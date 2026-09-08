export function ConnectTheMonitorBody() {
  return (
    <>
      <p>
        Every workout in this app can run two ways. Manual mode is the phone
        alone: you follow the timer and row. Connected mode adds a Concept2 PM5,
        and the piece changes character: the app writes the whole workout into
        the monitor before you take a stroke.
      </p>

      <p>
        Connect from the workout's own screen before you start. The app finds
        the monitor over Bluetooth and sends every interval: the work, the
        rests, the distances, the times. The PM5 then runs the piece the way it
        runs a race. Intervals advance themselves, rest counts itself down, and
        the monitor's numbers are the numbers.
      </p>

      <p>
        While you row, the timer shows your actual pace beside the target and
        your stroke rate beside the prescribed rate. No guessing about whether
        you're on: the screen says so, stroke by stroke.
      </p>

      <p>
        If the connection drops mid-piece, the screen says so plainly and keeps
        what it has: your readouts freeze rather than lie, and the session can
        be ended and logged like any other. Reconnecting is a fresh start, not a
        mid-piece rescue. Manual mode is always there as a choice before you
        start; connected mode simply hands the bookkeeping to the erg.
      </p>

      <p>
        You'll need a PM5 (the standard Concept2 monitor) with Bluetooth
        switched on. Your first baseline row works either way; connect whenever
        you're ready.
      </p>

      {/* THE SUPPORT MATRIX (Phase MT, James 2026-09-08: three tiers, "to help
          with the honesty / transparency"). The refusal screen links straight
          here, so this section is the answer to a question a rower has just
          been asked at an erg.

          h2-led sections, NOT a table: `.reader-body` styles p, h2,
          `.reader-inset` and `.reader-figure` and carries no table rules at
          all, so a table would be new CSS and a bad screen in a 320px column.

          THIS IS A PUBLISHED CLAIM AND IT GOES STALE SILENTLY — the same class
          as a shipped release note. Changing `server/concept2/mapping.ts`'s
          hardcoded `type: "rower"`, or the denylist in
          `domain/monitor/pm5/ergMachine.ts`, reconciles the middle tier below
          AND recounts `minutes` in `articles.tsx`. Its ROADMAP row says so
          too; this comment is here because the recount habit already lives at
          the registry and a reader of this file needs the same trigger. */}
      <h2>Which ergs work</h2>

      <p>
        <strong>Supported &mdash; confirmed.</strong> One machine: the RowErg
        this app was built and tested against. Everything below this line is
        honest guesswork until someone rows on one and tells us.
      </p>

      <p>
        <strong>Supported &mdash; best effort.</strong> Dynamic RowErgs, RowErgs
        on slides, MultiErgs on a rowing interval, and any monitor too old to
        tell us what it is. The piece itself is right: it is rowing, and pace
        per 500m means what it says. But Ergomatic tells Concept2 it was a plain
        RowErg, so the logbook entry names the wrong machine and its
        verification code will not be accepted. That one is on the list to fix.
      </p>

      <p>
        <strong>Unsupported.</strong> SkiErg, BikeErg and Dyno. Ergomatic
        refuses these rather than storing them as rows: nothing is programmed,
        nothing is recorded, nothing is sent.
      </p>
    </>
  );
}
