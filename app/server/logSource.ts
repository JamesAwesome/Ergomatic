import type { LogSource } from "../domain/types.js";
import type { LogStep } from "./stores/logs.js";

// Just Row unconnected spec (2026-09-02), §Mechanism stored shape (c):
// `session_logs.source` is a stored FACT about which door a row came
// through, written by every log door from this PR on. The two functions
// here exist for the one window where the server still has to reason
// about it — additive-only between tags means an installed build that
// predates the column posts no `source` at all.
//
// SUNSET, v0.35.0: `POST /api/logs` no longer calls `deriveLogSource` —
// `source` is required on the wire and an absent one is a 400 naming the
// field (`routes/data.ts`). The function stays because it documents
// migration 0020's backfill rule in TS, and
// `source.integration.test.ts` still proves the SQL CASE agrees with it.
//
// `deriveLogSource` is that window's inference, and it is BY DESIGN the
// same rule migration 0020's backfill CASE applies to every pre-existing
// row (`drizzle/0020_*.sql`): a row written by an old build today and a
// row backfilled from before the column must read the same word, because
// the rower sees the same PM5 / TIMER / LOGGED BY HAND either way. The
// rule is the old read-side guess (`src/log/storedSummary.ts`'s deleted
// `sourceLabel` inference) verbatim: device name wins, else any stopwatch
// step, else by hand. It is knowingly wrong about one row — a connected
// session the app never heard a pull from, saved through the manual door —
// which is exactly why the column exists and this path has a SUNSET:
// at the first tag after this ships, `source` becomes required on POST
// and this function is deleted (ROADMAP carries the item with that tag as
// its trigger). `source.integration.test.ts` runs the migration's own CASE
// text against three rows and asserts it agrees with this function, so the
// two copies of the rule cannot drift while both exist.
//
// `logSourceContradiction` is the other half: when a client DOES post a
// `source`, the body must not contradict it. Not "must equal the derived
// member" — the whole point of storing the fact is that the inference is
// wrong for some rows — but a member the body makes impossible is a client
// bug and gets a 400 naming the field. The ONLY evidence that can make a
// member impossible is `deviceName`: `pm5` needs one, `timer` and `manual`
// need none. Steps are deliberately NOT consulted: the spec's draft rule
// ("`timer` requires a stopwatch step or empty steps") 400'd every
// ordinary timer save, because the Timer door logs `actualSource:
// "assumed"` for every TIME phase (`src/session/logDraft.ts`'s
// `nextDistance` never touches a time phase), so a time-only workout closed
// on the Timer posts `timer` with zero stopwatch steps — caught by Task 4's
// e2e (`session.spec`, `today.spec`, `retest.spec` red on "Save stays on
// /session/log") and curl. That same row DERIVES/backfills `manual` above,
// which is the word the read side rendered for it before this PR — so the
// inference is left exactly as it was and only the refusal is narrowed.

export interface LogSourceEvidence {
  deviceName: string | null;
  steps: readonly LogStep[];
}

function hasStopwatchStep(steps: readonly LogStep[]): boolean {
  return steps.some((step) => step.actualSource === "stopwatch");
}

export function deriveLogSource(evidence: LogSourceEvidence): LogSource {
  if (evidence.deviceName !== null) return "pm5";
  if (hasStopwatchStep(evidence.steps)) return "timer";
  return "manual";
}

export function logSourceContradiction(
  source: LogSource,
  evidence: LogSourceEvidence,
): string | null {
  switch (source) {
    case "pm5":
      return evidence.deviceName === null
        ? "source pm5 requires a deviceName"
        : null;
    case "timer":
      return evidence.deviceName !== null
        ? "source timer requires deviceName to be absent"
        : null;
    case "manual":
      return evidence.deviceName !== null
        ? "source manual requires deviceName to be absent"
        : null;
  }
}
