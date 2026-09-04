import { isAllowed, parseAllowlist } from "../auth/allowlist.js";

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

// Wave E per-user gate (docs/superpowers/specs/2026-09-04-concept2-per-user-gate.md): the Concept2
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

/** One line for `index.ts` to print, with the console method to print it
 *  with. A VALUE rather than a `console.*` call because `index.ts` runs at
 *  import time and requires a real `DATABASE_URL` — nothing in it can be
 *  exercised by a test. */
export interface C2BootLine {
  level: "warn" | "info";
  message: string;
}

// The boot lines for the Concept2 env. `index.ts` prints whatever this
// returns, in order, and decides nothing.
//
// The credentials pair and the flag-off pair stay mutually exclusive (they
// describe the same misconfiguration from two directions). The empty-list
// warning is INDEPENDENT of them: a deployment with the flag on, working
// credentials and an empty `C2_ALLOWED_EMAILS` is a fully-configured
// Concept2 broker that will refuse every rower, and it is the one state
// where a silent boot would read as working software.
//
// The COUNT line (F5) exists because the empty-list warning alone left a
// TYPO'D address indistinguishable from a correct one: both boot silently
// and both render no card. The count separates "the variable never reached
// the container" from "it arrived and parsed to N", which is the half an
// operator cannot otherwise see. It prints the SIZE and never the
// addresses — `AUTH_VIA_LOG`'s precedent, and the reason the test asserts
// the absence of every address across every line.
function c2BootLines(
  linkEnabledFlag: string | undefined,
  clientId: string,
  clientSecret: string,
  allowedEmails: Set<string>,
): C2BootLine[] {
  const warnings: C2BootLine[] = [];
  if (
    linkEnabledFlag === "1" &&
    !computeAvailable(linkEnabledFlag, clientId, clientSecret)
  ) {
    warnings.push({
      level: "warn",
      message:
        "WARNING: C2_LINK_ENABLED=1 but C2_CLIENT_ID / C2_CLIENT_SECRET not fully set — Concept2 linking is DISABLED",
    });
  } else if (
    linkEnabledFlag !== "1" &&
    clientId !== "" &&
    clientSecret !== ""
  ) {
    warnings.push({
      level: "warn",
      message:
        "WARNING: C2_CLIENT_ID / C2_CLIENT_SECRET are set but C2_LINK_ENABLED is not '1' — Concept2 linking stays DISABLED",
    });
  }
  if (linkEnabledFlag === "1") {
    if (allowedEmails.size === 0) {
      warnings.push({
        level: "warn",
        message:
          "WARNING: C2_ALLOWED_EMAILS is empty — nobody can link a Concept2 account",
      });
    } else {
      warnings.push({
        level: "info",
        message: `Concept2 per-user gate: ${String(allowedEmails.size)} allowed email(s) configured`,
      });
    }
  }
  return warnings;
}

/** The four raw environment values the Concept2 gate is built from —
 *  strings exactly as `process.env` hands them over, never pre-parsed.
 *  Taking them raw is the point: it is what moves the parse and the
 *  composition into a file a test can import. */
export interface C2GateEnv {
  linkEnabledFlag: string | undefined;
  clientId: string;
  clientSecret: string;
  /** The RAW `C2_ALLOWED_EMAILS` string. */
  allowedEmails: string | undefined;
}

/** The two checks the router takes, as ONE value.
 *
 *  Nested rather than flat so `index.ts` can spread it — `{ ...c2.gate }` —
 *  and never write either field name. That is not tidiness: the two are
 *  mutually assignable (TypeScript's parameter bivariance makes a zero-arg
 *  function satisfy a one-arg type), so a hand-written
 *  `availableFor: c2.available` typechecks clean and opens every gated route
 *  to every signed-in user. `index.ts` cannot be imported by a test — it
 *  opens a real Postgres at import time — so nothing can go red on it.
 *  Measured before this shape existed: that exact one-word swap left
 *  `Test Files 58 passed`, `Tests 1878 passed | 1 skipped`, zero red.
 *  Spreading makes the swap unexpressible rather than merely discouraged.
 *
 *  `app.ts` keeps its named wiring on purpose — the identical mutation
 *  reddens a test there, because that hop IS reachable from a test. */
export interface C2GateChecks {
  /** Flag AND both credentials. The unauthenticated web callback's first
   *  check, and `DELETE /link`'s (revocation is not per-user gated). */
  available: () => boolean;
  /** `available()` AND the email is on `C2_ALLOWED_EMAILS`. Every other
   *  authenticated route's check, and the web callback's second one once it
   *  has resolved a principal. */
  availableFor: (email: string) => boolean;
}

export interface C2Gate {
  /** Spread this into the router deps; never name its fields. */
  gate: C2GateChecks;
  /** For `index.ts` to print, in order. */
  bootLines: C2BootLine[];
}

// F1 (fix round 1). `index.ts` used to hold the C2 allowlist as a
// `Set<string>` and compose the gate itself — one scope, two
// identically-typed Sets (the sign-in `allowlist` and `c2Allowlist`), and
// swapping one for the other typechecked clean and left 6842 tests green
// while opening the Concept2 surface to every signed-in user. `index.ts`
// cannot be imported by a test (it opens a real Postgres at import time),
// so no gate could ever have caught that.
//
// Taking RAW env and returning the FINISHED gate moves the parse and the
// composition here, where they are tested.
//
// WHAT IS ACTUALLY LEFT UNTESTED IN `index.ts` — the canonical statement;
// two other comments point here rather than restating it, because an
// over-stated version of this paragraph is the thing this work has got
// wrong four times. It is not "four env var names". Every claim below was
// measured on 2026-09-04 against the tree at `f76ac07a`, by making the edit
// and running `pnpm typecheck` and `pnpm test --project unit`:
//
//  1. FOUR `process.env` NAMES at the `c2Gate({...})` call. Exactly one of
//     the four fails OPEN when misnamed: `allowedEmails` pointed at
//     `ALLOWED_EMAILS` — the sign-in list — typechecks clean, leaves every
//     unit test green, and admits every signed-in rower. The other three
//     deny or break loudly.
//  2. FOUR FIELD LITERALS of `C2GateEnv`, several of them mutually
//     assignable: `clientId`/`clientSecret` are both `string`,
//     `linkEnabledFlag`/`allowedEmails` are both `string | undefined`, and
//     a `string` satisfies `string | undefined` too. Measured: feeding
//     `allowedEmails` from `c2ClientId` typechecks clean and stays green,
//     and DENIES (a client id is not an email); swapping the two
//     credentials typechecks clean and stays green and leaves this gate
//     untouched — it breaks the Concept2 API calls instead. One such swap
//     did fail `pnpm typecheck`, but on `TS6133 'c2LinkEnabled' is declared
//     but its value is never read`, i.e. `noUnusedLocals` and not the type
//     system catching a confusion; do not read that as protection.
//  3. The `bootLines` dispatch (`warn` vs `log`). Cosmetic.
//  4. THE SPREAD ITSELF IS A CONVENTION, NOT A GUARANTEE. Returning the
//     pair nested means `index.ts` writes neither field name, so the
//     one-token swap that opened every gated route
//     (`availableFor: c2.available`) is no longer expressible. It does NOT
//     make a bypass impossible: measured, deleting `...c2.gate` and
//     hand-writing the two named assignments back — with the per-user slot
//     fed the global check — typechecks clean and leaves all 1878 unit
//     tests green. What was bought is that the bypass now costs a
//     deliberate two-line rewrite against a comment that says not to,
//     rather than one word.
//
// `app.ts` keeps its NAMED wiring deliberately: the same mutation reddens a
// test there (`concept2.test.ts`, "createApp threads availableFor"),
// because that hop is reachable from a test and this one is not.
export function c2Gate(env: C2GateEnv): C2Gate {
  const allowedEmails = parseAllowlist(env.allowedEmails);
  const available = computeAvailable(
    env.linkEnabledFlag,
    env.clientId,
    env.clientSecret,
  );
  return {
    gate: {
      available: () => available,
      availableFor: (email: string) =>
        computeAvailableFor(available, allowedEmails, email),
    },
    bootLines: c2BootLines(
      env.linkEnabledFlag,
      env.clientId,
      env.clientSecret,
      allowedEmails,
    ),
  };
}
