// Wave E PR1 Task 7 (task-7-brief.md): the availability GATE composition —
// "flag AND both creds" (Task 6's `Concept2RouterDeps.available` comment,
// carried from the plan's own "Availability" line) — extracted to its own
// pure function so it can be unit-tested directly. `index.ts` runs at
// import time and requires `DATABASE_URL` (a real Postgres connection), so
// it can never be exercised there in a unit test; this module has no such
// dependency.
//
// Computed once at boot and closed over (never re-read per-request) —
// `index.ts` is the only caller, and the router's own `available()` deps
// field just returns whatever this produced.
export function computeAvailable(
  linkEnabledFlag: string | undefined,
  clientId: string,
  clientSecret: string,
): boolean {
  return linkEnabledFlag === "1" && clientId !== "" && clientSecret !== "";
}
