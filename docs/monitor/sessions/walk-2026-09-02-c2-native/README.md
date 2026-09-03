# Walk 2026-09-02 — Wave E PR1.75b, the native Concept2 link on device

Purpose: the card at
`docs/superpowers/plans/2026-09-02-concept2-pr175b-walk.md` — prove that a
real Concept2 consent, completed on the phone, comes back into the app and
writes a link. **No other instrument in this repo can reach that code:**
`WebAuthPlugin.swift` has no test target, `src/native/**` is `v8 ignore`d,
and `pnpm e2e` runs on web (design §Testing, RF19). This walk is the whole
gate for the Swift plugin.

No erg, no rowing. ~15 minutes, 07:30–07:45 local, James on the phone with
the controller running the lab.

## Provenance

| Piece | Value |
| --- | --- |
| Branch / head | `wave-e-pr175b-native` @ `aba9e5ce` |
| Build | `ios-version: stamped 0.34.0 (841)`, Debug, run to the phone from Xcode |
| Device | James's iPhone (iOS version NOT recorded) |
| Build flags | `VITE_ENABLE_C2_LINK_PROBE=1`, `ERGOMATIC_API_BASE=https://conviction-pulled-bin-treat.trycloudflare.com`, `GOOGLE_IOS_CLIENT_ID` derived by `scripts/ios-google-client-id.sh` |
| API | local `pnpm dev:server` on :8080, `C2_LINK_ENABLED=1`, `C2_BASE_URL=https://log-dev.concept2.com`, `AUTH_VIA_LOG=1` |
| DB | Postgres 18.4, container `erg-walk-pg`, host port 5433 |
| Tunnel | cloudflared quick tunnel `https://conviction-pulled-bin-treat.trycloudflare.com` |
| Evidence | `a-linked.png`, `c-declined.png`, `auth-via.log` |

Lab boot was clean: `migrations up to date`, `ergomatic api listening on
:8080`, the expected `GOOGLE_CLIENT_ID` warning (web sign-in only —
card §3) and **no** `C2_LINK_ENABLED=1 but … Concept2 linking is DISABLED`
warning, i.e. the log-dev credentials loaded. `/api/health` through the
tunnel answered `{"ok":true,"db":true,"version":"dev"}`. The probe card was
on **You**, second from bottom, and first read `Link status: not linked`.

**Debug build, deliberately** — check (d) needs Safari Web Inspector, which
only attaches to a build whose base configuration sets `CAPACITOR_DEBUG`
(card §4; `docs/history/phase-lt.md:185-190` is the phase that learned it).

## Results

| Check | Result | Observable |
| --- | --- | --- |
| (a) a real link | **PASS** | `Last outcome: linked`, `Link status: linked (C2 user 2211, H)` |
| (b) cancel the sheet | **PASS** | `Last outcome: cancelled`; a second `Start real link` opened a new sheet |
| (c) decline at Concept2 | **PASS** | `Last outcome: declined`, no `/exchange` on that leg |
| (d) reload mid-session | **PASS** | a fresh `Start real link` worked after the reload; a new `POST /connect` in the server log |
| (e) credential instrument | **PASS** | 42 `auth_via` lines, all `bearer` / `bearerPresent:true` / `cookiePresent:false`; 0 `auth_disagreement` |

### `state` echoed on the private-use callback: **YES on success, NO on deny**

Both halves are MEASURED on this walk, and they disagree — which is the
finding:

- (a), a completed consent: `Callback carried state: yes` (`a-linked.png`).
- (c), Concept2's own **Deny**: `Callback carried state: no`
  (`c-declined.png`).

So Concept2's authorization server echoes `state` on the success redirect to
`haus.waffle.ergomatic://oauth/callback` and **omits it on the deny
redirect**. `state` is an undocumented pass-through there (design §Research:
zero occurrences in Concept2's OAuth reference), and this walk measures the
behaviour rather than the contract.

**What it changes:** `linkFlow.ts`'s `returnedState !== state` check is a
real control on the success leg — a callback that carries a foreign `state`
is refused before `/exchange`. It stays *defence in depth* rather than a
guarantee, because the deny leg proves the echo is not universal and the
exchange has never depended on it (the mint returns `state` explicitly,
design §3).

For (b) the card's `Callback carried state:` line was **not captured** —
expected `n/a` (a cancellation has no parsed callback), recorded here as not
observed rather than as an observation.

### Info.plist entry needed (did anything escape the session): **NOT DISTINGUISHABLE ON THIS BUILD**

James reported no visible re-launch, flash, or reload when the callback
arrived — "didn't notice a flash". The callback landed inside
`ASWebAuthenticationSession` and the sheet dismissed itself.

**That observation cannot answer the question this heading asks.** The
`CFBundleURLTypes` entry for `haus.waffle.ergomatic` IS registered at this
head, so "nothing escaped" is equally consistent with *the entry is not
needed* and with *the entry is needed and is present*. A build without the
entry is the only experiment that separates them, and this walk did not run
one. Recorded as: **registered at this head; no visible escape observed;
necessity NOT distinguishable on this build.** Design §0 decided to keep the
entry in advance, so nothing turns on it — but the record must not read as a
measurement it is not.

### OS consent modal with `ephemeral: true`: **NONE**

No "…wants to use concept2.com to sign in" modal appeared before the sheet.
The design (§Research) marks the claim that an ephemeral session suppresses
that alert **UNSOURCED** — no Apple page fetched during design states it.
This walk observed the absence on one device, one iOS version; it does not
establish that Apple documents or guarantees it.

### Ephemeral session (`prefersEphemeralWebBrowserSession`): **IN EFFECT — PASS**

Precondition, per the card: James signed into `https://log-dev.concept2.com`
in phone Safari before the walk. The link sheet then **asked him to log in
again**. That is the PASS reading — the session did not inherit Safari's
cookies. A NO here would have been an (a) FAIL, not a nicety: it is the
shared-phone half of the code-injection control (design §4, "a CONTROL, not
a preference").

### Optional (d) variant — WebContent-process termination: **ATTEMPTED, NOT REPRODUCED**

Two console memory-thrash scripts were run against the web view with a link
sheet open; **the content process never terminated**, so the recovery-reload
path was never entered. Skipped per the card ("skip it if it does not
reproduce in a couple of minutes; the reload case is the one that gates").

Consequence, and it is a fold decision rather than a silence: the
`INFERENCE, not measured` paragraph in `WebAuthPlugin.swift`'s
`shouldOverrideLoad` comment — whether a post-termination recovery reload
re-enters the policy decision with a MAIN-FRAME `targetFrame` — **stays as
written**, with a sentence added recording this attempt. The reload producer,
which is the one that gates, PASSED.

## (e) The credential readings

`auth-via.log` in this directory is the server terminal's own output, copied
verbatim. It contains no token values: `AUTH_VIA_LOG` prints booleans and a
path only (`server/auth/middleware.ts`). A
`grep -ciE "token|secret|bearer [a-z0-9]"` over it returns 1, and that one
line is the startup warning naming the *variable* `GOOGLE_CLIENT_SECRET`, not
a value.

- **42 `auth_via` lines. Every one of them:**
  `{"authVia":"bearer","bearerPresent":true,"cookiePresent":false}`.
  (37 counted mid-walk, 42 at teardown.)
- **0 `auth_disagreement` lines.** 0 errors.
- Concept2 path sequence over the whole walk (25 requests):
  `link link connect exchange link connect exchange link connect link connect
  exchange link connect link connect link connect link connect link connect
  link connect link`.
  Non-Concept2 traffic in the same log: 6 `/baselines`, 4 `/workouts`, 2
  `/logs`, 2 `/plan`, 2 `/prefs`, 1 `/api/me` — ordinary app requests, all
  bearer, all `cookiePresent:false`.

**Conclusion — a native request never carried a cookie on this walk.** This
is the evidence design §1's UNMEASURED premise was waiting on: whether the
shared native `HTTPCookieStorage` jar can ever carry `erg_session` for the API
origin. Across 42 authenticated native requests, including every Concept2
route, the answer was no in every instance. **Scope, stated honestly:** this
is 42 requests from one install against a dev server over a tunnel, with no
prior web sign-in on that origin in the native jar. It supports the
`bearer`-wins resolution and shows the app-wide disagreement instrument never
fired; it does not prove the jar CANNOT carry one. Promoting `/api/concept2/*`'s
hard `400 ambiguous_auth` refusal app-wide remains a James decision and a
still-owed ROADMAP line, not something this walk decides.

### Caveat on the exchange count (RF16)

Three `/exchange` requests were logged. James performed at least two full
approve-and-link legs and re-tapped `Start real link` once, and **which tap
produced the third exchange was not captured.** The decline path provably
never reaches `/exchange` (`linkFlow.ts` returns `declined` before the POST;
`app/src/adapters/linkFlow.test.ts` pins it) and the log shows no error, so
the third is **presumed** a third approve. Presumed, not measured — do not
cite this as three counted links.

## Photographs

- `a-linked.png` — the probe card after (a), 07:31: `Link status: linked (C2
  user 2211, H)`, `Last outcome: linked`, `Callback carried state: yes`.
- `c-declined.png` — the probe card after (c), 07:35: `Last outcome:
  declined`, `Callback carried state: no`, and `Link status:` still
  `linked (C2 user 2211, H)` (a decline leaves the earlier link alone, which
  is correct: the attempt is left to expire, never consumed).

No photograph was taken for (b) or (d); those checks' observables are the
card line and the server log, both recorded above.

## Teardown

Dev server, cloudflared tunnel and `erg-walk-pg` all stopped.
`pnpm ios:build`'s version stamps were reverted with `git restore` on
`app/ios/App/App.xcodeproj/project.pbxproj` and `app/ios/App/App/Info.plist`;
`git status --short -- app/ios` read empty before this report was committed
(card §7, Global Constraint: never commit version stamps).

## Scope

One iPhone (iOS version not recorded), build 0.34.0 (841) from
`aba9e5ce`, one Concept2 log-dev account (C2 user 2211), one morning, against
a laptop dev server over a quick tunnel. The live Concept2 portal was NOT
exercised — the private-use callback is registered at log-dev only, and the
live registration is a cutover step. Nothing here generalises beyond that.
