import ArticleLink from "../../ArticleLink";

export function NotationBody() {
  return (
    <>
      <p>
        Rowing has its own shorthand, and the app uses it everywhere: on Today's
        suggestion, in the Library's structure lines, on the monitor. None of it
        is complicated. It just assumes you know five small conventions, so here
        they are.
      </p>

      <p>
        <strong>The split.</strong> Rowers do not measure speed in kilometres
        per hour. They measure how long 500 metres takes, and call it a split. A
        split of 2:05.0 means every 500 metres costs you two minutes and five
        seconds. Smaller number, faster boat: 2:00 is quicker than 2:10. The
        decimal is tenths of a second, and yes, tenths matter. Every pace target
        in the app is a split.
      </p>

      <p>
        <strong>Offsets.</strong> A workout never names a raw split, because
        your raw split changes as you get fitter. Instead it says 6k +10: your{" "}
        <ArticleLink to="/news/baselines">6k baseline pace</ArticleLink>, plus
        ten seconds per 500. Plus means slower and easier; minus means faster
        and harder. 6k +10 is a conversational cruise, 2k −2 is a bad place to
        live. When a piece says ALL OUT or EASY instead, that is deliberate:
        some efforts are not supposed to have a number.
      </p>

      <p>
        <strong>Counts and chains.</strong> 8 × 500m reads "eight pieces of 500
        metres each". When the pieces differ, they chain with hyphens:
        2-4-6-8-6-4-2 is seven pieces climbing from two minutes up to eight and
        back down. The convention doing quiet work here: a bare number is
        minutes, and metres always wear their unit. So 2000m-6-1000m-3 is a
        2,000 metre piece, six minutes, a 1,000 metre piece, three minutes. If
        there is no m, you are reading time.
      </p>

      <p>
        <strong>Rest.</strong> The tick mark is minutes: 2′ r after a piece
        means two minutes of easy movement before the next one, and · 2′ REST on
        a Library line means every gap in that workout is the same two minutes.
        Rest belongs to the piece it follows. On Today, a piece with no rest
        after it is usually the last one.
      </p>

      <p>
        <strong>Stroke rate.</strong> SPM is strokes per minute, and it is
        cadence, not effort. You can pull hard and slow at 20, or light and
        quick at 30. When a piece names a rate, hold the rate and let the split
        come from how hard each stroke is. That separation is most of erg
        technique in one sentence.
      </p>

      <p>
        Two more numbers you will meet on Today's card: WORK is the rowing
        alone, TOTAL adds the rests. The difference is exactly the recovery you
        are owed, and nothing about either includes your warm-up, which belongs
        to you and lives on the You screen.
      </p>
    </>
  );
}
