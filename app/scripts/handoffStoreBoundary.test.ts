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
//
// KNOWN EVASION SHAPES this gate does NOT catch (fix round 1/5, L-4 —
// named rather than silently accepted, so a future tightening pass knows
// where to look):
//  1. A key held in a variable whose name isn't literally `key` escapes
//     `INDIRECT_CALL` entirely. `e2e/connected.spec.ts:1294`'s own cleanup
//     loop, `for (const k of keys) localStorage.removeItem(k);`, is this
//     exact shape today — harmless here (the loop's own `keys` never
//     contains the monitor-run key; that removal is the separate, literal
//     `localStorage.removeItem("ergomatic.monitorRun")` two lines below,
//     which IS caught), but nothing in this gate would notice if some
//     FUTURE file laundered the key through an arbitrarily-named variable
//     on purpose or by accident.
//  2. `app/scripts/**` is not scanned at all (only `src/` and `e2e/`).
//     Currently benign — `pm5-lab.ts`, the one file there that touches
//     `localStorage`-adjacent browser APIs, never references this key —
//     but a future dev-harness script under `scripts/` writing the key
//     directly would get zero signal from either check in this file.
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
// directly, OUTSIDE the store.
//
// **NARROWED at the final fix round (2026-08-30; antagonist §10 audit,
// F-4a).** This used to be a wholesale skip: `monitorRun.ts` was exempt as
// a FILE, so a brand-new raw `localStorage.setItem(MONITOR_RUN_KEY, ...)`
// added anywhere in it — including in some future function that is not one
// of the two legacy writers — produced exactly zero signal from this gate.
// The file is still skipped by the offender loop (it genuinely holds the
// only sanctioned raw writes left), but the dedicated "monitorRun.ts holds
// EXACTLY the three sanctioned raw key operations" test below pins HOW
// MANY it holds, so a new one moves the number and goes red.
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
 * Task 6 fix round, M-2 (reviewer finding, reproduced 4x across Tasks
 * 4-5's own record before this gate existed): `monitorRun.ts`'s exported
 * legacy `saveMonitorRun`/`clearMonitorRun` (allowlisted above precisely
 * BECAUSE they hold the only raw key writes left outside the store) are
 * themselves a realistic bypass — any NEW production door calling one of
 * them writes/removes the durable key exactly as directly as a raw
 * `localStorage.setItem` would, and the checks above give it no signal at
 * all, since neither function's own call site ever mentions `setItem`,
 * `removeItem`, `MONITOR_RUN_KEY`, or the literal string. `\b` on both
 * sides so this matches a bare call (`saveMonitorRun(x)`) without also
 * matching an unrelated identifier that merely CONTAINS one of these
 * names as a substring.
 */
const LEGACY_WRITER_CALL = /\b(saveMonitorRun|clearMonitorRun)\s*\(/;

/**
 * Strips `//` line comments and `/* *\/` block comments before any pattern
 * below runs. Needed specifically for `LEGACY_WRITER_CALL`: this repo's
 * own prose comments name `` `clearMonitorRun()` `` verbatim in at least
 * four production files (`Today.tsx`, `LogSession.tsx`,
 * `WorkoutDetail.tsx`, `useStartWorkout.ts` — each explaining that the
 * file does NOT call it any more), and a naive scan false-flagged exactly
 * those four the first time this check was run (see M-2's own fix-round
 * report entry). A crude regex stripper, not a real tokenizer — it cannot
 * tell a `//` inside a string literal from a real comment start, which is
 * a known, accepted limitation for a gate this narrow (see this file's
 * own header comment on other known evasions).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * True when `source` writes or removes the durable key, by any of the
 * three raw shapes this repo actually uses (verified against the current
 * tree, not invented): the direct constant, the direct literal string
 * (single- or multi-line — `\s*` already spans newlines), or
 * `design.spec.ts`/`screenshots.spec.ts`'s own `page.evaluate(({key,
 * value}) => localStorage.setItem(key, value), {key: MONITOR_RUN_KEY,
 * ...})` idiom, where the call site and the key literal sit on different
 * lines — OR by calling the legacy `saveMonitorRun`/`clearMonitorRun`
 * writers directly (M-2 above). Comments are stripped first (see
 * `stripComments`'s own doc comment for why that specifically matters
 * here).
 */
function writesOrRemovesKey(rawSource: string): boolean {
  const source = stripComments(rawSource);
  if (
    DIRECT_IDENTIFIER.test(source) ||
    DIRECT_LITERAL.test(source) ||
    LEGACY_WRITER_CALL.test(source)
  ) {
    return true;
  }
  return (
    INDIRECT_CALL.test(source) &&
    (source.includes(`key: ${KEY_IDENTIFIER}`) ||
      source.includes(`key: "${KEY_LITERAL}"`))
  );
}

/**
 * §1's SECOND clause, as far as text can see it: every module-scope
 * `let`/`var` declared in `source`, by NAME. Extracted from the test that
 * used to inline it (PR #239 review round 1, item 3) so the detector can be
 * fed synthetic sources and pinned in BOTH directions — what it catches,
 * and what it provably does not.
 */
const MODULE_SCOPE_MUTABLE = /^(?:export\s+)?(?:let|var)\s+([A-Za-z_$][\w$]*)/;

function moduleScopeMutables(rawSource: string): string[] {
  const names: string[] = [];
  for (const line of stripComments(rawSource).split("\n")) {
    const m = MODULE_SCOPE_MUTABLE.exec(line);
    if (m !== null) names.push(m[1]!);
  }
  return names;
}

const TEST_FILE = /\.test\.tsx?$/;

// TITLES SAY WHAT IS ENFORCED, NOT WHAT IS WISHED FOR (PR #239 review
// round 1, item 3). These tests used to be named for §1's absolute
// invariant — "nothing else writes MONITOR_RUN_KEY" — while this file's own
// header disclosed, at length, the shapes they cannot see. A name is what a
// future reader trusts when they are deciding whether a risk is already
// covered, so each one now names the SYNTACTIC contract it actually
// enforces. The disclosed gap between that contract and §1 is itself
// pinned, by the detector self-tests at the bottom of this file.
describe("hand-off store module boundary (spec §1/§10 row 11)", () => {
  it("no PRODUCTION file under src/ outside the store and its allowlist writes or removes the durable key in any SCANNED syntactic form (constant, string literal, `key:`-property indirection, or a legacy-writer call)", () => {
    const offenders: string[] = [];
    for (const file of listFiles(SRC_ROOT, [".ts", ".tsx"])) {
      const rel = toPosixRelative(file);
      if (TEST_FILE.test(rel)) continue; // see header comment — exempt by pattern
      if (rel === STORE_FILE || SRC_ALLOWLIST.has(rel)) continue;
      if (writesOrRemovesKey(readFileSync(file, "utf8"))) offenders.push(rel);
    }
    expect(offenders).toStrictEqual([]);
  });

  it("no e2e spec outside the named seeders writes or removes the durable key in any SCANNED syntactic form", () => {
    const offenders: string[] = [];
    for (const file of listFiles(E2E_ROOT, [".ts"])) {
      const rel = toPosixRelative(file);
      if (E2E_ALLOWLIST.has(rel)) continue;
      if (writesOrRemovesKey(readFileSync(file, "utf8"))) offenders.push(rel);
    }
    expect(offenders).toStrictEqual([]);
  });

  // ANT-F4a: the allowlist's own escape hatch, closed with a COUNT.
  // `monitorRun.ts` holds exactly three raw key operations today, and all
  // three belong to the two legacy writers the allowlist comment names:
  //   - `saveMonitorRun`   — two `setItem` calls (the full write, then the
  //                          series-sacrifice retry; see its own comment)
  //   - `clearMonitorRun`  — one `removeItem`
  // Counted against the CURRENT tree, not copied from a brief. A fourth
  // raw operation added to this file — a new writer, or a re-added
  // self-heal on the read path (which is exactly what the final fix round
  // REMOVED from `loadMonitorRun`) — moves this number and fails here.
  // Deliberately a count rather than an enumeration of enclosing function
  // names: this file is scanned as text (no TypeScript AST available in a
  // vitest `unit` project without pulling a parser in for one assertion),
  // and a count is the strongest sound claim text alone supports.
  it("monitorRun.ts holds EXACTLY the three sanctioned raw key operations — a new one moves this number", () => {
    const source = stripComments(
      readFileSync(join(APP_ROOT, "src/monitor/monitorRun.ts"), "utf8"),
    );
    const matches = source.match(
      new RegExp(
        `localStorage\\.(setItem|removeItem)\\(\\s*${KEY_IDENTIFIER}\\b`,
        "g",
      ),
    );
    expect(matches).toHaveLength(3);
    // ...and they are the operations the allowlist claims: two writes and
    // one removal, not three writes or three removals. A raw removal
    // added on a read path would otherwise be able to hide behind a
    // deleted write and keep the total at three.
    expect(matches!.filter((m) => m.includes("setItem"))).toHaveLength(2);
    expect(matches!.filter((m) => m.includes("removeItem"))).toHaveLength(1);
    // The offender loop skips this file, so the count above is its only
    // gate — and the count matches the IDENTIFIER form only. A raw write
    // here against the string literal would evade both; assert that form
    // to zero explicitly.
    expect(
      source.match(
        /localStorage\.(setItem|removeItem)\(\s*["'`]ergomatic\.monitorRun["'`]/g,
      ),
    ).toBeNull();
  });

  // §1's SECOND clause, checked at last (ANT-F4b): "Nothing else writes
  // `MONITOR_RUN_KEY` **or holds a module-level run**." Everything above
  // gates the first half; this gates the second, as far as text can.
  //
  // WHAT IT DOES: enumerates every module-scope `let`/`var` in production
  // files under `src/monitor/` (the store excepted — its five are the
  // design) and pins the set. The deleted carrier this whole design
  // replaced WAS exactly such a binding (§2: "module slot + five stash
  // sites — deleted"), so re-introducing one, under any name or type,
  // trips this.
  //
  // WHAT IT CANNOT SEE, named rather than implied: a module-level run
  // held in a `const` object's mutable property (`const slot = {run:
  // null}`), one held outside `src/monitor/` (`src/session/`,
  // `src/workout/`), or one smuggled through a closure returned by a
  // factory. It also over-approximates in the other direction: ANY new
  // module-scope mutable here fails, run-holding or not. That is the
  // intended trade — a failure means: justify the binding and add it to
  // the pinned list below, a cheap, once-per-binding cost against a
  // carrier class that has already cost this project two review waves.
  it("no production file under src/monitor/ outside the store DECLARES a module-scope `let`/`var` — the text-visible half of §1's 'or holds a module-level run'", () => {
    const found: string[] = [];
    for (const file of listFiles(SRC_ROOT, [".ts", ".tsx"])) {
      const rel = toPosixRelative(file);
      if (!rel.startsWith("src/monitor/")) continue;
      if (TEST_FILE.test(rel) || rel === STORE_FILE) continue;
      // Identified by NAME, never by line number: `stripComments` above
      // collapses block comments and would shift every number anyway, and
      // a line-pinned gate would go red on any unrelated edit further up
      // the file — a gate that cries wolf is the thing this round is
      // removing, not adding.
      for (const name of moduleScopeMutables(readFileSync(file, "utf8"))) {
        found.push(`${rel}: ${name}`);
      }
    }
    // The two that exist today, both established long before this design
    // and neither able to hold a run:
    //  - `capacitorBle.ts: initPromise` — the native BLE client's
    //    one-shot `initialize()` memo (`Promise<void> | null`, Phase LL).
    //  - `useMonitorSession.ts: receiptChannelOwner` — an integer
    //    generation counter guarding receipt-channel ownership (its own
    //    doc comment). A `number`.
    expect(found).toStrictEqual([
      "src/monitor/transports/capacitorBle.ts: initPromise",
      "src/monitor/useMonitorSession.ts: receiptChannelOwner",
    ]);
  });
});

// ---------------------------------------------------------------------
// THE DETECTORS, TESTED AS DETECTORS (PR #239 review round 1, item 3).
//
// Every test above is a scan of the real tree, so all four are green
// precisely because the tree is clean — none of them can tell "the
// detector works and found nothing" apart from "the detector is broken
// and found nothing". A regex that stopped matching, a `stripComments`
// that ate the source, an inverted return: all silent. These feed each
// detector synthetic sources and pin BOTH directions.
//
// The MISSES half is not padding and is not aspiration. This file's header
// discloses the shapes the gate cannot see; a disclosure that nothing
// asserts can silently WIDEN — someone tightens a regex, the blind spot
// closes or moves, and the header (which the next reader trusts) is now
// wrong in whichever direction nobody checked. Pinning the misses makes
// the disclosed boundary a fact with a test behind it, so a future
// tightening pass has to come here and change the claim on purpose.
// ---------------------------------------------------------------------
describe("the boundary detectors themselves (both directions)", () => {
  describe("writesOrRemovesKey CATCHES each form the header claims", () => {
    it("the direct constant, set and remove", () => {
      expect(
        writesOrRemovesKey(`localStorage.setItem(${KEY_IDENTIFIER}, blob);`),
      ).toBe(true);
      expect(
        writesOrRemovesKey(`localStorage.removeItem(${KEY_IDENTIFIER});`),
      ).toBe(true);
    });

    it("the direct string literal, in either quote style", () => {
      expect(
        writesOrRemovesKey(`localStorage.setItem("${KEY_LITERAL}", blob);`),
      ).toBe(true);
      expect(
        writesOrRemovesKey(`localStorage.removeItem('${KEY_LITERAL}');`),
      ).toBe(true);
    });

    it("the same call split across lines by the formatter", () => {
      expect(
        writesOrRemovesKey(
          `localStorage.setItem(\n  ${KEY_IDENTIFIER},\n  JSON.stringify(run),\n);`,
        ),
      ).toBe(true);
    });

    it("the `page.evaluate({key, value})` indirection the e2e seeders use", () => {
      expect(
        writesOrRemovesKey(
          `await page.evaluate(\n` +
            `  ({ key, value }) => localStorage.setItem(key, value),\n` +
            `  { key: ${KEY_IDENTIFIER}, value: raw },\n` +
            `);`,
        ),
      ).toBe(true);
      expect(
        writesOrRemovesKey(
          `await page.evaluate(\n` +
            `  ({ key, value }) => localStorage.setItem(key, value),\n` +
            `  { key: "${KEY_LITERAL}", value: raw },\n` +
            `);`,
        ),
      ).toBe(true);
    });

    it("a call to either legacy writer, which bypasses the store just as directly", () => {
      expect(writesOrRemovesKey("saveMonitorRun(run);")).toBe(true);
      expect(writesOrRemovesKey("clearMonitorRun();")).toBe(true);
    });

    it("does NOT fire on a mere mention: a comment, or a read", () => {
      // The false-positive class `stripComments` exists for — four
      // production files name `clearMonitorRun()` in prose while calling
      // nothing.
      expect(
        writesOrRemovesKey("// this file no longer calls clearMonitorRun()"),
      ).toBe(false);
      expect(
        writesOrRemovesKey(`/* see saveMonitorRun(run) in monitorRun.ts */`),
      ).toBe(false);
      // Reading the key is not writing it — the whole gate is about
      // WRITERS.
      expect(
        writesOrRemovesKey(
          `const raw = localStorage.getItem(${KEY_IDENTIFIER});`,
        ),
      ).toBe(false);
      // ...and a different key is not this key.
      expect(writesOrRemovesKey(`localStorage.setItem(DRAFT_KEY, blob);`)).toBe(
        false,
      );
    });
  });

  describe("writesOrRemovesKey MISSES exactly what the header says it misses", () => {
    it("a key laundered through a variable that is not literally named `key` (header evasion 1)", () => {
      // `INDIRECT_CALL` matches `localStorage.setItem(key` and nothing
      // else, so any other identifier walks straight through. This is the
      // shape `e2e/connected.spec.ts`'s own cleanup loop already has,
      // harmlessly.
      expect(
        writesOrRemovesKey(
          `const k = ${KEY_IDENTIFIER};\nlocalStorage.setItem(k, blob);`,
        ),
      ).toBe(false);
      expect(
        writesOrRemovesKey(`for (const k of keys) localStorage.removeItem(k);`),
      ).toBe(false);
    });

    it("a legacy-writer call sharing a line with a `//` inside a string literal (the crude stripper's own limit)", () => {
      // `stripComments` is a regex, not a tokenizer: the `//` in the URL
      // starts a "comment" and eats the rest of the line, call included.
      expect(
        writesOrRemovesKey(
          `const docs = "https://c2.example"; saveMonitorRun(run);`,
        ),
      ).toBe(false);
      // ...and the identical call on its own line IS caught, so the miss
      // above is genuinely the stripper and not a broken detector.
      expect(
        writesOrRemovesKey(
          `const docs = "https://c2.example";\nsaveMonitorRun(run);`,
        ),
      ).toBe(true);
    });
  });

  describe("moduleScopeMutables, both directions", () => {
    it("catches a module-scope binding under any keyword, exported or not", () => {
      expect(moduleScopeMutables("let cached = null;")).toStrictEqual([
        "cached",
      ]);
      expect(moduleScopeMutables("var legacySlot;")).toStrictEqual([
        "legacySlot",
      ]);
      expect(moduleScopeMutables("export let sharedRun = null;")).toStrictEqual(
        ["sharedRun"],
      );
    });

    it("ignores an INDENTED `let` — a function-local, which is not a module-level carrier", () => {
      expect(
        moduleScopeMutables("function f() {\n  let local = 1;\n}"),
      ).toStrictEqual([]);
    });

    it("MISSES a run held in a `const` object's mutable property (header: 'what it cannot see')", () => {
      // The exact carrier shape §2 deleted, wearing a `const`. Text alone
      // cannot tell this from any other constant, which is why §1's second
      // clause is only half-gated and the test above now says so in its
      // name.
      expect(moduleScopeMutables("const slot = { run: null };")).toStrictEqual(
        [],
      );
    });
  });
});
