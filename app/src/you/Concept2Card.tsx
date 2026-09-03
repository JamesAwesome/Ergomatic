import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { startLink, type LinkOutcome } from "../adapters/linkFlow";
import { useConcept2Link, type LinkReadFailure } from "../api/useConcept2Link";
import {
  describeFailure,
  identityLine,
  type LinkFailure,
} from "./concept2CardModel";

/**
 * Wave E PR2, Surface 1 (board `docs/design/handoffs/2026-08-31-concept2-
 * connect/README.md` states 1a-1e, amended 2026-09-03 by
 * `amendment-2026-09-03.html` states 1f-1j). The rower's only door to the
 * Concept2 link: connect, see which account is linked, unlink.
 *
 * IT ASKS NOTHING. James, 2026-09-03: "I don't want that set in our app. I
 * want it to be set on Concept2's side." The weight class Concept2 needs on
 * every result is read from Concept2 on the send that uses it — the rower's
 * own most recent declaration first, our derivation from their profile as a
 * fallback (`server/concept2/mapping.ts`) — so this card holds no rower
 * attribute, renders no input, and sends no body of its own.
 *
 * NO PLATFORM CONDITIONAL LIVES HERE. `adapters/linkFlow.ts` owns the one
 * `isNative()` branch this feature has (that module's own header), and
 * this card reads only its `LinkOutcome`. On native the whole flow
 * resolves inside `startLink`'s promise; on web `startLink` resolves
 * `navigating` and the document unloads, so the outcome is learned from
 * the mount read on the rower's next visit. That asymmetry is why the
 * board's 1b Cancel button and its "CONFIRMING THE LINK" variant are gone
 * (amendment change 3): neither has a reachable presser on either surface.
 *
 * THREE OF THIS COMPONENT'S LINES HAVE NO HOME IN THE CARD MODEL, and that
 * is why `Concept2Card.test.tsx` pins each with its own literal.
 * `describeFailure` answers `null` for `navigating`, `updateRequired` and
 * `busy · source guard` — correctly, since none of the three is a failure —
 * so no `LinkFailure`, and no totality check over `LinkOutcome`, protects
 * their copy. The amendment's outcome table gives all three a rendered
 * line anyway, and this file is the only thing that can get them wrong.
 *
 * NOT the dev probe (`monitor/Concept2LinkProbe.tsx`), which stays exactly
 * as it is: it prints outcome kinds, plugin error codes and the
 * state-echo measurement a walk needs and a rower must never see, and its
 * `data-c2-link-probe` literal is `scripts/dist-grep.sh`'s eighth needle
 * proving it is absent from a release build.
 */
export const UNLINK_DISARM_MS = 4000;

/** One spelling of "what went wrong on the wire", for both the read and
 *  the unlink. `null` status means the request never completed at all. */
function reasonFor(failure: LinkReadFailure): string {
  return failure.status === null
    ? "NO CONNECTION"
    : `THE SERVER ANSWERED ${String(failure.status)}`;
}

/**
 * The attempt-failed panel — amendment 1e, and 1f-b's half of it.
 *
 * ONE definition, TWO callers, on purpose. Fix round 1 (R2) made a failed
 * RECONNECT render instead of staying silent, and the ruling was explicit
 * that it shows "the same failure line and REASON the unlinked card would
 * … reuse `describeFailure` — no new strings, no new copy decisions". A
 * second inline copy of this markup would be a second place
 * `THE LINK DIDN'T FINISH` is spelled, with no type protecting either — the
 * exact shape of the three panel lines this task already had to pin by hand.
 *
 * `failure.reason` is rendered unconditionally because `LinkFailure.reason`
 * is `string`, not `string | null` (`concept2CardModel.ts`'s own comment
 * says why: the members with no REASON answer `null` for the WHOLE object
 * and render no panel at all). The `!== null` guard this markup carried
 * before the extraction could never be false.
 */
function FailurePanel({ failure }: { failure: LinkFailure }) {
  return (
    <div className="c2-card-panel">
      <p className="c2-card-panel-label">THE LINK DIDN&apos;T FINISH</p>
      <p className="c2-card-panel-line">{failure.line}</p>
      <p className="c2-card-panel-reason">REASON: {failure.reason}</p>
    </div>
  );
}

export default function Concept2Card({ email }: { email: string }) {
  const { link, failed, reload } = useConcept2Link();
  const [outcome, setOutcome] = useState<LinkOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [unlinkFailed, setUnlinkFailed] = useState<LinkReadFailure | null>(
    null,
  );
  const [armed, setArmed] = useState(false);
  const disarmRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disarm = useCallback(() => {
    if (disarmRef.current !== null) {
      clearTimeout(disarmRef.current);
      disarmRef.current = null;
    }
    setArmed(false);
  }, []);

  // Invariant I2 (plan's lifetime table): the arm can never survive
  // leaving You. Returning `disarm` as the effect's cleanup is what
  // guarantees it, including for the timer.
  useEffect(() => disarm, [disarm]);

  // Invariant I5's OTHER half. `useConcept2Link` re-reads the link on a
  // back-forward-cache restore; on its own that fixes only the case where
  // the link SUCCEEDED, because the panel the rower is stuck behind is
  // drawn from `outcome`/`busy`, not from `link`. A restore preserves the
  // JS heap, so a web attempt that was declined or failed comes back with
  // `outcome` still `{kind:"navigating"}` and `busy` possibly still `true`
  // — a buttonless OPENING CONCEPT2 panel with no Try again, forever.
  // Clearing the attempt state on the same event is what makes the card
  // reachable again.
  //
  // `pageshow` ONLY, deliberately, and NOT `visibilitychange`. `pageshow`
  // is the restore event and it cannot fire while an attempt is genuinely
  // live in this document — a restore means the document was unloaded and
  // came back, which on the web arm is exactly the stuck case, and on the
  // native arm never happens (the consent sheet is a native view over a
  // live WebView; nothing navigates). `visibilitychange` fires whenever
  // the app returns to the foreground, INCLUDING the moment the native
  // sheet dismisses — a tick before or after `startLink`'s promise
  // resolves, unordered — so clearing there would race `setOutcome` and
  // could wipe the failure panel a declined native link just drew.
  useEffect(() => {
    const clearAttempt = () => {
      setOutcome(null);
      setBusy(false);
    };
    window.addEventListener("pageshow", clearAttempt);
    return () => {
      window.removeEventListener("pageshow", clearAttempt);
    };
  }, []);

  function arm() {
    if (disarmRef.current !== null) clearTimeout(disarmRef.current);
    disarmRef.current = setTimeout(() => {
      disarmRef.current = null;
      setArmed(false);
    }, UNLINK_DISARM_MS);
    setArmed(true);
  }

  // Invariant I1: the card never infers its own state from an outcome, it
  // re-reads the server. An outcome saying `linked` while `GET /link`
  // disagrees renders as NOT linked, deliberately.
  // Takes no argument, and there is nothing it could take: `startLink`
  // sends a mint body with nothing of the rower's in it (ruling i). Used
  // unchanged by both Connect and RECONNECT.
  async function connect(): Promise<void> {
    setBusy(true);
    setOutcome(null);
    try {
      const result = await startLink();
      setOutcome(result);
      await reload();
    } finally {
      // In the `finally`, never only the happy path: one thrown request
      // would otherwise wedge the card until the document reloads (the
      // same reasoning as `linkFlow.ts`'s own guard release in `startLink`).
      setBusy(false);
    }
  }

  async function unlink(): Promise<void> {
    setBusy(true);
    setUnlinkFailed(null);
    try {
      const res = await api("/api/concept2/link", { method: "DELETE" });
      // 204 normally; 404 means another tab already unlinked, which is the
      // outcome we wanted (`log/FromTheLog.tsx`'s own delete handler takes
      // the identical line for DELETE /api/logs/:id: "an error toast for an
      // operation that succeeded" is the defect being avoided).
      if (res.ok || res.status === 404) {
        setOutcome(null);
        // Invariant I4 needs no clear site here any more: an earlier
        // revision reset a weight-class draft on unlink so a relink would
        // ask again. There is no draft, and nothing about the removed
        // account survives in this component — `link` is re-read below and
        // `outcome` is cleared above.
        await reload();
      } else {
        // RF25's shape, at the UI seam: a lower layer reported a failure
        // and the caller must not proceed as if it succeeded. Without this
        // branch the only visible effect of a refused DELETE is the arm
        // clearing in the `finally`, which reads to the rower as either
        // "nothing happened" or "it worked and the card is wrong". The
        // grant is still live; say so.
        setUnlinkFailed({ status: res.status });
      }
    } catch {
      setUnlinkFailed({ status: null });
    } finally {
      // Invariant I2 names three disarmers and "a second tap" is the first
      // of them — so the arm is spent on EVERY exit, not only the happy
      // one. Disarming only on success leaves a live "Tap again to unlink"
      // sitting under a REASON line, where one stray tap re-fires a DELETE
      // the rower has not decided to repeat.
      disarm();
      setBusy(false);
    }
  }

  // Amendment 1h: nothing renders while the surface is unavailable, or
  // before the first read resolves. A capability gate, not a cosmetic
  // hide, and a card that does not yet know what it is showing shows
  // nothing rather than a wrong state.
  //
  // Amendment 1i, and NOT the same silence: a read that FAILED is a
  // different answer from a deployment that has no Concept2, and drawing
  // them the same way tells a rower whose server does have it that it does
  // not. `failed` wins over a stale `link` on purpose (invariant I1) —
  // including when a background re-read from `pageshow` fails over a card
  // that was fine a moment ago. The cost is one transient panel; the
  // alternative is a link state nobody observed staying on screen, and the
  // panel carries a Retry that fixes it in one tap.
  if (failed !== null) {
    return (
      <section className="c2-card" aria-labelledby="c2-card-label">
        <div className="c2-card-head">
          <h2 className="c2-card-label" id="c2-card-label">
            CONCEPT2
          </h2>
          <span className="c2-card-status">COULDN&apos;T READ</span>
        </div>
        {/* 1i is one of the page's GRIDDED landscape frames, so this body is
            always split — unlike 1e, the other panel-plus-one-button state,
            which the page draws single column. The two are inconsistent on
            the page and the page is the authority (fix round 2, F1). */}
        <div className="c2-card-body c2-card-body-split">
          <div className="c2-card-tell">
            <div className="c2-card-panel">
              <p className="c2-card-panel-label">COULDN&apos;T READ CONCEPT2</p>
              <p className="c2-card-panel-line">
                Couldn&apos;t reach Concept2 linking.
              </p>
              <p className="c2-card-panel-reason">
                REASON: {reasonFor(failed)}
              </p>
            </div>
          </div>
          <div className="c2-card-act">
            <button
              type="button"
              className="c2-card-retry"
              onClick={() => void reload()}
            >
              Retry
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (link === null || !link.available) return null;

  const failure = outcome === null ? null : describeFailure(outcome);
  const opening =
    busy ||
    (outcome !== null && outcome.kind === "navigating") ||
    (outcome !== null && outcome.kind === "busy" && outcome.source === "guard");
  // NO `&& !link.linked` (fix round 2, F2). It used to carry one, which made
  // this outcome render NOTHING on the needs-reauth card: `describeFailure`
  // answers `null` for `updateRequired` (correctly — it is not a failure), so
  // the 1f-b panel could not draw it either, and a rower on a build that
  // predates the WebAuth plugin tapped RECONNECT and the screen did not move.
  // The server answers `409 update_required` from the mint regardless of link
  // state and `needsReauth` is sticky, so that is a state a real rower sits
  // in, not a corner. The `!link.linked` test now lives on the RENDER gates
  // below, where it belongs: it decides which chrome draws the panel, not
  // whether the outcome exists.
  const updateRequired = outcome !== null && outcome.kind === "updateRequired";

  const status = link.linked
    ? link.needsReauth
      ? "RECONNECT NEEDED"
      : "LINKED ✓"
    : opening
      ? "WAITING"
      : "NOT LINKED";

  // WHICH STATES THE PAGE DRAWS AS TWO COLUMNS (fix round 2, F1).
  //
  // THE PREDICATE, in words: a card is single column exactly when the rower
  // is ARMED to unlink, or is unlinked and an attempt has just done
  // something — opened, failed, or hit a build too old to link. Everything
  // settled — unlinked at rest, linked, needs-reauth, read-failed,
  // unlink-refused — is two columns. It is written as a predicate over state
  // rather than a list of frame ids on purpose: it partitions all eleven
  // drawn frames correctly AND answers the two states the page never drew
  // (an in-flight attempt on the reauth card, and 1f-c before it was drawn),
  // which a frame list cannot do.
  //
  // It is NOT derived from a design principle, and that distinction is worth
  // keeping: the page is not internally consistent — 1i (read failed) is
  // gridded while 1e (link failed) is not, and both are "one panel and one
  // button" — so this predicate is fitted to the drawings, not to a rule
  // they follow. The ruling is that the page wins.
  //
  // MEASURED, not read. A script over every `class="frame land"` block in
  // `amendment-2026-09-03.html` reports a two-column grid for 1a, 1c, 1f,
  // 1f-b, 1f-c, 1i and 1j — SEVEN since fix round 3 drew 1f-c — and no grid
  // for 1b, 1d, 1e and 1g. Two earlier revisions of this comment were wrong
  // about that census: the first claimed "1b and 1g are exactly the two the
  // page does not grid" (wrong by two, and it shipped 1d and 1e split), and
  // the second went stale the moment 1f-c was drawn. Re-run the script when
  // a frame is added; a census in a comment is a measurement with an expiry
  // date.
  const singleColumn =
    armed || (!link.linked && (opening || updateRequired || failure !== null));

  return (
    <section className="c2-card" aria-labelledby="c2-card-label">
      <div className="c2-card-head">
        <h2 className="c2-card-label" id="c2-card-label">
          CONCEPT2
        </h2>
        <span
          className={`c2-card-status${link.linked ? " c2-card-status-on" : ""}`}
        >
          {status}
        </span>
      </div>

      {/* What the card TELLS the rower goes in `.c2-card-tell`; what it ASKS
          them to DO goes in `.c2-card-act`. The pair is in the DOM in EVERY
          state, so the landscape rule has a stable target; `-split` is what
          decides whether that target becomes two columns, and it is an
          enumeration of the page's own frames (see `singleColumn` above),
          not a principle.
          The identity line lives in the tell column in every state. 1f's
          landscape frame draws it above the grid instead; that is the one
          place the shipped card departs from a frame, it is recorded under
          1f in the amendment, and it is what the tell/act split means. */}
      <div
        className={`c2-card-body${singleColumn ? "" : " c2-card-body-split"}`}
      >
        <div className="c2-card-tell">
          {link.linked && (
            <p className="c2-card-identity">{identityLine(link, email)}</p>
          )}

          {link.linked && link.needsReauth && (
            <div className="c2-card-panel">
              <p className="c2-card-panel-label">
                CONCEPT2 STOPPED ACCEPTING THIS LINK
              </p>
              <p className="c2-card-panel-line">
                Your link is kept. Reconnect to send rows again.
              </p>
            </div>
          )}

          {/* Amendment 1f-b (fix round 1, R2). A RECONNECT that fails used
              to render NOTHING: every failure panel was gated `!link.linked`,
              so the rower tapped, something failed, and the screen was
              unchanged. It now shows the same line and REASON the unlinked
              card would, from the same `describeFailure` — no new copy, and
              no second spelling of the panel (see `FailurePanel`). The
              RECONNECT button below stays live, so the recovery is one tap. */}
          {link.linked && link.needsReauth && failure !== null && (
            <FailurePanel failure={failure} />
          )}

          {/* Fix round 2, F2. `updateRequired` is not a failure, so it never
              reaches `FailurePanel` — and while this gate carried
              `!link.linked` it reached nothing at all here, which made a
              RECONNECT on a pre-WebAuth build completely silent. Same panel
              copy as 1g, in 1f-b's chrome, which already holds two panels. */}
          {link.linked && link.needsReauth && updateRequired && (
            <div className="c2-card-panel">
              <p className="c2-card-panel-label">UPDATE NEEDED</p>
              <p className="c2-card-panel-line">
                Update Ergomatic to link your Concept2 account.
              </p>
            </div>
          )}

          {link.linked && !link.needsReauth && !armed && (
            <p className="c2-card-helper">
              Finished monitor rows can be sent from the log.
            </p>
          )}

          {/* The armed hairline sits ABOVE the warning, not below it: the
              page's 1d frames order the card identity, hair, explain, button,
              foot, in BOTH orientations (fix round 2, F6 — a previous
              revision moved it into the act column and claimed portrait was
              unchanged). Every other linked state puts its hairline in the
              act column instead, immediately above Unlink, which is where
              1c, 1f, 1f-b and 1j draw it. */}
          {link.linked && armed && (
            <>
              <hr className="c2-card-hair" />
              <p className="c2-card-explain">
                Unlink removes this app&apos;s access. Rows already sent stay on
                Concept2.
              </p>
            </>
          )}

          {/* Amendment 1j. Sits above the Unlink control it belongs to, so
              the rower reads the outcome and then sees the button that
              produced it. Says the link is UNCHANGED explicitly: the
              dangerous reading of a failed destructive action is that it
              half-worked. */}
          {link.linked && unlinkFailed !== null && (
            <div className="c2-card-panel">
              <p className="c2-card-panel-label">UNLINK DIDN&apos;T HAPPEN</p>
              <p className="c2-card-panel-line">
                Couldn&apos;t unlink. Your link is unchanged.
              </p>
              <p className="c2-card-panel-reason">
                REASON: {reasonFor(unlinkFailed)}
              </p>
            </div>
          )}

          {/* The `navigating` line and the `busy · source guard` line are
              the same sentence, deliberately: the amendment's outcome table
              gives both members this copy, because to the rower they are one
              situation — a tap of theirs is open at Concept2 and wants an
              answer. Neither reaches `describeFailure`, so this is the only
              place either string exists. */}
          {!link.linked && opening && (
            <div className="c2-card-panel">
              <p className="c2-card-panel-label">OPENING CONCEPT2</p>
              <p className="c2-card-panel-line">
                Approve access on Concept2&apos;s page.
              </p>
            </div>
          )}

          {!link.linked && !opening && updateRequired && (
            <div className="c2-card-panel">
              <p className="c2-card-panel-label">UPDATE NEEDED</p>
              <p className="c2-card-panel-line">
                Update Ergomatic to link your Concept2 account.
              </p>
            </div>
          )}

          {!link.linked && !opening && !updateRequired && failure !== null && (
            <FailurePanel failure={failure} />
          )}

          {!link.linked && !opening && !updateRequired && failure === null && (
            <>
              <p className="c2-card-explain">
                Sends finished monitor rows to your Concept2 logbook, one row at
                a time, from the log.
              </p>
              <hr className="c2-card-hair" />
              {/* Ruling (i): nothing is asked here. The hairline still marks
                  the break between the explanation and the action; what used
                  to sit between them was a WEIGHT CLASS section and a
                  two-option radiogroup. The copy below says where the class
                  comes from rather than leaving the rower to wonder where the
                  question went — and it names CONCEPT2, not the profile,
                  because the profile is only the FALLBACK producer
                  (observation 29): the class comes from the rower's own most
                  recent Concept2 row first. Naming the profile here would be
                  wrong for every rower who has ever declared a class, and it
                  would promise a page this card cannot open. */}
              <p className="c2-card-helper">
                Your weight class comes from Concept2.
              </p>
            </>
          )}
        </div>

        <div className="c2-card-act">
          {link.linked && link.needsReauth && (
            <>
              {/* `busy` is the ONLY thing that can disable this button
                  (ruling i). An earlier revision also gated it on a stored
                  weight class and drew a state for the case where that class
                  could not be read back — a button nothing could press.
                  There is no stored class to be unreadable. */}
              <button
                type="button"
                className="c2-card-primary"
                disabled={busy}
                onClick={() => void connect()}
              >
                RECONNECT CONCEPT2
              </button>
            </>
          )}

          {link.linked && (
            <>
              {/* Not while armed: 1d's hairline is above the warning, in the
                  tell column (F6). Two hairlines would be a rule the page
                  never draws. */}
              {!armed && <hr className="c2-card-hair" />}
              <button
                type="button"
                className={`c2-card-danger${armed ? " c2-card-danger-armed" : ""}`}
                disabled={busy}
                onClick={() => {
                  if (armed) void unlink();
                  else arm();
                }}
              >
                {armed ? "Tap again to unlink" : "Unlink Concept2"}
              </button>
              {armed && (
                <p className="c2-card-foot">
                  DISARMS ON ITS OWN AFTER 4 SECONDS
                </p>
              )}
            </>
          )}

          {!link.linked && !opening && !updateRequired && failure !== null && (
            <button
              type="button"
              className="c2-card-retry"
              disabled={busy}
              onClick={() => void connect()}
            >
              Try again
            </button>
          )}

          {!link.linked && !opening && !updateRequired && failure === null && (
            <>
              <button
                type="button"
                className="c2-card-primary"
                disabled={busy}
                onClick={() => void connect()}
              >
                CONNECT TO CONCEPT2
              </button>
              <p className="c2-card-foot">OPENS CONCEPT2 IN YOUR BROWSER</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
