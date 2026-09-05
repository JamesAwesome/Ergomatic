import type { LinkOutcome } from "../adapters/linkFlow";
import type { Concept2Link } from "../api/useConcept2Link";

/** Board 1e, verbatim and gate-approved. Every failure that is not
 *  specifically about the rower's own choice reads this line. */
export const FAILED_LINE =
  "The connection didn't complete. Nothing was linked.";

/** `reason` is a plain `string`, not `string | null`. Every member that
 *  `describeFailure` answers with a `LinkFailure` at all carries a REASON in
 *  the Gate 0 amendment's outcome table; the members whose REASON column
 *  reads em-dash are exactly the ones that answer `null` for the WHOLE
 *  object, and the card renders no panel for them. A nullable `reason` would
 *  be a second, unreachable way to say "no detail" that no caller could
 *  observe and no test could cover (review F6). */
export interface LinkFailure {
  line: string;
  reason: string;
}

/** Gate 0 amendment 1c. Same order the Linked callback page uses
 *  ("Concept2 X is now connected to Ergomatic Y",
 *  `server/concept2/callbackPage.ts`'s `linked` spec), so a rower who just
 *  saw that page recognises this card.
 *
 *  The fallback is `account #<id>` — the SAME spelling the callback page
 *  uses, changed there in Task 3 for exactly this reason. One numeric
 *  identity, spelled one way, on both surfaces.
 *
 *  Guarded on `!== null && !== ""`, not on nullishness. `normalizeLink`
 *  already collapses `""` to `null` on the wire path, and this second
 *  guard is not redundant: `identityLine` is a pure exported function that
 *  a test, a future caller or a hand-built fixture can hand a raw
 *  `Concept2Link`, and observation 18's whole lesson is that this codebase
 *  has already shipped one `??` on this exact value. The doc comment that
 *  claimed "never an empty identity" was on the code that could render
 *  one. */
export function identityLine(link: Concept2Link, email: string): string {
  const c2 =
    link.c2Username !== null && link.c2Username !== ""
      ? link.c2Username
      : link.c2UserId === null
        ? "account"
        : `account #${String(link.c2UserId)}`;
  return `Concept2 ${c2} · Ergomatic ${email}`;
}

/**
 * `LinkOutcome` -> the card's failure copy. The table this implements is
 * the Gate 0 amendment's §1e; nothing here invents a string.
 *
 * TOTAL over the union with no `default`, deliberately: an eighteenth
 * member is a compile error here rather than a silent fall-through to a
 * generic message, which is the same mechanism `domain/types.ts`'s
 * `LogSource` switches rely on (that type's own comment: the switches are
 * "total over `LogSource` with no `default`, so a fifth member errors on
 * its own").
 *
 * `busy` splits on `source` because `adapters/linkFlow.ts`'s own
 * `case "busy"` comment says it must: the JS guard means "your last tap is
 * still working" (not a failure at all) while the plugin's means "a sheet
 * is already up and your fresh mint just superseded the attempt it belongs
 * to" (a failure the rower has to act on).
 */
export function describeFailure(outcome: LinkOutcome): LinkFailure | null {
  switch (outcome.kind) {
    case "linked":
    case "navigating":
    case "cancelled":
    case "updateRequired":
      return null;
    case "busy":
      return outcome.source === "guard"
        ? null
        : {
            line: FAILED_LINE,
            reason: "A LINK IS ALREADY OPEN · CLOSE IT AND TRY AGAIN",
          };
    case "declined":
      return {
        line: "You cancelled at Concept2. Nothing was linked.",
        reason: "DECLINED AT CONCEPT2",
      };
    case "abandoned":
      return { line: FAILED_LINE, reason: "THE BROWSER LEFT CONCEPT2" };
    case "stateMismatch":
      return {
        line: FAILED_LINE,
        reason: "THE RETURN DIDN'T MATCH THIS ATTEMPT",
      };
    case "malformed":
      return {
        line: FAILED_LINE,
        reason: "CONCEPT2 SENT SOMETHING WE COULDN'T READ",
      };
    case "exchangeFailed":
      return outcome.error === "already_linked_elsewhere"
        ? {
            line: "That Concept2 account is already connected to a different Ergomatic account.",
            reason: "ALREADY LINKED ELSEWHERE · 409",
          }
        : {
            line: FAILED_LINE,
            reason: `CONCEPT2 REFUSED THE LINK · ${String(outcome.status)}`,
          };
    case "serverError":
      return {
        line: FAILED_LINE,
        reason: `ERGOMATIC'S SERVER DIDN'T ANSWER · ${String(outcome.status)}`,
      };
    case "mintFailed":
      return {
        line: FAILED_LINE,
        reason: `COULDN'T START THE LINK · ${String(outcome.status)}`,
      };
    case "networkError":
      return { line: FAILED_LINE, reason: "NO CONNECTION" };
    // Four members, one sentence, and NO token appended. An earlier
    // revision rendered `outcome.kind.toUpperCase()`, which put "NOWINDOW",
    // "NOCONTEXT" and "CONTEXTINVALID" on a rower's screen, and
    // `outcome.code.toUpperCase()` put a Capacitor plugin's own error code
    // there — the same defect as the eligibility tokens, one surface over.
    // All four mean the identical thing to the person holding the phone:
    // this device could not open Concept2.
    //
    // WHERE THE DETAIL GOES, stated exactly rather than assumed. On a dev
    // or walk build, `Concept2LinkProbe`'s `outcomeDetail` already prints
    // the kind plus the plugin's `code` and `message` verbatim, and those
    // builds are where these four members actually get hit. On a plain
    // TestFlight build the probe is not compiled in (`Concept2Screen.tsx` gates it on
    // `import.meta.env.DEV || VITE_ENABLE_C2_LINK_PROBE === "1"`), the link
    // flow posts nothing to our server on this path, and the probe's own
    // header says so: the code and message "reach no server log". So
    // dropping the token from the copy DOES cost a production diagnosis for
    // these four, and that is accepted here rather than papered over:
    // James's copy ruling is explicit, the four are plumbing failures a
    // rower cannot act on differently, and the durable fix is a Diagnostics
    // entry carrying the last link failure — filed in ROADMAP as a
    // follow-on rather than smuggled into this PR. Do not write a comment
    // claiming a log that does not exist.
    case "noWindow":
    case "noContext":
    case "contextInvalid":
    case "pluginError":
      return {
        line: FAILED_LINE,
        reason: "THIS DEVICE COULDN'T OPEN CONCEPT2",
      };
  }
}
