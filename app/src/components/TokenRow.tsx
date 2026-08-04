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
 * would).
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
    <>
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
    </>
  );
}
