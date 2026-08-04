import type { ReactNode } from "react";

/** One removable token: `fill` carries a type token's own `--type-*` CSS
 *  var through as an inline background (the same per-instance idiom
 *  TypeBadge.tsx/PainBar.tsx use), `"ink"` — the default, whether omitted
 *  or set explicitly — leaves `.filter-token`'s own `--ink` background rule
 *  alone rather than overriding it with an identical inline value. */
export interface Token {
  key: string;
  label: string;
  onClear: () => void;
  fill?: "ink" | string;
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
        <span
          key={token.key}
          className="filter-token"
          style={
            token.fill && token.fill !== "ink"
              ? { background: token.fill }
              : undefined
          }
        >
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
