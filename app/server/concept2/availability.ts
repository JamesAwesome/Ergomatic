import { isAllowed } from "../auth/allowlist.js";

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

// Wave E per-user gate (.superpowers/c2-user-gate-brief.md): the Concept2
// surface goes live for ONE account before it goes live for the sign-in
// allowlist — James links a real account, sends a real row and reads it back
// in the logbook, while the rest of `ALLOWED_EMAILS` never meets an
// unfinished feature. The same primitive is what makes the eventual live
// cutover safe: widen the list, don't flip a flag.
//
// `available` is a CONJUNCT, never a fallback: the C2 list can only narrow
// what the flag and the credentials already permit. `allowedEmails` is a
// `parseAllowlist` result, which is why "unset" needs no special case here —
// an absent or empty `C2_ALLOWED_EMAILS` parses to an EMPTY set, and an
// empty set matches nobody. That is the fail-closed direction, and it is a
// property of the parse rather than of a default written here; nothing in
// this function may grow a `size === 0` branch, which would be exactly the
// "unset means everybody" bug this gate exists to avoid.
export function computeAvailableFor(
  available: boolean,
  allowedEmails: Set<string>,
  email: string,
): boolean {
  return available && isAllowed(allowedEmails, email);
}

// The boot warnings for the Concept2 env, as VALUES rather than
// `console.warn` calls, because `index.ts` runs at import time and requires
// a real `DATABASE_URL` — the same reason `computeAvailable` lives here.
// `index.ts` prints whatever this returns, in order, and decides nothing.
//
// The credentials pair and the flag-off pair stay mutually exclusive (they
// describe the same misconfiguration from two directions). The empty-list
// warning is INDEPENDENT of them: a deployment with the flag on, working
// credentials and an empty `C2_ALLOWED_EMAILS` is a fully-configured
// Concept2 broker that will refuse every rower, and it is the one state
// where a silent boot would read as working software.
export function c2Warnings(
  linkEnabledFlag: string | undefined,
  clientId: string,
  clientSecret: string,
  allowedEmails: Set<string>,
): string[] {
  const warnings: string[] = [];
  if (
    linkEnabledFlag === "1" &&
    !computeAvailable(linkEnabledFlag, clientId, clientSecret)
  ) {
    warnings.push(
      "WARNING: C2_LINK_ENABLED=1 but C2_CLIENT_ID / C2_CLIENT_SECRET not fully set — Concept2 linking is DISABLED",
    );
  } else if (
    linkEnabledFlag !== "1" &&
    clientId !== "" &&
    clientSecret !== ""
  ) {
    warnings.push(
      "WARNING: C2_CLIENT_ID / C2_CLIENT_SECRET are set but C2_LINK_ENABLED is not '1' — Concept2 linking stays DISABLED",
    );
  }
  if (linkEnabledFlag === "1" && allowedEmails.size === 0) {
    warnings.push(
      "WARNING: C2_ALLOWED_EMAILS is empty — nobody can link a Concept2 account",
    );
  }
  return warnings;
}
