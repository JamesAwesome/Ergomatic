import { useRef, type KeyboardEvent } from "react";

// Pain is 1–5 (docs/design/DEVIATIONS.md), not the handoff's 1–10 — this
// picker always renders exactly five cells.
const LEVELS = [1, 2, 3, 4, 5] as const;

// One minimal ink-stroke face per level; only the mouth path changes, so the
// expression — not just the fill — distinguishes them (WCAG 1.4.1). Adjacent
// steps' curve depth differs by >=2px (measured at the curve midpoint vs the
// mouth-corner baseline) so 1-vs-2 and 4-vs-5 stay legible in grayscale; the
// two ends also get a secondary, non-color cue (a wider mouth on 1, angled
// brows on 5) since same-direction curves alone read too similarly.
const MOUTHS: Record<number, string> = {
  1: "M6 14 Q11 23 16 14", // wide, deep smile (depth +4.5)
  2: "M7 14.5 Q11 18.5 15 14.5", // slight smile (depth +2.0)
  3: "M7 15 H15", // flat (depth 0)
  4: "M7 15.5 Q11 11.5 15 15.5", // slight frown (depth -2.0)
  5: "M7 16 Q11 7 15 16", // deep frown (depth -4.5)
};

// Secondary distinguishing feature for the two ends only (see MOUTHS
// comment): angled brow strokes above the eyes for the most painful face.
const BROWS: Partial<Record<number, readonly [string, string]>> = {
  5: ["M6 6.5 L9.5 8", "M16 6.5 L12.5 8"],
};

export default function PainPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (pain: number) => void;
}) {
  // Roving tabindex (WAI-ARIA radiogroup pattern): the group is one tab
  // stop, and arrow keys move focus (and selection) within it.
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function selectByIndex(index: number) {
    const wrapped = (index + LEVELS.length) % LEVELS.length;
    cellRefs.current[wrapped]?.focus();
    onChange(LEVELS[wrapped]);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        selectByIndex(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        selectByIndex(index - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div className="pain-picker" role="radiogroup" aria-label="Expected pain">
      {LEVELS.map((level, index) => {
        const checked = value === level;
        const tabbable = value === null ? index === 0 : checked;
        return (
          <button
            key={level}
            ref={(el) => {
              cellRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`Pain ${level}`}
            className="pain-picker-cell"
            style={
              checked ? { background: `var(--pain-${level}-fill)` } : undefined
            }
            tabIndex={tabbable ? 0 : -1}
            onClick={() => onChange(level)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <svg
              className="pain-picker-face"
              viewBox="0 0 22 22"
              aria-hidden="true"
              focusable="false"
            >
              <circle
                cx="11"
                cy="11"
                r="9.5"
                style={{
                  fill: `var(--pain-${level})`,
                  stroke: "var(--ink)",
                  strokeWidth: 1,
                }}
              />
              <circle cx="8" cy="9" r="1" fill="var(--ink)" />
              <circle cx="14" cy="9" r="1" fill="var(--ink)" />
              {BROWS[level]?.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth="1"
                />
              ))}
              <path
                d={MOUTHS[level]}
                fill="none"
                stroke="var(--ink)"
                strokeWidth="1"
              />
            </svg>
            <span className="pain-picker-num">{level}</span>
          </button>
        );
      })}
    </div>
  );
}
