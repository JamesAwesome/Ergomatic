import type { Difficulty } from "../../domain/types.js";

// EASY/MEDIUM/HARD — docs/design/DEVIATIONS.md row 12's adaptation of the
// handoff's Introductory/Moderate/Advanced. Shared by every screen that
// renders a difficulty chip (ClassificationCard.tsx, Today.tsx) so the
// three labels can only be spelled one way: the two screens used to keep
// their own local `DIFFICULTY_CHIPS` copies, and they had already drifted
// (Today's said "MED") before this module existed to prevent it.
export const DIFFICULTY_CHIPS: { value: Difficulty; label: string }[] = [
  { value: "easy", label: "EASY" },
  { value: "medium", label: "MEDIUM" },
  { value: "hard", label: "HARD" },
];
