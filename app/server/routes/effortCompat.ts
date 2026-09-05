// Phase DE PR 2 (spec §4.3). The store speaks `effort`. For one tag cycle the
// API also speaks `pain`, because installed pre-PR-2 builds send and read it.
// Both adapters live here so Phase DE PR 3 deletes this file and its call
// sites and nothing else. `PATCH /api/logs/:id` decides what to touch by KEY
// PRESENCE ("pain" in body): absent = leave alone, present-null = clear — so
// adoptEffortKey never creates a key the caller did not send. A `pain` key
// whose value is `undefined` (impossible over JSON, possible in a test) is
// treated as absent rather than copied.
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function effortError(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  ) {
    return null;
  }
  return "effort must be an integer 1..5 or null";
}

export type AdoptResult =
  | { ok: true; sawPainKey: boolean; usedPainKey: boolean }
  | { ok: false; field: "effort"; error: string };

/** Mutates `body` (when it is a record) so downstream code reads only
 *  `effort`. `sawPainKey` is the PR 3 trigger's property (the REQUEST
 *  carried the old key); `usedPainKey` says the old key's value WON, which
 *  is what error wording keys off. Non-record bodies (Express 5 leaves
 *  `req.body` undefined for a bodiless or non-JSON request) pass through
 *  untouched — the validators downstream already answer them with 400. */
export function adoptEffortKey(body: unknown): AdoptResult {
  if (!isRecord(body))
    return { ok: true, sawPainKey: false, usedPainKey: false };
  const sawPainKey = "pain" in body;
  if (!sawPainKey || body.pain === undefined) {
    return { ok: true, sawPainKey, usedPainKey: false };
  }
  const pain = body.pain;
  if (!("effort" in body) || body.effort === undefined) {
    body.effort = pain;
    return { ok: true, sawPainKey, usedPainKey: true };
  }
  const effort = body.effort;
  if (effort === null) {
    if (pain !== null) {
      body.effort = pain;
      return { ok: true, sawPainKey, usedPainKey: true };
    }
    return { ok: true, sawPainKey, usedPainKey: false };
  }
  if (pain !== null && pain !== effort) {
    return {
      ok: false,
      field: "effort",
      error: "pain and effort disagree; send one",
    };
  }
  return { ok: true, sawPainKey, usedPainKey: false };
}

export function withPainAlias<T extends { effort: number | null }>(
  row: T,
): T & { pain: number | null } {
  return { ...row, pain: row.effort };
}

// PR 3's trigger (spec §5): zero of these over a container lifetime ≥ 7 days.
// Fired on `sawPainKey`, a property of the request, never of how it resolved.
export function notePainWrite(route: string): void {
  console.info(JSON.stringify({ event: "compat.pain_write", route }));
}
