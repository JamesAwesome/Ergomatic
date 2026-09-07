import type { LogStep } from "../stores/logs.js";
import { c2Tenths } from "./tenths.js";

/** One object of the logbook API's `workout.intervals[]` (spec
 *  2026-09-06-logbook-parity §5, every row quoted there). REQUIRED:
 *  `type`, `time`, `distance`, `rest_time`. */
export interface C2Interval {
  type: "time" | "distance";
  time: number;
  distance: number;
  rest_time: number;
  rest_distance?: number;
  stroke_rate?: number;
  calories_total?: number;
  heart_rate?: { average?: number; rest?: number };
  targets?: { pace?: number; stroke_rate?: number };
}

const U16 = 65535;
const HR_MIN = 20;
const HR_MAX = 254;

/** A stored number that may be sent: an integer within [min, max]. Anything
 *  else — absent, null, a decimal, a string — is omitted, because the API
 *  fails the WHOLE workout on one non-integer ("Sending across a decimal
 *  value or a string where an integer is expected … will result in the
 *  workout failing"). */
function sendableInt(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : undefined;
}

/**
 * Phase LP PR 2 (spec §5): every stored step → one interval object, or
 * `null` when ANY step cannot fill a REQUIRED key — a manual/stopwatch
 * step, a dropped boundary (no `actualSeconds`/`actualMeters`), a row saved
 * before PR 2 (no `machineRestSeconds`), or an empty list (a Just Row). Never
 * a partial array, never a zero standing in for a reading the machine did
 * not send. Every emitted number is an integer. Targets ride EACH interval
 * because every programmed Ergomatic piece is sent as `VariableInterval`
 * (the API: "For variable interval workouts, the target should be at the
 * level of each individual interval"; "only one of watts, calories or pace
 * can be present" — we send pace).
 */
export function buildC2Intervals(
  steps: readonly LogStep[],
): C2Interval[] | null {
  if (steps.length === 0) return null;
  const out: C2Interval[] = [];
  for (const s of steps) {
    if (s.actualSource !== "pm5") return null;
    if (
      s.actualSeconds === undefined ||
      s.actualMeters === undefined ||
      s.machineRestSeconds === undefined
    ) {
      return null;
    }
    if (
      !Number.isFinite(s.actualSeconds) ||
      s.actualSeconds < 0 ||
      !Number.isFinite(s.actualMeters) ||
      s.actualMeters < 0 ||
      !Number.isInteger(s.machineRestSeconds) ||
      s.machineRestSeconds < 0
    ) {
      return null;
    }
    const interval: C2Interval = {
      type: s.seconds !== undefined ? "time" : "distance",
      time: c2Tenths(s.actualSeconds),
      distance: Math.round(s.actualMeters),
      rest_time: c2Tenths(s.machineRestSeconds),
    };
    // 0 m of rest is a reading (an r0 piece), sent as 0 beside its
    // `rest_time: 0` — §2's invariant, "0 is a value" (antagonist delta 6).
    const restMeters = sendableInt(s.machineRestMeters, 0, 1_000_000);
    if (restMeters !== undefined) interval.rest_distance = restMeters;
    const spm = sendableInt(s.actualSpm, 1, 99);
    if (spm !== undefined) interval.stroke_rate = spm;
    const cal = sendableInt(s.machineCalories, 0, U16);
    if (cal !== undefined) interval.calories_total = cal;
    const hr: NonNullable<C2Interval["heart_rate"]> = {};
    const avg = sendableInt(s.avgHr, HR_MIN, HR_MAX);
    if (avg !== undefined) hr.average = avg;
    const rest = sendableInt(s.machineRestHr, HR_MIN, HR_MAX);
    if (rest !== undefined) hr.rest = rest;
    if (Object.keys(hr).length > 0) interval.heart_rate = hr;
    const targets: NonNullable<C2Interval["targets"]> = {};
    if (typeof s.targetSplit === "number" && s.targetSplit > 0) {
      targets.pace = c2Tenths(s.targetSplit);
    }
    const targetSpm = sendableInt(s.spm, 1, 255);
    if (targetSpm !== undefined) targets.stroke_rate = targetSpm;
    if (Object.keys(targets).length > 0) interval.targets = targets;
    out.push(interval);
  }
  return out;
}
