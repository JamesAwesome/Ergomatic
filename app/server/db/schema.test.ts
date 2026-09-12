// The `ended_by` value set, pinned against six independent literals.
//
// Phase MD PR 3 REPLACED the `EXHAUSTIVE` pin that used to live here. That
// one tied this file's `endedByEnum` to `server/stores/logs.ts`'s `EndedBy`
// union with `Record<EndedBy, true>`, and it was a real gate for as long as
// `EndedBy` was a hand-copied literal union. `EndedBy` is now
// `(typeof endedByEnum.enumValues)[number]`, so both sides are the same
// expression and that assertion could not have gone red whatever anyone did
// to either — RF21: a green check nobody can make fail is decoration that
// reads as evidence, and it is worse than no gate because it retires the
// suspicion that would have found the drift.
//
// The pin below is what replaces it, and it is strictly stronger than the
// one it replaces in the direction that matters: the literals are written
// out here and owned by nothing else, so a member ADDED to the pgEnum reds
// it, and so does one removed or renamed. What it deliberately does NOT do
// is tie the DB to a TS type — there is no longer a type to tie it to.
//
// The other two gates on this value set, stated honestly because the
// previous wording overstated them: `server/routes/endedBy.integration.test.ts`
// round-trips each value through real Postgres, and `data.test.ts`'s POST
// loop asserts 201 for each of its own six literals — that loop catches a
// member REMOVED from the enum (the POST 400s) and stays GREEN on one added,
// because an added member widens the route automatically.
//
// The CLIENT still carries its own copies, ungated by anything here (PR 3
// collapsed the SERVER's four; it did not reach across the wire):
// `src/monitor/monitorRun.ts`'s `CloseReason` (five members, no
// "interrupted") and its `endedBy` validator, `src/log/storedSummary.ts`'s
// two branches, `src/monitor/handoffStore.ts`'s `isMonitorRun`. A member
// added to the pgEnum reaches none of them until a client PR spells it.
import { describe, expect, it } from "vitest";
import { endedByEnum } from "./schema.js";

describe("endedByEnum (server/db/schema.ts) is the one source for ended_by", () => {
  it("carries exactly these six values, pinned by independent literals", () => {
    expect([...endedByEnum.enumValues]).toStrictEqual([
      "finished",
      "rower",
      "link-lost",
      "program-failed",
      "program-dropped",
      "interrupted",
    ]);
  });
});
