// Phase DE PR 2 (spec §4.3). The store speaks `effort`. For one tag cycle the
// API also speaks `pain`, because installed pre-PR-2 builds send and read it.
// Both adapters live here so Phase DE PR 3 deletes this file and its call
// sites and nothing else. `PATCH /api/logs/:id` decides what to touch by KEY
// PRESENCE ("pain" in body): absent = leave alone, present-null = clear — so
// adoptEffortKey never creates a key the caller did not send, and never
// assigns `undefined`.
export function effortError(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  )
    return null;
  return "effort must be an integer 1..5 or null";
}

export type AdoptResult =
  | { ok: true; usedPainKey: boolean }
  | { ok: false; field: "effort"; error: string };

export function adoptEffortKey(body: Record<string, unknown>): AdoptResult {
  const hasPain = "pain" in body;
  const hasEffort = "effort" in body;
  if (!hasPain) return { ok: true, usedPainKey: false };
  if (!hasEffort) {
    body.effort = body.pain;
    return { ok: true, usedPainKey: true };
  }
  const pain = body.pain;
  const effort = body.effort;
  if (effort === null || effort === undefined) {
    if (pain !== null && pain !== undefined) {
      body.effort = pain;
      return { ok: true, usedPainKey: true };
    }
    return { ok: true, usedPainKey: false };
  }
  if (pain !== null && pain !== undefined && pain !== effort) {
    return {
      ok: false,
      field: "effort",
      error: "pain and effort disagree; send one",
    };
  }
  return { ok: true, usedPainKey: false };
}

export function withPainAlias<T extends { effort: number | null }>(
  row: T,
): T & { pain: number | null } {
  return { ...row, pain: row.effort };
}

// PR 3's trigger (spec §5): zero of these over a container lifetime ≥ 7 days.
export function notePainWrite(route: string): void {
  console.info(JSON.stringify({ event: "compat.pain_write", route }));
}
