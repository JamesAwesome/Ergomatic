/**
 * House utility (Phase 7B Task 8, the comment-stripped-view pattern):
 * returns `text` with every comment removed, for tests that pin a
 * structural fact about a raw SOURCE file (CSS or TSX) read straight off
 * disk — Vitest mocks every `.css` import to an empty string for this
 * project, and the client tsconfig deliberately carries no `@types/node`
 * ambient d.ts (`src/session/node-fs-raw.d.ts` explains why), so "read the
 * file and regex it" is the only way several of this repo's own tests can
 * pin a CSS declaration or a JSX caller pattern at all.
 *
 * THE DEFECT THIS EXISTS TO STOP RECURRING: a rule-body or caller-sweep
 * regex captures a DOC COMMENT sitting next to the code it's actually
 * trying to pin, and a comment that happens to say the same words as a
 * since-deleted declaration/usage satisfies the assertion anyway —
 * `min-height: 0` shipped GONE from a real rule while its own doc comment
 * still said "min-height: 0" and every gate stayed green (task-7 review,
 * M1); a caller-sweep regex matched its OWN commentary about the finding
 * in the SAME round it was fixing (task-7 fix round, mutation 11's "meta-
 * catch"); a `:has(.connected-interstitial)` guard-rail test anchored a
 * height-formula check to a doc comment that itself said "var(--tap)"
 * (task-6 re-review, L6). Three incidents, three hand-rolled copies of the
 * same regex, before this file existed to be the one place instead.
 *
 * Strips CSS's only comment style — `/* ... *\/` block comments — and
 * TSX's `//` line comments too (safe for CSS callers as well: no comment
 * marker other than `/* *\/` appears anywhere in `index.css`, verified —
 * `grep -c "//" index.css` is `0`). Only whole-line `//` comments are
 * stripped (anchored to the start of a line, `m` flag), matching the
 * pattern all three prior call sites already used — a trailing
 * same-line `// comment` after real code is left alone, since none of the
 * three call sites' assertions have ever needed that and a partial-line
 * strip risks eating a legitimate `//` inside a string or URL this repo's
 * own source might someday contain.
 *
 * NOT a general-purpose comment stripper: it has no notion of string or
 * template-literal boundaries, so a `"//"` INSIDE a string literal would be
 * (wrongly) treated as a whole-line comment if nothing preceded it but
 * whitespace on that line. None of this repo's CSS or its three TSX call
 * sites has ever hit that case; a caller whose source might should reach
 * for a real parser instead of this function.
 */
export function commentStrippedSource(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * A style rule, tagged with the at-rules that enclose it.
 *
 * `at` is the chain of enclosing at-rule preludes, outermost first: `[]`
 * means the rule is at the top level of the stylesheet, and
 * `["@media (orientation: landscape)"]` means it is genuinely inside a
 * landscape query. That field is the whole point of this parser — see
 * `cssRules` below.
 */
export interface CssRule {
  /** The selector list, split on `,`, each entry whitespace-collapsed. */
  selectors: string[];
  /** Everything between this rule's OWN braces. */
  body: string;
  /** Enclosing at-rule preludes, outermost first; `[]` at the top level. */
  at: string[];
}

/**
 * THE DEFECT THIS EXISTS TO STOP RECURRING (connected-revamp test-integrity
 * sweep, P7/P8/P9/P10/P11/P12/P16/P17 — seven proven-vacuous findings, one
 * mechanism): three test files read `index.css` / `tokens.css` as one flat
 * string and asserted media-query scoping with unanchored regexes and
 * `indexOf`/`slice` windows. None of them modelled brace nesting, so every
 * one of those tests proved "this declaration exists SOMEWHERE in 7,848
 * lines" while its own name and comment claimed "this declaration exists in
 * THIS media query". Measured consequences, all with the whole suite green:
 * the landscape `:root` token block hoisted to top level (portrait phones at
 * landscape type sizes) passed 22/22; pane C's four landscape rules hoisted
 * out of their query (32px rows and a REST column leaking into portrait)
 * passed 46/46; `.connected-grid-time { order: 2 }` added inside the
 * landscape query passed 46/46; the phone timer's `display: inline` moved
 * out of its landscape block passed 79/79.
 *
 * `cssRules` returns every style rule in `source` at every nesting depth,
 * each carrying the at-rule chain that actually encloses it. A test that
 * asks for `at: []` gets top-level rules only; one that asks for a media
 * condition gets rules the browser really scopes to it. `slice` from an
 * `indexOf` cannot express either — the landscape query at `index.css:6959`
 * closes at `:7662` while the file runs to `:7848`, so "everything after the
 * last `@media (orientation: landscape)`" silently includes 186 lines of
 * top-level CSS.
 *
 * SCOPE. `source` must already be comment-stripped (`commentStrippedSource`)
 * — a `{` or `}` inside a comment would throw the depth count off, and this
 * throws rather than guessing if the braces do not balance. It handles the
 * only two block shapes this repo's stylesheets contain, nested arbitrarily:
 * at-rules (a prelude starting `@`) and style rules. It does NOT handle
 * statement at-rules that end in `;` (`@import`, `@charset`), braces inside
 * string or `url()` literals, or CSS Nesting's `&`. None of those appears in
 * `index.css` or `tokens.css` (verified: the only at-rules in either file
 * are the six `@media (orientation: …)` queries). A caller whose source
 * might contain them should reach for a real parser instead.
 */
export function cssRules(source: string): CssRule[] {
  const rules: CssRule[] = [];
  const at: string[] = [];
  let preludeStart = 0;
  let i = 0;

  const collapse = (text: string): string => text.trim().replace(/\s+/g, " ");

  const walk = (end: number): void => {
    while (i < end) {
      const ch = source[i];
      if (ch === "}") {
        return;
      }
      if (ch !== "{") {
        i += 1;
        continue;
      }
      const prelude = collapse(source.slice(preludeStart, i));
      const bodyStart = i + 1;
      i = bodyStart;
      if (prelude.startsWith("@")) {
        at.push(prelude);
        preludeStart = bodyStart;
        walk(end);
        at.pop();
      } else {
        // A style rule: its body holds declarations, never further blocks
        // in this repo's CSS, so scan straight to its close brace.
        while (i < end && source[i] !== "}") i += 1;
        rules.push({
          selectors: prelude.split(",").map(collapse),
          body: source.slice(bodyStart, i),
          at: [...at],
        });
      }
      if (source[i] !== "}") {
        throw new Error(
          `unbalanced CSS: no close brace for ${prelude || "(empty prelude)"}`,
        );
      }
      i += 1;
      preludeStart = i;
    }
  };

  walk(source.length);
  if (i < source.length) {
    throw new Error("unbalanced CSS: a close brace with no matching open");
  }
  return rules;
}

/**
 * The bodies (rule lists, brace contents) of every TOP-LEVEL at-rule whose
 * prelude is exactly `prelude`, in source order. `index.css` carries five
 * separate `@media (orientation: landscape)` queries, which is why this
 * returns all of them rather than the first (`indexOf`) or the last
 * (`lastIndexOf`) — both of those picked the wrong one in shipped tests.
 */
export function atRuleBodies(source: string, prelude: string): string[] {
  const want = prelude.trim().replace(/\s+/g, " ");
  const bodies: string[] = [];
  let depth = 0;
  let preludeStart = 0;
  let bodyStart = -1;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
      if (depth === 1) bodyStart = i + 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth < 0) {
        throw new Error("unbalanced CSS: a close brace with no matching open");
      }
      if (depth === 0) {
        const found = source
          .slice(preludeStart, bodyStart - 1)
          .trim()
          .replace(/\s+/g, " ");
        if (found === want) bodies.push(source.slice(bodyStart, i));
        preludeStart = i + 1;
      }
    }
  }
  if (depth !== 0) throw new Error("unbalanced CSS: unclosed block");
  return bodies;
}

/**
 * Every declaration block genuinely scoped to `selector` under exactly the
 * at-rule chain `at` — `[]` for the top level, `["@media (orientation:
 * landscape)"]` for a landscape query. `selector` must match one entry of
 * the rule's selector list exactly (whitespace-collapsed), so
 * `.connected-grid-num` never matches `.connected-pane-grid
 * .connected-grid-num` and vice versa; that conflation is what let a
 * landscape override stand in for a missing base rule.
 *
 * Returns every match, not the first — `.exec` returning only the first
 * `.connected-end` block is finding P17, and only the first `:root` is P9.
 * Callers that mean "exactly one" should assert the length.
 */
export function scopedRuleBodies(
  source: string,
  selector: string,
  at: string[] = [],
): string[] {
  const want = selector.trim().replace(/\s+/g, " ");
  return cssRules(source)
    .filter(
      (rule) =>
        rule.at.length === at.length &&
        rule.at.every((prelude, n) => prelude === at[n]) &&
        rule.selectors.includes(want),
    )
    .map((rule) => rule.body);
}
