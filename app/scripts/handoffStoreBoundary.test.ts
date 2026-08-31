// The hand-off store's own module boundary (design spec `docs/superpowers/
// specs/2026-08-30-handoff-protocol-design.md` §1/§10 row 11, plan Task 6
// close-out): "Nothing outside [handoffStore.ts] writes MONITOR_RUN_KEY or
// holds a module-level run" (handoffStore.ts's own header comment). This is
// the grep-shaped gate Task 2's own report carried forward ("belongs at Task
// 6 (close-out), once Tasks 3-5 have actually removed the other writers")
// and Task 4's review widened to cover REMOVERS as well as writers
// (ROADMAP.md's AUD-016 item).
//
// Scans every `.ts`/`.tsx` file under `src/` and `e2e/` (the only two trees
// that can reach a browser's `localStorage`) for a `localStorage.setItem`/
// `removeItem` call against the durable key — by its imported constant
// (`MONITOR_RUN_KEY`) or by the literal string it equals (an e2e spec
// cannot import a client module, per `e2e/session.spec.ts`'s own comment,
// so it spells the key out literally instead). A bare `localStorage.clear()`
// is deliberately NOT scanned: it wipes every key in the origin for reasons
// that have nothing to do with this one, and is the standard test-isolation
// idiom in dozens of unrelated `beforeEach` hooks across this repo — scanning
// it would make this gate fail on files that have never mentioned the
// monitor-run key at all. "Removal" here means `removeItem` specifically,
// the only operation that can target this one key by name.
//
// Two files are the store's own destination, never scanned as violations:
// `handoffStore.ts` itself (this IS the store), and `handoffStore.test.ts`
// (its own test file, which must seed raw/malformed bytes directly to test
// hydration's own resilience — testing the store's READ side necessarily
// means writing storage the store itself never wrote).
//
// ALLOWLIST, below, is every other file this repo actually has doing this
// today — verified by grepping the tree fresh at close-out, not copied
// blind from the close-out brief's own list (whose own line numbers it
// asked to be checked, not trusted): `src/monitor/monitorRun.ts` and
// `e2e/connected.spec.ts` are genuine, disclosed additions the brief's list
// did not name.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT = join(import.meta.dirname, "..");
const SRC_ROOT = join(APP_ROOT, "src");
const E2E_ROOT = join(APP_ROOT, "e2e");

const KEY_IDENTIFIER = "MONITOR_RUN_KEY";
const KEY_LITERAL = "ergomatic.monitorRun";
const STORE_FILE = "src/monitor/handoffStore.ts";

// `*.test.ts`/`*.test.tsx` files under `src/` are exempt from this check
// ENTIRELY, by filename pattern rather than by an enumerated list — a
// vitest component/unit test cannot drive a real browser, so seeding a
// precondition means writing `localStorage` directly, and this repo
// already does that in dozens of pre-existing files across `src/monitor/`,
// `src/session/`, `src/today/`, and `src/workout/` (verified empirically:
// the first version of this gate, enumerating only the close-out brief's
// own named files, false-flagged `src/session/logDraft.test.ts` and
// `src/today/Today.test.tsx` — two more test files doing the identical
// direct multi-line `localStorage.setItem(\n  MONITOR_RUN_KEY, ...)` seed,
// neither named anywhere in this task's brief). Enumerating every test file
// individually would make this gate a maintenance trap, growing forever as
// legitimate new tests are added; the invariant this gate actually protects
// — PRODUCTION code never bypasses the store — does not depend on which
// test file seeds its own fixture.
//
// Non-test files under `src/` permitted to write/remove the durable key
// directly, OUTSIDE the store:
const SRC_ALLOWLIST = new Set<string>([
  // Legacy `saveMonitorRun`/`clearMonitorRun` (Task 6 close-out,
  // 2026-08-30): ZERO production callers on this branch, confirmed via
  // `grep -rln "saveMonitorRun(\|clearMonitorRun(" src --include=*.ts
  // --include=*.tsx | grep -v '\.test\.'` — every production door now
  // commits/retires through `handoffStore.ts` (Tasks 3-5). Kept, not
  // deleted: the dozens of test files above call `saveMonitorRun`/
  // `clearMonitorRun` directly as their own established fixture-seeding
  // convention, independent of the store's CAS/tombstone discipline —
  // rewriting all of them onto the store is a materially larger, different
  // task than this close-out's own scope (the close-out brief's own item 4
  // sanctions exactly this "leave + disclose" shape for dead code that
  // would otherwise drag in unrelated churn).
  "src/monitor/monitorRun.ts",
]);

// e2e specs permitted to seed/clear the key directly (an e2e file cannot
// import a client module to seed through the store's own API — see
// `e2e/session.spec.ts`'s own comment on this).
const E2E_ALLOWLIST = new Set<string>([
  "e2e/design.spec.ts",
  "e2e/screenshots.spec.ts",
  "e2e/session.spec.ts",
  // Verified fresh at Task 6 close-out, NOT named in the close-out brief's
  // own list: a genuine `finally`-block test cleanup, `localStorage.
  // removeItem("ergomatic.monitorRun")`, matching §4 S3's own "other tests
  // share the origin" instruction.
  "e2e/connected.spec.ts",
]);

function listFiles(root: string, exts: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (exts.includes(extname(full))) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

function toPosixRelative(file: string): string {
  return relative(APP_ROOT, file).split(sep).join("/");
}

const DIRECT_IDENTIFIER = new RegExp(
  `localStorage\\.(setItem|removeItem)\\(\\s*${KEY_IDENTIFIER}\\b`,
);
const DIRECT_LITERAL = new RegExp(
  `localStorage\\.(setItem|removeItem)\\(\\s*["']${KEY_LITERAL.replace(/\./g, "\\.")}["']`,
);
const INDIRECT_CALL = /localStorage\.(setItem|removeItem)\(\s*key\b/;

/**
 * True when `source` writes or removes the durable key, by any of the
 * three shapes this repo actually uses (verified against the current tree,
 * not invented): the direct constant, the direct literal string (single-
 * or multi-line — `\s*` already spans newlines), or `design.spec.ts`/
 * `screenshots.spec.ts`'s own `page.evaluate(({key, value}) =>
 * localStorage.setItem(key, value), {key: MONITOR_RUN_KEY, ...})` idiom,
 * where the call site and the key literal sit on different lines.
 */
function writesOrRemovesKey(source: string): boolean {
  if (DIRECT_IDENTIFIER.test(source) || DIRECT_LITERAL.test(source)) {
    return true;
  }
  return (
    INDIRECT_CALL.test(source) &&
    (source.includes(`key: ${KEY_IDENTIFIER}`) ||
      source.includes(`key: "${KEY_LITERAL}"`))
  );
}

const TEST_FILE = /\.test\.tsx?$/;

describe("hand-off store module boundary (spec §1/§10 row 11)", () => {
  it("no PRODUCTION file under src/ other than handoffStore.ts (and its own allowlist) writes or removes MONITOR_RUN_KEY", () => {
    const offenders: string[] = [];
    for (const file of listFiles(SRC_ROOT, [".ts", ".tsx"])) {
      const rel = toPosixRelative(file);
      if (TEST_FILE.test(rel)) continue; // see header comment — exempt by pattern
      if (rel === STORE_FILE || SRC_ALLOWLIST.has(rel)) continue;
      if (writesOrRemovesKey(readFileSync(file, "utf8"))) offenders.push(rel);
    }
    expect(offenders).toStrictEqual([]);
  });

  it("no e2e spec other than the named seeders writes or removes MONITOR_RUN_KEY", () => {
    const offenders: string[] = [];
    for (const file of listFiles(E2E_ROOT, [".ts"])) {
      const rel = toPosixRelative(file);
      if (E2E_ALLOWLIST.has(rel)) continue;
      if (writesOrRemovesKey(readFileSync(file, "utf8"))) offenders.push(rel);
    }
    expect(offenders).toStrictEqual([]);
  });
});
