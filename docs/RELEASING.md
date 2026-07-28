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

## Cutting a release (~15 min, on the build Mac)

1. `git checkout main && git pull`
2. `git tag -a vX.Y.Z -m "<one-line summary>" && git push origin vX.Y.Z`
3. `cd app && GOOGLE_IOS_CLIENT_ID=<id> pnpm ios:build`
4. `pnpm ios:open` → Xcode: Product → Archive → Distribute App →
   TestFlight (internal). No Beta App Review for internal testers.
5. Confirm the build appears in App Store Connect → TestFlight; internal
   testers update automatically.

Notes: internal builds expire after 90 days — re-upload (no new tag needed;
BUILD increments with any new commit). First-time setup lives in
docs/deploy.md ("iOS build machine" section, Task-7 activation).
