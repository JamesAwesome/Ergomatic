// THE JUDGE PALETTE SPLITS INTO RAW INKS AND RESOLVED SLOTS.
//
// Phase JC Task 2 (spec `docs/superpowers/specs/2026-09-08-judge-colours-
// design.md`, "How the colour reaches the pixels"). A rower will shortly be
// able to choose, per slot, whether a judged pace or stroke-rate number is
// red, blue, or uncoloured. The mechanism is four RESOLVED custom
// properties on the root — `--judge-{pace,spm}-{faster,slower}` — that a
// runtime `documentElement.style.setProperty` overrides. Every consumer
// stays plain CSS and never learns a preference exists.
//
// I-4, THE ONE WITH TEETH: `.connected-lost` — the red LOST THE MONITOR
// banner — is an ALARM, not a judged number, and must stay red at every
// setting, including all-blue. It therefore paints from the RAW ink
// `--judge-red`, never from a resolved slot. That split is the whole reason
// the palette has two layers instead of one: overriding the single
// `--judge-faster`/`--judge-slower` pair in place (Task 3 retired it) would
// have been fewer lines and would have turned the alarm blue.
//
// WHY CSS-SOURCE TESTS AND NOT COMPUTED COLOUR: Vitest mocks every `.css`
// import to `""` for this project, and jsdom does not resolve `var()` —
// `getComputedStyle(el).color` returns the literal string
// `"var(--judge-pace-faster)"`, so an assertion written as
// `toContain("var(--judge-pace-faster)")` passes against a completely
// broken cascade. These read the stylesheets' source text straight off
// disk, the same `node:fs` + `commentStrippedSource` idiom
// `tokens.test.ts` and `ConnectedSurface.test.tsx` already use. Only e2e
// asserts a colour.
//
// COMMENT-STRIPPING IS LOAD-BEARING, not hygiene: `index.css` carries a
// comment naming `--judge-slower` fifteen lines above `.connected-lost`'s
// real `background` declaration, so an unstripped sweep for that token
// hits prose and reports a hit that no browser would ever see —
// `cssView.ts`'s own header documents three shipped instances of exactly
// that defect.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compileProgram } from "../../domain/monitor/program.js";
import type { MonitorFrame } from "../../domain/monitor/types.js";
import type { WorkoutType } from "../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";
import PostWorkoutSummary from "../session/PostWorkoutSummary";
import type { SummaryModel } from "../session/summaryModel";
import PaneGrid from "../workout/connected/PaneGrid";
import PaneLive from "../workout/connected/PaneLive";
import type { SurfaceModel } from "../workout/connected/surfaceModel";
import { buildSurfaceModel } from "../workout/connected/surfaceModel";
import SettingsScreen from "../you/SettingsScreen";
import {
  commentStrippedSource,
  cssRules,
  scopedRuleBodies,
} from "../test/cssView";

function thisDirPath(filename: string): string {
  // Same plain string surgery `tokens.test.ts` uses and documents: this
  // project's jsdom environment resolves `new URL(...)` against
  // `http://localhost:3000/` instead of the given `file://` base. Replaces
  // only this file's OWN basename, so `filename` is relative to `theme/`.
  return import.meta.url
    .replace(/^file:\/\//, "")
    .replace(/judgeTokens\.test\.tsx$/, filename);
}

const tokensCss = commentStrippedSource(
  readFileSync(thisDirPath("tokens.css"), "utf-8"),
);
const indexCss = commentStrippedSource(
  readFileSync(thisDirPath("../index.css"), "utf-8"),
);

/** The one top-level `:root` block in `tokens.css`. Its count is pinned by
 *  `tokens.test.ts`; this reads `[0]` and would surface a structural change
 *  as a failed value assertion below rather than silently. */
const TOKENS_ROOT = scopedRuleBodies(tokensCss, ":root")[0] ?? "";

function declaredValue(block: string, name: string): string | null {
  const re = new RegExp(
    `${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([^;]+);`,
  );
  const match = re.exec(block);
  return match ? match[1]!.trim() : null;
}

/** The four resolved slots, and the raw ink each resolves to TODAY. The
 *  runtime override replaces the value; the NAME is what every consumer
 *  binds to, which is why the names are the contract. */
const SLOTS = [
  { slot: "--judge-pace-faster", ink: "var(--judge-blue)" },
  { slot: "--judge-pace-slower", ink: "var(--judge-red)" },
  { slot: "--judge-spm-faster", ink: "var(--judge-blue)" },
  { slot: "--judge-spm-slower", ink: "var(--judge-red)" },
] as const;

/** Class → the resolved slot its `color` must name. Four classes, one per
 *  slot: this is what makes pace and SPM separable at all. */
const TINT_RULES = [
  { selector: ".judge-pace-faster", slot: "--judge-pace-faster" },
  { selector: ".judge-pace-slower", slot: "--judge-pace-slower" },
  { selector: ".judge-spm-faster", slot: "--judge-spm-faster" },
  { selector: ".judge-spm-slower", slot: "--judge-spm-slower" },
] as const;

describe("the judge palette: raw inks and resolved slots (tokens.css)", () => {
  // The two inks a rower may choose. Their hex values are the ones the
  // retired `--judge-faster`/`--judge-slower` pair carried, so the split
  // repainted nothing — contrast recomputed 2026-09-08 against the THREE
  // backgrounds a judged value sits on (--surface #fffdf7, --page #f4f1e8,
  // --surface-sunken #efeade, the last of them a resting grid row's SPM
  // cell): --judge-blue 8.25 / 7.43 / 6.99:1, --judge-red 7.94 / 7.15 /
  // 6.73:1. Both clear the house 4.5:1 floor. `tokens.css`'s own block
  // carries the same table and why the third ground is reachable.
  it("declares the two raw inks as literal hex, not as references", () => {
    expect(declaredValue(TOKENS_ROOT, "--judge-blue")).toBe("#1d4e89");
    expect(declaredValue(TOKENS_ROOT, "--judge-red")).toBe("#962718");
  });

  it.each(SLOTS)("$slot resolves to $ink", ({ slot, ink }) => {
    expect(declaredValue(TOKENS_ROOT, slot)).toBe(ink);
  });

  // That a custom property may hold a `var()` reference and RESOLVE through
  // it is PRIMARY — CSS Custom Properties Level 1 §2.3, verbatim: "Custom
  // properties are left almost entirely unevaluated, except that they allow
  // and evaluate the var() function in their value." It already ships here
  // (`--ink-1: var(--ink)`), on James's phone today.
  //
  // THE ALIASES ARE GONE (Task 3). They existed for exactly one commit
  // boundary: deleting them while `PaneLive`/`PaneGrid`/
  // `PostWorkoutSummary` still emitted `.timer-card-actual-faster` and
  // `.summary-row-*` would have left judged colour DARK app-wide with
  // every gate green — `pnpm build` exits 0, because an unresolvable
  // `var()` is invalid at computed-value time, not a parse error. With
  // every emitter moved onto the four slots they have no consumers, and
  // leaving them would give the next author two plausible tokens to reach
  // for, one of which nothing reads.
  it("retired --judge-faster/--judge-slower once nothing emitted their classes", () => {
    expect(declaredValue(TOKENS_ROOT, "--judge-faster")).toBeNull();
    expect(declaredValue(TOKENS_ROOT, "--judge-slower")).toBeNull();
  });
});

describe("the four judged tint rules (index.css)", () => {
  it.each(TINT_RULES)(
    "$selector is declared exactly once at the top level and colors from $slot",
    ({ selector, slot }) => {
      const bodies = scopedRuleBodies(indexCss, selector);
      expect(bodies).toHaveLength(1);
      expect(bodies[0]!).toContain(`color: var(${slot});`);
    },
  );

  // BOTH SUPERSEDED PAIRS ARE GONE (Task 3), and so is every reference to
  // the tokens behind them. The four rules above are the only place a
  // judged verdict gets its colour now, on either surface — a surviving
  // `.timer-card-actual-faster` or `.summary-row-slower` would be a rule
  // nothing can reach (recurring failure 5) and a second plausible hook
  // for the next author to wire a new emitter to.
  it("retired both pre-split pairs and every reference to their tokens", () => {
    for (const selector of [
      ".timer-card-actual-faster",
      ".timer-card-actual-slower",
      ".summary-row-faster",
      ".summary-row-slower",
    ]) {
      expect(scopedRuleBodies(indexCss, selector)).toHaveLength(0);
    }
    expect(indexCss).not.toContain("var(--judge-faster)");
    expect(indexCss).not.toContain("var(--judge-slower)");
  });

  // Unchanged by this task, and asserted so a careless edit to the block
  // these rules sit in is caught: `stale` keeps the old prefix and a plain
  // `--ink-3`, because a stale reading is not a judgement.
  it("leaves .timer-card-actual-stale on --ink-3", () => {
    const bodies = scopedRuleBodies(indexCss, ".timer-card-actual-stale");
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!).toContain("color: var(--ink-3);");
  });
});

describe("I-4: the LOST THE MONITOR alarm never follows the preference", () => {
  // The banner's fill is the raw ink. A rower who sets every slot to blue
  // still gets a red alarm.
  it(".connected-lost fills from the raw --judge-red", () => {
    // `[0]`, not the only body: this selector has a second rule inside the
    // landscape query (its own grid placement), and the fill belongs to the
    // base rule so both orientations inherit it.
    const base = scopedRuleBodies(indexCss, ".connected-lost")[0];
    expect(base).toBeDefined();
    expect(base!).toContain("background: var(--judge-red);");
  });

  // THE INVARIANT ITSELF, and it is deliberately not expressed with
  // `scopedRuleBodies`: that function filters by ONE selector, and I-4 is a
  // statement about the WHOLE stylesheet — no resolved slot may reach any
  // `background` declaration anywhere, under any selector, at any nesting
  // depth. A per-selector assertion would pass the moment someone paints a
  // NEW alarm from a slot. `cssRules` walks every rule the browser sees,
  // including the ones inside the six `@media (orientation: …)` queries.
  it("no resolved slot appears in any background declaration in index.css", () => {
    const offenders = cssRules(indexCss)
      .flatMap((rule) =>
        rule.body
          .split(";")
          .map((decl) => decl.trim())
          .filter(
            (decl) =>
              /^background(-color|-image)?\s*:/.test(decl) &&
              /var\(\s*--judge-(pace|spm)-/.test(decl),
          )
          .map((decl) => `${rule.selectors.join(", ")} { ${decl} }`),
      )
      .sort();
    expect(offenders).toStrictEqual([]);
  });

  // RF21: the sweep above is a negative assertion over 10,000 lines, so it
  // reads as evidence whether or not it can ever fail. This proves it can,
  // against the same two patterns, without touching the real stylesheet.
  it("the sweep finds a slot-painted background when one exists", () => {
    const sample =
      ".alarm { background: var(--judge-pace-slower); }\n" +
      ".fine { color: var(--judge-pace-slower); }\n" +
      ".alsofine { background: var(--judge-red); }";
    const offenders = cssRules(commentStrippedSource(sample))
      .flatMap((rule) =>
        rule.body
          .split(";")
          .map((decl) => decl.trim())
          .filter(
            (decl) =>
              /^background(-color|-image)?\s*:/.test(decl) &&
              /var\(\s*--judge-(pace|spm)-/.test(decl),
          )
          .map((decl) => `${rule.selectors.join(", ")} { ${decl} }`),
      )
      .sort();
    expect(offenders).toStrictEqual([
      ".alarm { background: var(--judge-pace-slower) }",
    ]);
  });

  // The comment-strip is not hygiene here. `index.css` names
  // `--judge-slower` in prose fifteen lines above the declaration this
  // section pins, so a sweep over the RAW text sees a token reference no
  // browser does. Proven against the real file rather than asserted.
  it("comment-stripping is what keeps the sweep off prose", () => {
    const raw = readFileSync(thisDirPath("../index.css"), "utf-8");
    const commentsOnly = raw.match(/\/\*[\s\S]*?\*\//g)?.join("\n") as string;
    // The file really does name judge tokens in prose, so a sweep over raw
    // text would report references no browser resolves...
    expect(commentsOnly).toMatch(/--judge-/);
    // ...and the stripped view this whole file reads really does drop them.
    const count = (text: string) => (text.match(/--judge-/g) ?? []).length;
    expect(count(indexCss)).toBe(count(raw) - count(commentsOnly));
  });
});

// ---------------------------------------------------------------------------
// I-3's cascade half: a verdict class must be able to WIN
// ---------------------------------------------------------------------------

// THIS SHIPPED BROKEN AND THE BROWSER GATE CAUGHT IT (Phase JC Task 3).
// Moving the summary's verdicts onto the shared `.judge-*` family moved
// them ~5000 lines UP `index.css`, and `.summary-row-pace` declared
// `color: var(--ink)` at (0,1,0) below them — equal specificity, later
// wins — so every judged row on the summary rendered plain ink. Nothing
// at the class layer could see it: jsdom resolves no `var()` and every
// client assertion here is a class name. `design.spec.ts`'s §2E computed-
// colour leg went red, on the real cascade, in a real browser.
//
// The fix was to delete that declaration (both cells inherit the same
// `--ink` from `body`), and this is the INVARIANT behind it rather than
// the counterexample: a judged cell's neutral tone arrives by
// INHERITANCE, which any matching rule beats, so no bare rule for one of
// these classes may declare `color` at all. `index.css`'s own pane C block
// already stated this in prose — "NO RULE THAT COULD MATCH A JUDGED CELL
// DECLARES `color`" — learned from the identical bug on pane B's hero, and
// prose is not a gate.
//
// SCOPED TO THE BARE (0,1,0) SELECTOR ON PURPOSE. A more specific rule
// (`.summary-hero-lead .summary-hero-value`, say) beats a verdict class on
// specificity regardless of source order, and such a rule is a deliberate
// override rather than an accident. It is the single-class form — the one
// that wins only by sitting lower in the file — this cannot allow.
const JUDGED_CELL_CLASSES = [
  // `PaneLive.tsx`'s `judgedClass`, all three sites.
  "connected-hero-value",
  "connected-hero-avg-value",
  // `PaneGrid.tsx`'s `cellClass`, both columns.
  "connected-grid-pace",
  "connected-grid-spm",
  // `PostWorkoutSummary.tsx`'s `judgedColorClass`, all three elements it
  // lands on. `.summary-row-bar` paints `background: currentColor`, so it
  // needs the verdict to reach its own `color` too.
  "summary-row-pace",
  "summary-row-dev",
  "summary-row-bar",
  // Task 6's settings screen (`you/SettingsScreen.tsx`): each group's live
  // preview specimen wears the same verdict class a real row does, on an
  // element whose own class sits ~5,700 lines lower in this stylesheet —
  // the exact source-order shape that broke the summary above.
  "judge-preview-value",
] as const;

/** Every `selector { decl }` where a bare judged-cell class sets `color`. */
function inheritanceBreakers(source: string): string[] {
  return cssRules(source)
    .flatMap((rule) => {
      const bare = JUDGED_CELL_CLASSES.filter((c) =>
        rule.selectors.includes(`.${c}`),
      );
      if (bare.length === 0) return [];
      return rule.body
        .split(";")
        .map((decl) => decl.trim())
        .filter((decl) => /^color\s*:/.test(decl))
        .flatMap((decl) => bare.map((c) => `.${c} { ${decl} }`));
    })
    .sort();
}

describe("I-3's cascade half: nothing outranks a verdict by source order", () => {
  it("no judged cell's own bare class declares color anywhere in index.css", () => {
    expect(inheritanceBreakers(indexCss)).toStrictEqual([]);
  });

  // RF21: the assertion above is a negative sweep over 10,000 lines and
  // reads as evidence whether or not it can fail. This is the exact
  // declaration the rename shipped, replayed against a sample — plus the
  // two shapes that must NOT trip it: a multi-class override (which wins
  // on specificity, deliberately) and a non-color declaration.
  it("the sweep finds the declaration that actually broke the summary", () => {
    const sample =
      ".summary-row-pace,\n.summary-row-target { color: var(--ink); }\n" +
      ".summary-hero-lead .summary-row-pace { color: var(--ink-2); }\n" +
      ".summary-row-dev { font-weight: 600; }";
    expect(inheritanceBreakers(commentStrippedSource(sample))).toStrictEqual([
      ".summary-row-pace { color: var(--ink) }",
    ]);
  });
});

// ---------------------------------------------------------------------------
// LOW-3: the list above is DERIVED, not maintained by hand
// ---------------------------------------------------------------------------

// WHY THIS EXISTS (whole-branch review, 2026-09-08). `JUDGED_CELL_CLASSES`
// was eight names typed out by hand. All eight were right on the day, and
// NOTHING failed when a ninth judged cell appeared without being added: the
// sweep above would simply stop covering it. That is the weakest possible
// link in the fix for this branch's own worst bug, because the bug class is
// INVISIBLE at the class layer — a rule moving in `index.css` lost an
// equal-specificity tie and blanked every judged summary row while every
// client assertion here stayed green.
//
// TWO GATES, AND NEITHER IS THE OTHER'S DUPLICATE:
//
//   THE FILE CENSUS walks every non-test source file under `src/` and
//   requires the set that COMPOSES a verdict class to be exactly the four
//   emitters named below. It catches a judged cell added in a NEW file,
//   which the render census cannot see.
//
//   THE RENDER CENSUS mounts those four emitters, forces every judgeable
//   value in their models to a verdict, and collects the classes that
//   actually land on the same ELEMENT as a `judge-*` class in jsdom. It
//   catches a ninth judged cell added to a file that is already an emitter,
//   which the file census cannot see. It reads the DOM rather than the
//   source on purpose: the four emitters compose their class strings four
//   different ways (a two-level helper, a one-level helper, a template with
//   a variable, a template with a table lookup), so any source-text
//   extractor would encode today's four shapes and go quietly blind on a
//   fifth — recurring failure 21 with extra steps.
//
// WHAT THE PAIR DOES NOT PROVE, stated rather than left to be assumed
// (recurring failure 26): a judged cell added to an existing emitter behind
// a branch that `forceEveryJudgement` cannot reach — one keyed on something
// other than a `JudgedValue` — is still invisible to both. The browser gate
// (`e2e/design.spec.ts` §2E's computed-colour legs) is what has actually
// caught this bug class once; these two make the cheap client sweep stop
// narrowing silently in the two ways it demonstrably could.

/** `src/`, resolved off this file's own path — the same plain-string
 *  surgery `thisDirPath` above and `connectedPhaseReaders.test.ts` both
 *  use, and for the same reason (jsdom resolves `new URL(...)` against
 *  `http://localhost:3000/`, not the `file://` base). */
const SRC_ROOT = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(/\/theme\/judgeTokens\.test\.tsx$/, "");

/** Every non-test `.ts`/`.tsx` under `src/`, relative to `src/`. */
function productionSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(SRC_ROOT, dir))) {
      const rel = dir === "" ? entry : `${dir}/${entry}`;
      if (statSync(join(SRC_ROOT, rel)).isDirectory()) {
        walk(rel);
        continue;
      }
      if (!/\.tsx?$/.test(rel) || /\.test\.tsx?$/.test(rel)) continue;
      out.push(rel);
    }
  };
  walk("");
  return out.sort();
}

/** Does this source COMPOSE a judged verdict class name?
 *
 *  Matches the literal form (`"judge-pace-faster"`, `PostWorkoutSummary`
 *  and `SettingsScreen`) and the interpolated one
 *  (`` `judge-${metric}-${judgement}` ``, `PaneLive` and `PaneGrid`) — a
 *  literal-only sweep would report two emitters, not four.
 *
 *  `(?<!-)` is load-bearing: `you/judgeColors.ts` names all four CUSTOM
 *  PROPERTIES (`--judge-pace-faster`), which are the tokens the classes
 *  read, not classes a cell can wear. Without the guard that file joins the
 *  emitter list and the census stops meaning anything. */
const VERDICT_COMPOSER =
  /(?<!-)judge-(?:pace|spm|\$\{[^}]*\})-(?:faster|slower|\$\{[^}]*\})/;

/** The four files allowed to put a verdict class on an element. Each one's
 *  cells are enumerated in `JUDGED_CELL_CLASSES` above. */
const VERDICT_EMITTERS = [
  "session/PostWorkoutSummary.tsx",
  "workout/connected/PaneGrid.tsx",
  "workout/connected/PaneLive.tsx",
  "you/SettingsScreen.tsx",
] as const;

describe("LOW-3, the file census: only four files compose a verdict class", () => {
  it("no production file outside the four known emitters composes one", () => {
    const offenders = productionSourceFiles().filter(
      (rel) =>
        !(VERDICT_EMITTERS as readonly string[]).includes(rel) &&
        VERDICT_COMPOSER.test(
          commentStrippedSource(readFileSync(join(SRC_ROOT, rel), "utf-8")),
        ),
    );
    expect(offenders).toStrictEqual([]);
  });

  // The allowlist half. Without this, an emitter that stopped emitting
  // would leave a dead entry nobody notices, and the sweep above would be
  // guarding a name that no longer exists.
  it("every allowlisted emitter really does compose one — no dead entries", () => {
    for (const rel of VERDICT_EMITTERS) {
      const stripped = commentStrippedSource(
        readFileSync(join(SRC_ROOT, rel), "utf-8"),
      );
      expect([rel, VERDICT_COMPOSER.test(stripped)]).toStrictEqual([rel, true]);
    }
  });

  // RF21, on the detector rather than on the sweep: both shapes fire, prose
  // does not, and a custom-property name does not.
  it("the detector fires on both composition shapes and on neither decoy", () => {
    const fires = (source: string): boolean =>
      VERDICT_COMPOSER.test(commentStrippedSource(source));
    expect(fires('const c = "judge-spm-slower";')).toBe(true);
    expect(fires("const c = `judge-${metric}-${judgement}`;")).toBe(true);
    expect(fires('const t = "--judge-pace-faster";')).toBe(false);
    expect(fires("// a comment naming judge-pace-slower in prose\n")).toBe(
      false,
    );
  });
});

/** THE FORCED MODEL. Every judged cell in the app reads a `JudgedValue`
 *  (`{ display, judgement, absent }`) or a `GridValue` (`{ display, judged
 *  }`), so a deep walk that sets every one of them to `slower` puts a
 *  verdict on every cell that can hold one, without this file needing to
 *  know which frame or interval state reaches which cell. That genericity
 *  is the point: `PaneLive`'s AVG cell is judged only during a rest that
 *  folded onto a completed interval, and a census that had to arrange that
 *  state would be a census of the fixtures rather than of the surface. */
function forceEveryJudgement<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v: unknown) => forceEveryJudgement(v)) as unknown as T;
  }
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = forceEveryJudgement(v);
  }
  if ("judgement" in out && "display" in out && "absent" in out) {
    out.judgement = "slower";
    out.absent = false;
  }
  if ("judged" in out) {
    out.judged = {
      display: typeof out.display === "string" ? out.display : "2:00.0",
      judgement: "slower",
      absent: false,
    };
  }
  return out as T;
}

const VERDICT_CLASS = /^judge-(?:pace|spm)-(?:faster|slower)$/;

/** Every OTHER class sharing an element with a verdict class. The whole
 *  element's class list, not just the base: a sibling class that declares
 *  `color` breaks the verdict exactly as the base class would, so it
 *  belongs in the sweep too. */
function judgedCellClassesIn(container: ParentNode): string[] {
  const found = new Set<string>();
  for (const el of Array.from(container.querySelectorAll("*"))) {
    const classes = Array.from(el.classList);
    if (!classes.some((c) => VERDICT_CLASS.test(c))) continue;
    for (const c of classes) if (!VERDICT_CLASS.test(c)) found.add(c);
  }
  return Array.from(found);
}

/** A REAL library workout (agent briefing's realistic-fixture rule), the
 *  same `Filling Low` + authored opener `PaneLive.test.tsx` builds its own
 *  model from. */
function connectedModel(): SurfaceModel {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
  if (!w) throw new Error("missing library fixture: Filling Low");
  const draft = buildDraft({
    id: "filling-low",
    title: w.title,
    type: w.type as WorkoutType,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { effort: "min" },
      },
      ...w.steps,
    ],
  });
  const phases = buildRun(
    draft,
    { k2Seconds: 112, k6Seconds: 122 },
    new Date("2026-08-07T09:00:00.000Z"),
  ).phases;
  const program = compileProgram(phases);
  if ("code" in program)
    throw new Error(`fixture failed to compile: ${program.code}`);
  const frame: MonitorFrame = {
    elapsedSeconds: 600,
    distanceMeters: 2400,
    sessionElapsedSeconds: 600,
    sessionDistanceMeters: 2400,
    currentSplit: 117.8,
    spm: 21,
    heartRateBpm: 164,
    splitAvgPace: 121.4,
    restSeconds: 0,
    intervalIndex: 1,
    intervalRemaining: { kind: "distance", value: 1200 },
    intervalAccrued: null,
    state: "rowing",
    rowingActive: true,
  };
  return forceEveryJudgement(
    buildSurfaceModel({
      phases,
      program,
      status: "live",
      linkLost: false,
      frame,
      deviceName: "PM5 432331249",
      actuals: [],
      freeRow: false,
    }),
  );
}

/** The monitor-door shape `PostWorkoutSummary.test.tsx` uses: an unjudged
 *  opener plus a faster row and a slower one. */
function summaryModel(): SummaryModel {
  return {
    meta: {
      dateLabel: "AUG 10",
      timeLabel: "18:57",
      sourceLabel: "PM5 432331249",
    },
    heroes: { avgSplit: "2:09.2", time: "25:50", distanceMeters: 6000 },
    rows: [
      {
        measured: true,
        index: 1,
        label: "4:00 @ MIN",
        timeLabel: "4:00",
        paceLabel: "2:20.0",
      },
      {
        measured: true,
        index: 2,
        label: "6:00 @ 6k",
        timeLabel: "6:00",
        paceLabel: "2:05.0",
        judged: {
          direction: "faster",
          deviationSeconds: -4.2,
          deviationLabel: "−4.2",
          barWidthPercent: 50,
        },
      },
      {
        measured: true,
        index: 3,
        label: "6:00 @ 6k",
        timeLabel: "6:20",
        paceLabel: "2:13.4",
        judged: {
          direction: "slower",
          deviationSeconds: 4.2,
          deviationLabel: "+4.2",
          barWidthPercent: 50,
        },
      },
    ],
  };
}

describe("LOW-3, the render census: the sweep's list is what the emitters emit", () => {
  afterEach(() => {
    cleanup();
  });

  it("every class sharing an element with a verdict is in JUDGED_CELL_CLASSES, and every entry is reached", () => {
    const model = connectedModel();
    const found = new Set<string>();
    const add = (container: HTMLElement) => {
      for (const c of judgedCellClassesIn(container)) found.add(c);
    };

    add(render(<PaneLive model={model} />).container);
    cleanup();
    add(render(<PaneGrid model={model} />).container);
    cleanup();
    add(
      render(
        <MemoryRouter>
          <PostWorkoutSummary
            title="Sea Fret"
            model={summaryModel()}
            pacesOffCaption="PACES OFF 6K 2:09.0"
            hint="TARGET 2:09.0"
            expectedEffort={3}
            held={null}
            onHeld={vi.fn()}
            effort={null}
            onEffort={vi.fn()}
            thumbs={null}
            onThumbs={vi.fn()}
            notes=""
            onNotes={vi.fn()}
            plan={null}
            accountBaselines={{ k2Seconds: 112, k6Seconds: 122 }}
            saving={false}
            saveError={null}
            onLogAgainstPlan={vi.fn()}
            onSaveWithoutLogging={vi.fn()}
            discardSlot={null}
          />
        </MemoryRouter>,
      ).container,
    );
    cleanup();
    add(
      render(
        <MemoryRouter initialEntries={["/you/settings"]}>
          <Routes>
            <Route path="/you" element={<p>You screen</p>} />
            <Route path="/you/settings" element={<SettingsScreen />} />
          </Routes>
        </MemoryRouter>,
      ).container,
    );

    // ONE ASSERTION, BOTH DIRECTIONS. Extra means a judged cell the sweep
    // above never checks; missing means a listed name no emitter puts on a
    // judged element any more (a rename, or a cell that quietly stopped
    // being judged) — dead weight in a negative sweep, which is how a
    // negative sweep goes quietly vacuous.
    expect(Array.from(found).sort()).toStrictEqual(
      Array.from(JUDGED_CELL_CLASSES).sort(),
    );
  });
});
