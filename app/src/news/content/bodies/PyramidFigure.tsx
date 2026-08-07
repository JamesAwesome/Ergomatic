// The training pyramid (workout-types article): four bands from wide O2
// base to AN tip, filled with the app's own type tokens so it repaints
// with them. Text sits inside each band, on-color, like every type badge.
export function PyramidFigure() {
  return (
    <figure className="reader-figure">
      <svg
        viewBox="0 0 320 190"
        role="img"
        aria-label="The training pyramid. A wide O2 general endurance base carries an AT threshold band, a TR hard intervals band, and a small AN speed tip."
      >
        <polygon
          points="160,10 197.5,52.5 122.5,52.5"
          fill="var(--type-an)"
          stroke="var(--page)"
          strokeWidth="2"
        />
        <polygon
          points="122.5,52.5 197.5,52.5 235,95 85,95"
          fill="var(--type-tr)"
          stroke="var(--page)"
          strokeWidth="2"
        />
        <polygon
          points="85,95 235,95 272.5,137.5 47.5,137.5"
          fill="var(--type-at)"
          stroke="var(--page)"
          strokeWidth="2"
        />
        <polygon
          points="47.5,137.5 272.5,137.5 310,180 10,180"
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
          <text x="160" y="48" fontSize="7" letterSpacing="0.08em">
            SPEED
          </text>
          <text x="160" y="74" fontSize="12" fontWeight="600">
            TR
          </text>
          <text x="160" y="87" fontSize="7" letterSpacing="0.08em">
            HARD INTERVALS
          </text>
          <text x="160" y="116" fontSize="12" fontWeight="600">
            AT
          </text>
          <text x="160" y="129" fontSize="7" letterSpacing="0.08em">
            THRESHOLD
          </text>
          <text x="160" y="158" fontSize="12" fontWeight="600">
            O2
          </text>
          <text x="160" y="171" fontSize="7" letterSpacing="0.08em">
            GENERAL ENDURANCE
          </text>
        </g>
      </svg>
    </figure>
  );
}
