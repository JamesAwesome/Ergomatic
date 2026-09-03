import type { Concept2Link } from "../api/useConcept2Link";
import type { StoredLog } from "./storedSummary";

/** Client mirror of `server/concept2/mapping.ts`'s `eligibilityFailure`
 *  (that function's four clauses, same order). The SERVER is authoritative
 *  — it re-checks and 422s — so this predicate exists only to decide
 *  whether the block renders at all (board: "Non-qualifying rows: the
 *  block does not render, ever"). The two are pinned equal by
 *  `server/routes/concept2Send.integration.test.ts`, the same cross-tree
 *  shape `routes/partial.integration.test.ts` already uses for the PARTIAL
 *  predicate. */
export function isSendable(
  row: Pick<StoredLog, "source" | "endedBy" | "workSeconds" | "workMeters">,
): boolean {
  return (
    row.source === "pm5" &&
    row.endedBy === "finished" &&
    row.workSeconds !== null &&
    row.workMeters !== null
  );
}

/** Spec §Stored shapes, anchor F8, verbatim: "the sent state renders only
 *  when the row's `c2_user_id` matches the live link's". A row carrying
 *  account A's result id, read while account B is linked, is NOT sent for
 *  this rower — the link-out would point at a row the current grant cannot
 *  see. Re-derived on every render (invariant I3), never cached.
 *
 *  ONE line does the work, and a second null guard is deliberately ABSENT.
 *  An earlier revision opened with
 *  `if (row.c2ResultId === null || row.c2UserId === null) return null;`,
 *  which reads like a check and is not one: deleting it alone left this
 *  file green (Task 5 probe M33, 23/23), because the account line below is
 *  already total over every shape it caught — a row whose `c2UserId` is
 *  null never equals a live link's id, and a row whose `c2ResultId` is null
 *  but whose account matches falls through and returns that same null.
 *  That is an unfalsifiable guard sold as a check, which is worse than no
 *  guard, and it is the SAME question `server/stores/logs.ts`'s
 *  `sentC2ResultIds` answered in this PR when it deleted its own
 *  `isNotNull(c2_result_id)` for the identical reason. `recordC2Result` is
 *  the only writer of either column and writes both in one statement, so no
 *  supported path produces a half-null row. One question, one answer.
 *
 *  The line that IS load-bearing is the account check: removing it reddens
 *  two tests (probe M33c), one of them the only pin on `link.c2UserId ===
 *  null`. */
export function sentResultId(
  row: Pick<StoredLog, "c2ResultId" | "c2UserId">,
  link: Concept2Link,
): number | null {
  if (link.c2UserId === null || row.c2UserId !== link.c2UserId) return null;
  return row.c2ResultId;
}

/** PR0 measurement: "the logbook web URL is `/profile/{c2_user_id}/log/
 *  {result_id}`" (`docs/monitor/c2-crossconnect-2026-09/README.md`). The
 *  ORIGIN comes from the server (`logbookBaseUrl`, echoed from
 *  `C2_BASE_URL`) because the client cannot know whether this deployment
 *  talks to `log.concept2.com` or `log-dev.concept2.com`, and a hardcoded
 *  guess 404s for the whole sandbox phase (plan observation 5). */
export function c2ResultUrl(
  logbookBaseUrl: string,
  c2UserId: number,
  resultId: number,
): string {
  return `${logbookBaseUrl}/profile/${String(c2UserId)}/log/${String(resultId)}`;
}

/** The rower's OWN Concept2 account page — amendment 2i's link-out, where
 *  they set the weight (or the class) the send needs.
 *
 *  NO id in the path, and the id-bearing form is the thing this function
 *  exists to avoid. Both were measured on 2026-09-03 against log-dev:
 *
 *    `/profile/2211` -> 200 to an ANONYMOUS fetcher, 13862 bytes, whose
 *    entire visible text is "Login Sign Up … james morelli Age: 38
 *    Country: United States Logbook ID: 2211 Member since: August 21, 2026
 *    … Quick Links Your Log Rankings". No weight. No form. No edit control.
 *    A page that renders to a signed-out fetcher is by construction not the
 *    rower's own account-edit form.
 *
 *    `/profile` (no id) -> 302 to `/login`, which is the authenticated-self
 *    signature. `/profile/edit`, `/profile/2211/edit`, `/account`,
 *    `/settings` and `/preferences` all 404.
 *
 *  So the id-less path is the one that lands a rower in their own account
 *  after signing in — and signing in is the likely case, because the native
 *  arm opens `SFSafariViewController`, whose website data has been isolated
 *  from Safari since iOS 11 (SECONDARY — the same isolation that forced
 *  PR1.75b's OAuth hop onto `ASWebAuthenticationSession`). The rower arrives
 *  in a cookie jar that is not Safari's.
 *
 *  PROVISIONAL until one logged-in glance (exit criterion 3b's session) says
 *  which page actually carries the weight and weight-class fields. No status
 *  code can settle that, and this comment does not pretend otherwise. */
export function c2ProfileUrl(logbookBaseUrl: string): string {
  return `${logbookBaseUrl}/profile`;
}

/** Which producer supplied the class on a send that just succeeded
 *  (`weightClassSource` on the route's 200). Rendered on the SENT state so a
 *  DERIVED class — a guess about a fact Concept2 lets its owner declare — is
 *  visible at the moment it is written, while Concept2's own per-result edit
 *  can still repair it. Never stored: on a later mount the row carries only
 *  its result id, and this line is absent. */
export type WeightClassSource = "declaration" | "profile";

export type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | {
      kind: "sent";
      resultId: number;
      weightClass: "H" | "L" | null;
      weightClassSource: WeightClassSource | null;
    }
  | { kind: "duplicate"; resultId: number }
  | { kind: "reauth" }
  /** The block's own preconditions stopped holding mid-session: unlinked
   *  in another tab, or the flag flipped off. The block disappears; it
   *  never shows a retry for something retrying cannot fix.
   *
   *  `not_eligible` is deliberately NOT one of these. It means the client
   *  predicate and the server's disagree about the SAME row — a fault on
   *  our side, not a precondition lapsing — and it is drawn as a `failed`
   *  with its own reason (amendment 2h), so the divergence is visible in
   *  the field and not only in CI. */
  | { kind: "gone" }
  /** Amendment 2i, ruling (i). Concept2 requires a weight class on every
   *  rower result and we ask for none: the server reads the rower's own most
   *  recent declaration, falls back to deriving one from their profile, and
   *  this is the answer when neither producer can supply one. It is a
   *  `failed` with a LINK-OUT and a retry rather than a plain `failed`,
   *  because it is the one send failure the rower can actually repair, and
   *  the place to repair it is not in this app. Distinct from
   *  `not_eligible`, which is about the ROW and cannot be repaired at all.
   *
   *  `line` and `reason` are BOTH carried because the four server tokens do
   *  not all mean "set your weight": a profile whose `gender` is neither `M`
   *  nor `F` has no derivable class at all, and telling that rower to set a
   *  weight would send them to fix a field that is not broken. */
  | { kind: "noWeight"; line: string; reason: string }
  | { kind: "failed"; reason: string };

function field(body: unknown, key: string): unknown {
  return typeof body === "object" && body !== null && key in body
    ? (body as Record<string, unknown>)[key]
    : null;
}

/** Amendment 2i's copy: FOUR server tokens, THREE renderings, and every
 *  one of them drawn on the Gate 0 page.
 *
 *  The tokens are the SERVER's vocabulary and the words are the client's,
 *  the same split `not_eligible` uses. The renderings are grouped by what
 *  the rower can actually DO about it, and every sentence is answerable
 *  from the one control this state has (OPEN CONCEPT2 PROFILE).
 *
 *  `unreadable_weight` and `implausible_weight` share one rendering, and
 *  it says what WE could not do rather than what they should fix: an
 *  implausible number is most likely our own unit inference being wrong
 *  (`server/concept2/mapping.ts`'s band comment), so blaming the rower's
 *  weight sends them after a field that is probably fine. The two tokens
 *  stay distinct on the WIRE so the route's log line can tell a value we
 *  could not parse from one that parsed and was absurd.
 *
 *  `no_gender` and any token we do not recognise share the third: we
 *  could not work a class out, and the destination is the same. It does
 *  NOT say "set your weight" (that rower's weight is not the broken
 *  thing) and it does NOT name the logbook, because this state's only
 *  control opens the PROFILE and copy must never name a destination its
 *  control cannot reach. */
const NO_WEIGHT_SET = {
  line: "Concept2 needs a weight class. Your Concept2 profile has no weight set.",
  reason: "SET YOUR WEIGHT ON CONCEPT2",
};

const WEIGHT_UNREADABLE = {
  line: "Concept2 needs a weight class. We couldn't read the weight on your Concept2 profile.",
  reason: "COULDN'T READ YOUR CONCEPT2 WEIGHT",
};

const CLASS_UNDERIVABLE = {
  line: "Concept2 needs a weight class. We couldn't work one out from your Concept2 profile.",
  reason: "COULDN'T GET A CLASS FROM CONCEPT2",
};

/** A SWITCH, not a `Record` lookup. A `reason in NO_WEIGHT_COPY` guard over
 *  a `Record<string, X>` admits `Object.prototype` keys — a wire token of
 *  `"toString"` passes the guard and yields an `undefined` line, which the
 *  compiler hides because `Record` types the lookup as non-optional (this
 *  app sets no `noUncheckedIndexedAccess`). A switch cannot be reached that
 *  way, is exhaustive over the wire vocabulary, and needs no
 *  `Object.hasOwn` — which is Safari 15.4, above this app's
 *  `IPHONEOS_DEPLOYMENT_TARGET = 15.0` floor and used nowhere in this repo
 *  (RF27's availability rule).
 *
 *  There is deliberately NO fourth "unknown token" rendering: an
 *  unrecognised token means Concept2's side gave us something we could not
 *  turn into a class, which is exactly what `CLASS_UNDERIVABLE` says. That
 *  keeps the set of sentences this client can produce equal to the set the
 *  Gate 0 page drew. */
function noWeightCopy(reason: unknown): { line: string; reason: string } {
  switch (reason) {
    case "no_weight":
      return NO_WEIGHT_SET;
    case "unreadable_weight":
    case "implausible_weight":
      return WEIGHT_UNREADABLE;
    case "no_gender":
      return CLASS_UNDERIVABLE;
    default:
      return CLASS_UNDERIVABLE;
  }
}

/** The three eligibility tokens `eligibilityFailure` can return, each with
 *  words written for a rower rather than transliterated from the enum.
 *  `not_monitor` is "NO MONITOR USED" because the row's `source` is not
 *  `pm5` — nothing was connected when it was rowed; `not_finished` is
 *  "DIDN'T FINISH" because `endedBy` is not `finished` (terminated, or no
 *  ending recorded at all); `no_work_totals` is "NO WORK TIME OR METERS"
 *  because `workSeconds`/`workMeters` are null, and those are the two
 *  numbers the send block's own helper says it sends.
 *
 *  A switch, not a `Record`, for the reason `noWeightCopy` gives: a
 *  `reason in TABLE` guard over a `Record<string, X>` admits
 *  `Object.prototype` keys and the compiler hides the `undefined`. */
function notEligibleReason(reason: unknown): string {
  switch (reason) {
    case "not_monitor":
      return "NO MONITOR USED";
    case "not_finished":
      return "DIDN'T FINISH";
    case "no_work_totals":
      return "NO WORK TIME OR METERS";
    default:
      return "NOT ELIGIBLE";
  }
}

/** THE SENTENCE THE PAGE ALREADY DRAWS for "the answer arrived and we could
 *  not read it" — the amendment's §1e outcome table renders `malformed` as
 *  exactly this string
 *  (`docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html`,
 *  the `LinkOutcome` table's `malformed` row), for the sibling surface's
 *  identical shape.
 *
 *  Fix round 1 (F2). Two reasons used to live here — CONCEPT2 ANSWERED
 *  WITHOUT A RESULT ID for a 200 with no numeric `resultId`, and CONCEPT2
 *  REJECTED A DUPLICATE WITHOUT AN ID for a 409 `duplicate` with no numeric
 *  `c2ResultId` — and both were sentences this project invented, drawn on no
 *  design artifact. They also drew a distinction a rower cannot act on
 *  differently: in both cases Concept2's answer reached us and did not carry
 *  the one number the state needs, and the only move is to try again. WHICH
 *  of the two it was belongs in the send's log line, where an operator needs
 *  it, not on a screen. One approved sentence replaces both. */
const MALFORMED_ANSWER = "CONCEPT2 SENT SOMETHING WE COULDN'T READ";

/**
 * `POST /api/concept2/results/:logId`'s answer -> the block's state.
 *
 * EVERY branch keys on `body.error`, never on the status alone, because
 * that route answers 409 with three different meanings:
 * `unlinked`, `needs_reauth` and `duplicate`. Branching on `409` would
 * collapse a rower who must reconnect, a rower who unlinked, and a row
 * Concept2 already has. The same applies to the two 422s.
 */
export function readSendResponse(status: number, body: unknown): SendState {
  const error = field(body, "error");
  if (status === 200) {
    const resultId = field(body, "resultId");
    if (typeof resultId !== "number") {
      return { kind: "failed", reason: MALFORMED_ANSWER };
    }
    // The class and its producer are read DEFENSIVELY, not required: an
    // older server (mid rolling deploy) answers a bare `{resultId}`, and a
    // SENT row with no provenance line is correct there — it is the same
    // thing a later mount renders, since nothing about the class is stored.
    const weightClass = field(body, "weightClass");
    const source = field(body, "weightClassSource");
    return {
      kind: "sent",
      resultId,
      weightClass:
        weightClass === "H" || weightClass === "L" ? weightClass : null,
      weightClassSource:
        source === "declaration" || source === "profile" ? source : null,
    };
  }
  if (error === "duplicate") {
    const resultId = field(body, "c2ResultId");
    // The 409's id is what makes the duplicate state useful AND durable:
    // the route writes it to the row before answering (RF25), so the next
    // mount reads SENT. Without an id there is nothing to link to and
    // nothing was recorded — that is a failure, not a duplicate.
    return typeof resultId === "number"
      ? { kind: "duplicate", resultId }
      : { kind: "failed", reason: MALFORMED_ANSWER };
  }
  if (error === "needs_reauth") return { kind: "reauth" };
  if (error === "unlinked" || error === "unavailable") return { kind: "gone" };
  // Amendment 2i. Its own kind, not a `failed`, because it is the only send
  // failure that renders a BUTTON going somewhere: the repair is on
  // Concept2's side and the rower has no other way to find it.
  if (error === "no_weight_class") {
    const copy = noWeightCopy(field(body, "reason"));
    return { kind: "noWeight", line: copy.line, reason: copy.reason };
  }
  // A WRITTEN PHRASE PER TOKEN, never the token itself (James, 2026-09-03:
  // "'REASON: CONCEPT2 WON'T TAKE THIS ROW · NO MONITOR USED' is a bit
  // awkward"). An earlier revision rendered
  // `reason.toUpperCase().replace(/_/g, " ")`, which is a machine
  // transliteration of a wire token wearing the costume of copy: it read
  // "NOT MONITOR" because the server's enum member is `not_monitor`, and
  // nobody chose those words for a rower. Every token this route can send
  // gets a phrase written for the person reading it; an unrecognised token
  // says NOT ELIGIBLE and the token itself goes to the send's log line,
  // where a diagnosis belongs, rather than onto the screen.
  //
  // `not_eligible` is NOT one of the `gone` cases, and folding it in with
  // them was a defect: `unlinked` and `unavailable` mean the block's own
  // preconditions stopped holding and it should not be on screen at all. A
  // 422 `not_eligible` means the CLIENT predicate and the SERVER predicate
  // disagree about this row — exactly the drift
  // `server/routes/concept2Send.integration.test.ts` exists to detect — and
  // drawing it as the block silently vanishing on tap shows the rower a
  // control that was there a second ago and now is not, while telling
  // nobody. It is a failure, it names itself, and the divergence becomes
  // visible in the field rather than only in CI.
  if (error === "not_eligible") {
    return {
      kind: "failed",
      reason: `CONCEPT2 WON'T TAKE THIS ROW · ${notEligibleReason(
        field(body, "reason"),
      )}`,
    };
  }
  if (status === 404) return { kind: "failed", reason: "THIS ROW IS GONE" };
  if (status === 400 && field(body, "field") === "tz") {
    return { kind: "failed", reason: "COULDN'T READ THIS DEVICE'S TIME ZONE" };
  }
  if (status === 502) return { kind: "failed", reason: "CONCEPT2 ERROR · 502" };
  return {
    kind: "failed",
    reason: `COULDN'T SEND THIS ROW · ${String(status)}`,
  };
}

/** The SENT state's provenance sub-line (ruling R2). Null when the send
 *  carried no class — an older server, or a SENT state re-derived from the
 *  stored row on a later mount. */
export function weightClassLine(send: SendState): string | null {
  if (send.kind !== "sent") return null;
  if (send.weightClass === null || send.weightClassSource === null) return null;
  return `WEIGHT CLASS ${send.weightClass} · ${
    send.weightClassSource === "declaration"
      ? "FROM YOUR LAST CONCEPT2 ROW"
      : "FROM YOUR CONCEPT2 WEIGHT"
  }`;
}
