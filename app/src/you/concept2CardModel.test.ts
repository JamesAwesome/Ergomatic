import { describe, it, expect } from "vitest";
import type { LinkOutcome } from "../adapters/linkFlow";
import type { Concept2Link } from "../api/useConcept2Link";
import {
  describeFailure,
  identityLine,
  FAILED_LINE,
} from "./concept2CardModel";

// ---------------------------------------------------------------------------
// EVERY expected string below is an INDEPENDENT literal, transcribed by hand
// from the Gate 0 page
// (`docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html`)
// and NEVER read back out of the module under test. Review finding F1 is why:
// the first draft asserted `expect(other?.line).toBe(FAILED_LINE)`, and a
// reviewer replaced `FAILED_LINE` with "Something went wrong." with the whole
// suite green. An expectation derived from the symbol it exists to gate pins
// nothing at all (RF21's first smell).
//
// TWO ROWS WERE TRANSCRIBED FROM THE PAGE'S RULING RATHER THAN ITS TABLE,
// because when this file was written the page disagreed with itself on
// exactly those two: the outcome→copy table still listed "THE BROWSER LEFT
// THE LINK" and "THIS DEVICE COULDN'T OPEN CONCEPT2 · <code>", while the
// copy-pass ruling row on the same page (the one that also says it
// "Supersedes the board's 'copy is final as rendered' note for these
// strings") reads, verbatim:
//
//   "Every token gets words written for a rower, or is dropped. […] one
//    sentence, "THIS DEVICE COULDN'T OPEN CONCEPT2", for all four
//    device-open failures. Also "CONCEPT2 REFUSED THE LINK", not "THE
//    EXCHANGE" (an OAuth word, not a rowing one), and "THE BROWSER LEFT
//    CONCEPT2"."
//
// The ruling won: a Capacitor error code on a rower's screen is the exact
// defect it exists to remove. The page's table has SINCE been corrected to
// match (commit "Gate 0: the outcome table said the pre-ruling strings"), so
// the two halves now agree and every literal below can be checked against
// either. The history is kept here because it is the reason these two rows
// carry a note the others do not.
// ---------------------------------------------------------------------------

// Board 1e's panel line is transcribed inline on every row of the table
// below rather than hoisted into one shared constant. Fifteen repetitions is
// deliberate: a shared constant is one edit away from being the same
// self-reference F1 found, one level removed. The amendment's rendered 1e
// frames read `<p class="panel-line">The connection didn't complete. Nothing
// was linked.</p>`.

const LINKED: Concept2Link = {
  // Spelled out rather than spread from `LINK_UNAVAILABLE`: a fixture that
  // borrows the other module's constant inherits its corruption too (F2 is
  // that constant's own finding).
  available: true,
  linked: true,
  c2UserId: 2211,
  c2Username: "jamesawesome",
  needsReauth: false,
  logbookBaseUrl: "https://log-dev.concept2.com",
};

describe("identityLine (Gate 0 amendment 1c)", () => {
  it("names the Concept2 username and the Ergomatic email, in the callback page's order", () => {
    expect(identityLine(LINKED, "james@jamestheaweso.me")).toBe(
      "Concept2 jamesawesome · Ergomatic james@jamestheaweso.me",
    );
  });

  it("falls back to the numeric account when no username is stored", () => {
    expect(
      identityLine({ ...LINKED, c2Username: null }, "james@jamestheaweso.me"),
    ).toBe("Concept2 account #2211 · Ergomatic james@jamestheaweso.me");
  });

  it("falls back for an EMPTY username too, which is a different shape from a missing one", () => {
    // Observation 18: `client.ts`'s `fetchMe` returns
    // `typeof data?.username === "string" ? data.username : null`, so the
    // empty string is a STRING and reaches the card intact. A `??` guard
    // would render "Concept2  · Ergomatic james@…" — a blank where the
    // account-injection mitigation is supposed to name an account.
    expect(
      identityLine({ ...LINKED, c2Username: "" }, "james@jamestheaweso.me"),
    ).toBe("Concept2 account #2211 · Ergomatic james@jamestheaweso.me");
  });

  it("says the word 'account' with no number when there is no id either", () => {
    expect(
      identityLine(
        { ...LINKED, c2Username: "", c2UserId: null },
        "james@jamestheaweso.me",
      ),
    ).toBe("Concept2 account · Ergomatic james@jamestheaweso.me");
  });
});

describe("the module's own exported copy", () => {
  it("FAILED_LINE is board 1e's panel line, character for character", () => {
    // The constant itself, pinned against a transcription rather than
    // against itself. Nothing else in this file reads `FAILED_LINE`, so this
    // is the ONE place a change to it can be caught (F1).
    expect(FAILED_LINE).toBe(
      "The connection didn't complete. Nothing was linked.",
    );
  });
});

interface CopyRow {
  name: string;
  outcome: LinkOutcome;
  /** The WHOLE answer, asserted with `toStrictEqual` — not one field of it.
   *  A per-field assertion is how the first draft let a wrong `line` ride
   *  along beside a right `reason`. */
  expected: { line: string; reason: string } | null;
}

/** Every member of `LinkOutcome`, with the two members that branch
 *  (`busy` on `source`, `exchangeFailed` on `error`) appearing once per
 *  branch, plus a second generic `exchangeFailed` status so a hardcoded
 *  number cannot satisfy the row. Twenty rows over seventeen members. */
const COPY_TABLE: CopyRow[] = [
  {
    name: "linked → no panel at all",
    outcome: {
      kind: "linked",
      c2UserId: 2211,
      // Task 2 deletes `weightClass` from this member (ruling i); the
      // excess-property check turns that into a compile error here rather
      // than letting a stale fixture survive.
      weightClass: "H",
      stateEchoed: true,
    },
    expected: null,
  },
  {
    name: "navigating → 1b, which is not a failure",
    outcome: { kind: "navigating" },
    expected: null,
  },
  {
    name: "cancelled → 1a, the rower dismissed the sheet themselves",
    outcome: { kind: "cancelled" },
    expected: null,
  },
  {
    name: "updateRequired → 1g, which owns its own copy",
    outcome: { kind: "updateRequired" },
    expected: null,
  },
  {
    name: "busy · guard → 1b: the rower's own previous tap is still working",
    outcome: { kind: "busy", source: "guard" },
    expected: null,
  },
  {
    name: "busy · sheet → a sheet is already up",
    outcome: { kind: "busy", source: "sheet" },
    expected: {
      line: "The connection didn't complete. Nothing was linked.",
      reason: "A LINK IS ALREADY OPEN · CLOSE IT AND TRY AGAIN",
    },
  },
  {
    name: "declined → its own line, about the rower's own choice",
    outcome: { kind: "declined", stateEchoed: false },
    expected: {
      line: "You cancelled at Concept2. Nothing was linked.",
      reason: "DECLINED AT CONCEPT2",
    },
  },
  {
    name: "abandoned → THE BROWSER LEFT CONCEPT2 (the copy ruling's spelling)",
    outcome: { kind: "abandoned" },
    expected: {
      line: "The connection didn't complete. Nothing was linked.",
      reason: "THE BROWSER LEFT CONCEPT2",
    },
  },
  {
    name: "stateMismatch → the return didn't match",
    outcome: { kind: "stateMismatch" },
    expected: {
      line: "The connection didn't complete. Nothing was linked.",
      reason: "THE RETURN DIDN'T MATCH THIS ATTEMPT",
    },
  },
  {
    name: "malformed → Concept2 sent something unreadable",
    outcome: { kind: "malformed", stateEchoed: false },
    expected: {
      line: "The connection didn't complete. Nothing was linked.",
      reason: "CONCEPT2 SENT SOMETHING WE COULDN'T READ",
    },
  },
  {
    name: "exchangeFailed · already_linked_elsewhere → its own line and a fixed 409",
    outcome: {
      kind: "exchangeFailed",
      status: 409,
      error: "already_linked_elsewhere",
      stateEchoed: true,
    },
    expected: {
      line: "That Concept2 account is already connected to a different Ergomatic account.",
      reason: "ALREADY LINKED ELSEWHERE · 409",
    },
  },
  {
    name: "exchangeFailed · any other error → generic line, status 400",
    outcome: {
      kind: "exchangeFailed",
      status: 400,
      error: "invalid_state",
      stateEchoed: true,
    },
    expected: {
      line: "The connection didn't complete. Nothing was linked.",
      reason: "CONCEPT2 REFUSED THE LINK · 400",
    },
  },
  {
    name: "exchangeFailed · a SECOND status, so a hardcoded number cannot pass both",
    outcome: {
      kind: "exchangeFailed",
      status: 500,
      error: "c2_error",
      stateEchoed: false,
    },
    expected: {
      line: "The connection didn't complete. Nothing was linked.",
      reason: "CONCEPT2 REFUSED THE LINK · 500",
    },
  },
  {
    name: "serverError → our own server, with its status",
    outcome: { kind: "serverError", status: 502, stateEchoed: false },
    expected: {
      line: "The connection didn't complete. Nothing was linked.",
      reason: "ERGOMATIC'S SERVER DIDN'T ANSWER · 502",
    },
  },
  {
    name: "mintFailed → the link never started, with its status",
    outcome: { kind: "mintFailed", status: 403, error: "unavailable" },
    expected: {
      line: "The connection didn't complete. Nothing was linked.",
      reason: "COULDN'T START THE LINK · 403",
    },
  },
  {
    name: "networkError → no connection",
    outcome: { kind: "networkError", message: "boom" },
    expected: {
      line: "The connection didn't complete. Nothing was linked.",
      reason: "NO CONNECTION",
    },
  },
  {
    name: "noWindow → one sentence, no token",
    outcome: { kind: "noWindow" },
    expected: {
      line: "The connection didn't complete. Nothing was linked.",
      reason: "THIS DEVICE COULDN'T OPEN CONCEPT2",
    },
  },
  {
    name: "noContext → the same sentence",
    outcome: { kind: "noContext" },
    expected: {
      line: "The connection didn't complete. Nothing was linked.",
      reason: "THIS DEVICE COULDN'T OPEN CONCEPT2",
    },
  },
  {
    name: "contextInvalid → the same sentence",
    outcome: { kind: "contextInvalid" },
    expected: {
      line: "The connection didn't complete. Nothing was linked.",
      reason: "THIS DEVICE COULDN'T OPEN CONCEPT2",
    },
  },
  {
    name: "pluginError → the same sentence, and NOT the plugin's code",
    outcome: { kind: "pluginError", code: "cannotStart", message: "x" },
    expected: {
      line: "The connection didn't complete. Nothing was linked.",
      reason: "THIS DEVICE COULDN'T OPEN CONCEPT2",
    },
  },
];

describe("describeFailure — the Gate 0 amendment's outcome table, transcribed", () => {
  it.each(COPY_TABLE)("$name", ({ outcome, expected }) => {
    expect(describeFailure(outcome)).toStrictEqual(expected);
  });

  it("covers every member of the union, with the two branching members twice", () => {
    // The table is only an authority if it is COMPLETE. `describeFailure` is
    // total over the union with no `default`, so a new member is a compile
    // error there — but nothing would force it into this table. Counting the
    // distinct `kind`s here does.
    const kinds = new Set(COPY_TABLE.map((row) => row.outcome.kind));
    expect([...kinds].sort()).toStrictEqual([
      "abandoned",
      "busy",
      "cancelled",
      "contextInvalid",
      "declined",
      "exchangeFailed",
      "linked",
      "malformed",
      "mintFailed",
      "navigating",
      "networkError",
      "noContext",
      "noWindow",
      "pluginError",
      "serverError",
      "stateMismatch",
      "updateRequired",
    ]);
    expect(COPY_TABLE).toHaveLength(20);
  });
});

describe("describeFailure — the two rules that outlive any one string", () => {
  it("puts NO wire token in the reason, for any of the four device failures", () => {
    // James, 2026-09-03: the copy is mechanical, and a token is not copy.
    // Subsumed value-wise by the table above; kept because it names the RULE
    // rather than the string, and it is the assertion that goes red when a
    // future revision re-appends `outcome.kind` or the plugin's `code`.
    const four: LinkOutcome[] = [
      { kind: "noWindow" },
      { kind: "noContext" },
      { kind: "contextInvalid" },
      { kind: "pluginError", code: "cannotStart", message: "x" },
    ];
    const reasons = four.map((outcome) => describeFailure(outcome)?.reason);
    expect(
      reasons.filter((reason) =>
        /CANNOTSTART|NOWINDOW|NOCONTEXT|CONTEXTINVALID/.test(reason ?? ""),
      ),
    ).toStrictEqual([]);
  });

  it("uses no em-dash in any user-facing string (house style)", () => {
    const strings = COPY_TABLE.flatMap((row) => {
      const failure = describeFailure(row.outcome);
      return failure === null ? [] : [failure.line, failure.reason];
    });
    // 15 of the 20 rows are failures, each carrying a line AND a reason. The
    // count is what stops this sweep passing vacuously: a `describeFailure`
    // that answered `null` everywhere would sweep an empty array and go
    // green (this exact assertion is what mutation M3 trips).
    expect(strings).toHaveLength(30);
    expect(strings.filter((value) => value.includes("—"))).toStrictEqual([]);
  });
});
