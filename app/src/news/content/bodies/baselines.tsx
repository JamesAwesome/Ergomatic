export function BaselinesBody() {
  return (
    <>
      <p>
        Every pace in this app is written relative to you. A workout never says
        "row 2:00.0". It says something like 6k −2, meaning two seconds per 500
        m faster than your 6k pace. That 6k pace is a baseline, and once yours
        is set, every offset in the library resolves into a real number.
      </p>

      <p>
        A baseline is nothing more than the average split (your time per 500 m)
        you can hold for the distance. Row a 6k; whatever your average split
        turns out to be, that's your 6k baseline. There is no test protocol to
        get right and no way to fail it. Row it honestly rather than heroically:
        warm up first, then hold as even a pace as you can. A 6k that starts too
        hot undersells your real fitness.
      </p>

      <aside className="reader-inset">
        IN THE APP · Your 6k baseline: 2:02.4. A workout written 6k −2 resolves
        two seconds faster: 2:00.4. Every target carries the offset it came
        from, so you can always tell where a number was born.
      </aside>

      <p>
        Why offsets instead of fixed paces? Because fitness moves. When your
        baseline improves, every workout in the library gets faster with you.
        The same piece that resolved to 2:00.4 in March might resolve to 1:58.9
        by June, with nobody editing anything. Your history stays honest too:
        when you log a session, the app freezes the resolved numbers into the
        log, so an old entry always shows the paces you actually rowed against,
        not today's.
      </p>

      <p>
        There are two baselines, 2k and 6k, and they are deliberately separate.
        A 2k describes the fastest even pace you can hold for the full two
        thousand metres; a 6k describes what you can sustain when the effort
        runs long. They move at different rates and they answer different
        questions, so short, sharp workouts key off your 2k and longer ones key
        off your 6k. Keep both current and every workout in the library speaks
        your language.
      </p>

      <p>
        Why those two distances? Racing. A 2k is the standard sprint race, the
        distance every competitive rower trains toward. Head races, the longer
        events rowed through autumn, run about five to six thousand metres.
        Training culture calibrated itself around those two efforts long ago,
        and the app's own plan presets, sprint and head race, point at the same
        pair. You never need to enter a race for the numbers to work. They are
        simply well-studied reference points for two different engines: one
        fast, one sustained.
      </p>

      <p>
        Don't overthink the first one. An honest, unheroic 6k this week beats a
        perfect one someday. When you've rowed it, enter your average split
        under You, and every workout in the library starts speaking in your
        numbers. Re-test whenever workouts have felt noticeably easier or harder
        than their forecasts for a couple of weeks.
      </p>
    </>
  );
}
