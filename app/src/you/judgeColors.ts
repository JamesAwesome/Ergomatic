/**
 * The rower's per-slot judged-colour choice — the ONE persisted fact behind
 * `/you/settings` (spec `2026-09-08-judge-colours-design.md`, "The stored
 * shape", invariants I-2, I-6, I-9, I-10).
 *
 * WHAT IT STORES: four independent slots — faster and slower, for pace and
 * for stroke rate — each holding `red`, `blue` or `off`. Nothing else. The
 * consumers are plain CSS and never learn a preference exists: this module
 * writes four RESOLVED custom properties onto `document.documentElement` and
 * the cascade does the rest.
 *
 * LIFETIME, QUALIFIED (PM final gate, 2026-09-08). The value survives reload,
 * relaunch and sign-out, and there is deliberately no clear path at all — not
 * a Reset, not an account switch. But "survives relaunch" is not absolute:
 * `docs/superpowers/research/2026-09-03-localstorage-getter-wkwebview.md`
 * records that eviction and low disk LOSE origin storage, and a rower then
 * silently gets the defaults back. The harm is cosmetic and self-healing —
 * the read below is total, so a vanished key is indistinguishable from a
 * fresh install — which is why this is a clause rather than a mechanism. It
 * lives here rather than in the spec's lifetime table because the code
 * outlives the plan.
 *
 * TOTAL PER FIELD, WHICH IS A DEPARTURE FROM `today/todayFilters.ts`. That
 * file's `parseFilterSet` comment reads "Strict per-set check … a
 * present-but-wrong-shaped value fails the SET" — it is total per KEY and
 * strict per FIELD, so one bad field discards a whole set. Here a rower who
 * has set three slots and whose fourth is corrupt keeps their three, so the
 * fallback happens in the smallest unit the rower chose in. The `try`/`catch`
 * WRAPPER discipline (`loadTodayFilters`/`saveTodayFilters`) is followed
 * exactly; only the parse strictness differs, and it differs on purpose.
 *
 * THE CATCH IS BARE, AND MUST STAY BARE.
 * `docs/superpowers/research/2026-09-03-localstorage-getter-wkwebview.md`,
 * verbatim: "Write them as bare `catch`, never
 * `catch (e) { if (e.name === "SecurityError") }` — the `nullptr` paths above
 * make detached-document access a `TypeError` that a name-filtered catch
 * would let escape." That matters more here than anywhere else in the app:
 * `applyJudgeColors(loadJudgeColors())` runs at `main.tsx` module scope
 * BEFORE `createRoot`, so an escaping throw is a white screen, not a lost
 * preference. Every other localStorage reader in this repo runs inside a
 * component, where a throw costs one screen.
 *
 * NO CLEAR PATH, AND THE KEY IS NOT ACCOUNT-SCOPED (spec's lifetime table,
 * both deliberate). Nothing removes the key — not sign-out, not a Reset
 * button, not an account switch — and a second rower on the same phone
 * inherits the first rower's choices. The preference is about the eyes
 * looking at the screen, not about an account; it is re-litigated the day a
 * device account switcher lands.
 */

export const JUDGE_COLORS_KEY = "ergomatic.judgeColors";

/** The two inks a rower may choose, plus "leave it the body colour". */
export type JudgeColor = "red" | "blue" | "off";

/** One choice per judged slot. Faster and slower are independent, and pace
 *  and stroke rate are independent — the whole point of the screen. */
export interface JudgeColors {
  paceFaster: JudgeColor;
  paceSlower: JudgeColor;
  spmFaster: JudgeColor;
  spmSlower: JudgeColor;
}

/** Today's colours, exactly (I-1): a rower who never opens the screen sees no
 *  change on any judged surface. */
export const JUDGE_COLOR_DEFAULTS: JudgeColors = {
  paceFaster: "blue",
  paceSlower: "red",
  spmFaster: "blue",
  spmSlower: "red",
};

/** The resolved custom property each slot drives. `theme/tokens.css` declares
 *  all four with today's values; `applyJudgeColors` overrides them as inline
 *  style on the root. The RAW inks (`--judge-red`, `--judge-blue`) are never
 *  written here — that split is what keeps the LOST-THE-MONITOR alarm red at
 *  every setting (I-4). */
export const JUDGE_SLOT_PROPERTIES: Readonly<
  Record<keyof JudgeColors, string>
> = {
  paceFaster: "--judge-pace-faster",
  paceSlower: "--judge-pace-slower",
  spmFaster: "--judge-spm-faster",
  spmSlower: "--judge-spm-slower",
};

/** What each choice resolves to. `off` is `--ink`, the body colour: the
 *  number stops being coloured without becoming an on-target number (I-5 —
 *  the bar and the `±` label stay). */
const JUDGE_COLOR_VALUES: Readonly<Record<JudgeColor, string>> = {
  red: "var(--judge-red)",
  blue: "var(--judge-blue)",
  off: "var(--ink)",
};

/** Derived from the defaults rather than written out again, so adding a slot
 *  to `JudgeColors` is a compile error in `JUDGE_COLOR_DEFAULTS` and in
 *  `JUDGE_SLOT_PROPERTIES` and then simply appears in every loop below. */
const JUDGE_SLOTS = Object.keys(JUDGE_COLOR_DEFAULTS) as (keyof JudgeColors)[];

function isJudgeColor(value: unknown): value is JudgeColor {
  return value === "red" || value === "blue" || value === "off";
}

/** Total per field: anything that is not one of the three union members —
 *  absent, null, a number, an object, `"green"` — resolves to THAT slot's
 *  default and disturbs no other slot (I-2). */
function parseJudgeColors(raw: string): JudgeColors {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...JUDGE_COLOR_DEFAULTS };
  }
  const fields =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  const result = { ...JUDGE_COLOR_DEFAULTS };
  for (const slot of JUDGE_SLOTS) {
    const value = fields[slot];
    if (isJudgeColor(value)) result[slot] = value;
  }
  return result;
}

/** Never throws, never returns a partial (I-9, I-2). A missing key, a denied
 *  store, unparseable JSON, a non-object, or a corrupt field all resolve to
 *  the default for the fields they affect and to nothing else. The returned
 *  object is fresh on every call, so a caller may edit it in place. */
export function loadJudgeColors(): JudgeColors {
  try {
    const raw = localStorage.getItem(JUDGE_COLORS_KEY);
    if (raw === null) return { ...JUDGE_COLOR_DEFAULTS };
    return parseJudgeColors(raw);
  } catch {
    return { ...JUDGE_COLOR_DEFAULTS };
  }
}

/** Returns whether the write landed (I-6, RF25). A denied write costs
 *  persistence, never the current screen: the caller still calls
 *  `applyJudgeColors`, so the colours take effect for this session, and then
 *  tells the rower the choice will not survive a reload. The two steps are
 *  separate precisely so a storage failure cannot make the screen inert. */
export function saveJudgeColors(next: JudgeColors): boolean {
  try {
    localStorage.setItem(JUDGE_COLORS_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** Writes the four resolved properties onto the root. Called from exactly two
 *  places: `main.tsx` at module scope before `createRoot`, so no judged
 *  surface paints a default it is about to replace; and the settings screen on
 *  every change, so a choice is live without a reload. */
export function applyJudgeColors(colors: JudgeColors): void {
  const root = document.documentElement;
  for (const slot of JUDGE_SLOTS) {
    root.style.setProperty(
      JUDGE_SLOT_PROPERTIES[slot],
      JUDGE_COLOR_VALUES[colors[slot]],
    );
  }
}
