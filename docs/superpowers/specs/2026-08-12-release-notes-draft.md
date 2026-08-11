# Next release notes — draft (NOT wired into `releaseNotes.ts`)

**This is a docs draft only.** It exists so the next tag doesn't have to
reconstruct, from scratch, everything that shipped after v0.7.0's entry
was written. When the next release is cut, fold the finished items below
into `app/src/news/content/releaseNotes.ts`'s `RELEASE_NOTES` array
(newest first), rewrite anything the fast-follow wave's own erg walk
changes, and delete this file.

**Version / date:** provisional — `v0.8.0`, dated at the tag. Both
values are placeholders; the tag corrects them the way v0.7.0's own
tag-time touch (#82) corrected its date and PM5 line after the phone-BLE
merge landed the same morning.

**Everything below post-dates v0.7.0's entry (shipped 2026-08-11), per
the step-detail memory's own owed note.**

## Item list

1. **Workout step detail (#80, merged 2026-08-10).** Today's piece
   region and the Library's generated structure line now show a
   workout's real piece-by-piece shape: each interval as its own row,
   the hardest piece tinted, a `+N more` cap when a workout runs long,
   and a WORK · TOTAL foot at the bottom.
2. **"Reading the shorthand" article (#81, merged 2026-08-11).** New in
   News: a first-party article decoding the Library's shorthand line by
   line, so a rower can scan a workout's shape without opening it.
3. **Consecutive-piece roll-up (#83, merged 2026-08-11).** Workouts with
   several identical pieces back to back now collapse to one line,
   "5× the block below," on both Today and the Library, instead of
   five separate rows.
4. **The finish survives a dropped split (this wave).** If a workout's
   last interval's data ever fails to arrive from a connected PM5, the
   app now fills it in itself from the monitor's own end-of-workout
   summary, so a session that finished for real still saves complete
   instead of missing its last piece.
5. **Starting a workout is one door now, and your pace adjustment
   sticks (this wave).** The old confirm screen between "Start" and
   your workout is gone. Adjust pace right on the workout page, then
   start: the same adjustment now carries through whether you connect
   a PM5 or use the phone's own timer, which used to only work on one
   of the two paths.
6. **Connect stands out (this wave).** The Connect button is blue now
   and sits above Start Timer, the workout page's one clear way to
   begin a monitored row.

## Notes for whoever cuts this

- Items 4-6 are the fast-follow wave
  (`docs/superpowers/specs/2026-08-11-fast-follow-design.md`); item 4's
  rower-facing phrasing intentionally omits the wire-level mechanism
  (grace window, summary characteristics, premise discriminators) the
  spec and `pm5-interface-notes.md` §23 carry for the implementation
  record — release notes speak rower, not radio.
- Confirm the fast-follow erg walk (Task 7) actually passed before this
  ships; item 4 and item 5's "carries through" claim are both walk
  results, not yet hardware-confirmed at the time this draft was
  written.
- No em-dash in any item — house style
  (`no-emdash-in-copy` memory) — checked at draft time; re-check
  anything reworded before it lands in `releaseNotes.ts`.
