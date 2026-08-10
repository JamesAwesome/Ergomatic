# WOD Import Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deterministic Concept2-WOD fetcher writing a local JSONL dump,
and a user-invocable `wod-import` skill that curates, translates, scales,
and presents WODs for James's manual import — with persistent state.

**Architecture:** Plain-node fetcher (no deps) + committed HTML fixture +
vitest coverage; a project skill whose SKILL.md encodes the whole
workflow and state contract; a vite-node validation runner so every
translated block is proven against the real `domain/bulk.ts` parser
before a human sees it.

**Tech Stack:** Node stdlib (`fetch`, `fs`), vitest (unit project),
vite-node (ships with vitest), Claude Code project skills.

**Spec:** `docs/superpowers/specs/2026-08-10-wod-import-design.md` —
binding; read first.

## Global Constraints

- Worktree `.claude/worktrees/wod-import`, branch `wod-import-tooling`;
  `git rev-parse --show-toplevel` before every commit.
- Raw WOD text NEVER enters the repo except ONE structural HTML fixture
  (test apparatus). The dump/state live at `~/.ergomatic/wods/`
  (`--out`/`--state` overridable; tests use temp dirs, never the real
  home path).
- Zero new dependencies. No app/src, domain, or server product code —
  the vitest test files under `app/server/` are the one repo-convention
  exception (the unit project's only non-src glob, `vite.config.ts:11`;
  precedent `app/server/releaseAssets.test.ts`).
- Fetch pacing in range mode: ≥1000ms between requests, injectable for
  tests.
- Skill prose: transcribe EXACTLY from this plan (James reviews the
  diff). No em dashes anywhere in it.

## File Structure

```
scripts/wod/fetch-wods.mjs        the fetcher CLI (exported fns + thin main)
scripts/wod/fixtures/wod-rowerg-2026-08-10.html   structural fixture
scripts/wod/validate-block.ts     stdin → parseBulk verdict (vite-node)
app/server/wodFetch.test.ts       fetcher unit tests
.claude/skills/wod-import/SKILL.md    the skill
ROADMAP.md                        one Triggered-follow-ons line (cron revival)
```

---

### Task 1: the fetcher

**Files:** Create `scripts/wod/fetch-wods.mjs`,
`scripts/wod/fixtures/wod-rowerg-2026-08-10.html` (curl it fresh:
`curl -s https://log.concept2.com/wod/2026-08-10/rowerg` — verify it
contains `<h3>6 x 500m / 1 min easy</h3>`), and
`app/server/wodFetch.test.ts`.

**Interfaces (Task 2's skill and any future cron consume these):**
```js
// fetch-wods.mjs exports:
export function extractWod(html, date)
// -> { date, equipment: "rowerg", title, raw, sourceUrl } | { date, error, excerpt }
export function appendNew(records, jsonlPath)
// -> { appended: n, skipped: n }  (skip = date+equipment already present)
export async function fetchRange(fromDate, toDate, opts)
// opts: { out, delayMs = 1000, fetchImpl = fetch, sleep = default }
// CLI: node scripts/wod/fetch-wods.mjs --date YYYY-MM-DD | --range FROM TO [--out PATH]
```

- [ ] **Step 1: failing tests** (`app/server/wodFetch.test.ts`, unit
  project; import via `../../scripts/wod/fetch-wods.mjs`):

```ts
import { readFileSync, mkdtempSync, readFileSync as rf } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  appendNew,
  extractWod,
  fetchRange,
} from "../../scripts/wod/fetch-wods.mjs";

const FIXTURE = readFileSync(
  new URL(
    "../../scripts/wod/fixtures/wod-rowerg-2026-08-10.html",
    import.meta.url,
  ),
  "utf8",
);

describe("extractWod", () => {
  it("pulls title and verbatim instruction from the real page shape", () => {
    const r = extractWod(FIXTURE, "2026-08-10");
    expect(r).toStrictEqual({
      date: "2026-08-10",
      equipment: "rowerg",
      title: "6 x 500m / 1 min easy",
      raw: "Complete six 500 meter pieces. Continue at light pressure between each 500. Note: for BikeErg, distance is 1000 meters.",
      sourceUrl: "https://log.concept2.com/wod/2026-08-10/rowerg",
    });
  });

  it("decodes HTML entities in title and body", () => {
    const html = "<h3>4 x 2000m &amp; sprint</h3>\n<p><strong>Row hard &gt; easy.</strong></p>";
    const r = extractWod(html, "2026-01-01");
    expect(r.title).toBe("4 x 2000m & sprint");
    expect(r.raw).toBe("Row hard > easy.");
  });

  it("returns an explicit error record for an unrecognized shape, with an excerpt", () => {
    const r = extractWod("<html><body>maintenance page</body></html>", "2026-01-02");
    expect(r.date).toBe("2026-01-02");
    expect(r.error).toMatch(/shape/i);
    expect(r.excerpt).toContain("maintenance");
  });
});

describe("appendNew", () => {
  it("appends records as JSONL and skips dates already present", () => {
    const dir = mkdtempSync(join(tmpdir(), "wod-"));
    const p = join(dir, "raw.jsonl");
    const rec = (date) => ({ date, equipment: "rowerg", title: "t", raw: "r", sourceUrl: "u" });
    expect(appendNew([rec("2026-08-01")], p)).toStrictEqual({ appended: 1, skipped: 0 });
    expect(appendNew([rec("2026-08-01"), rec("2026-08-02")], p)).toStrictEqual({ appended: 1, skipped: 1 });
    const lines = rf(p, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.date)).toStrictEqual(["2026-08-01", "2026-08-02"]);
    expect(lines[0].retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("fetchRange", () => {
  it("fetches each date once, paced by the injected sleeper, and appends", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wod-"));
    const p = join(dir, "raw.jsonl");
    const calls = [];
    const sleeps = [];
    const fetchImpl = vi.fn(async (url) => {
      calls.push(url);
      return new Response(FIXTURE, { status: 200 });
    });
    const sleep = vi.fn(async (ms) => void sleeps.push(ms));
    const res = await fetchRange("2026-08-09", "2026-08-10", {
      out: p, fetchImpl, sleep,
    });
    expect(calls).toStrictEqual([
      "https://log.concept2.com/wod/2026-08-09/rowerg",
      "https://log.concept2.com/wod/2026-08-10/rowerg",
    ]);
    expect(sleeps).toStrictEqual([1000]); // between requests, not after the last
    expect(res.appended).toBe(2);
  });

  it("a non-200 becomes an error record, not a throw, and the range continues", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wod-"));
    const p = join(dir, "raw.jsonl");
    const fetchImpl = vi.fn(async (url) =>
      url.includes("2026-08-09")
        ? new Response("gone", { status: 404 })
        : new Response(FIXTURE, { status: 200 }),
    );
    const res = await fetchRange("2026-08-09", "2026-08-10", {
      out: p, fetchImpl, sleep: async () => {},
    });
    const lines = rf(p, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0].error).toMatch(/404/);
    expect(lines[1].title).toBe("6 x 500m / 1 min easy");
    expect(res.appended).toBe(2);
  });
});
```

- [ ] **Step 2:** run `pnpm test --project unit -- wodFetch` in `app/` —
  FAIL (module missing).
- [ ] **Step 3:** implement `fetch-wods.mjs`:

```js
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
  const m = html.match(/<h3>([^<]+)<\/h3>\s*<p><strong>([^<]+)<\/strong><\/p>/);
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
```

- [ ] **Step 4:** tests green (`pnpm test --project unit -- wodFetch`);
  full `pnpm test --project unit`; lint/typecheck/format. Self-mutations:
  break the skip-key (drop equipment from the key) → append test fails;
  drop the `i < all.length - 1` guard → pacing test fails; break the
  regex (`<h4>`) → extraction test fails. Per-file coverage note: .mjs
  under scripts/ may sit outside the coverage include (`vite.config.ts:39`)
  — say which source you used and whether the file appears; the TESTS
  are the gate here, not the aggregate number.
- [ ] **Step 5:** live smoke (network, once): `node scripts/wod/fetch-wods.mjs
  --date 2026-08-09 --out /tmp/wod-smoke.jsonl` → one appended record;
  paste the JSON line into your report; delete the temp file.
- [ ] **Step 6:** commit (`feat: the WOD fetcher — date-keyed, paced, append-only`).

---

### Task 2: the validation runner and the skill

**Files:** Create `scripts/wod/validate-block.ts`,
`.claude/skills/wod-import/SKILL.md`; modify `ROADMAP.md` (one line
under Triggered follow-ons: cron+ntfy revival on this fetcher, trigger =
"James wants WODs pushed instead of pulled").

**Interfaces:** the skill invokes
`pnpm --dir app exec vite-node ../scripts/wod/validate-block.ts < block.txt`
and reads its stdout verdict + exit code.

- [ ] **Step 1:** verify the runner exists: `pnpm --dir app exec vite-node
  --version` (vite-node ships with vitest 3). If absent, STOP and report
  (fallback design needed; do not improvise).
- [ ] **Step 2:** `scripts/wod/validate-block.ts`:

```ts
// Reads one bulk-grammar paste from stdin, runs it through the REAL
// parser (domain/bulk.ts), prints the verdict. The wod-import skill's
// gate: no translated block reaches James unless this exits 0.
// Run: pnpm --dir app exec vite-node ../scripts/wod/validate-block.ts < block.txt
import { parseBulk } from "../../app/domain/bulk.js";

const text = await new Promise<string>((resolve) => {
  let buf = "";
  process.stdin.on("data", (c) => (buf += c));
  process.stdin.on("end", () => resolve(buf));
});

const result = parseBulk(text);
if (result.errors.length > 0) {
  console.error("INVALID:");
  for (const e of result.errors) console.error(`  line ${e.line}: ${e.message}`);
  process.exit(1);
}
console.log(
  `OK: ${result.blocks.length} block(s)` +
    (result.droppedWarmups > 0
      ? `, ${result.droppedWarmups} wu line(s) dropped per the warmup setting`
      : ""),
);
```

  NOTE: field names above (`errors`, `blocks`, `droppedWarmups`) are
  UNVERIFIED — read `parseBulk`'s actual return type in
  `app/domain/bulk.ts` first and match it exactly; the intent (exit 1 +
  per-line errors, exit 0 + block count + dropped-wu count) is binding.
- [ ] **Step 3:** prove it live, both directions, and paste both outputs
  in your report: a valid block (use a real seed workout's shape, e.g.
  `WOD Smoke | O2 | easy | 2` + `w 30' 6k @20`) → OK; the same block
  with `w 10' 9k` → INVALID line-numbered.
- [ ] **Step 4:** `.claude/skills/wod-import/SKILL.md` — transcribe
  EXACTLY:

```markdown
---
name: wod-import
description: Pull Concept2 Workouts-of-the-Day, curate and translate them into Ergomatic's bulk grammar (optionally scaled), and present them for James's import decisions. Use when James asks to add workouts from the C2 WODs, mentions the workout of the day, or wants the WOD backlog mined for library material.
---

# wod-import

You are curating third-party workouts into Ergomatic's vocabulary for
James to review. You never touch the app's database, API, or seed files,
and raw WOD text never enters the repo. Your output is bulk-grammar
blocks James pastes into /library/import himself.

## State (read first, every run)

`~/.ergomatic/wods/state.json`:

    {
      "cursor": "YYYY-MM-DD",   // oldest date ever pulled
      "ruled": {
        "YYYY-MM-DD": { "status": "imported" | "rejected" | "pending",
                         "title": "...", "reason": "..." }
      }
    }

If the file is missing, initialize it with cursor = today and empty
ruled. The raw dump is `~/.ergomatic/wods/raw.jsonl` (the fetcher owns
it; you only read it).

State discipline: after EVERY write, re-read the file and confirm the
dates you just ruled are present with the status you wrote. A run that
cannot verify its own state write stops and says so.

## The workflow

1. Parse the ask into a target count N (default 5 if unstated).
2. Read state and the dump. Collect unruled dates already in the dump
   first; if fewer than 2xN, run the fetcher backward from the cursor:
   `node scripts/wod/fetch-wods.mjs --range <cursor minus K days>
   <cursor minus 1 day>` with K sized to bring unruled candidates to
   about 2xN. Update cursor. Error records in the dump count as ruled
   rejected (reason: scrape error) — record them so they are never
   re-pulled.
3. Curate. Keep a candidate only if ALL hold:
   - It translates faithfully to time/distance work steps with optional
     rests. Skip team/relay/choice-of-equipment/technique-drill shapes;
     when the prose is ambiguous, skip rather than guess.
   - It adds variety: check the type x duration spread of BOTH the
     app's library (read `app/server/seed/library/index.ts`'s grid
     comment for the bands) AND the state's already-imported titles.
   - It is not a structural duplicate of an existing library workout
     (same interval count, durations, and rest shape).
4. Translate each keeper into ONE bulk-grammar block:
   - Original title in the app's naming voice. Never C2's own text as
     the title.
   - Type, difficulty, and pain per the house rubric. Read, in this
     order, before your first classification of the run:
     `app/src/news/content/bodies/workoutTypes.tsx` (what the types
     mean), `app/domain/generation/patterns.json` (work:rest and spm
     bands per type x duration), and the pain-scale article
     (`painScale.tsx`) for the 1-to-5 semantics.
   - `w`/`r` lines only. Never author `wu` lines: the app dropped
     workout-owned warm-ups (the warmup setting); the import would
     drop them anyway.
   - VALIDATE before presenting:
     `pnpm --dir app exec vite-node ../scripts/wod/validate-block.ts`
     with the block on stdin. A block that does not print OK never
     reaches James; fix it or drop the candidate.
5. Scaling, only when James asks (in the original request or per
   candidate): produce a variant block beside the faithful one, delta
   stated in one line ("original 6x500m; scaled 8x500m" or "original
   open rate; scaled @26"). Two levers only: interval count, and
   intensity (pace ref or spm). A scale that would change the workout's
   honest type is not a scale; reclassify or do not offer it.
6. Present a table: date, C2 title, raw text (short), your block (and
   variant), your classification reasoning in one line each. Ask for
   James's calls.
7. On his rulings: imported -> status imported with the final title
   (only after he confirms the paste landed); rejected -> status
   rejected with his reason verbatim; unruled -> pending. Write state,
   then re-verify per the discipline above.

## Hard limits

- Never insert into the app, never edit seed files, never commit raw
  WOD text (the one HTML fixture under scripts/wod/fixtures/ is test
  apparatus and not yours to grow).
- Fetch politely: the fetcher's built-in pacing is the floor; never
  parallelize pulls.
- If the fetcher reports error records for a whole range, the page
  shape may have changed: stop, show James the excerpt, and suggest
  re-running the fetcher's own tests against a fresh fixture.
```

- [ ] **Step 5:** lint/typecheck/format (repo gates); the SKILL.md has
  no test harness — its verification is Step 3's live validation proof
  plus a dry-run: invoke the skill's step 2 fetcher command for a
  2-day range against a temp `--out`, confirm the JSONL shape matches
  what step 3 of the workflow expects, and paste the run in your report.
- [ ] **Step 6:** commit (`feat: the wod-import skill — curate, translate, ask James`).

---

### Task 3: close-out

- [ ] Full gates: lint/typecheck/format, `pnpm test` (all projects;
  Docker if available). NO e2e (zero app/src product code — cite the
  briefing's gate table in your report).
- [ ] Push `wod-import-tooling`; PR "WOD import: the fetcher and the
  skill" — body: the spec link, the live smoke outputs (fetch + both
  validation directions), the content-policy note (one fixture, dump
  outside repo), risk note (page-shape fragility and the loud-failure
  design). Do NOT merge.

## Self-review record

Spec coverage: fetcher CLI/extraction/JSONL/idempotency/pacing/error
records (T1), fixture policy (T1), validation gate (T2), skill workflow
incl. state contract, curation rubric, scaling levers, hard limits (T2),
cron follow-on line (T2), no-app-insert posture (skill prose), PR (T3).
Placeholders: none — full code and prose present; `parseBulk`'s return
shape flagged UNVERIFIED with binding intent, per the briefing's rule.
Type consistency: `extractWod`/`appendNew`/`fetchRange` names match
between tests, implementation, and the skill's invocations.
