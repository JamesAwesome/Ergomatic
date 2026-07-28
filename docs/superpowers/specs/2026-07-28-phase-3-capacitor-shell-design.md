# Phase 3: Capacitor iOS Shell — Design

Approved 2026-07-28. Implements ROADMAP Phase 3 per the roadmap amendment
(`2026-07-28-roadmap-amendment-distance-pm5-capacitor.md`) and the research doc
(`2026-07-27-capacitor-vs-react-native.md`).

## Decisions

| Question | Decision |
|---|---|
| Web app's role | **Continuously-deployed Bluetooth-less prototype** — used for prototyping and to prove nothing requires Bluetooth. Web behavior must be provably unchanged by this phase |
| iOS distribution | Internal TestFlight, released **periodically and deliberately** (not per-merge). James enrolled in the Apple Developer Program 2026-07-28 (approval pending) |
| Bundle ID | `haus.waffle.ergomatic` (permanent) |
| Native auth | **A1: ID-token verification** — system browser (ASWebAuthenticationSession) → Google ID token (new iOS OAuth client, no secret) → `POST /api/auth/native` verifies signature+audience via Google JWKS → Phase 2's email_verified/allowlist/upsert path → opaque bearer (same hashed `sessions` row) → iOS Keychain. serverAuthCode exchange rejected (more parts, no needed benefit) |
| Versioning | **B1: git-tag-derived (hatch-vcs style)** — annotated `vX.Y.Z` tags are the only authority; build number = `git rev-list --count HEAD`; full `git describe` in `/api/health.version`, shown in-app once an About/You-version surface exists (deferred to Phase 9 preferences work; explicitly not in Phase 3). semantic-release rejected (auto-versions every merge; contradicts periodic cadence) |
| Release discipline | `docs/RELEASING.md` guide rule + standing per-merge release recommendations from Claude (see below) |
| Android | Not now; door open (`npx cap add android` later) |

## Shell

- `@capacitor/core` + `@capacitor/ios` in the existing `app/` package.
  `capacitor.config.ts`: appId `haus.waffle.ergomatic`, appName `Ergomatic`,
  webDir `dist/client`. Bundled local assets; NEVER remote-URL mode.
- Generated `ios/` native project is committed. `.gitignore` gains the
  Capacitor/Xcode transients (`ios/App/Pods`, `DerivedData`, etc. — exact list
  at plan time).
- Phase 3 plugins only: `@capacitor/browser`, keep-awake, secure
  storage/Keychain (exact packages + versions registry-verified at plan
  time; standing version rule applies). Native BLE deliberately NOT
  installed until Phase 7.
- `app/src/platform.ts`: `isNative()` wrapping `Capacitor.isNativePlatform()`
  — the single platform switch. Web bundle imports no other Capacitor API.
- The shell points at the production API (`https://ergomatic.waffle.haus`);
  the server's CORS posture: no CORS headers needed (capacitor fetches are
  not subject to a server origin allowlist for non-cookie bearer requests;
  the Origin check exempts bearer — below).

## Native auth

Flow: sign-in (native) → Browser plugin opens the Google auth URL for
`GOOGLE_IOS_CLIENT_ID` (custom-scheme redirect per the plugin's pattern) →
app receives the **ID token** → `POST /api/auth/native {idToken}` →
server: verify signature + `aud === GOOGLE_IOS_CLIENT_ID` + issuer + expiry
against Google's JWKS (`jose` or openid-client helper — pinned at plan time)
→ claims `{sub, email, email_verified, name}` → EXACTLY Phase 2's gate
sequence (email_verified → existing-sub upsert | allowlist → create) →
`sessions.createSession(user.id)` → respond `{token, expiresAt, user}`.

- Bearer channel: app stores token in iOS Keychain; sends
  `Authorization: Bearer <token>` on every request. Sign-out: `POST
  /api/auth/signout` (bearer works there too) + Keychain wipe.
- `requireUser` accepts the session cookie OR the bearer header (same
  hashed-token lookup, same rolling refresh — refresh responses include the
  new expiry in a response header the native client can read;
  cookie behavior unchanged).
- Origin check: requests authenticating via bearer are EXEMPT (no ambient
  credential → no CSRF surface). Cookie requests keep the existing check.
- `/api/auth/native` returns 503 + clear message when `GOOGLE_IOS_CLIENT_ID`
  is unset (mirrors web's missing-env behavior; boot warning added).
- New env: `GOOGLE_IOS_CLIENT_ID` (compose + .env.example + docs/deploy.md
  Google section: create an "iOS" type OAuth client, no secret, bundle ID
  `haus.waffle.ergomatic`).

## Versioning (tag-derived)

- Annotated tags `vX.Y.Z`. `app/scripts/version.sh` outputs:
  `VERSION` (latest tag, stripped `v`), `BUILD` (`git rev-list --count HEAD`),
  `DESCRIBE` (`git describe --tags --always`).
- iOS build pipeline stamps VERSION/BUILD into the Xcode project
  (`agvtool`/plist script — pinned at plan time) as part of
  `pnpm ios:build` (= web build + `cap sync` + stamp).
- `/api/health` gains `version: <DESCRIBE>` (server learns it at build time
  via a Vite/tsc define or env — pinned at plan time; must not require git
  at runtime in the container).
- First tag: `v0.1.0` at phase completion, through the runbook.

## Release discipline (`docs/RELEASING.md`)

- **Release when**: native-relevant changes (auth/session flow, timer,
  Capacitor config/plugins), completed user-visible capability, security
  fix, or James asks.
- **Don't release for**: web-prototype iterations, docs, infra/CI,
  invisible refactors.
- **Standing behavior (CLAUDE.md + Claude memory)**: after every merge to
  main, Claude posts an explicit recommendation — "TestFlight release
  recommended: <reasons>" or "No release needed: <reason>" — derived from
  the PR contents.
- **Runbook**: `git tag -a vX.Y.Z -m "..."` + push tag → `pnpm ios:build` →
  Xcode archive → Distribute → internal TestFlight (no Beta App Review).
  Target ≤15 min. Includes the 90-day internal-build expiry note.
- **API-skew rule**: TestFlight builds lag the continuously-deployed server,
  so API changes must be **additive-only between tags** (HTTP twin of the
  expand-only migration rule). A breaking change forces a coordinated tag.

## Testing

- Unit: `/api/auth/native` with stubbed verification (valid, expired,
  wrong audience, email_verified=false, allowlist deny/existing/new);
  `requireUser` bearer mode (valid/invalid/expired; refresh header);
  origin-check bearer exemption.
- Integration (Testcontainers): mint bearer via the native endpoint path
  (verification stubbed at the JWKS boundary), use it, sign out.
- Coverage ≥90 maintained. Xcode/simulator/device verification is
  runbook-driven, not CI (no macOS CI).
- Web-unchanged proof: full existing suite green; prototype deploy after
  merge verified live.

## Activation (human-in-the-loop, gated on Apple approval)

1. Apple Developer approval lands (enrolled + paid 2026-07-28).
2. Xcode signed in to the team; automatic signing for `haus.waffle.ergomatic`.
3. Google Cloud: create the iOS OAuth client; `GOOGLE_IOS_CLIENT_ID` to host
   `.env`; container recreate.
4. App Store Connect: create the app record; first archive/upload; add
   internal testers (household).
5. Exit: James signs in and sees his account in the TestFlight build; logs
   show bearer sessions; web app verified unchanged; `v0.1.0` tagged via the
   runbook.

## Out of scope

Native BLE (Phase 7), keep-awake *usage* (wired in Phase 6; installed now),
Apple sign-in / HealthKit (triggered follow-ons), Android target, live-update
tooling (Capgo etc. — web prototype covers fast iteration instead).
