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
// the palette has two layers instead of one: overriding
// `--judge-faster`/`--judge-slower` in place would have been fewer lines
// and would have turned the alarm blue.
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

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
    .replace(/judgeTokens\.test\.ts$/, filename);
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
  // retiring `--judge-faster`/`--judge-slower` pair carries today, so this
  // change repaints nothing — contrast measured against both backgrounds a
  // judged value sits on (--surface #fffdf7, --page #f4f1e8):
  // --judge-blue 8.25:1 / 7.43:1, --judge-red 7.94:1 / 7.15:1. Both clear
  // the house 4.5:1 floor.
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
  // The aliases are Task 3's to retire, once nothing emits the classes that
  // consume them. Pinned here so this task cannot "tidy" them away early:
  // deleting them while `PaneLive`/`PaneGrid`/`PostWorkoutSummary` still
  // emit `.timer-card-actual-faster` and `.summary-row-*` leaves judged
  // colour DARK app-wide with every gate green — `pnpm build` exits 0,
  // because an unresolvable `var()` is invalid at computed-value time, not
  // a parse error.
  it("keeps --judge-faster/--judge-slower alive as aliases for Task 3 to retire", () => {
    expect(declaredValue(TOKENS_ROOT, "--judge-faster")).toBe(
      "var(--judge-blue)",
    );
    expect(declaredValue(TOKENS_ROOT, "--judge-slower")).toBe(
      "var(--judge-red)",
    );
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

  // The old pair still stands and still resolves through the aliases —
  // Task 3 removes them together with their emitters. If this goes red
  // before Task 3, judged colour has gone dark on a shipped surface.
  it("leaves the two rules Task 3 retires still resolving", () => {
    expect(
      scopedRuleBodies(indexCss, ".timer-card-actual-faster")[0],
    ).toContain("color: var(--judge-faster);");
    expect(
      scopedRuleBodies(indexCss, ".timer-card-actual-slower")[0],
    ).toContain("color: var(--judge-slower);");
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
