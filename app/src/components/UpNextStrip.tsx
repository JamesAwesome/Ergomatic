/** The UP NEXT panel (`.timer-upnext`), extracted verbatim from
 *  `session/Timer.tsx`'s own inline JSX (Phase 7B Task 3) so the future
 *  connected panes (Tasks 6/7) can render the identical strip. Neutral
 *  value props: `upNextText`/`thenNextText` (Timer.tsx's own text builders,
 *  reading `SessionRun`) stay exactly where they are — this component only
 *  ever sees their already-computed OUTPUT strings, never a run.
 *
 *  `thenNext === null` hides the landscape-only second line entirely (no
 *  empty `.timer-upnext-then` span rendered) — the same "null past the last
 *  phase" contract `thenNextText` itself documents, and the exact condition
 *  the phone timer's own inline JSX used before this extraction. `upNext
 *  === null` renders the value slot empty rather than omitting it: the
 *  phone timer never actually passes `null` (`upNextText` always returns a
 *  string, "FINISH" included), so this branch is here only for future
 *  callers (a connected pane before its first live phase resolves, say) —
 *  it must not silently print the literal string `"null"` if one ever
 *  does. */
export interface UpNextStripProps {
  upNext: string | null;
  thenNext: string | null;
}

export default function UpNextStrip({ upNext, thenNext }: UpNextStripProps) {
  return (
    <div className="timer-upnext">
      <div className="timer-upnext-main">
        <span className="timer-upnext-label">UP NEXT</span>
        <span className="timer-upnext-value">{upNext ?? ""}</span>
      </div>
      {thenNext !== null && (
        <span className="timer-upnext-then">then {thenNext}</span>
      )}
    </div>
  );
}
