#!/usr/bin/env node
// Concept2 WOD fetcher (spec: docs/superpowers/specs/2026-08-10-wod-import-design.md).
// Deterministic: date-keyed server-rendered pages, verbatim extraction,
// append-only JSONL, explicit error records, never silent. The dump lives
// OUTSIDE the repo (~/.ergomatic/wods) per the house content policy; only
// one structural fixture is committed as test apparatus.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const BASE = "https://log.concept2.com/wod";
const DEFAULT_OUT = join(homedir(), ".ergomatic", "wods", "raw.jsonl");

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .trim();

export function extractWod(html, date) {
  const sourceUrl = `${BASE}/${date}/rowerg`;
  const m = html.match(
    /<h3>([^<]+)<\/h3>\s*<p><strong>([^<]+)<\/strong><\/p>/,
  );
  if (!m) {
    return {
      date,
      error: "unrecognized page shape (no <h3>+<p><strong> pair)",
      excerpt: html.replace(/\s+/g, " ").slice(0, 200),
    };
  }
  return {
    date,
    equipment: "rowerg",
    title: decode(m[1]),
    raw: decode(m[2]),
    sourceUrl,
  };
}

export function appendNew(records, jsonlPath) {
  mkdirSync(dirname(jsonlPath), { recursive: true });
  const seen = new Set(
    existsSync(jsonlPath)
      ? readFileSync(jsonlPath, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((l) => {
            const r = JSON.parse(l);
            return `${r.date}/${r.equipment ?? "rowerg"}`;
          })
      : [],
  );
  let appended = 0;
  let skipped = 0;
  for (const r of records) {
    const key = `${r.date}/${r.equipment ?? "rowerg"}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    appendFileSync(
      jsonlPath,
      JSON.stringify({ ...r, retrievedAt: new Date().toISOString() }) + "\n",
    );
    appended++;
  }
  return { appended, skipped };
}

function* dates(from, to) {
  // Date-only ISO strings, UTC arithmetic — no TZ drift.
  for (
    let d = new Date(`${from}T00:00:00Z`);
    d <= new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    yield d.toISOString().slice(0, 10);
  }
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchRange(fromDate, toDate, opts = {}) {
  const {
    out = DEFAULT_OUT,
    delayMs = 1000,
    fetchImpl = fetch,
    sleep = defaultSleep,
  } = opts;
  const all = [...dates(fromDate, toDate)];
  const records = [];
  for (let i = 0; i < all.length; i++) {
    const date = all[i];
    try {
      const res = await fetchImpl(`${BASE}/${date}/rowerg`);
      records.push(
        res.ok
          ? extractWod(await res.text(), date)
          : { date, error: `HTTP ${res.status}`, excerpt: "" },
      );
    } catch (e) {
      records.push({ date, error: `fetch failed: ${e.message}`, excerpt: "" });
    }
    if (i < all.length - 1) await sleep(delayMs);
  }
  return appendNew(records, out);
}

// Thin CLI. Never runs under vitest (import.meta.main-style guard).
const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const out = args.includes("--out")
    ? args[args.indexOf("--out") + 1]
    : DEFAULT_OUT;
  const run = async () => {
    if (args[0] === "--date") return fetchRange(args[1], args[1], { out });
    if (args[0] === "--range") return fetchRange(args[1], args[2], { out });
    console.error(
      "usage: fetch-wods.mjs --date YYYY-MM-DD | --range FROM TO [--out PATH]",
    );
    process.exit(2);
  };
  run().then((r) => console.log(`appended ${r.appended}, skipped ${r.skipped}`));
}
