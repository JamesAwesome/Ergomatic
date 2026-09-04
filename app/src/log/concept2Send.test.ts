import { describe, it, expect } from "vitest";
import { LINK_UNAVAILABLE, type Concept2Link } from "../api/useConcept2Link";
import {
  c2ProfileUrl,
  c2ResultUrl,
  isSendable,
  readSendResponse,
  sentResultId,
} from "./concept2Send";

const LINK: Concept2Link = {
  ...LINK_UNAVAILABLE,
  available: true,
  linked: true,
  c2UserId: 2211,
  c2Username: "jamesawesome",
  logbookBaseUrl: "https://log-dev.concept2.com",
};

const ELIGIBLE = {
  source: "pm5" as const,
  endedBy: "finished" as const,
  workSeconds: 1234.5,
  workMeters: 5000,
};

describe("isSendable (mirrors server/concept2/mapping.ts's eligibilityFailure)", () => {
  it("accepts a finished pm5 row with both work columns", () => {
    expect(isSendable(ELIGIBLE)).toBe(true);
  });

  it("refuses every non-pm5 door", () => {
    expect(
      (["timer", "manual", "no-reading"] as const).map((source) =>
        isSendable({ ...ELIGIBLE, source }),
      ),
    ).toStrictEqual([false, false, false]);
  });

  it("refuses every close that is not a natural finish", () => {
    // Every `endedBy` shape a stored row can carry other than `"finished"`:
    // the four other `CloseReason` members (`monitor/monitorRun.ts`), the
    // widened `"interrupted"`, and the `null`/absent a row predating the
    // column carries. The SERVER answers `not_finished` for each of them —
    // `server/concept2/mapping.ts`'s `eligibilityFailure` is a bare
    // `if (row.endedBy !== "finished") return "not_finished"`, whose own
    // comment says a null-`endedBy` pre-RC row is excluded deliberately —
    // so the client mirror has to refuse the same set or the block renders
    // a button the server will 422.
    expect(
      (
        [
          "rower",
          "link-lost",
          "program-failed",
          "program-dropped",
          "interrupted",
          null,
          undefined,
        ] as const
      ).map((endedBy) => isSendable({ ...ELIGIBLE, endedBy })),
    ).toStrictEqual([false, false, false, false, false, false, false]);
  });

  it("refuses a row missing either work column", () => {
    expect(isSendable({ ...ELIGIBLE, workSeconds: null })).toBe(false);
    expect(isSendable({ ...ELIGIBLE, workMeters: null })).toBe(false);
  });
});

describe("sentResultId (spec anchor F8: sent belongs to an ACCOUNT, not just a row)", () => {
  it("returns the id when the row's account is the live link's", () => {
    expect(sentResultId({ c2ResultId: 339, c2UserId: 2211 }, LINK)).toBe(339);
  });

  it("returns null when the row was accepted by a DIFFERENT account", () => {
    expect(sentResultId({ c2ResultId: 339, c2UserId: 999 }, LINK)).toBeNull();
  });

  it("returns null for a row that was never sent, and for a link with no account", () => {
    // THE COMMON CASE, and the one the coverage rows showed untested: every
    // row in the record carries `c2ResultId: null, c2UserId: null` until a
    // send succeeds (`stores/logs.ts`'s `recordC2Result` is the only writer),
    // and the pair is written together — a half-null row is a shape the
    // column cannot produce, but this predicate has to be total over it
    // anyway. The last case is a link the server answered without an
    // account id (`normalizeLink` degrades a non-numeric `c2UserId` to
    // `null`): unknown is never a match.
    expect(sentResultId({ c2ResultId: null, c2UserId: null }, LINK)).toBeNull();
    expect(sentResultId({ c2ResultId: 339, c2UserId: null }, LINK)).toBeNull();
    expect(sentResultId({ c2ResultId: null, c2UserId: 2211 }, LINK)).toBeNull();
    expect(
      sentResultId(
        { c2ResultId: 339, c2UserId: 2211 },
        {
          ...LINK,
          c2UserId: null,
        },
      ),
    ).toBeNull();
  });
});

describe("the two Concept2 URLs", () => {
  it("builds /profile/{c2_user_id}/log/{result_id} on the server's own origin", () => {
    expect(c2ResultUrl("https://log-dev.concept2.com", 2211, 339)).toBe(
      "https://log-dev.concept2.com/profile/2211/log/339",
    );
  });

  it("sends the rower to the ID-LESS profile path, because the id-bearing one is a public read-only card", () => {
    // Measured 2026-09-03: `/profile/2211` renders 200 to an ANONYMOUS
    // fetcher — Age, Country, Logbook ID, Login/Sign Up chrome, no weight and
    // no form — while `/profile` 302s to `/login`, which is the
    // authenticated-self signature. A 200 to a signed-out fetcher is evidence
    // AGAINST a page being the rower's own settings form.
    expect(c2ProfileUrl("https://log-dev.concept2.com")).toBe(
      "https://log-dev.concept2.com/profile",
    );
  });
});

describe("readSendResponse (409 carries THREE meanings, 422 carries TWO; never key on status)", () => {
  it("takes the RESULT ID and nothing else out of a 200, class fields included", () => {
    // James, 2026-09-04: "Stop talking about the weight class." The route
    // still answers `weightClass` and `weightClassSource` — the server's log
    // line is how an operator settles which producer answered — and the
    // client drops both on the floor. `toStrictEqual` against a two-key
    // object is the assertion that says so: a client that started carrying
    // either field again would fail here, where `toMatchObject` would not.
    expect(
      readSendResponse(200, {
        resultId: 339,
        weightClass: "L",
        weightClassSource: "declaration",
      }),
    ).toStrictEqual({ kind: "sent", resultId: 339 });
  });

  it("reads an OLDER server's bare 200 the same way, rather than as a failure", () => {
    // Mid rolling deploy the route answers `{resultId}` alone. That renders
    // identically to the line above, which is now true of every SENT row on
    // every mount: the id is the whole state.
    expect(readSendResponse(200, { resultId: 339 })).toStrictEqual({
      kind: "sent",
      resultId: 339,
    });
  });

  it("tells the three 409s apart by body.error, not by status", () => {
    expect(
      readSendResponse(409, { error: "duplicate", c2ResultId: 339 }),
    ).toStrictEqual({ kind: "duplicate", resultId: 339 });
    expect(readSendResponse(409, { error: "needs_reauth" })).toStrictEqual({
      kind: "reauth",
    });
    expect(readSendResponse(409, { error: "unlinked" })).toStrictEqual({
      kind: "gone",
    });
  });

  it("SHOWS an eligibility refusal, because it means the two predicates disagree", () => {
    expect(
      readSendResponse(422, { error: "not_eligible", reason: "not_finished" }),
    ).toStrictEqual({
      kind: "failed",
      reason: "CONCEPT2 WON'T TAKE THIS ROW · DIDN'T FINISH",
    });
  });

  it("writes a rower's phrase for every eligibility token the route can send", () => {
    // EXHAUSTIVE over `server/concept2/mapping.ts`'s own `EligibilityFailure`
    // union (`"not_monitor" | "not_finished" | "no_work_totals"`), plus a
    // token this build does not know. Every phrase is transcribed
    // independently from the Gate 0 amendment
    // (`docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html`,
    // which draws all three and the `<REASON>` placeholder), never read back
    // off the module that produces it. The per-file coverage rows are why
    // this test exists: three of the four arms were rendered copy no test
    // reached.
    expect(
      (
        [
          "not_monitor",
          "not_finished",
          "no_work_totals",
          "something_new",
        ] as const
      ).map((reason) => {
        const state = readSendResponse(422, { error: "not_eligible", reason });
        return state.kind === "failed" ? state.reason : state.kind;
      }),
    ).toStrictEqual([
      "CONCEPT2 WON'T TAKE THIS ROW · NO MONITOR USED",
      "CONCEPT2 WON'T TAKE THIS ROW · DIDN'T FINISH",
      "CONCEPT2 WON'T TAKE THIS ROW · NO WORK TIME OR METERS",
      "CONCEPT2 WON'T TAKE THIS ROW · NOT ELIGIBLE",
    ]);
  });

  it("names the DEVICE's time zone as the fault when that is what the route rejected", () => {
    // The route 400s a missing or unparseable zone with `{field: "tz"}`
    // (`server/routes/concept2.ts`'s upload handler). A bare 400 with any
    // other `field` is not that fault and must not borrow its words.
    expect(
      readSendResponse(400, {
        error: "tz must be an IANA timezone name",
        field: "tz",
      }),
    ).toStrictEqual({
      kind: "failed",
      reason: "COULDN'T READ THIS DEVICE'S TIME ZONE",
    });
    expect(readSendResponse(400, { field: "logId" })).toStrictEqual({
      kind: "failed",
      reason: "COULDN'T SEND THIS ROW · 400",
    });
  });

  it("tells the two 422s apart, because only one of them is the rower's to fix", () => {
    expect(
      readSendResponse(422, { error: "no_weight_class", reason: "no_weight" })
        .kind,
    ).toBe("noWeight");
    expect(
      readSendResponse(422, { error: "not_eligible", reason: "not_finished" })
        .kind,
    ).toBe("failed");
  });

  it("gives each server reason honest words, and never tells a rower we cannot classify to set a weight", () => {
    // Four tokens, three renderings, and the last two rows are lens 2 F12:
    // a `Record` + `reason in MAP` lookup admits `Object.prototype` keys,
    // so `"toString"` would render an `undefined` line while `tsc` types
    // the lookup as non-optional. The switch cannot be reached that way.
    const rendered = (
      [
        "no_weight",
        "unreadable_weight",
        "implausible_weight",
        "no_gender",
        "something_new",
        "toString",
        "constructor",
      ] as const
    ).map((reason) => {
      const state = readSendResponse(422, {
        error: "no_weight_class",
        reason,
      });
      return state.kind === "noWeight" ? state.reason : state.kind;
    });
    expect(rendered).toStrictEqual([
      "SET YOUR WEIGHT ON CONCEPT2",
      "COULDN'T READ YOUR CONCEPT2 WEIGHT",
      "COULDN'T READ YOUR CONCEPT2 WEIGHT",
      "COULDN'T GET A CLASS FROM CONCEPT2",
      "COULDN'T GET A CLASS FROM CONCEPT2",
      "COULDN'T GET A CLASS FROM CONCEPT2",
      "COULDN'T GET A CLASS FROM CONCEPT2",
    ]);
  });

  it("renders each no-weight SENTENCE word for word, not just a REASON word", () => {
    // Fix round 1, F1. Every assertion on `line` before this one was
    // NEGATIVE (`.not.toContain("logbook")`, `.not.toContain("—")`) or a
    // single fragment, so all three sentences could be replaced with junk
    // and the file stayed green — the reviewer did exactly that and got 23
    // passed. A manual grep by the author against the amendment is not a
    // gate; this is. Transcribed from
    // `docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html`
    // (§2i's three drawn frames), as independent literals — never read back
    // off the module that produces them (RF21's "a test that imports the
    // constant it exists to gate proves nothing about it").
    const lines = (
      [
        "no_weight",
        "unreadable_weight",
        "implausible_weight",
        "no_gender",
      ] as const
    ).map((reason) => {
      const state = readSendResponse(422, { error: "no_weight_class", reason });
      return state.kind === "noWeight" ? state.line : state.kind;
    });
    expect(lines).toStrictEqual([
      "Concept2 needs a weight class. Your Concept2 profile has no weight set.",
      "Concept2 needs a weight class. We couldn't read the weight on your Concept2 profile.",
      "Concept2 needs a weight class. We couldn't read the weight on your Concept2 profile.",
      "Concept2 needs a weight class. We couldn't work one out from your Concept2 profile.",
    ]);
  });

  it("never blames the rower's weight for a number OUR unit inference could not classify", () => {
    // An implausible number is most likely our own unit being wrong
    // (observation 24), so the copy says what WE could not do.
    const state = readSendResponse(422, {
      error: "no_weight_class",
      reason: "implausible_weight",
    });
    expect(state.kind === "noWeight" && state.line).not.toContain("no weight");
    // "We couldn't read", capital W: the amendment's own sentence is
    // "Concept2 needs a weight class. We couldn't read the weight on your
    // Concept2 profile."
    // (`docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html`),
    // so the clause starts a sentence. The brief prescribed a lowercase
    // needle here, which no rendering of that line can ever satisfy.
    expect(state.kind === "noWeight" && state.line).toContain(
      "We couldn't read",
    );
  });

  it("names no destination its only control cannot reach", () => {
    const lines = (
      [
        "no_weight",
        "unreadable_weight",
        "implausible_weight",
        "no_gender",
      ] as const
    ).map((reason) => {
      const state = readSendResponse(422, { error: "no_weight_class", reason });
      return state.kind === "noWeight" ? state.line : "";
    });
    // 2i's one control opens the PROFILE. No sentence may send the rower to
    // the logbook, where the class is set per result and this button cannot
    // go — which is what the copy said before lens 2 F3.
    expect(lines.join(" ")).not.toContain("logbook");
    expect(lines.join(" ")).not.toContain("—");
  });

  it("degrades a malformed 200 rather than rendering SENT with no id, and says so in the sentence the page already draws", () => {
    // The `kind` half is the behaviour; the `reason` half is fix round 1's
    // F1/F2. These two were the last rendered strings reached only through
    // `.kind === "failed"`, and they used to be two INVENTED sentences
    // ("CONCEPT2 ANSWERED WITHOUT A RESULT ID", "CONCEPT2 REJECTED A
    // DUPLICATE WITHOUT AN ID") on no design artifact. They now collapse to
    // the one the amendment's §1e outcome table already renders for
    // `malformed` on the sibling surface — a rower cannot act on the two
    // differently, and which it was belongs in the log line. Literal
    // transcribed from the page, not read off the module.
    expect(readSendResponse(200, {})).toStrictEqual({
      kind: "failed",
      reason: "CONCEPT2 SENT SOMETHING WE COULDN'T READ",
    });
    expect(readSendResponse(409, { error: "duplicate" })).toStrictEqual({
      kind: "failed",
      reason: "CONCEPT2 SENT SOMETHING WE COULDN'T READ",
    });
  });

  it("uses no em-dash in any reason or line (house style)", () => {
    const strings = (
      [
        [502, { error: "c2_error" }],
        [404, {}],
        [418, {}],
        [422, { error: "no_weight_class", reason: "no_weight" }],
        [422, { error: "no_weight_class", reason: "no_gender" }],
      ] as const
    ).flatMap(([status, body]) => {
      const state = readSendResponse(status, body);
      if (state.kind === "failed") return [state.reason];
      if (state.kind === "noWeight") return [state.reason, state.line];
      return [];
    });
    expect(strings.join(" ")).not.toContain("—");
    expect(strings.slice(0, 3)).toStrictEqual([
      "CONCEPT2 ERROR · 502",
      "THIS ROW IS GONE",
      "COULDN'T SEND THIS ROW · 418",
    ]);
  });
});
