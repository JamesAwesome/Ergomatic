import { describe, it, expect } from "vitest";
import type { LinkOutcome } from "../adapters/linkFlow";
import { LINK_UNAVAILABLE, type Concept2Link } from "../api/useConcept2Link";
import {
  describeFailure,
  identityLine,
  FAILED_LINE,
} from "./concept2CardModel";

const LINKED: Concept2Link = {
  ...LINK_UNAVAILABLE,
  available: true,
  linked: true,
  c2UserId: 2211,
  c2Username: "jamesawesome",
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

describe("describeFailure (Gate 0 amendment, the LinkOutcome table)", () => {
  it("returns null for the outcomes that are not failures", () => {
    const notFailures: LinkOutcome[] = [
      // `weightClass` is still on the `linked` member at this commit. Task 2
      // deletes it (ruling i) and this one property comes out with it — the
      // excess-property check turns that into a compile error rather than
      // letting a stale fixture survive silently.
      { kind: "linked", c2UserId: 2211, weightClass: "H", stateEchoed: true },
      { kind: "navigating" },
      { kind: "cancelled" },
      { kind: "updateRequired" },
      { kind: "busy", source: "guard" },
    ];
    // Mapped rather than looped: `vitest/no-conditional-expect` and the
    // repo's own preference both push assertions out of control flow, and
    // one `toStrictEqual` over the whole array says the same thing with a
    // better failure message (it names WHICH member stopped being null).
    expect(
      notFailures.map((outcome) => describeFailure(outcome)),
    ).toStrictEqual([null, null, null, null, null]);
  });

  it("separates the two busy sources, which the union previously could not", () => {
    expect(describeFailure({ kind: "busy", source: "guard" })).toBeNull();
    expect(describeFailure({ kind: "busy", source: "sheet" })?.reason).toBe(
      "A LINK IS ALREADY OPEN · CLOSE IT AND TRY AGAIN",
    );
  });

  it("gives a declined link its own line, not the generic one", () => {
    const failure = describeFailure({ kind: "declined", stateEchoed: false });
    expect(failure?.line).toBe(
      "You cancelled at Concept2. Nothing was linked.",
    );
    expect(failure?.reason).toBe("DECLINED AT CONCEPT2");
  });

  it("gives already_linked_elsewhere its own line and keeps every other exchange failure generic", () => {
    expect(
      describeFailure({
        kind: "exchangeFailed",
        status: 409,
        error: "already_linked_elsewhere",
        stateEchoed: true,
      })?.line,
    ).toBe(
      "That Concept2 account is already connected to a different Ergomatic account.",
    );
    const other = describeFailure({
      kind: "exchangeFailed",
      status: 400,
      error: "invalid_state",
      stateEchoed: true,
    });
    expect(other?.line).toBe(FAILED_LINE);
    expect(other?.reason).toBe("CONCEPT2 REFUSED THE LINK · 400");
  });

  it("carries the status into the reason for every server-hop failure", () => {
    expect(
      describeFailure({ kind: "mintFailed", status: 403, error: "unavailable" })
        ?.reason,
    ).toBe("COULDN'T START THE LINK · 403");
    expect(
      describeFailure({ kind: "serverError", status: 502, stateEchoed: false })
        ?.reason,
    ).toBe("ERGOMATIC'S SERVER DIDN'T ANSWER · 502");
  });

  it("puts NO wire token in the reason, for any of the four device failures", () => {
    // James, 2026-09-03: the copy is mechanical, and a token is not copy.
    // All four members read one sentence; the failing kind and the plugin's
    // own code stay OUT of it. The literals below are independent of the
    // production symbols on purpose (RF21's first smell) — building the
    // expectation from `outcome.kind` would pass whatever the code did.
    const four: LinkOutcome[] = [
      { kind: "noWindow" },
      { kind: "noContext" },
      { kind: "contextInvalid" },
      { kind: "pluginError", code: "cannotStart", message: "x" },
    ];
    const reasons = four.map((outcome) => describeFailure(outcome)?.reason);
    expect(reasons).toStrictEqual([
      "THIS DEVICE COULDN'T OPEN CONCEPT2",
      "THIS DEVICE COULDN'T OPEN CONCEPT2",
      "THIS DEVICE COULDN'T OPEN CONCEPT2",
      "THIS DEVICE COULDN'T OPEN CONCEPT2",
    ]);
    // The second half of the same guard, kept even though the equality above
    // already implies it: a later revision that widens the copy is exactly
    // the change that would re-append a token, and this line names the four
    // tokens by hand so the failure says which one came back.
    expect(
      reasons.filter((reason) =>
        /CANNOTSTART|NOWINDOW|NOCONTEXT|CONTEXTINVALID/.test(reason ?? ""),
      ),
    ).toStrictEqual([]);
  });

  it("uses no em-dash in any user-facing string (house style)", () => {
    const every: LinkOutcome[] = [
      { kind: "declined", stateEchoed: false },
      { kind: "abandoned" },
      { kind: "stateMismatch" },
      { kind: "malformed", stateEchoed: false },
      { kind: "networkError", message: "boom" },
      { kind: "noWindow" },
      { kind: "busy", source: "sheet" },
    ];
    const strings = every.flatMap((outcome) => {
      const failure = describeFailure(outcome);
      return [failure?.line, failure?.reason];
    });
    // Every one of the seven is a failure carrying BOTH a line and a reason,
    // so 14 strings is the count that proves the sweep below actually read
    // something. Without it, a `describeFailure` that returned `null` for
    // all seven would pass the em-dash check by having nothing to check.
    expect(strings.filter((value) => typeof value === "string")).toHaveLength(
      14,
    );
    expect(
      strings.filter((value) => value?.includes("—") === true),
    ).toStrictEqual([]);
  });
});
