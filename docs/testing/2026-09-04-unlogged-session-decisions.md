# Recovery implementation decisions

These controller rulings were made while implementing the approved
[unsaved-workout design](../superpowers/specs/2026-09-03-unlogged-session-design.md),
in this order. They do not authorize merge, release or native acceptance.

1. **Replace the old omission fixture with a real-library-derived recording.**
   Inspection showed the old fixture had empty intervals and no frozen seed,
   contrary to the plan's claim. Use library → draft/run → compiled program
   and log seed, and correct the plan. Cost if wrong: the new witness may miss
   an old malformed-fixture behavior; malformed recordings have separate
   fallback coverage.
2. **Preserve the approved discard content-replacement layout.** The approved
   prototype replaces the row with confirmation; it does not require the
   historical fixed-height/accent-border treatment. Keep two taps, blur,
   timeout and stable recovery mounting. Cost if wrong: reserve more row space
   in a visual rework; storage behavior is unchanged.
3. **Keep the initial-GREEN test history honest.** Some first-pass tests were
   characterizations, not pre-implementation failures. Later mutations prove
   sensitivity, not retroactive TDD compliance. Independent review and
   fix-first RED cases remained required. Cost: implementation-shaped tests
   can miss blind spots; review subsequently found malformed measurements.
4. **Test behavior in mounted recovery/caller harnesses, not decorative legacy
   file edits.** Correct the plan's file list; unchanged legacy suites still
   run. Cost if wrong: a legacy-only regression could escape the selected-route
   witnesses, which is why those legacy suites remain part of verification.
5. **Use a genuine positive-rest five-interval producer.** The unchanged
   zero-rest fake reproduced incorrectly indexed actuals; the approved recovery
   journey requires completed programmed production, not zero rests. Keep the
   old zero-rest story and existing RC-8 ownership; do not change fake, driver
   or arithmetic here. Cost: this witness does not establish zero-rest fake
   correctness.
6. **Let the Task 2 fix worker repair the shared warning's initial visibility.**
   One writer reused the existing non-animated focus/center-scroll idiom for
   the approved copy/layout, with viewport, keyboard, mutation and capture
   evidence. No other Task 1 product or global CSS ownership was added. Cost:
   viewport/focus behavior may need native rework; phone acceptance remains
   required.
7. **Refuse conflicting designated-test identities.** The known global linked
   library row owns the complete identity, and its designated title must agree
   with the retained title. Both disagreement directions refuse an automatic
   test offer; captured display/POST title and measured calculations stay
   unchanged. Cost: a genuine designated session whose library title later
   changes still saves, but receives no automatic baseline offer. This avoids
   writing a false test result from mixed records.
8. **Keep the residual verification-byte finding blocking at the review limit.**
   Scoped re-review found the new guard lacks the existing server's array-length
   and byte-range checks. The controller confirmed that selected Save forwards
   these values and the server rejects them. Do not waive it or start a second
   automatic fix wave; ask James to direct a focused follow-up that preserves
   the exact recording in read-only fallback. Cost: delivery waits for that
   direction; accepting the gap would leave another misleading Save action.
