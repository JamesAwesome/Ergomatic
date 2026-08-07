export function BaselinesBody() {
  return (
    <>
      <p>
        Every pace in this app is written relative to you. A workout never says
        "row 2:00.0" — it says something like 6k −2: two seconds per 500 m
        faster than your 6k pace. That 6k pace is a baseline, and once yours is
        set, every offset in the library resolves into a real number.
      </p>

      <p>
        A baseline is nothing more than the average split you can hold for the
        distance. Row a 6k; whatever your average split turns out to be, that's
        your 6k baseline. There is no test protocol to get right and no way to
        fail it. Row it how it feels.
      </p>

      <aside className="reader-inset">
        IN THE APP — 6K 2:02.4 → O2 AT 6K −2 = 2:00.4. Every target carries the
        offset it came from, so you can always tell where a number was born.
      </aside>

      <p>
        Why offsets instead of fixed paces? Because fitness moves. When your
        baseline improves, every workout in the library gets faster with you —
        the same piece that resolved to 2:00.4 in March might resolve to 1:58.9
        by June, with nobody editing anything. Your history stays honest too:
        when you log a session, the app freezes the resolved numbers into the
        log, so an old entry always shows the paces you actually rowed against,
        not today's.
      </p>

      <p>
        There are two baselines, 2k and 6k, and they are deliberately separate.
        A 2k describes what you can do flat out; a 6k describes what you can
        sustain. They move at different rates and they answer different
        questions, so short, sharp workouts key off your 2k and longer ones key
        off your 6k. Keep both current and every workout in the library speaks
        your language.
      </p>

      <p>
        Don't overthink the first one. An honest, unheroic 6k this week beats a
        perfect one someday. You can re-row it whenever fitness (or honesty)
        demands.
      </p>
    </>
  );
}
