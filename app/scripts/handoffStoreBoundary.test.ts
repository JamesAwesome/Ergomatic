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
//  3. The MODULE-SCOPE detector (a separate detector, §1's second clause)
//     is no longer text-shaped at all — it parses with the TypeScript
//     compiler API and walks the tree, so evasions 1-2 above do not apply
//     to it. It now performs the `var` half of a real hoisting analysis
//     (PR #239 review round 5, finding 3a): a `var` declared inside a
//     top-level BLOCK — `if (x) { var run = null; }` — hoists to module
//     scope and IS collected. Its residuals are narrower and named at
//     `moduleScopeMutables`: a run held in a `const` object's mutable
//     property, and anything outside `src/monitor/`. Both pinned as
//     MISSES below. Each scanned file is parsed EXACTLY ONCE, at
//     `parseModule` — this file's only `ts.createSourceFile` call site,
//     asserted as such — and the detector, the diagnostics pin and the
//     statement-count check all read that one tree, so none of them can
//     be looking at a differently-named parse than the others.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
// The compiler the repo already builds with (`app/package.json`
// devDependency `typescript`, the same one `pnpm typecheck` runs) — used
// here as a PARSER, never a type checker: `createSourceFile` is a
// syntax-only, error-tolerant parse with no program, no `tsconfig`, and
// no filesystem resolution, so scanning ~40 files costs milliseconds.
import ts from "typescript";
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
 * Every name bound by one declaration's binding element, flattened.
 * `let cached = null` yields `["cached"]`; `let { run } = slot` yields
 * `["run"]`; `let { a, b: { c } , ...rest } = x` yields
 * `["a", "c", "rest"]`; `let [first, , third] = xs` yields
 * `["first", "third"]` (an omitted array element carries no name at all).
 * Recursive because a binding pattern nests arbitrarily, and a carrier
 * smuggled in as `let { run: heldRun } = ...` binds `heldRun`, not `run`.
 */
function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  const out: string[] = [];
  for (const element of name.elements) {
    if (ts.isOmittedExpression(element)) continue;
    out.push(...bindingNames(element.name));
  }
  return out;
}

/**
 * THE ONLY PARSE SITE IN THIS FILE (PR #239 review round 5 finding 3b,
 * hardened at round 7). Everything downstream — the module-scope
 * detector, the diagnostics accessor, the statement-count check — takes
 * the resulting `ts.SourceFile`, never source text, so there is no second
 * `ts.createSourceFile` for a file-name (or target, or `setParentNodes`)
 * regression to diverge across.
 *
 * **Why by construction and not by convention.** Round 6 had three parse
 * calls behind one helper, and the reviewer's mutation — changing ONLY
 * the detector's call to a hardcoded `"module.ts"` — passed the focused
 * suite 23/23, because the diagnostics pin was parsing its own,
 * correctly-named copy. The pin was asserting on arguments the detector
 * did not use. With one call site that mutation is unrepresentable: it
 * moves the file name for the detector AND the diagnostics AND the real
 * scan at once, and all three go red. The "exactly one call site" claim
 * is itself gated, by the self-scan test at the bottom of this file.
 *
 * `scriptKind` comes from the file name (TypeScript's own
 * `ensureScriptKind` fallback), so a `.tsx` file's JSX parses as JSX
 * rather than as a cascade of type assertions. Callers scanning the real
 * tree pass the real relative path for exactly that reason.
 */
function parseModule(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
}

/**
 * The SYNTACTIC diagnostics OF AN ALREADY-PARSED FILE, used as the "did
 * this actually parse as the language we think it is" check (PR #239
 * review round 5, finding 3b; takes a `ts.SourceFile` rather than source
 * text since round 7 — see `parseModule`).
 *
 * **`parseDiagnostics` is INTERNAL** — it is not on the public
 * `ts.SourceFile` type, so reaching it needs a cast. The public route
 * (`ts.createProgram` + `getSyntacticDiagnostics`) would drag a real
 * program, `tsconfig` resolution and a filesystem host into a scan whose
 * whole point is that it is a syntax-only parse costing milliseconds.
 * The cast is the cheap route, and the risk it carries — a future
 * TypeScript renaming or dropping the property, leaving every diagnostics
 * assertion silently reading `undefined` — is closed by throwing here
 * rather than defaulting to "clean", and pinned by the deliberate-garbage
 * self-test below.
 */
function parseDiagnosticsOf(
  sourceFile: ts.SourceFile,
): readonly ts.Diagnostic[] {
  const parsed = sourceFile as unknown as {
    parseDiagnostics?: readonly ts.Diagnostic[];
  };
  const diagnostics = parsed.parseDiagnostics;
  if (diagnostics === undefined) {
    throw new Error(
      "ts.SourceFile no longer exposes `parseDiagnostics` — this gate's parse-health checks would read as CLEAN on an unparsed file, so they fail loudly here instead",
    );
  }
  return diagnostics;
}

/** The node kinds that open a new `var` scope. A `var` hoists to the
 *  nearest FUNCTION scope, so a `var` inside any of these is function-
 *  local and NOT a module-level carrier; a `var` inside a plain block,
 *  `if`, `try`, `switch` or loop body at module level IS. Class static
 *  blocks and namespace bodies are their own `var` scopes too and are
 *  included on the same rule. */
function opensVarScope(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isClassStaticBlockDeclaration(node) ||
    ts.isModuleDeclaration(node)
  );
}

/**
 * §1's SECOND clause: every module-scope `let`/`var` declared in
 * `sourceFile`, by NAME. Extracted from the test that used to inline it
 * (PR #239 review round 1, item 3) so the detector can be fed synthetic
 * sources and pinned in BOTH directions — what it catches, and what it
 * provably does not.
 *
 * **THIS IS A SYNTAX-AWARE SCOPE CHECK, NOT A TEXT HEURISTIC (PR #239
 * review round 4, reviewer finding 3).** It reads the TypeScript
 * compiler's own parse tree, so "module scope" means the parser's own
 * answer rather than a claim about indentation. What that buys:
 *  - `let { run } = slot;` at the top level is CAUGHT (the previous regex
 *    required an identifier immediately after the keyword and walked
 *    straight past every destructuring pattern);
 *  - `for (var run = null; false; ) {}` at the top level is CAUGHT — a
 *    `var` in a for-head hoists to the enclosing FUNCTION scope, which at
 *    the top level of a module is module scope;
 *  - a `let` sitting at column zero INSIDE a multiline template literal is
 *    not flagged, because it is a string, not a declaration. The previous
 *    line-oriented regex could not tell the two apart, and its
 *    `stripComments` pre-pass could not either.
 * And the whole Prettier composition the original version depended on —
 * `format:check` in CI plus `prettier --write` at pre-commit, with a
 * self-test pinning that Prettier indents block bodies — is GONE, along
 * with its self-test: indentation is irrelevant to the answer in both
 * directions.
 *
 * **THE COVERAGE, EXACTLY, BY KEYWORD (PR #239 review round 5, finding
 * 3a — which is why this is a traversal rather than a walk of
 * `sourceFile.statements`).** The two keywords scope differently, so they
 * are collected differently, and the difference is the whole point:
 *  - **`var`: ANYWHERE in the module's own function scope.** The walk
 *    descends the full tree and stops only at a node that opens a new
 *    `var` scope (`opensVarScope` above). So `if (flag) { var run = null; }`
 *    at module level IS collected — it hoists — as are `var`s in `try`,
 *    `switch`, bare blocks, and loop bodies, and `var`s in all three
 *    for-heads. A `var` inside any function, method, accessor,
 *    constructor, class static block or namespace body is NOT: it hoists
 *    only as far as that scope.
 *  - **`let`: TOP-LEVEL STATEMENTS ONLY.** `let` is block-scoped, so a
 *    `let` inside any block — including a top-level `if` or `try` — can
 *    never outlive it and is not a module-level carrier. `for (let q = 0;
 *    …)` is likewise not collected.
 *  - **`const`: never.** The binding cannot be re-pointed at a run. (What
 *    its VALUE can hold is a different, and disclosed, blind spot — see
 *    the `const slot = { run: null }` MISS pin below.)
 *
 * RESIDUALS, named rather than implied: a run held in a `const` object's
 * mutable property, one held outside the scanned tree, and one smuggled
 * through a closure returned by a factory. All three are pinned or named
 * below; the `var`-in-a-block miss this comment used to disclose is now
 * CAUGHT, and pinned as such.
 *
 * **Takes a PARSED file, not source text (round 7).** The caller parses,
 * once, through `parseModule`; this detector cannot choose a file name of
 * its own, so it cannot disagree with the diagnostics pin about which
 * language the bytes are in.
 */
function moduleScopeMutables(sourceFile: ts.SourceFile): string[] {
  const names: string[] = [];
  // `NodeFlags.Const` and `NodeFlags.Let` are the only flags that
  // distinguish the three keywords: `var` sets neither.
  const isConst = (list: ts.VariableDeclarationList): boolean =>
    (list.flags & ts.NodeFlags.Const) !== 0;
  const isLet = (list: ts.VariableDeclarationList): boolean =>
    (list.flags & ts.NodeFlags.Let) !== 0;
  const collect = (list: ts.VariableDeclarationList): void => {
    for (const declaration of list.declarations) {
      names.push(...bindingNames(declaration.name));
    }
  };

  const visit = (node: ts.Node, atTopLevel: boolean): void => {
    // A `var` below this point hoists to THIS node, not to the module.
    if (opensVarScope(node)) return;

    if (ts.isVariableStatement(node)) {
      const list = node.declarationList;
      // `var` anywhere in this scope; `let` only as a top-level statement.
      if (!isConst(list) && (!isLet(list) || atTopLevel)) collect(list);
    } else if (
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node)
    ) {
      // Only `var` hoists out of a for-head; `let`/`const` there are
      // block-scoped to the loop. All three head forms hoist alike.
      const initializer = node.initializer;
      if (
        initializer !== undefined &&
        ts.isVariableDeclarationList(initializer) &&
        !isConst(initializer) &&
        !isLet(initializer)
      ) {
        collect(initializer);
      }
    }

    node.forEachChild((child) => {
      visit(child, false);
    });
  };

  for (const statement of sourceFile.statements) visit(statement, true);
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
  //
  // WHAT "MODULE-SCOPE" MEANS HERE, EXACTLY (PR #239 review rounds 4 and
  // 5, finding 3): whatever the TypeScript PARSER says it is, applied per
  // KEYWORD — every `var` anywhere in the module's own function scope
  // (top-level blocks, `if`/`try`/`switch` bodies and all three for-heads
  // included, function bodies excluded because that is where a `var`
  // actually stops), and every `let` declared as a top-level statement.
  // Destructuring patterns are included; string and comment contents are
  // excluded by construction. The column-zero heuristic this replaced,
  // and the whole Prettier composition it leaned on, are gone; see
  // `moduleScopeMutables`'s own doc comment for the keyword-by-keyword
  // statement.
  it("no production file under src/monitor/ outside the store DECLARES a module-scope binding — every `var` in the module's function scope (blocks and for-heads included) and every top-level `let` — the syntax-visible half of §1's 'or holds a module-level run'", () => {
    const found: string[] = [];
    for (const file of listFiles(SRC_ROOT, [".ts", ".tsx"])) {
      const rel = toPosixRelative(file);
      if (!rel.startsWith("src/monitor/")) continue;
      if (TEST_FILE.test(rel) || rel === STORE_FILE) continue;
      // ONE parse per file, and all three checks below read THAT tree
      // (PR #239 review round 7). The diagnostics pin can no longer be
      // asserting on a differently-named copy than the detector consumes,
      // because there is no copy: `parseModule` is the file's only
      // `ts.createSourceFile` call site, gated as such below.
      const sourceFile = parseModule(readFileSync(file, "utf8"), rel);
      // RF21 insurance, in the only form that can actually go red on a
      // broken parse (PR #239 review round 5, finding 3b). The previous
      // `statements.length > 0` check could not: a `.tsx` file parsed as
      // `.ts` still yields plenty of statements — garbage ones, with the
      // JSX read as type assertions — so it was green either way. ZERO
      // SYNTACTIC DIAGNOSTICS is the claim that distinguishes them, and
      // it is what makes `parseModule`'s file-name plumbing load-bearing:
      // hardcode that argument and every `.tsx` file here goes red.
      expect(
        parseDiagnosticsOf(sourceFile).map((d) =>
          ts.flattenDiagnosticMessageText(d.messageText, " "),
        ),
        `${rel} did not parse cleanly — the detector is blind, not clean`,
      ).toStrictEqual([]);
      // ...and it parsed to something. Kept alongside, since a source
      // that produced no statements AND no diagnostics (an empty file)
      // would satisfy the check above on its own.
      expect(
        sourceFile.statements.length,
        `${rel} parsed to zero statements — the detector is blind, not clean`,
      ).toBeGreaterThan(0);
      // Identified by NAME, never by line number: a line-pinned gate would
      // go red on any unrelated edit further up the file — a gate that
      // cries wolf is the thing this round is removing, not adding.
      for (const name of moduleScopeMutables(sourceFile)) {
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
    // The detector takes a PARSED file (round 7's single-parse-site fix),
    // so the synthetic-source cases below go through `parseModule` — the
    // same and only call site the real scan uses. A file name is supplied
    // where the case is ABOUT the file name (the `.tsx` pair); everywhere
    // else `module.ts` is fine, since none of those fixtures contain JSX.
    const mutablesOf = (source: string, fileName = "module.ts"): string[] =>
      moduleScopeMutables(parseModule(source, fileName));

    it("catches a module-scope binding under any keyword, exported or not", () => {
      expect(mutablesOf("let cached = null;")).toStrictEqual(["cached"]);
      expect(mutablesOf("var legacySlot;")).toStrictEqual(["legacySlot"]);
      expect(mutablesOf("export let sharedRun = null;")).toStrictEqual([
        "sharedRun",
      ]);
    });

    // THE THREE CASES THAT KILLED THE COLUMN-ZERO HEURISTIC (PR #239
    // review round 4, finding 3 — the reviewer's own counterexamples).
    it("catches a DESTRUCTURED module-scope binding, which the old regex walked straight past", () => {
      // The reviewer's case 1. `let { run } = slot;` binds a mutable
      // module-level `run` as surely as `let run = slot.run;` does, and
      // the previous regex required an identifier immediately after the
      // keyword, so it returned [] here.
      expect(mutablesOf("let { run } = slot;")).toStrictEqual(["run"]);
      // ...and every shape a pattern can wear: renamed, nested, rest,
      // array, with holes.
      expect(
        mutablesOf("let { run: heldRun, meta: { key } } = slot;"),
      ).toStrictEqual(["heldRun", "key"]);
      expect(mutablesOf("let [first, , third] = runs;")).toStrictEqual([
        "first",
        "third",
      ]);
      expect(mutablesOf("var { a, ...rest } = slot;")).toStrictEqual([
        "a",
        "rest",
      ]);
    });

    it("catches a top-level `for (var …)` head — `var` hoists to module scope — and NOT a `for (let …)` head, which is block-scoped", () => {
      // The reviewer's case 2.
      expect(mutablesOf("for (var run = null; false; ) {}")).toStrictEqual([
        "run",
      ]);
      expect(mutablesOf("for (var k in slot) {}")).toStrictEqual(["k"]);
      expect(mutablesOf("for (var r of runs) {}")).toStrictEqual(["r"]);
      // The deliberate NOT: a `let` in a for-head cannot outlive the loop,
      // so it is not a module-level carrier and is not reported. This is
      // the half that makes the check a scope statement rather than a
      // keyword census.
      expect(mutablesOf("for (let q = 0; false; ) {}")).toStrictEqual([]);
      expect(mutablesOf("for (const r of runs) {}")).toStrictEqual([]);
    });

    it("does NOT flag a `let` sitting at column zero inside a multiline template literal — it is a string, not a declaration", () => {
      // The reviewer's case 3, and the one no amount of line-oriented
      // regex plus comment-stripping could ever get right.
      expect(
        mutablesOf(
          "const snippet = `\nlet nestedLocal = 1;\n`;\nexport default snippet;",
        ),
      ).toStrictEqual([]);
      // Same for a `let` named inside a comment — free, now that the
      // parser rather than `stripComments` decides.
      expect(
        mutablesOf("// let smuggledRun = null;\nconst a = 1;"),
      ).toStrictEqual([]);
    });

    it("ignores a `let` inside a function body — a function-local, which is not a module-level carrier, at ANY indentation", () => {
      expect(mutablesOf("function f() {\n  let local = 1;\n}")).toStrictEqual(
        [],
      );
      // Written at column zero, which the previous detector false-flagged.
      // Indentation no longer participates in the answer at all.
      expect(
        mutablesOf("function f() {\nlet local = 1;\nreturn local;\n}"),
      ).toStrictEqual([]);
      // ...and the converse: an INDENTED module-scope declaration, which
      // the previous detector missed, is now caught.
      expect(mutablesOf("  let smuggledRun = null;")).toStrictEqual([
        "smuggledRun",
      ]);
    });

    it("parses a `.tsx` file as JSX rather than as type assertions — pinned by ZERO parse diagnostics, in a red/green pair", () => {
      // The scan feeds real relative paths precisely for this. Without the
      // extension the parser reads `<div ... />` as a type assertion and
      // the statement list is garbage.
      //
      // WHY THE DIAGNOSTICS AND NOT THE NAMES (PR #239 review round 5,
      // finding 3b): the name list alone does NOT pin the plumbing. This
      // fixture parses to `["held"]` either way — as `.ts` the JSX is
      // mangled into a type assertion, but the `let` above it is still a
      // `let`, so hardcoding the file name to `module.ts` inside
      // `parseModule` left this test green and the pin was decoration.
      // The diagnostics are the discriminator: as `.tsx` there are none,
      // as `.ts` there are several. Both halves asserted, so the "clean"
      // half cannot be satisfied by a parser that never complains.
      //
      // ROUND 7: the name assertion and the clean-parse assertion now
      // read the SAME `ts.SourceFile`, so this pin cannot drift from the
      // detector the way round 6's separate parses allowed. Hardcode the
      // file name inside `parseModule` and the `.tsx` half goes RED (the
      // JSX is read as a type assertion and diagnostics appear where none
      // are asserted), together with every `.tsx` file the real scan
      // touches — one mutation, three failing places.
      const tsx = "let held = null;\nconst el = <div className='x' />;\n";
      const asTsx = parseModule(tsx, "src/monitor/Thing.tsx");
      expect(moduleScopeMutables(asTsx)).toStrictEqual(["held"]);
      expect(parseDiagnosticsOf(asTsx)).toStrictEqual([]);
      expect(
        parseDiagnosticsOf(parseModule(tsx, "src/monitor/Thing.ts")).length,
      ).toBeGreaterThan(0);
    });

    it("`parseDiagnosticsOf` reads a real diagnostics list — deliberate garbage comes back non-empty", () => {
      // RF21 on the ACCESSOR itself. `parseDiagnostics` is an internal
      // property (see `parseDiagnosticsOf`'s own comment); if a future
      // TypeScript renamed it, every "parses cleanly" assertion in this
      // file would read `undefined`. The helper throws rather than
      // defaulting to clean, and this is the positive half proving the
      // property is really there and really populated.
      expect(
        parseDiagnosticsOf(parseModule("const = ;\nfunction (", "module.ts"))
          .length,
      ).toBeGreaterThan(0);
      expect(
        parseDiagnosticsOf(parseModule("const a = 1;\n", "module.ts")),
      ).toStrictEqual([]);
    });

    // THE SINGLE-PARSE PROPERTY, ASSERTED RATHER THAN ASSUMED (PR #239
    // review round 7). Everything above rests on there being exactly one
    // place in this file where a `ts.SourceFile` is created: that is what
    // makes a file-name regression unrepresentable instead of merely
    // unlikely. Round 6 had three parse calls behind one helper and the
    // reviewer's detector-only mutation passed 23/23 — the diagnostics
    // pin was asserting on its own correctly-named copy. This test is
    // that structural claim, in the only form text can carry it: count
    // the `ts.createSourceFile` call sites in this file's own source,
    // comments stripped (the header and the doc comments name the API in
    // prose several times). A second parse site — anywhere, including a
    // well-meant convenience helper — moves the number and fails here,
    // which is the moment to ask what it is allowed to disagree about.
    it("creates a ts.SourceFile at EXACTLY ONE call site — a second parse is where a file-name regression could hide", () => {
      const self = stripComments(readFileSync(import.meta.filename, "utf8"));
      expect(self.match(/ts\.createSourceFile\(/g)).toHaveLength(1);
    });

    it("MISSES a run held in a `const` object's mutable property (header: 'what it cannot see')", () => {
      // The exact carrier shape §2 deleted, wearing a `const`. Syntax
      // alone cannot tell this from any other constant — the binding is
      // genuinely immutable; what it POINTS AT is not — which is why §1's
      // second clause is only half-gated and the scan test above says so
      // in its name.
      expect(mutablesOf("const slot = { run: null };")).toStrictEqual([]);
    });

    // THE FORMER RESIDUAL, NOW CAUGHT (PR #239 review round 5, finding
    // 3a — the reviewer's own counterexample). This used to be pinned as
    // a MISS: the walk was over top-level statements, so a `var` nested
    // in a top-level block escaped even though it hoists to module scope.
    // The walk is now a `var`-scope traversal and the shape is caught.
    it("CATCHES a `var` hoisting out of a top-level BLOCK — `if (flag) { var run = null; }` is a module-level binding", () => {
      expect(
        mutablesOf("if (flag) {\n  var smuggledRun = null;\n}"),
      ).toStrictEqual(["smuggledRun"]);
      // The identical declaration as a top-level statement, unchanged.
      expect(mutablesOf("var smuggledRun = null;")).toStrictEqual([
        "smuggledRun",
      ]);
      // ...and every other block shape a `var` can hide in at module
      // level, since `if` is not special — a bare block, `try`/`catch`/
      // `finally`, `switch`, and a loop body all hoist the same way.
      expect(mutablesOf("{\n  var inBlock = null;\n}")).toStrictEqual([
        "inBlock",
      ]);
      expect(
        mutablesOf(
          "try {\n  var inTry = null;\n} catch {\n  var inCatch = null;\n}",
        ),
      ).toStrictEqual(["inTry", "inCatch"]);
      expect(
        mutablesOf("while (flag) {\n  var inLoop = null;\n}"),
      ).toStrictEqual(["inLoop"]);
      expect(
        mutablesOf("switch (x) {\n  case 1: {\n    var inCase = null;\n  }\n}"),
      ).toStrictEqual(["inCase"]);
    });

    // THE OTHER HALF OF THE SAME RULE, and the reason this is a
    // `var`-scope traversal rather than "collect every `var` anywhere".
    it("does NOT flag a `var` inside a function — `var` hoists to the nearest FUNCTION scope, which is where it stops", () => {
      expect(
        mutablesOf("function f() {\n  var local = null;\n}"),
      ).toStrictEqual([]);
      // Nested a block deep inside the function, so the exclusion is the
      // function boundary and not merely "one level down".
      expect(
        mutablesOf(
          "function f() {\n  if (flag) {\n    var local = null;\n  }\n}",
        ),
      ).toStrictEqual([]);
      // Every other node that opens a `var` scope, on the same rule.
      expect(
        mutablesOf("const f = () => {\n  var local = null;\n};"),
      ).toStrictEqual([]);
      expect(
        mutablesOf(
          "class C {\n  m() {\n    var local = null;\n  }\n  get g() {\n    var inGetter = null;\n    return inGetter;\n  }\n}",
        ),
      ).toStrictEqual([]);
    });

    // ...and the CONVERSE for `let`, which scopes differently and is
    // therefore collected differently. A `let` in a top-level block dies
    // with the block and can never be a module-level carrier, so
    // collecting it would be a false positive, not a tightening.
    it("does NOT flag a `let` inside a top-level BLOCK — `let` is block-scoped, so it never reaches module scope", () => {
      expect(
        mutablesOf("if (flag) {\n  let blockLocal = null;\n}"),
      ).toStrictEqual([]);
      expect(mutablesOf("{\n  let blockLocal = null;\n}")).toStrictEqual([]);
      // The discriminator, side by side: same block, same name, `var`
      // instead of `let`, and it IS collected.
      expect(
        mutablesOf("if (flag) {\n  var blockLocal = null;\n}"),
      ).toStrictEqual(["blockLocal"]);
    });
  });
});
