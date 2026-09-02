# Releasing Ergomatic (TestFlight)

The web app at https://ergomatic.waffle.haus deploys continuously on every
merge — it is the Bluetooth-less prototype. TestFlight releases are
**periodic and deliberate**, cut from annotated git tags.

## When to release

Cut a release when any of:

- Native-relevant code changed: auth/session flow, live timer, Capacitor
  config or plugins.
- A user-visible capability is complete (typically a phase exit).
- A security fix landed.
- James says so.

Do NOT release for: web-prototype iterations, docs, infra/CI, refactors
invisible on device.

**A release that changes what a tester receives also updates the in-app
release notes** (James, 2026-08-09) — the News tab's Releases screen,
written in the app's own voice, covering what testers actually get rather
than what merged. The notes PR merges BEFORE the tag: the screen names the
version they are about to receive, and three e2e pins force a deliberate
touch when it changes.

The usual shape is a separate notes PR merged just before the tag (v0.8.0 and
v0.9.0 both went out that way). **It is not the only shape:** v0.26.0's tag
points at the phase PR that introduced its own notes, with no separate notes
PR. Either is fine. What matters is that the notes are in the tagged commit —
a tag cut ahead of its notes ships a Releases screen that does not name the
build the tester just received.

**Standing rule:** after every merge to main, Claude posts an explicit
recommendation — "TestFlight release recommended: <reasons>" or "No release
needed: <reason>" — based on the PR contents.

## Versioning (hatch-vcs style — never hand-edit)

- Annotated tags `vX.Y.Z` are the ONLY version authority.
- `scripts/version.sh` derives VERSION (latest tag), BUILD (commit count,
  monotonic — Apple requires this), DESCRIBE (`git describe`).
- `/api/health` reports the server's DESCRIBE; the app's About will show its
  own once that surface lands (Phase 9).
- API changes must be **additive-only between tags**: old TestFlight builds
  talk to the newest server. A breaking change forces a coordinated tag.
  **Breaks so far, one per line, newest first:** v0.35.0 — `POST /api/logs`
  requires `source` (pm5 | timer | manual); builds before 0.34.0 (≤811)
  post none and get a 400 naming the field. The derive-when-absent path
  that carried them from 0.34.0 was a dated sunset (ROADMAP), and the
  0.34.0 notes told those builds to update.

## Refresh the captures (with the notes PR, BEFORE the tag)

**`docs/screenshots/` is documentation, not a gate — by ruling** (James,
2026-08-27: *"We honestly don't need to run these in ci. It can be part of
the release skill and maybe a scheduled reup."*). `screenshots.spec.ts` is
excluded from the chromium project CI runs, so nothing regenerates or
checks these images except this step. If it is skipped, they rot silently.

From `app/`, on the notes branch, before the notes PR merges:

```
pnpm screenshots          # boots the compose stack itself; ~50s once up
```

Then **commit only the captures that changed for a REASON**, and revert the
rest. A same-commit regeneration churns ~22 files for reasons that are not
changes:

| cause | count | what it looks like |
| --- | --- | --- |
| date text | 7 | `AUG 25` → `AUG 27`, monospace, no reflow |
| time-of-day | 5 | `13:04` → `13:05`, from `loggedAt DEFAULT now()` |
| rasterizer flicker | 2 | 8-10 px at max channel delta 2-3, invisible |
| the test user's address | 6 | the run id genuinely differs; since 2026-08-27 it is clamped to one line, so the diff stays inside rows 45-91 instead of moving the whole page |

**Open each image you are about to commit and look at it** (recurring
failure #7). The reason this step exists: `releases.png` sat stale for two
whole releases showing `v0.23.0` while the app shipped `v0.25.0`, and every
assertion in the suite was green the entire time — the pin checks the app,
not the picture. A release-time regeneration is what catches that class.

**To tell real churn from noise, run it twice and diff run against run.**
The calendar is held constant for free, so anything that still moves is
nondeterminism rather than the date.

**Run this on the build Mac, never on Linux.** The committed captures are a
macOS artifact. Measured 2026-08-27 in
`mcr.microsoft.com/playwright:v1.62.1-noble` against the same stack:
**90 of 90 captures differ, zero identical**, max channel delta 255, and
one page renders a different HEIGHT — FreeType against CoreText is a
different layout, not a hinting wobble. The suite still passed 81/81 in the
container, because every assertion is about the DOM and none can see this.
Regenerating anywhere else produces a 90-file diff that means nothing.

## Cutting a release (~10 min, on the build Mac, fully CLI)

0. **`gh run list --branch main --limit 5` — main's last run, INCLUDING its
   `deploy` job, is green.** A PR's checks are not this run. On 2026-09-01
   six consecutive merges deployed nothing for eleven hours (the host
   checkout was dirty and `deploy.sh` refused), v0.32.0 went to TestFlight
   against a server still on v0.31.0, and the tag's own feature failed to
   save at the erg. Prod's `/api/health` version is the cheap cross-check:
   `curl -s https://ergomatic.waffle.haus/api/health`.
1. `git checkout main && git pull`
2. **Account for every commit since the last tag** before writing the notes —
   `git log $(git tag --list --sort=-v:refname | head -1)..main --oneline` —
   and give each one a note or a stated reason it needs none. Parallel sessions
   make "my branch is the release" wrong more often than right: v0.13.0 was one
   command from shipping with notes covering only one session's phase while a
   delete button from another session rode along unmentioned.
   **`--sort=-v:refname` is load-bearing.** A bare `git tag --list` sorts
   lexically and reports `v0.9.0` as the newest tag when the real head is
   `v0.26.0`. **Do not add `--merges`** — main is squash-merged and has no merge
   commits, so it returns empty.
3. `git tag -a vX.Y.Z -m "<one-line summary>" && git push origin vX.Y.Z`
4. `cd app && pnpm ios:release`

That's the whole thing (first proven on v0.10.0, 2026-08-17). The script
(`scripts/ios-release.sh`) refuses to run unless HEAD is exactly the
latest `vX.Y.Z` tag, derives `GOOGLE_IOS_CLIENT_ID` from Info.plist's
committed reversed URL scheme (export it to override), builds + syncs,
archives via `xcodebuild -project` (the iOS app is SPM-based — there is
no `.xcworkspace`; `-workspace` fails), and uploads with
`-exportArchive` (`method: app-store-connect`, `destination: upload`,
internal-only). Signing and upload auth ride the Apple ID already logged
into Xcode via `-allowProvisioningUpdates` — no App Store Connect API
key on this machine.

Then confirm the build appears in App Store Connect → TestFlight;
internal testers update automatically after Apple's few minutes of
processing. No Beta App Review for internal.

Fallback (GUI, if the CLI upload ever breaks): `pnpm ios:build` then
`pnpm ios:open` → Xcode: Product → Archive → Distribute App →
TestFlight (internal). **Round 7 review caveat: this path calls the SAME
`pnpm ios:build` `ios-release.sh` calls, but never runs `ios-release.sh`
itself — none of its guards (the `VITE_ENABLE_C2_LINK_PROBE` shell/`.env`
checks, or the dist:grep-after-build check) run here.** If your shell (or
an `.env*` file) has `VITE_ENABLE_C2_LINK_PROBE` set for a walk
(`docs/superpowers/plans/2026-09-01-concept2-pr15-walk.md`), this path
will happily build the dev-only probe card into a release. **Run
`pnpm dist:grep` yourself, by hand, right after `pnpm ios:build` and
BEFORE archiving in Xcode** — it must print `dist-grep: OK`; if it
doesn't, stop and find out why before touching Product → Archive.

Notes: internal builds expire after 90 days — re-upload (no new tag needed;
BUILD increments with any new commit).

**First-time iOS build machine setup is not written down.** This line used to
point at a "iOS build machine" section of `docs/deploy.md`; that section does
not exist, and deploy.md pointed back here. See deploy.md's TestFlight section
for what such a section would have to cover — and write it there the first time
a new Mac needs it.

## Rollback constraints

The server rollback floor is the newest version listed here. `deploy.sh`'s
health-gated auto-rollback and any manual rollback must never cross it —
the seed converges the global library BY TITLE at every boot, so a version
whose seed does not know a rename will DELETE the renamed rows (nulling
every `session_logs.workout_id` that pointed at them — unrecoverable link
loss) and reinsert its own old-titled rows fresh. Rolling forward again
renames the fresh rows, but the links are gone. Recovery is a DB backup,
not a redeploy.

| Floor | Why |
| ----- | --- |
| v0.16.0 (PR #156) | First version whose seed renames global rows in place (`First 6k`/`First 2k` → `6K Test`/`2K Test` via `LEGACY_TITLE_RENAMES`). Rolling the API back past it against a post-rename DB is unrecoverable log-link loss. |
| the tag carrying migration 0020 (`session_logs.source`, unconnected-JR PR) | 0020 adds `source` NOT NULL with a backfill. A server older than it does not write the column, so rolling the API back past it makes every new save fail the NOT NULL constraint (no row is written, the app shows its save failure and holds the record). Not data loss, but a total write outage until rolled forward. |
| the tag carrying migration 0022 (`log_source` gains `no-reading`; door PR A) | Two one-way changes. (1) `log_source` widens to a fourth member, `no-reading` — a server older than this migration 400s every `no-reading` save (`LOG_SOURCES` doesn't know the member) on field `source`, and the client's only 400 retry strips `workoutId`, so the save is LOST, not held. (2) `preferences.warmup` is DROPPED — a server older than this migration still declares and selects that column, so `GET /api/prefs` fails outright (`column "warmup" does not exist`) until rolled forward. Not data loss either way, but a save-loss window plus a read outage on `/api/prefs` until rolled forward. |
