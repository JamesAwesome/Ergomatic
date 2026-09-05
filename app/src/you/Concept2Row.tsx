import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useConcept2Link } from "../api/useConcept2Link";
import { rowState } from "./concept2RowState";
import { readConcept2Seen, writeConcept2Seen } from "./concept2Seen";

/**
 * The Concept2 door on You (spec 2026-09-04-concept2-walk-fixes §5.1; Gate 0
 * amendment §8). One quiet mono row in the DIAGNOSTICS idiom — label, state
 * line, chevron — opening `/you/concept2`, where the card now lives.
 *
 * THE ROW SHOWS WHAT THE SERVER LAST SAID; THE SCREEN SHOWS WHAT THE LAST TAP
 * DID. That partition is forced, not chosen: the card's attempt state
 * (`outcome`/`busy`/`armed`/`unlinkFailed`) is `useState` inside
 * `Concept2Card`, routes are flat (`shell/AppRoutes.tsx`), so You is unmounted
 * whenever the screen is open and no frame ever holds a mounted row and a live
 * attempt at once (R2). The fifth attempt value, `adapters/linkFlow.ts`'s
 * module-level `linkInFlight`, does survive unmount — and is rendered nowhere.
 *
 * THE ROW MINTS NO COPY (R1): its four strings are ones `Concept2Card` already
 * renders. The card's fifth status, `WAITING`, is an attempt state and is
 * unreachable here.
 *
 * `rowState` (`./concept2RowState.ts`, a separate module so this file exports
 * only a component for Fast Refresh) is the decision table, spec §5.1, over
 * the two inputs the row actually reads plus `seen` on the two cells where
 * `link` is still null.
 * The one place it DEPARTS from the card: on the card `failed` wins over a
 * retained `link` (`Concept2Card.tsx`, the 1i comment) because the card's
 * failure panel carries a Retry. The row has no Retry — its only affordance
 * is the tap into the screen — so a sticky, server-set `needsReauth` is NOT
 * overwritten by a transient read failure (ruling 5, cell 10): the server
 * clears `needsReauthAt` only on a successful relink
 * (`server/routes/concept2.ts`, the exchange handler's own comment), and a
 * read that FAILED cannot have resolved it.
 */
export default function Concept2Row({ accountId }: { accountId: string }) {
  const { link, failed } = useConcept2Link();
  // Read ONCE, at mount (a `useState` initializer, never re-read): `seen`
  // is an input only while `link` is null, and once a read resolves this
  // mount `link` is newer than the flag and answers for it. Re-reading it
  // later would be a second source of truth for a fact the live read owns.
  const [seenAtMount] = useState(() => readConcept2Seen(accountId));

  // The row is `seen`'s only WRITER as well as its only reader (I-F): every
  // successful read that reaches this mount records its `available` answer,
  // minting on `true` and clearing on `false` (I-C). Never on a failed read
  // — `link` stays whatever it was, so this effect does not fire for it.
  // No `setState` here (`react-hooks/set-state-in-effect`): the effect
  // writes storage and nothing else.
  useEffect(() => {
    if (link !== null) writeConcept2Seen(accountId, link.available);
  }, [accountId, link]);

  const state = rowState(link, failed, seenAtMount);
  if (state === null) return null;

  return (
    <Link to="/you/concept2" state={{ from: "/you" }} className="diag-row">
      <span>CONCEPT2</span>
      <span className="diag-row-end">
        <span className="diag-row-state">{state}</span>
        <span aria-hidden="true">&rsaquo;</span>
      </span>
    </Link>
  );
}
