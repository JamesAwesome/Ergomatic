/**
 * Phase PS (career-stats spec §3.1): what ONE stored row contributes to
 * every career figure — the tier rule transcribed from
 * `src/log/storedSummary.ts`'s `buildHeroes`, which now calls this so the
 * You totals and the log's detail hero cannot disagree (invariant 2).
 *
 * Every field is REQUIRED with `null` for absent (RF33): a producer that
 * renames or drops a field fails to compile instead of silently landing in
 * the wrong tier. `endedBy` is a plain `string | null` — the rule is an
 * ALLOWLIST (`isReconstructableClose`), so a value this build has never
 * seen declines, exactly as `buildHeroes` always has.
 */
export interface StatsStepInput {
  actualMeters: number | null;
  actualSeconds: number | null;
}

export interface StatsRowInput {
  endedBy: string | null;
  machineWorkSeconds: number | null;
  machineWorkMeters: number | null;
  workSeconds: number | null;
  workMeters: number | null;
  distanceMeters: number | null;
  timeSeconds: number | null;
  restSeconds: number | null;
  restMeters: number | null;
  steps: readonly StatsStepInput[];
  /** `machineSummary.totalCalories`, whatever the blob holds — an
   *  untyped jsonb on the server and an all-optional view on the client,
   *  so the read-side integer check below is hardening on top of the
   *  write route's `validateMachineSummary` (spec §3.1). */
  totalCalories: unknown;
}

export type StatsTier = "machine" | "work-pair" | "steps" | "stored";

/** The field set BOTH producers already hold — the client's `StoredLog`
 *  and the server's `statsRows()` projection — before either has done any
 *  mapping of its own. `endedBy` is `string | null` here too: the client
 *  maps its optional `endedBy ?? null` BEFORE calling; the server's enum
 *  column is already `T | null`. `steps` is `unknown` because it is an
 *  untyped jsonb on the server and a typed array on the client, and only
 *  the two actuals are read (`stepActuals`). */
export interface StatsRowSource {
  endedBy: string | null;
  machineWorkSeconds: number | null;
  machineWorkMeters: number | null;
  workSeconds: number | null;
  workMeters: number | null;
  distanceMeters: number | null;
  timeSeconds: number | null;
  restSeconds: number | null;
  restMeters: number | null;
  steps: unknown;
  totalCalories: unknown;
}

/** Only the two actuals the tier rule sums, each `null` unless it is a
 *  number; anything that is not an array of objects contributes nothing.
 *  ONE reader for both producers (RF24: the seam between the client's
 *  `buildHeroes` and the route's `toStatsRow` is this function). */
export function stepActuals(steps: unknown): StatsStepInput[] {
  if (!Array.isArray(steps)) return [];
  return steps.map((s: unknown) => {
    const step = (typeof s === "object" && s !== null ? s : {}) as Record<
      string,
      unknown
    >;
    return {
      actualMeters:
        typeof step.actualMeters === "number" ? step.actualMeters : null,
      actualSeconds:
        typeof step.actualSeconds === "number" ? step.actualSeconds : null,
    };
  });
}

/** The ONE `StatsRowInput` builder. Both producers call it, so a field
 *  the rule needs is mapped in one place and the compiler holds the two
 *  call sites to the same shape. */
export function statsRowInput(row: StatsRowSource): StatsRowInput {
  return {
    endedBy: row.endedBy,
    machineWorkSeconds: row.machineWorkSeconds,
    machineWorkMeters: row.machineWorkMeters,
    workSeconds: row.workSeconds,
    workMeters: row.workMeters,
    distanceMeters: row.distanceMeters,
    timeSeconds: row.timeSeconds,
    restSeconds: row.restSeconds,
    restMeters: row.restMeters,
    steps: stepActuals(row.steps),
    totalCalories: row.totalCalories,
  };
}

interface RestAndCalories {
  restMeters: number | null;
  restSeconds: number | null;
  calories: number | null;
}

export type RowContribution = RestAndCalories &
  (
    | { tier: "machine"; workMeters: number; workSeconds: number }
    | { tier: "work-pair"; workMeters: number; workSeconds: number }
    | { tier: "steps"; workMeters: number; workSeconds: number | null }
    | { tier: "stored"; workMeters: number | null; workSeconds: number | null }
  );

/** `buildHeroes`'s allowlist: only `"finished"` or an absent close reason
 *  proves a row historical; anything else — including a value this build
 *  does not know — declines the `steps` tier (fails closed). */
export function isReconstructableClose(endedBy: string | null): boolean {
  return endedBy === "finished" || endedBy === null;
}

export function stepActualSums(steps: readonly StatsStepInput[]): {
  meters: number | null;
  seconds: number | null;
} {
  let meters: number | null = null;
  let seconds: number | null = null;
  for (const step of steps) {
    if (step.actualMeters !== null) meters = (meters ?? 0) + step.actualMeters;
    if (step.actualSeconds !== null) {
      seconds = (seconds ?? 0) + step.actualSeconds;
    }
  }
  return { meters, seconds };
}

export function rowContribution(row: StatsRowInput): RowContribution {
  const rest: RestAndCalories = {
    restMeters: row.restMeters,
    restSeconds: row.restSeconds,
    calories: Number.isInteger(row.totalCalories)
      ? (row.totalCalories as number)
      : null,
  };
  if (
    row.machineWorkSeconds !== null &&
    row.machineWorkMeters !== null &&
    row.machineWorkSeconds > 0 &&
    row.machineWorkMeters > 0
  ) {
    return {
      ...rest,
      tier: "machine",
      workMeters: Math.round(row.machineWorkMeters),
      workSeconds: row.machineWorkSeconds,
    };
  }
  if (
    row.workSeconds !== null &&
    row.workMeters !== null &&
    row.workSeconds > 0 &&
    row.workMeters > 0
  ) {
    return {
      ...rest,
      tier: "work-pair",
      workMeters: Math.round(row.workMeters),
      workSeconds: row.workSeconds,
    };
  }
  const sums = stepActualSums(row.steps);
  if (sums.meters !== null && isReconstructableClose(row.endedBy)) {
    return {
      ...rest,
      tier: "steps",
      // Rounded like the machine and work-pair tiers: PM5 step actuals are
      // fractional (`src/monitor/driver.ts` reads 194.1 / 104.8 on finished
      // frames). Seconds stay verbatim on every tier.
      workMeters: Math.round(sums.meters),
      workSeconds: sums.seconds,
    };
  }
  return {
    ...rest,
    tier: "stored",
    workMeters: row.distanceMeters,
    workSeconds: row.timeSeconds,
  };
}
