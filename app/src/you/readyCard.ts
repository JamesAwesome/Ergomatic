/**
 * GATE 0 RENDER ONLY — not the shipped module. Written to capture the
 * settings screen for James's design gate; task 1 re-lands it tests-first
 * once the gate closes. See
 * `docs/superpowers/specs/2026-09-09-ready-card-preference-design.md`.
 */

export const READY_CARD_KEY = "ergomatic.readyCard";

export type ReadyCardChoice = "show" | "skip";

export const READY_CARD_DEFAULT: ReadyCardChoice = "show";

let lastSet: ReadyCardChoice | null = null;

function isReadyCardChoice(value: unknown): value is ReadyCardChoice {
  return value === "show" || value === "skip";
}

export function loadReadyCard(): ReadyCardChoice {
  // STORAGE FIRST. Reading `lastSet` first makes every persistence gate
  // structurally incapable of failing — proven, see the spec.
  try {
    const raw = localStorage.getItem(READY_CARD_KEY);
    if (isReadyCardChoice(raw)) return raw;
  } catch {
    /* fall through to the in-memory value, then the default */
  }
  return lastSet ?? READY_CARD_DEFAULT;
}

export function saveReadyCard(next: ReadyCardChoice): boolean {
  lastSet = next;
  try {
    localStorage.setItem(READY_CARD_KEY, next);
    return true;
  } catch {
    return false;
  }
}
