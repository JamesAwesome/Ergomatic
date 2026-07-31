import type {
  Difficulty,
  PaceRef,
  Step,
  WorkDuration,
  WorkoutInput,
  WorkoutType,
} from "./types.js";

const TYPES: WorkoutType[] = ["AN", "O2", "AT", "TR"];
const DIFFS: Difficulty[] = ["easy", "medium", "hard"];

const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;
/** Any whole number of seconds, expressed in minutes. The epsilon is
 *  load-bearing, though not for the obvious reason: most whole seconds do
 *  survive the round trip exactly (`20 / 60 * 60 === 20`). 407 of the 10,800
 *  in range do not — 31 (`31 / 60 * 60 === 31.000000000000004`), 62, 123,
 *  124, 125, 245… — so a bare `Number.isInteger(n * 60)` would reject those
 *  at random, and a user would find 30s and 32s save while 31s does not.
 *  Widened from a 0.5-step rule in Phase 5F —
 *  everything that validated before still validates, so there is nothing to
 *  migrate. */
const wholeSecond = (n: unknown, lo: number, hi: number): n is number =>
  typeof n === "number" &&
  n >= lo &&
  n <= hi &&
  Math.abs(n * 60 - Math.round(n * 60)) < 1e-6;

const SECOND = 1 / 60;
const int = (n: unknown, lo: number, hi: number): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;

function checkRef(v: unknown, errs: string[], i: number): v is PaceRef {
  if (
    !isRec(v) ||
    (v.base !== "2k" && v.base !== "6k") ||
    typeof v.off !== "number" ||
    Math.abs(v.off) > 60
  ) {
    errs.push(`step ${i}: invalid pace ref`);
    return false;
  }
  return true;
}

function checkDuration(
  v: unknown,
  errs: string[],
  i: number,
): v is WorkDuration {
  if (isRec(v) && v.kind === "time" && wholeSecond(v.minutes, SECOND, 180))
    return true;
  if (isRec(v) && v.kind === "distance" && int(v.meters, 100, 42195))
    return true;
  errs.push(`step ${i}: invalid duration`);
  return false;
}

export function validateSteps(
  value: unknown,
): { ok: true; steps: Step[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    return { ok: false, errors: ["steps must be a non-empty array (max 100)"] };
  }
  let markers = 0;
  let hasWorkOrTest = false;
  value.forEach((s, i) => {
    if (!isRec(s)) {
      errors.push(`step ${i}: not an object`);
      return;
    }
    switch (s.k) {
      case "wu":
      case "r":
        if (!wholeSecond(s.minutes, SECOND, 180))
          errors.push(`step ${i}: invalid minutes`);
        break;
      case "reps":
        markers += 1;
        if (!int(s.count, 1, 12)) errors.push(`step ${i}: reps 1..12`);
        if (i === value.length - 1)
          errors.push(`step ${i}: reps marker cannot be last`);
        break;
      case "w":
        hasWorkOrTest = true;
        checkDuration(s.duration, errors, i);
        checkRef(s.ref, errors, i);
        if (s.spm !== undefined && !int(s.spm, 10, 60))
          errors.push(`step ${i}: spm 10..60`);
        if (
          s.restMinutes !== undefined &&
          !wholeSecond(s.restMinutes, SECOND, 60)
        )
          errors.push(`step ${i}: rest 0:01..60:00`);
        break;
      case "test":
        hasWorkOrTest = true;
        if (
          typeof s.label !== "string" ||
          s.label.length === 0 ||
          s.label.length > 40
        )
          errors.push(`step ${i}: test label required`);
        break;
      default:
        errors.push(`step ${i}: unknown kind`);
    }
  });
  if (markers > 1) errors.push("at most one reps marker");
  if (!hasWorkOrTest) errors.push("needs at least one work or test step");
  return errors.length
    ? { ok: false, errors }
    : { ok: true, steps: value as Step[] };
}

export function validateWorkoutInput(
  value: unknown,
): { ok: true; workout: WorkoutInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRec(value)) return { ok: false, errors: ["not an object"] };
  if (
    typeof value.title !== "string" ||
    value.title.length < 1 ||
    value.title.length > 80
  )
    errors.push("title 1..80 chars");
  if (!TYPES.includes(value.type as WorkoutType)) errors.push("invalid type");
  if (!DIFFS.includes(value.difficulty as Difficulty))
    errors.push("invalid difficulty");
  if (!int(value.pain, 1, 5)) errors.push("pain must be 1..5");
  const steps = validateSteps(value.steps);
  if (!steps.ok) errors.push(...steps.errors);
  return errors.length
    ? { ok: false, errors }
    : { ok: true, workout: value as unknown as WorkoutInput };
}
