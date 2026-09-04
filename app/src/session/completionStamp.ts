/**
 * Wave E PR2. The two fields `POST /api/logs` has validated and stored
 * since PR1 and nothing has ever sent (plan observation 17):
 * `session_logs.completed_at` and `session_logs.tz`.
 *
 * WHY A MODULE OF ITS OWN, for four lines. It is the upstream half of an
 * A-writes-then-B-reads seam (RF24), and the only way to gate that seam is
 * a test that starts at the producer. A server-side test can import THIS
 * — it has no imports at all, so it drags no React, no `window` and no
 * `import.meta.env` across the tree boundary — and build the request body
 * with the same function the app uses. Inlining these two keys at each
 * door would leave the seam ungateable: every available test would seed a
 * hand-written body, which is exactly the shape that let
 * `MACHINE CONFIRMED · WORK ONLY` reach zero of sixteen production rows.
 *
 * WHY IT MATTERS, in Concept2's own words. Their documentation of the
 * `date` parameter on `POST /api/users/me/results`, quoted verbatim
 * (`docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`,
 * §Research record, the "POST results" bullet):
 *
 *   "this should be the date as stored in the monitor, which is the end of
 *    the workout, NOT the beginning"
 *
 * `loggedAt` is when the rower tapped Save, and the gap between the two is
 * however long they spent on the summary screen. The sentence is quoted
 * here rather than pointed at because it IS this module's whole
 * justification, and `date` is neither optional nor forgiving: the same
 * source lists it as required, and Concept2's dedup key is
 * second-granular.
 *
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` returns a canonical
 * IANA zone name, which is what `routes/data.ts`'s `tzError` accepts
 * (membership of `Intl.supportedValuesOf("timeZone")` plus `"UTC"` — not
 * "Intl parses it", which would also admit `"+05:00"`).
 *
 * The route does NOT refuse a zone it fails to recognise — it stores null
 * and keeps the save (`routes/data.ts`'s `POST /api/logs` tz note). That
 * asymmetry is deliberate and this function relies on it: the phone's
 * tzdata and the server image's can legitimately disagree, and a Concept2
 * field must never cost a rower their own row.
 */
export function completionStamp(run: { completedAt: string | null }): {
  completedAt: string | null;
  tz: string;
} {
  return {
    // Passed through, NEVER defaulted to `new Date()`. An interrupted run
    // genuinely has no close stamp, and substituting the current instant
    // would post the save clock while claiming to be the close stamp —
    // strictly worse than the server's honest `loggedAt` fallback.
    completedAt: run.completedAt,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
