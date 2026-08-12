import type { ReactNode } from "react";

/** One removable token. Every token wears `.filter-token`'s own `--ink`
 *  background; there is no per-instance colour override any more. The old
 *  `fill` prop existed solely for Library's TYPE token, and that token was
 *  retired on 2026-08-12 ("the type shouldn't be added as a tag since it's
 *  already visible" — its chip row shows the selection in colour), leaving
 *  no producer. Deleted rather than left as an unused seam; a future
 *  coloured token would reintroduce it deliberately. */
export interface Token {
  key: string;
  label: string;
  onClear: () => void;
}

/**
 * The removable-token strip (Library.tsx's active-filter row, lifted out
 * whole) plus an optional trailing control — `trailing` is a plain slot
 * (Library.tsx's own CLEAR ALL sits in its own row today, so it doesn't use
 * this slot; a caller that renders CLEAR ALL immediately after its tokens
 * would, e.g. Today.tsx).
 *
 * Fix round 1 (whole-branch review M2): the row's own layout (flex, wrap,
 * gap, vertically centering the trailing control against the tokens) now
 * lives HERE, on the returned `.token-row` wrapper, rather than being left
 * to whatever the caller happens to wrap this in. Originally a bare
 * Fragment — Library.tsx's own `.library-filter-row` (flex/wrap/gap)
 * happened to supply exactly this layout for its own render site, but a
 * caller that renders `<TokenRow>` without that wrapper (Today.tsx) got
 * unstyled inline content instead: tokens butted into one continuous ink
 * bar and `trailing` (CLEAR ALL) wrapped onto its own line. Moving the
 * layout into the component itself means no consumer can render it
 * unstyled again.
 */
export function TokenRow({
  tokens,
  trailing,
}: {
  tokens: Token[];
  trailing?: ReactNode;
}) {
  if (tokens.length === 0 && !trailing) return null;
  return (
    <div className="token-row">
      {tokens.map((token) => (
        <span key={token.key} className="filter-token">
          <span className="filter-token-label">{token.label}</span>
          <button
            type="button"
            className="filter-token-remove"
            aria-label={`Remove ${token.label} filter`}
            onClick={token.onClear}
          >
            ✕
          </button>
        </span>
      ))}
      {trailing}
    </div>
  );
}
