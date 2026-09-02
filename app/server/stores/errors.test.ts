import { describe, it, expect } from "vitest";
import { isUniqueViolation, pgConstraint } from "./errors.js";

// Fix round 2 (task-2-report.md, review finding: `isUniqueViolation`
// classifies by SQLSTATE 23505 alone, which cannot distinguish WHICH
// constraint fired). These are synthetic drizzle-wrapped errors — the real
// shape confirmed against a live constraint violation during Task 2's own
// mutation testing (`errors.ts`'s own `pgCode` comment: drizzle-orm wraps
// the driver error in a `DrizzleQueryError`, and the pg `DatabaseError` with
// `.code`/`.constraint` lives on `.cause`).
function wrappedViolation(constraint: string): unknown {
  return {
    name: "DrizzleQueryError",
    message: "Failed query: insert into ...",
    cause: { code: "23505", constraint },
  };
}

describe("pgConstraint", () => {
  it("reads the constraint name off a drizzle-wrapped cause", () => {
    expect(pgConstraint(wrappedViolation("concept2_auth_attempts_pkey"))).toBe(
      "concept2_auth_attempts_pkey",
    );
    expect(
      pgConstraint(wrappedViolation("concept2_links_c2_user_id_unique")),
    ).toBe("concept2_links_c2_user_id_unique");
  });

  it("also reads a constraint carried directly on the error (no .cause hop)", () => {
    expect(pgConstraint({ code: "23505", constraint: "some_table_pkey" })).toBe(
      "some_table_pkey",
    );
  });

  it("returns undefined when there is no constraint anywhere in the chain", () => {
    expect(pgConstraint(new Error("plain error, no cause"))).toBeUndefined();
    expect(pgConstraint({ cause: { code: "23505" } })).toBeUndefined();
    expect(pgConstraint(null)).toBeUndefined();
    expect(pgConstraint(undefined)).toBeUndefined();
  });

  it("isUniqueViolation is still true for any of these regardless of constraint name", () => {
    expect(
      isUniqueViolation(wrappedViolation("concept2_auth_attempts_pkey")),
    ).toBe(true);
    expect(
      isUniqueViolation(
        wrappedViolation("concept2_auth_attempts_user_id_unique"),
      ),
    ).toBe(true);
  });
});

// The classifier PATTERN both `upsertLink` and `createAttempt` now use —
// `isUniqueViolation(err) && pgConstraint(err) === EXPECTED_NAME` — pulled
// out here so the biting mutation (dropping the constraint check, leaving
// only the SQLSTATE check) has a test that targets the pattern directly,
// independent of a real Postgres round trip.
function classify(
  err: unknown,
  expectedConstraint: string,
): "matched" | "rethrow" {
  // Mirrors concept2.ts's own two catch blocks exactly. Being a mirror
  // means it is a PATTERN test, not a production one (RF11): a regression
  // in `stores/concept2.ts` back to a bare `isUniqueViolation(err)` check
  // (dropping the constraint-name comparison) would NOT redden this file —
  // this `classify` would regress in lockstep with the production code it
  // mirrors. The production sites' own evidence is Task 2's real-Postgres
  // mutation testing (`task-2-report.md:609-633`): mutating `createAttempt`
  // to a delete-then-insert produced a `concept2_auth_attempts_user_id_
  // unique` violation that, with the real (unmutated) constraint-name
  // check, propagated unmapped rather than being misclassified as the
  // expected nonce-PK collision — that real-Postgres run is the actual
  // proof this pattern matters, not this file.
  if (isUniqueViolation(err) && pgConstraint(err) === expectedConstraint) {
    return "matched";
  }
  return "rethrow";
}

describe("constraint-aware unique-violation classification (concept2.ts's own pattern)", () => {
  const ATTEMPTS_NONCE_PK = "concept2_auth_attempts_pkey";
  const LINKS_C2_USER_ID_UNIQUE = "concept2_links_c2_user_id_unique";

  it("matches the attempts PK by name", () => {
    expect(
      classify(wrappedViolation(ATTEMPTS_NONCE_PK), ATTEMPTS_NONCE_PK),
    ).toBe("matched");
  });

  it("matches the links c2_user_id unique constraint by name", () => {
    expect(
      classify(
        wrappedViolation(LINKS_C2_USER_ID_UNIQUE),
        LINKS_C2_USER_ID_UNIQUE,
      ),
    ).toBe("matched");
  });

  // The exact failure mode the review named: a 23505 on the SAME table from
  // a DIFFERENT constraint (the one a delete+insert-style mutation of
  // createAttempt actually violates) must NOT be misreported as a nonce
  // collision — a bare SQLSTATE check cannot tell these apart, only the
  // constraint name can.
  it("an unrelated unique constraint on the SAME statement is rethrown untouched, never matched", () => {
    expect(
      classify(
        wrappedViolation("concept2_auth_attempts_user_id_unique"),
        ATTEMPTS_NONCE_PK,
      ),
    ).toBe("rethrow");
    expect(
      classify(
        wrappedViolation("some_other_table_pkey"),
        LINKS_C2_USER_ID_UNIQUE,
      ),
    ).toBe("rethrow");
  });

  it("a non-unique-violation error is rethrown untouched even with a matching constraint name (defensive)", () => {
    expect(
      classify(
        { cause: { code: "23503", constraint: ATTEMPTS_NONCE_PK } },
        ATTEMPTS_NONCE_PK,
      ),
    ).toBe("rethrow");
  });
});
