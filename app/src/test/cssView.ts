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
