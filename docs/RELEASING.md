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
