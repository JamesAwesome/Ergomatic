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
touch when it changes. v0.8.0 and v0.9.0 both went out this way.

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

## Cutting a release (~10 min, on the build Mac, fully CLI)

1. `git checkout main && git pull`
2. `git tag -a vX.Y.Z -m "<one-line summary>" && git push origin vX.Y.Z`
3. `cd app && pnpm ios:release`

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
TestFlight (internal).

Notes: internal builds expire after 90 days — re-upload (no new tag needed;
BUILD increments with any new commit). First-time setup lives in
docs/deploy.md ("iOS build machine" section, Task-7 activation).

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
