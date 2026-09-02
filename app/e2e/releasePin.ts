/** The newest release the e2e suites expect the Releases screen to show.
 *
 *  ONE literal, consumed by both `news.spec.ts` (CI's e2e job, the
 *  forcing function: a notes PR that forgets to bump this goes red in CI)
 *  and `screenshots.spec.ts` (no CI job runs it — it used to carry its
 *  own copy, which rotted while the gated one got bumped, breaking
 *  `pnpm screenshots` on main at v0.18.0 (#166) and again at v0.27.0
 *  (#232). Two independent literals was the failure class; one literal
 *  cannot drift from itself.)
 *
 *  Deliberately NOT derived from `src/news/content/releaseNotes.ts`: the
 *  screen renders `RELEASE_NOTES[0].version`, so an expectation read from
 *  that same module is a mirror (recurring failure 11) — green for any
 *  notes at all, catching only render breakage. The literal is the
 *  independent witness that the notes PR actually shipped the entry it
 *  claims.
 *
 *  Bump alongside each release-notes PR. */
export const NEWEST_RELEASE_VERSION = "v0.34.0";
