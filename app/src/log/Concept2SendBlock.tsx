import { useState } from "react";
import { api } from "../api";
import { openReadOnlyUrl } from "../adapters/externalBrowser";
import { useConcept2Link } from "../api/useConcept2Link";
import {
  c2ProfileUrl,
  c2ResultUrl,
  isSendable,
  readSendResponse,
  sentResultId,
  type SendState,
} from "./concept2Send";
import type { StoredLog } from "./storedSummary";

/**
 * Wave E PR2, Surface 2 (board 2a-2e, amended 2026-09-03: 2c loses its
 * timestamp, 2d gains the specific result link, 2e gains a REASON, 2f/2h/2i
 * are new). Renders ONLY when an account is linked AND the row qualifies;
 * otherwise absent entirely, with no pointer and no disabled control —
 * the You card is the sole discovery surface (board's approved amendment).
 *
 * Reads the fetched `StoredLog` and the live link, and nothing else. It is
 * not part of `buildStoredSummary`'s view model, for the same reason
 * `MachineConfirmedBlock` above it is not (`FromTheLog.tsx`'s own header
 * comment on that component): its inputs are stored facts about this row's
 * relationship to a THIRD PARTY, not derived readings of the session.
 */
export default function Concept2SendBlock({ row }: { row: StoredLog }) {
  const { link, failed, reload } = useConcept2Link();
  const [send, setSend] = useState<SendState>({ kind: "idle" });

  async function post(): Promise<void> {
    setSend({ kind: "sending" });
    try {
      const res = await api(`/api/concept2/results/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Required on EVERY upload, even when the row already carries a
        // stored zone (`server/routes/concept2.ts`'s upload handler 400s
        // without it). The route persists it on first use so every later
        // retry renders one stable C2 date — the dedup-stability property
        // C2's second-granular key needs.
        body: JSON.stringify({
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      let body: unknown = null;
      try {
        body = await (res.json() as Promise<unknown>);
      } catch {
        // Not JSON at all: an old image's HTML during a rolling deploy is
        // the named case (`adapters/linkFlow.ts`'s `readError`).
        body = null;
      }
      const next = readSendResponse(res.status, body);
      setSend(next);
      // The preconditions this block renders on stopped holding. Re-read
      // rather than keeping a stale link on screen.
      if (next.kind === "gone" || next.kind === "reauth") await reload();
    } catch {
      // THE ONE ROW OF §2e'S TABLE THAT `readSendResponse` CANNOT SERVE.
      // That function maps a status and a body; a request that never
      // completed at all — offline, DNS, an aborted fetch — has neither, so
      // the page's `network throw -> NO CONNECTION` row is drawn here and
      // nowhere else. Same spelling the sibling card's own read failure
      // uses for a request that did not complete (`Concept2Card.tsx`'s
      // `reasonFor`).
      setSend({ kind: "failed", reason: "NO CONNECTION" });
    }
  }

  // `failed !== null` since Task 1's hook reports WHY a read failed rather
  // than a bare boolean. The block stays silent either way: the You card is
  // the sole discovery surface and owns the read-failed treatment
  // (amendment 1i), and a second Concept2 error panel on a screen about a
  // rowing session would be noise the rower cannot act on from here.
  if (failed !== null || link === null || !link.available || !link.linked) {
    return null;
  }
  if (!isSendable(row)) return null;

  // Invariant I3: re-derived every render from the row and the LIVE link,
  // never cached across a link change.
  const stored = sentResultId(row, link);
  const resultId =
    send.kind === "sent" || send.kind === "duplicate" ? send.resultId : stored;
  const state: SendState["kind"] =
    send.kind === "duplicate"
      ? "duplicate"
      : resultId !== null
        ? "sent"
        : send.kind;

  if (state === "gone") return null;

  const url =
    resultId !== null && link.c2UserId !== null && link.logbookBaseUrl !== null
      ? c2ResultUrl(link.logbookBaseUrl, link.c2UserId, resultId)
      : null;

  // Amendment 2i's link-out. Same origin rule as `url` above and for the
  // same reason (observation 22): an empty origin would build `/profile`, a
  // RELATIVE path that opens on Ergomatic's own domain. NO `c2UserId` — the
  // id-bearing path was measured to render a PUBLIC read-only card with no
  // weight and no form, while the id-less one 302s to login and lands the
  // rower in their own account (observation 28).
  const profileUrl =
    link.logbookBaseUrl !== null ? c2ProfileUrl(link.logbookBaseUrl) : null;

  const status =
    state === "sent"
      ? "SENT"
      : state === "duplicate"
        ? "ALREADY THERE"
        : state === "reauth"
          ? "RECONNECT NEEDED"
          : state === "noWeight"
            ? "NO WEIGHT CLASS"
            : state === "failed"
              ? "SEND FAILED"
              : state === "sending"
                ? "SENDING"
                : "NOT SENT";

  // THE PAGE'S OWN MARKUP, counted rather than reasoned about: §2's frames
  // draw `<span class="c2status">` bare for 2a NOT SENT and 2b SENDING, and
  // `c2status on` for all nineteen remaining status spans (2c, 2c-b, 2d, 2e,
  // 2f, 2h, 2i). So the status lights when Concept2 has ANSWERED, not when
  // the rower has tapped — a send in flight is still "nothing has happened
  // yet". `--ink-4` 5.29:1 dim, `--ink` 17.11:1 at weight 600 lit.
  const statusLit = state !== "idle" && state !== "sending";

  return (
    <section className="c2-send" aria-labelledby="c2-send-label">
      <div className="c2-send-head">
        <h2 className="c2-send-label" id="c2-send-label">
          CONCEPT2
        </h2>
        <span
          className={`c2-send-status${statusLit ? " c2-send-status-on" : ""}`}
        >
          {status}
        </span>
      </div>

      {(state === "idle" || state === "sending") && (
        <>
          <button
            type="button"
            className="c2-send-action"
            disabled={state === "sending"}
            onClick={() => void post()}
          >
            {state === "sending" ? "Sending to Concept2 …" : "Send to Concept2"}
          </button>
          <p className="c2-send-helper">
            Sends this row&apos;s work time and meters to your Concept2 logbook.
          </p>
        </>
      )}

      {/* Amendment change 4: no timestamp. Nothing stores when Concept2
          accepted the row (`server/db/schema.ts` carries `c2_result_id` and
          `c2_user_id` and no acceptance clock), and printing `loggedAt`
          here would put the save time under a line naming a different
          event. The result id below is the durable evidence. */}
      {state === "sent" && (
        <p className="c2-send-line">Accepted by Concept2.</p>
      )}

      {/* Amendment change 5: this state is SESSION-TRANSIENT. The route
          records the colliding id before answering (RF25), so the next
          mount of this screen reads it off the row and renders SENT
          above instead. */}
      {state === "duplicate" && (
        <p className="c2-send-line">
          Concept2 already has this row: same date, time and distance.
        </p>
      )}

      {/* A BUTTON, not an anchor: `openReadOnlyUrl` needs a click handler,
          not a navigation, to open the URL in a new context rather than
          driving the WebView itself there. Walked on the phone
          (`docs/monitor/sessions/walk-2026-09-04-c2-linkout/README.md`):
          the tap opens the phone's default browser, signed in, on the
          rower's own result — Ergomatic stays mounted behind it. 44px hit
          row. */}
      {url !== null && (
        <button
          type="button"
          className="c2-send-linkout"
          onClick={() => void openReadOnlyUrl(url)}
        >
          View on Concept2 →
        </button>
      )}

      {/* The id renders on `resultId` ALONE, never on the link-out's
          condition. `url` is null whenever `logbookBaseUrl` is — an older
          server mid rolling deploy, or an origin that arrived empty — and
          gating the id on the button meant a SENT row rendering
          "Accepted by Concept2." and nothing else: no id, no link, no way
          for a tester to say WHICH row landed. Amendment change 4 removed
          the timestamp on the grounds that "the result id below is the
          durable evidence", so this is that evidence disappearing.

          The line reads the same with or without the link-out (2c-b: "the
          only difference between these two frames is that the button is
          absent here"), so there is no branch here to write. */}
      {resultId !== null && <p className="c2-send-foot">RESULT {resultId}</p>}

      {state === "reauth" && (
        <p className="c2-send-line">
          Concept2 stopped accepting this link. Reconnect on the You tab.
        </p>
      )}

      {/* Amendment 2i, ruling (i). The failed-state chrome of 2e/2f, plus a
          link-out that goes to Concept2. It keeps `Send again`: the panel's
          own sentence tells the rower to fix something on Concept2 and come
          back, so a state that offers no way to come back tells them to do
          something it cannot let them do. The 1g parallel does not hold —
          nothing a rower can do fixes a stale app build, while EVERYTHING
          about this state is fixable in one visit, which is why it has a
          link-out at all. PR B moved the link-out to the phone's default
          browser (`adapters/externalBrowser.ts`'s own note on
          `openReadOnlyUrl`), and the reason `Send again` is still the right
          affordance changed with it: on a WARM return (the normal case) the
          app is backgrounded rather than navigated, so this block is still
          mounted and the rower lands right back on it (design page §7.2,
          `docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html`).
          On a COLD relaunch there is no mounted block to return to at all —
          the rower lands on Today — but the row is still in the log, un-sent,
          with `Send` reachable from its detail screen.

          The line is the SERVER's own reason rendered in our words: four
          tokens, three sentences, and `no_gender` deliberately does not read
          "set your weight", because that rower's weight is not the broken
          thing.

          The URL is built from the LIVE link (invariant I3) and renders
          only when the origin is readable; an empty one would build a
          RELATIVE path opening on Ergomatic's own domain (observation 22).
          With no URL the rower still gets the sentence, the REASON and
          `Send again` — only the shortcut is missing. */}
      {state === "noWeight" && send.kind === "noWeight" && (
        <>
          <p className="c2-send-line">{send.line}</p>
          <p className="c2-send-reason">REASON: {send.reason}</p>
          {profileUrl !== null && (
            <button
              type="button"
              className="c2-send-linkout"
              onClick={() => void openReadOnlyUrl(profileUrl)}
            >
              OPEN CONCEPT2 PROFILE
            </button>
          )}
          <button
            type="button"
            className="c2-send-action"
            onClick={() => void post()}
          >
            Send again
          </button>
        </>
      )}

      {state === "failed" && send.kind === "failed" && (
        <>
          <p className="c2-send-line">The send didn&apos;t reach Concept2.</p>
          <p className="c2-send-reason">REASON: {send.reason}</p>
          <button
            type="button"
            className="c2-send-action"
            onClick={() => void post()}
          >
            Retry send
          </button>
        </>
      )}
    </section>
  );
}
