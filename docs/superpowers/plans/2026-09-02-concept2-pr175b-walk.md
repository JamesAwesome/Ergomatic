# PR1.75b — the native Concept2 link, on device (walk card)

**What this proves:** that a real Concept2 consent, completed on the phone,
comes back into the app and writes a link. Nothing in this repo's own gates
can reach that code: the plugin is Swift with no test target, `src/native/**`
is coverage-exempt, and `pnpm e2e` runs on web. This card is the whole
instrument.

**No erg. No rowing budget.** About 20 minutes, most of it setup.

> **Run every block below in `bash`** — type `bash`, paste, and `exit` when
> you are done with that terminal. These are bash snippets (`set -a`,
> `export FOO=...`, `VAR=value cmd`) and this machine's default shell is
> **fish**, which rejects all three forms. Nothing here is fish-compatible and
> nothing here should be translated on the fly.

## Before you start

You need: the phone on the same machine's Xcode, `cloudflared`
(`brew install cloudflared`), Docker for the dev Postgres, and the log-dev
Concept2 credentials that live in **`/Users/james/projects/github/jamesawesome/Ergomatic/.env`**
(the MAIN checkout -- the worktree has no `.env`). That file holds
`LOGBOOK_CLIENT_ID_DEV` and `LOGBOOK_CLIENT_SECRET_DEV`. **Never echo them,
never paste them into a report.**

Confirm in the log-dev portal (Profile -> Edit Profile -> Applications ->
your app -> Callback endpoints) that BOTH rows still exist:
`https://<anything>/api/concept2/callback` and
`haus.waffle.ergomatic://oauth/callback`. The second was added 2026-09-02 and
the desk pre-check (design §GO/NO-GO, D3 PASS) confirmed the authorization
server honours it.

On the **PHONE**, open Safari, go to `https://log-dev.concept2.com`, sign in,
and confirm you are signed in. This is the precondition for the ephemeral
check in (a): without an existing Safari session, being asked to log in
proves nothing.

All commands below run from **`/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b`**
unless a block says otherwise.

## 1. Postgres

CLAUDE.md's long-lived `erg-dev-pg` dev container may already hold host port
5433 -- check first: `docker ps --filter publish=5433`. If it is taken, either
reuse that container (point `DATABASE_URL` at it below; this walk's migrations
apply at server boot) or pick a free port with `-p 5434:5432` and adjust every
`DATABASE_URL` in this card to match.

```
docker run --rm -d --name erg-walk-pg -p 5433:5432 -e POSTGRES_PASSWORD=dev postgres:18.4
```

## 2. The tunnel

In its own terminal:

```
cloudflared tunnel --url http://localhost:8080
```

It prints a line like `https://something-random.trycloudflare.com`. **That is
`<TUNNEL>` for the rest of this card.** Leave it running. HTTPS matters: the
app's `Info.plist` carries no `NSAppTransportSecurity` key, and every request
goes through native `URLSession` (`CapacitorHttp` is enabled in
`capacitor.config.ts:7-11`), so a plain `http://` LAN address is blocked by
App Transport Security. The tunnel host needs no Concept2 registration -- the
native leg's `redirect_uri` is the app scheme, not a URL.

## 3. The API server

In its own terminal, from `app/`. Read the two Concept2 values out of the main
checkout's `.env` without printing them:

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b/app
set -a; . /Users/james/projects/github/jamesawesome/Ergomatic/.env; set +a
export GOOGLE_IOS_CLIENT_ID="$(bash scripts/ios-google-client-id.sh ios/App/App/Info.plist)"
DATABASE_URL=postgres://postgres:dev@localhost:5433/postgres \
C2_LINK_ENABLED=1 \
C2_BASE_URL=https://log-dev.concept2.com \
C2_CLIENT_ID="$LOGBOOK_CLIENT_ID_DEV" \
C2_CLIENT_SECRET="$LOGBOOK_CLIENT_SECRET_DEV" \
AUTH_VIA_LOG=1 \
SITE_URL=https://<TUNNEL> \
ALLOWED_EMAILS=james@jamestheaweso.me \
pnpm dev:server
```

It should print `ergomatic api listening on :8080`.

**You WILL see `WARNING: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not fully set
— sign-in is DISABLED (auth routes will 503)` (`server/index.ts:76`), and it
is expected.** That disables the WEB sign-in route only. Native sign-in — the
one the phone uses — gates on `GOOGLE_IOS_CLIENT_ID` alone
(`server/index.ts:79-83` builds `nativeVerifier` from it, and
`server/auth/routes.ts:101-104` is the route that 503s without it), and step 3
exports it. Ignore this warning.

**The only warning that stops the walk is `WARNING: C2_LINK_ENABLED=1 but
C2_CLIENT_ID / C2_CLIENT_SECRET not fully set — Concept2 linking is DISABLED`
(`server/index.ts:126`).** If that appears the credentials did not load --
stop here, the whole walk is unrunnable.

`SITE_URL` is set for coherence, not necessity: native requests carry a bearer
and skip the origin check entirely (`server/auth/middleware.ts:50-53`), and
there is no CORS middleware. It only controls the WEB callback's redirect.

`AUTH_VIA_LOG=1` turns on the credential instrument this walk exists to read
(`server/auth/middleware.ts:113-124`) -- one JSON line per authenticated
request with `authVia`, `bearerPresent`, `cookiePresent` and `path`, never a
token value.

## 4. The build

In a third terminal, from `app/`:

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b/app
export VITE_ENABLE_C2_LINK_PROBE=1
export GOOGLE_IOS_CLIENT_ID="$(bash scripts/ios-google-client-id.sh ios/App/App/Info.plist)"
ERGOMATIC_API_BASE=https://<TUNNEL> pnpm ios:build
pnpm ios:open
```

`pnpm ios:build`'s last step, `scripts/ios-version.sh:12-13`, stamps
tag-derived version numbers into the Xcode project -- **watch for
`ios-version: stamped <VERSION> (<BUILD>)` in the output; that line is the
success signal.** It rewrites two TRACKED files, `App.xcodeproj/project.pbxproj`
and `App/Info.plist` -- expected, and restored in §7 before anything is
committed.

`ERGOMATIC_API_BASE` becomes `VITE_API_BASE` (`package.json:29`);
`GOOGLE_IOS_CLIENT_ID` becomes `VITE_GOOGLE_IOS_CLIENT_ID`, and it **defaults
to empty** if you skip it, which builds a bundle whose Google sign-in is
silently dead. Then Run to the phone from Xcode.

**Do NOT release this build.** `pnpm ios:release` refuses outright while
`VITE_ENABLE_C2_LINK_PROBE` is exported (`scripts/ios-release.sh:42-45`), and
the last step of this card unsets it anyway.

## 5. The five checks

Sign in on the phone first (Google), then go to the **You** tab and scroll to
the bottom for **C2 LINK PROBE (DEV HARNESS)** -- it sits second from the
bottom, above the diagnostics row. If the card is not there the build did not
carry the flag -- stop and re-check step 4.

**How to read the card's three lines.**

- `Link status: not available (C2_LINK_ENABLED is off)` is NOT the same as
  `not linked`. The server answers `{available:false}` with HTTP 200 when the
  flag is off, so the card names that case separately; if you see it, the
  server in step 3 did not get `C2_LINK_ENABLED=1`.
- **`Last outcome: cancelled` together with `Link status: linked` is a
  RESULT, not a cancellation.** It means the mint authenticated by COOKIE, so
  the server issued the WEB redirect, Concept2 redirected to our https
  callback inside the sheet, the link completed server-side, and you dismissed
  a page the session was never going to hand back. **Record it** -- it is
  direct evidence on the "can a native request carry a cookie" question this
  walk exists to answer, and the `auth_via` lines in check (e) will show it
  too. **On THIS walk the web-callback explanation cannot occur** (the
  tunnel's `https://<TUNNEL>/api/concept2/callback` is not registered at
  Concept2, so an in-sheet web redirect would show D3's error page instead);
  the `auth_via` lines in check (e) are the authority on what actually
  happened if you see this pairing.
- `Last outcome: networkError` means the request never reached the server at
  all -- almost always the cloudflared tunnel. Restart the tunnel, rebuild
  with the new `<TUNNEL>` host, and start the check again.
- **`Link status: unreadable (the request failed)` means the STATUS read
  itself failed** -- the card is telling you it does not know, rather than
  showing you a line from before the request that never answered. Same cause
  as `networkError`, same fix: the tunnel. **Never record a status while this
  is on screen**; tap **Re-read link status** until it says something else.

**(a) A real link.** The card should read `Link status: not linked`. Tap
**Start real link (log-dev)**.

- A sheet slides up showing Concept2's sign-in page. **RECORD: did the sheet
  ask you to log in again**, despite the Safari session you established
  above? YES = `prefersEphemeralWebBrowserSession` is in effect. NO = the
  sheet inherited Safari's cookies and the control is not working -- that is
  a FAIL, not a nicety.
- **RECORD: did any OS modal appear first**, asking permission to use
  Concept2's sign-in ("wants to use concept2.com to sign in")? Yes/no, and
  screenshot it if it does.
- Log in and approve. The sheet should dismiss ITSELF.
- **RECORD** what the card now reads: `Last outcome:`, `Callback carried
  state:` (this is the `state`-echo measurement), and `Link status:`. A PASS
  is `Last outcome: linked` and `Link status: linked (C2 user NNNN, H)`.
- **RECORD: did anything escape the session?** If the app visibly re-launched,
  flashed, or reloaded when the callback arrived, the URL went through the
  OS's URL-type routing rather than the session. It should not. This is the
  Info.plist-necessity observation.
- Photograph the card.

**(b) Cancel.** Tap **Start real link**, then dismiss the sheet with its own
Cancel/X. (An already-linked account can re-link -- `POST /connect` has no
already-linked refusal, `routes/concept2.ts:212-277`.)

- **RECORD:** `Last outcome: cancelled`, and `Callback carried state: n/a`.
- **RECORD** that the attempt survives: tap **Start real link** again and
  confirm a NEW sheet opens (a second mint succeeding is the observable). In
  the server terminal you should see a second `POST /api/concept2/connect`
  and NO `/api/concept2/exchange` between them.

**(c) Decline at Concept2.** Start a link, log in if asked, then use
Concept2's own **Deny**/**Cancel** on the consent screen.

- **RECORD:** `Last outcome: declined`, and that the server log shows no
  `exchange` request.

**(d) Reload mid-session.** Tap **Start real link**, and with the sheet OPEN,
reload the web view: attach Safari on the Mac (Develop -> your phone -> the
Ergomatic web view) and press its reload button.

This works because the build you just ran from Xcode is a **Debug** build:
`app/ios/debug.xcconfig` sets `CAPACITOR_DEBUG = true` and is the base
configuration for both Debug configs (`project.pbxproj:195,316`), which is
what makes `WKWebView.isInspectable` true. **A Release/TestFlight build cannot
be inspected at all** and this check is impossible on one
(`docs/history/phase-lt.md:185-190` is the phase that learned it the hard way).

- **PASS CRITERION: a FRESH `Start real link` works after the reload.** That
  is the whole observable. Tap it and confirm a new sheet opens; in the server
  terminal you should see a new `POST /api/concept2/connect`.
- **Do NOT expect to see the `abandoned` outcome on the card.** The rejection
  lands in a document that is being destroyed, so nothing renders it — the
  card comes back reading `Last outcome: none yet` (fresh document). The
  rejection's job is to release the native claim, and "a fresh link works" is
  how you observe that it did.
- **STOP condition:** the sheet lingers with no receiver, or every later tap
  does nothing / the card shows `Last outcome: busy`. That is the claim
  leaking — the `abandoned` path failing — and it is Task 7's named STOP.
- **Optional second producer, and it MEASURES AN INFERENCE:** a WebContent
  process termination makes Capacitor call `bridge?.reset()` +
  `webView.reload()` (`WebViewDelegationHandler.swift:158-162`, read in the
  source). Whether that recovery reload re-enters the policy decision with a
  MAIN-FRAME target frame — which is what the plugin's guard needs to release
  the claim — is UNVERIFIED. This variant is the only thing that can settle
  it. Force a termination from Safari's inspector (Develop -> the web view ->
  the process/Timelines menu, or just leave a heavy page thrashing until iOS
  kills it) with the sheet open, and record the same pass criterion: does a
  fresh `Start real link` work afterwards, or does the card read `busy`?
  **`busy` here is NOT a walk failure** — it falsifies an inference the plan
  already labelled as one, and belongs in the report as a finding. Skip it if
  it does not reproduce in a couple of minutes; the reload case is the one
  that gates.

**(e) The credential readings.** In the server terminal, copy EVERY
`{"event":"auth_via",...}` line produced during the whole walk into the
report. For each, note `authVia`, `bearerPresent`, `cookiePresent`. Also copy
any `{"event":"auth_disagreement",...}` line (there should be none).

## 6. Write the report

`docs/monitor/sessions/walk-2026-09-0X-c2-native/README.md` (use today's
date), containing:

- Build: the git SHA, the marketing/build version Xcode showed, the tunnel
  host, `C2_LINK_ENABLED=1`, `C2_BASE_URL=https://log-dev.concept2.com`.
- A PASS/FAIL line per check (a)-(e).
- The two design-mandated measurements, as their own headings:
  **`state` echoed on the private-use callback: YES / NO**, and
  **Info.plist entry needed (i.e. anything escaped the session): YES / NO**.
- The OS-modal observation from (a).
- **The ephemeral-session RECORD from (a):** did the sheet ask you to log in
  again despite the Safari session you established under "Before you start"
  (YES/NO), and its PASS/FAIL reading (YES = `prefersEphemeralWebBrowserSession`
  in effect and PASS; NO = a FAIL).
- **Optional (d) variant:** attempted YES/NO; if attempted, does a fresh link
  work after a WebContent termination? YES/NO.
- The pasted `auth_via` lines (and any `auth_disagreement` line, per (e)), and
  the conclusion they support about whether a native request can ever carry a
  cookie -- which is the evidence the app-wide disagreement REFUSAL is waiting
  on (design §1; promotion is a stated follow-up, not this PR).
- The photographs.

## 7. Afterwards

```
unset VITE_ENABLE_C2_LINK_PROBE
docker rm -f erg-walk-pg
```

Stop `cloudflared` and the dev server. The phone build is disposable; the next
real TestFlight build goes out through the normal `pnpm ios:release`.

**Restore the two stamped files before committing anything.** Step 4's build
ran `agvtool` and rewrote two tracked files with version stamps:

```
git -C /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b diff --stat -- app/ios
```

That must show ONLY `project.pbxproj` and `Info.plist` (the four version
keys). Then:

```
git -C /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b restore app/ios/App/App.xcodeproj/project.pbxproj app/ios/App/App/Info.plist
```

Never commit version stamps (Global Constraint).

---

## Pre-flight (RF13) — run or read on 2026-09-02 at head `b8900c83`

Every command and citation in this card was executed, or read against the code
that serves it, before the card reached James. RUN = executed on this machine
today. READ = checked against the named source at this head.

| # | Command / claim | RUN or READ | What it printed / what the code says |
| - | --------------- | ----------- | ------------------------------------ |
| a | `docker ps --filter publish=5433` | RUN | **Header only — port 5433 is FREE today.** No `erg-dev-pg`, and no stopped container holds the name `erg-walk-pg`. **The §1 branch that applies today is the plain `docker run` line as written** — no port substitution needed. `postgres:18.4` is already pulled locally. |
| b | `cloudflared --version` | RUN | `cloudflared version 2026.8.2 (built 2026-08-14T11:22:52Z)` |
| b | `cloudflared tunnel --url http://localhost:8080` | RUN (~15 s, then killed) | Confirmed the QUICK-TUNNEL form: `INF Requesting new quick Tunnel on trycloudflare.com...`, then `Your quick Tunnel has been created! Visit it at ...` and the host `https://armed-nation-desirable-bidder.trycloudflare.com`. Host shape is four hyphenated words; the `ERR ... context canceled` lines at the end are only the SIGTERM teardown. No tunnel left running. |
| c | `/Users/james/projects/github/jamesawesome/Ergomatic/.env` | RUN | File exists (191 bytes). `grep -c "^LOGBOOK_CLIENT_ID_DEV=\|^LOGBOOK_CLIENT_SECRET_DEV="` = **2**. Names only were ever printed. The card's `set -a; . <.env>; set +a` form was executed in a subshell: exit 0, both variables set, non-empty and exported. |
| d | `bash app/scripts/ios-google-client-id.sh app/ios/App/App/Info.plist` | RUN | `896004543555-9m5cf46vdgf57dv1r68u7stad6ngi304.apps.googleusercontent.com` (exit 0) — the forward-form public client id, as §3/§4 need. |
| e | §3's whole env block, with the real credentials | **RUN end to end** | Booted against the `erg-walk-pg` container. Log: `migrations up to date` / `global starter library seeded (idempotent)` / `WARNING: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not fully set — sign-in is DISABLED (auth routes will 503)` / `ergomatic api listening on :8080`. **The GOOGLE warning is the ONLY warning**, exactly as §3 says; **the C2 stop-condition warning did NOT appear** (credentials loaded); no `GOOGLE_IOS_CLIENT_ID not set` warning, so the export line works. No secret appeared in the log. Server and container both torn down. |
| e | `server/index.ts:76`, `:79-83`, `:126`, `:163` | READ | 76 = the GOOGLE_CLIENT_ID warning string; 79-80 build `iosClientId`/`nativeVerifier` and 81-83 its warning; 126 = the C2 warning string; 163 = `` console.log(`ergomatic api listening on :${port}`) ``, with `port` defaulting to 8080 at `:150`. All four citations correct. |
| e | `server/auth/routes.ts:101-104` | READ | 101 = `router.post("/api/concept2/..."` — precisely, `router.post("/api/auth/native", ...)`; 102 `if (!nativeVerifier)`; 103-104 the `503`. Correct. |
| e | `server/auth/middleware.ts:50-53` | READ | `if (bearerToken(req)) { next(); return; }` inside the mutating-method origin check — a bearer does skip the origin check. Correct. |
| f | `server/auth/middleware.ts:113-124` | READ | `if (process.env.AUTH_VIA_LOG === "1")` then `console.log(JSON.stringify({ event: "auth_via", authVia, bearerPresent, cookiePresent, path }))`. Emits exactly the four fields §3 and check (e) name, and no token value. `auth_disagreement` is a real sibling event at `:101`. |
| g | `pnpm ios:build` = `package.json:29` | READ | `VITE_API_BASE=${ERGOMATIC_API_BASE:-…} VITE_GOOGLE_IOS_CLIENT_ID=${GOOGLE_IOS_CLIENT_ID:-} vite build && npx cap sync ios && bash scripts/ios-version.sh`. Both env mappings and the empty default are as §4 states. |
| g | `scripts/ios-version.sh:12-13`, and its stamp line at `:14` | READ + RUN | 12-13 are the two `agvtool` calls; 14 prints `ios-version: stamped $VERSION ($BUILD)`. Its guard (`command -v agvtool` and `xcode-select -p | grep Xcode`) was evaluated on this machine and **passes** (`/usr/bin/agvtool`, `/Applications/Xcode.app/Contents/Developer`), so the stamp line WILL appear rather than the skip warning. `bash ../scripts/version.sh` was run: `VERSION=0.34.0 BUILD=840`, so expect **`ios-version: stamped 0.34.0 (840)`**. |
| h | `pnpm ios:open` | READ | `package.json:30` = `npx cap open ios`. Exists. |
| i | `scripts/ios-release.sh:42-45` | READ | `if [ -n "${VITE_ENABLE_C2_LINK_PROBE:-}" ]; then echo "ios-release: refusing …" >&2; exit 1; fi`. The refusal §4 promises, at exactly those lines. |
| j | `docs/history/phase-lt.md:185-190` | READ | "**The pre-save storage dump is IMPOSSIBLE on a TestFlight build.** `WKWebView.isInspectable` defaults false since iOS 16.4; Capacitor sets it from `CAPACITOR_DEBUG`, whose xcconfig is the base configuration for the DEBUG configs only, and `ios-release.sh` archives `-configuration Release`." Supports §4(d)'s claim. |
| — | `project.pbxproj:187,308` (§(d)) | READ | **CARD CORRECTED.** Those are the line numbers on `origin/main`; this PR adds 8 lines to `project.pbxproj`, so at this head the two `baseConfigurationReference = … debug.xcconfig` lines are **195 and 316** (their configs are the `name = Debug;` blocks at 255 and 335). The card now cites `195,316`. `app/ios/debug.xcconfig` does contain exactly `CAPACITOR_DEBUG = true`. |
| — | `capacitor.config.ts:7-11`; no `NSAppTransportSecurity` | READ | 7-11 are the `CapacitorHttp: { enabled: true }` block. `grep NSAppTransportSecurity ios/App/App/Info.plist` is empty. Both §2 claims hold. |
| — | `haus.waffle.ergomatic://oauth/callback` is the native `redirect_uri` | READ | `server/routes/concept2.ts:67` — `export const NATIVE_REDIRECT_URI = "haus.waffle.ergomatic://oauth/callback"`, used at `:243`/`:475`. The scheme is also declared in `Info.plist` (`CFBundleURLName` `Concept2Link`, added by this PR), so §5(a)'s "did anything escape the session" is a live question rather than a guaranteed no-op. |
| — | `routes/concept2.ts:212-277` has no already-linked refusal | READ | The route is `POST /api/concept2/connect` (212-279); its only guards are `available()` and `weightClass`. The two "already linked" strings live elsewhere — `renderCallbackPage("alreadyLinked")` in the WEB callback (`:391`) and the `409 already_linked_elsewhere` in `POST /exchange` (`:496`), which fires only when the C2 account belongs to a DIFFERENT app user. §5(b)'s parenthetical is safe. |
| — | `{available:false}` with HTTP 200 when the flag is off | READ | `GET /api/concept2/link` (`:513`): `res.json({ available: false })` with no status override, and a comment naming it "the matrix's one non-403 row". §5's first bullet holds. |
| — | Every card string the checks ask you to read | READ | `src/monitor/Concept2LinkProbe.tsx`: `C2 LINK PROBE (DEV HARNESS)` (`:187`), `Link status: …` (`:188`), `Start real link (log-dev)` (`:195`), `Last outcome: …`/`none yet` (`:197`), `Callback carried state: …` (`:198`), `Re-read link status` (`:205`), `unreadable (the request failed)` (`:116`), `not available (C2_LINK_ENABLED is off)` (`:120`), `linked (C2 user N, H)` (`:127`), and `n/a` (`:79`). Every outcome the card names — `linked`, `cancelled`, `declined`, `networkError`, `busy`, `abandoned` — is a real `LinkOutcome` member in `src/adapters/linkFlow.ts:77-102`. |
| — | The probe's position ("second from the bottom, above the diagnostics row") | READ | `src/You.tsx:97-101` renders `<Concept2LinkProbe/>` immediately before the `DIAGNOSTICS` `<Link>` at `:112`, which is the last child. Gated at `src/You.tsx:19-20` by `import.meta.env.DEV || VITE_ENABLE_C2_LINK_PROBE === "1"` — and `ios:build` is a production build, so §4's `export` is genuinely required. |
| — | `WebViewDelegationHandler.swift:158-162` | READ | `open func webViewWebContentProcessDidTerminate(_:)` at 158, `bridge?.reset()` at 160, `webView.reload()` at 161. §5(d)'s optional variant cites it correctly. |
| — | `design §GO/NO-GO, D3 PASS`; `design §1` | READ | `docs/superpowers/specs/2026-09-02-concept2-pr175-app-bind-design.md` — `## GO/NO-GO, settled first` at `:36`, and `D3 PASS (2026-09-02)` at `:651`/`:664-665`. The disagreement-refusal discussion is at `:256-263`. Both references resolve. |
| k | Every block is bash; the card says so up top | READ | The seven fenced blocks use `docker run`, `cloudflared`, `cd`/`set -a`/`export`/`VAR=value cmd`, `unset`, `docker rm`, and two `git -C` forms. All are bash, none are fish-compatible, and the blockquote under the title says to run them in `bash`. |
| l | The phone-Safari precondition for (a)'s ephemeral RECORD | READ | Present under "Before you start": sign in to `https://log-dev.concept2.com` in phone Safari first, with the reason ("without an existing Safari session, being asked to log in proves nothing"). |
| m | Every RECORD line has a slot in §6's report template | READ | (a) ephemeral RECORD → §6 bullet 5; (a) OS-modal RECORD → §6 bullet 4; (a) `Last outcome`/`Link status` → §6 bullet 2; (a) `Callback carried state` → §6 bullet 3's `state`-echo heading; (a) escape RECORD → §6 bullet 3's Info.plist heading; (a) photograph → §6 last bullet; (b) and (c) RECORDs → §6 bullet 2 (per-check PASS/FAIL); (d) pass criterion → §6 bullet 2, and its optional variant → §6 bullet 6; (e) `auth_via`/`auth_disagreement` → §6 bullet 7. **No RECORD is left without a slot.** |

**The one card change:** `§5(d)`'s `project.pbxproj:187,308` became
`project.pbxproj:195,316` — the original numbers were correct on `origin/main`
and stale by exactly the 8 lines this PR adds to that file. Nothing else in
the card was altered.
