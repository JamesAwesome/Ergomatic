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
const halfStep = (n: unknown, lo: number, hi: number): n is number =>
  typeof n === "number" && n >= lo && n <= hi && Number.isInteger(n * 2);
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
  if (isRec(v) && v.kind === "time" && halfStep(v.minutes, 0.5, 180))
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
        if (!halfStep(s.minutes, 0.5, 180))
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
        if (s.restMinutes !== undefined && !halfStep(s.restMinutes, 0.5, 60))
          errors.push(`step ${i}: rest 0.5..60`);
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
  if (!int(value.num, 1, 9999)) errors.push("num must be 1..9999");
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
