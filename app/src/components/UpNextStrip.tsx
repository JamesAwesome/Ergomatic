/** The UP NEXT panel (`.timer-upnext`), extracted verbatim from
 *  `session/Timer.tsx`'s own inline JSX (Phase 7B Task 3) so the connected
 *  panes can render the identical strip. Both A and B do (Task 6). Neutral
 *  value props: `upNextText`/`thenNextText` (Timer.tsx's own text builders,
 *  reading `SessionRun`) stay exactly where they are — this component only
 *  ever sees their already-computed OUTPUT strings, never a run.
 *
 *  ONE COMBINED VALUE, NOT TWO STRINGS (connected-revamp Task 6, design
 *  spec §6/revision §3). The mockup renders `REST 2:00 · then WORK 2:09.0`
 *  as a SINGLE span in landscape, and `REST 2:00 · WORK 2:09.0` — the exact
 *  same value, minus the word "then" — as a single span in portrait
 *  (`Ergomatic connected mode.dc.html`'s Live/Grid/Timer frames, verified
 *  byte-for-byte). This component has no JS notion of the device's current
 *  orientation (the phone timer's own header comment establishes that
 *  rule; this file inherits it), so both orientations render from the SAME
 *  markup and CSS alone decides which reads: `thenNext`'s text always
 *  follows `upNext`'s behind a plain " · " separator, and only the WORD
 *  "then" — `.timer-upnext-then`, an inline span holding just that one
 *  word — is toggled by `index.css`'s landscape media query (visible
 *  landscape, `display: none` by default). Drop the word and what is left
 *  IS the portrait string; there is no second builder and no second prop.
 *
 *  `thenNext === null` renders no `.timer-upnext-then` element and no " · "
 *  separator at all — the "null past the last phase" contract
 *  `thenNextText` documents, unchanged by this rework. `upNext === null`
 *  renders the value slot empty rather than omitting it: the phone timer
 *  never actually passes `null` (`upNextText` always returns a string,
 *  "FINISH" included), so this branch is here only for future callers (the
 *  connected panes always pass a string too — `upNextTextAt` has the same
 *  "FINISH past the last phase" contract) — it must not silently print the
 *  literal string `"null"` if one ever does. */
export interface UpNextStripProps {
  upNext: string | null;
  thenNext: string | null;
}

export default function UpNextStrip({ upNext, thenNext }: UpNextStripProps) {
  return (
    <div className="timer-upnext">
      <div className="timer-upnext-main">
        <span className="timer-upnext-label">UP NEXT</span>
        <span className="timer-upnext-value">
          {upNext ?? ""}
          {thenNext !== null && (
            <>
              {" · "}
              <span className="timer-upnext-then">then </span>
              {thenNext}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
