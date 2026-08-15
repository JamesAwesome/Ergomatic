import ArticleLink from "../../ArticleLink";
import { LIBRARY_EXAMPLES } from "./notationExamples";

export function NotationBody() {
  return (
    <>
      <p>
        Every row in the Library carries one line of shorthand that states the
        whole workout: the pieces, the pace, the rest. Once you can read it, you
        can scan three hundred workouts without opening one. The same notation
        runs through Today's card and the monitor. Five conventions cover all of
        it.
      </p>

      <p>
        <strong>The split.</strong> Rowers do not measure speed in kilometres
        per hour. They measure how long 500 metres takes, and call it a split. A
        split of 2:05.0 means every 500 metres costs you two minutes and five
        seconds. Smaller number, faster boat. Every pace target in the app is a
        split.
      </p>

      <p>
        <strong>Offsets.</strong> A workout never names a raw split, because
        your raw split changes as you get fitter. Instead it says 6K+12: your{" "}
        <ArticleLink to="/news/baselines">6k baseline</ArticleLink>, which is
        your own average split from a 6,000 metre row, plus twelve seconds per
        500 metres. A 2k baseline works the same way, from a 2,000 metre row,
        and the letter alone tells you the job: 6K anchors steady endurance
        work, 2K anchors the short sharp stuff. Plus means slower and easier;
        minus means faster, and for most rowers harder. When the pieces move
        through different offsets, the line shows the range slowest first, like
        2K+3 → −1: the baseline is named once, on the slow end, and every piece
        in the range rides it. A bare 6K or 2K means exactly baseline pace. When
        a piece says MAX or ALL OUT instead, that is deliberate: some efforts
        are not supposed to have a number.
      </p>

      <p>
        <strong>Counts and chains.</strong> 2 × 4:00 reads "two pieces of four
        minutes each". When the pieces differ, they chain with hyphens. The
        convention doing quiet work here: a bare number is minutes, and metres
        always wear their unit. If there is no m, you are reading time.
      </p>

      <p>
        <strong>Rest.</strong> The tick mark is whole minutes: · 1′ REST at the
        end of a line means every gap in that workout is the same one minute.
        When rest is not a whole minute, it drops the tick and uses the clock
        instead: 1:15 REST is one minute fifteen, the same format the pieces
        use. When a line names no rest at all, the gaps differ or do not exist;
        open the workout to see them.
      </p>

      <p>
        <strong>Stroke rate.</strong> SPM is strokes per minute, and it is
        cadence, not effort: you can pull hard and slow at 20, or light and
        quick at 30. Rates show on Today's piece rows rather than in Library
        lines, so none of the rows below name one.
      </p>

      <p>
        <strong>Now read four real rows.</strong> These are in the Library
        today.
      </p>

      <aside className="reader-inset">
        {LIBRARY_EXAMPLES[0].title} · {LIBRARY_EXAMPLES[0].line}
      </aside>
      <p>
        Two pieces of four minutes, both at your 6k pace plus twelve seconds,
        with one minute of rest between them. A gentle steady session, stated
        whole.
      </p>

      <aside className="reader-inset">
        {LIBRARY_EXAMPLES[1].title} · {LIBRARY_EXAMPLES[1].line}
      </aside>
      <p>
        Five pieces climbing two, three, four minutes and back down, all at the
        same pace, a minute of rest in every gap. The shape rowers call a
        pyramid, readable without the name.
      </p>

      <aside className="reader-inset">
        {LIBRARY_EXAMPLES[2].title} · {LIBRARY_EXAMPLES[2].line}
      </aside>
      <p>
        Ten pieces of forty-five seconds, one second per 500 FASTER than your 2k
        pace, resting a minute and fifteen each time: there is the clock format,
        standing in for a rest that is not whole minutes. Short, sharp, and
        honest about it.
      </p>

      <aside className="reader-inset">
        {LIBRARY_EXAMPLES[3].title} · {LIBRARY_EXAMPLES[3].line}
      </aside>
      <p>
        The full vocabulary in one line: 1,100 metres, then three MINUTES, then
        550 metres, then one minute, sliding from three seconds slower than
        baseline to one second faster. The 2k is stated once and covers the
        whole slide, so the fast end needs no letter of its own. Metres wear
        their m; bare numbers are time.
      </p>

      <p>
        That is the whole language. Open the Library and read a few rows: every
        one states its workout the same way, and none of them need opening to be
        understood.
      </p>
    </>
  );
}
