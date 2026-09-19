import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 *  A SPELLING PIN, AND THAT IS ALL IT IS.
 *
 *  The antagonist pass on this design defeated an earlier version of this
 *  test FIVE ways in one probe — a drizzle builder call
 *  (`db.delete(authAttempts)`), a lowercase statement, a
 *  `public."auth_attempts"` form, a composed identifier `${T}`, and a
 *  template literal wrapping after `DELETE` — each of which left the count
 *  unchanged. It can also go red for a reason that is not a defect, because a
 *  source-text count counts SQL quoted in comments, and these files quote SQL
 *  in comments constantly.
 *
 *  So, per RF26, the strongest conclusion this test supports is stated here
 *  and nowhere else: NO SECOND OCCURRENCE OF THIS EXACT BYTE SEQUENCE EXISTS
 *  IN THESE FILES' SOURCE TEXT. It does not prove the helper is the only path
 *  that destroys an attempt row, and it cannot — a cascade from `sessions`
 *  destroys them with no statement at all, which is the defect that produced
 *  this whole design.
 *
 *  What actually gates that is one integration test per producer in the
 *  census, each starting upstream of its producer. This is the cheap
 *  reminder that sits next to them, not the gate.
 */
describe("the attempt-delete choke point", () => {
  const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
  const STATEMENT = "DELETE FROM auth_attempts";
  const occurrences = (s: string) => s.split(STATEMENT).length - 1;

  it("keeps the only DELETE statement inside the helper", () => {
    expect(occurrences(read("./attemptCredentials.ts"))).toBe(1);
  });

  // The two files that used to carry their own, named individually so a
  // failure says WHICH file grew one back rather than just "a count changed".
  it.each(["./attempts.ts", "./sessions.ts"])("leaves none in %s", (file) => {
    expect(occurrences(read(file))).toBe(0);
  });
});
