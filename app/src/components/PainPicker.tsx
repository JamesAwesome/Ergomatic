import { useRef, type KeyboardEvent } from "react";

// Pain is 1–5 (docs/design/DEVIATIONS.md), not the handoff's 1–10 — this
// picker always renders exactly five cells.
const LEVELS = [1, 2, 3, 4, 5] as const;

// One minimal ink-stroke face per level; only the mouth path changes, so the
// expression — not just the fill — distinguishes them (WCAG 1.4.1).
const MOUTHS: Record<number, string> = {
  1: "M7 14 Q11 17.5 15 14", // smile
  2: "M7 14.5 Q11 16.5 15 14.5", // slight smile
  3: "M7 15 H15", // flat
  4: "M7 15.5 Q11 13.5 15 15.5", // slight frown
  5: "M7 16 Q11 12.5 15 16", // frown
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
