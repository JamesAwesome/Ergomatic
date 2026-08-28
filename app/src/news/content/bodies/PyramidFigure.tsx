import { TYPE_WORDS } from "../../../components/typeWords";

// The training pyramid (workout-types article): four bands from wide O2
// base to AN top, filled with the app's own type tokens so it repaints
// with them. Text sits inside each band, on-color, like every type badge.
//
// THE WORDS COME FROM `typeWords.ts`, NEVER FROM HERE (TL-2). This figure
// used to carry its own copy, and three of the four had drifted: O2 read
// GENERAL ENDURANCE against LOW & SLOW, AT read THRESHOLD — the coach
// jargon the disclosure work exists to replace — and AN read SPEED against
// SPEED WORK. The pyramid is inside the explainer, so it is the FIRST place
// a rower meets these words and every chip afterwards used different ones.
//
// THE APEX IS TRUNCATED, and that is load-bearing rather than decorative
// (TL-3, design gate approved by James 2026-08-28). The words were authored
// at `fontSize="7"`, which is not 7 CSS px: a 320-unit viewBox rendered into
// `.reader-figure svg`'s 340px max-width (index.css) scales every unit by
// 340/320, so they landed at 7.44px against the house 10px mono floor
// (--size-label). Raising them to 10 (10.63px rendered) makes SPEED WORK
// 67.99 units wide — measured in Chromium against the shipped IBM Plex Mono
// woff2, at this figure's own 0.08em letter-spacing — and a POINTED tip
// offers only 26.2 units of half-width where the word needs 34.0. That gap
// does not close by resizing the figure: it is width-capped at 340px, so a
// bigger pyramid raises the floor's unit cost in exact step. A flat top 32
// units wide is what buys the room (+5.28 units clear each side, 5.6 CSS
// px). The cost, accepted at the gate: band areas move from 1:3:5:7 to
// 1:2.0:3.1:4.1, so AN still reads smallest but less starkly.
//
// Geometry: sides run (144,10)->(10,180) and (176,10)->(310,180), so
// half-width(y) = 16 + 0.788235*(y-10); four equal bands split at y = 10,
// 52.5, 95, 137.5, 180.
export function PyramidFigure() {
  return (
    <figure className="reader-figure">
      <svg
        viewBox="0 0 320 190"
        role="img"
        aria-label={`The training pyramid. A wide O2 ${spoken(TYPE_WORDS.O2)} base carries an AT ${spoken(TYPE_WORDS.AT)} band, a TR ${spoken(TYPE_WORDS.TR)} band, and a small AN ${spoken(TYPE_WORDS.AN)} band at the top.`}
      >
        <polygon
          points="144,10 176,10 209.5,52.5 110.5,52.5"
          fill="var(--type-an)"
          stroke="var(--page)"
          strokeWidth="2"
        />
        <polygon
          points="110.5,52.5 209.5,52.5 243,95 77,95"
          fill="var(--type-tr)"
          stroke="var(--page)"
          strokeWidth="2"
        />
        <polygon
          points="77,95 243,95 276.5,137.5 43.5,137.5"
          fill="var(--type-at)"
          stroke="var(--page)"
          strokeWidth="2"
        />
        <polygon
          points="43.5,137.5 276.5,137.5 310,180 10,180"
          fill="var(--type-o2)"
          stroke="var(--page)"
          strokeWidth="2"
        />
        <g
          fill="var(--on-color)"
          textAnchor="middle"
          fontFamily="'IBM Plex Mono', monospace"
        >
          <text x="160" y="36" fontSize="12" fontWeight="600">
            AN
          </text>
          <text x="160" y="48" fontSize="10" letterSpacing="0.08em">
            {TYPE_WORDS.AN}
          </text>
          <text x="160" y="74" fontSize="12" fontWeight="600">
            TR
          </text>
          <text x="160" y="87" fontSize="10" letterSpacing="0.08em">
            {TYPE_WORDS.TR}
          </text>
          <text x="160" y="116" fontSize="12" fontWeight="600">
            AT
          </text>
          <text x="160" y="129" fontSize="10" letterSpacing="0.08em">
            {TYPE_WORDS.AT}
          </text>
          <text x="160" y="158" fontSize="12" fontWeight="600">
            O2
          </text>
          <text x="160" y="171" fontSize="10" letterSpacing="0.08em">
            {TYPE_WORDS.O2}
          </text>
        </g>
      </svg>
    </figure>
  );
}

// The band prints "LOW & SLOW"; a screen reader should say "low and slow".
function spoken(word: string): string {
  return word.toLowerCase().replace(/\s*&\s*/g, " and ");
}
