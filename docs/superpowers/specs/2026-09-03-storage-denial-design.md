# Storage denial is recoverable before work (AUD-011 / AUD-015)

**Date:** 2026-09-03 · **Wave:** F · **Class:** not TRIAD (no stored shape,
no number's meaning, no auth) · **Status:** DRAFT, awaiting James's review ·
**Gate 0:** ONE, on the Countdown blocked-start state (it changes what a
rower reads and what happens when they press Start).

## What and why

Two audit findings, one PR. **AUD-015:** `Countdown` builds the run, calls
`saveRun(run)`, throws its boolean away, and navigates to Timer — which
bounces straight back to Today when the write never landed. The rower
presses Start, watches a countdown, and arrives back where they began with
no explanation. **AUD-011:** three loaders call `localStorage.getItem`
outside any `try`, so a denied getter escapes as an exception rather than
reading as absent.

**The research changed AUD-011's shape and this spec is written from it**
(`docs/superpowers/research/2026-09-03-localstorage-getter-wkwebview.md`,
2026-09-03, summarised in §4 with its citations): **the getter cannot throw on the phone.** WebKit's
`localStorage` getter has exactly one throw, gated on
`canAccessResource(LocalStorage) == No`, whose three routes are an opaque
origin, a `file://`-equivalent local origin, and
`StorageBlockingPolicy::BlockAll`. Our origin is `capacitor://localhost`
(no `server` block in `capacitor.config.ts`, served by a
`WKURLSchemeHandler`), the blocking policy is embedder-set and neither
Capacitor nor we set it, and Lockdown Mode touches neither preference. So
no rower reaches that state by any setting on their phone.

**James's ruling (2026-09-03), on that evidence:** ship the three guards as
WEB-ARM hardening, and do NOT build a Retry surface for a denied getter —
a screen for a state the primary surface cannot enter. AUD-015's blocked
start is where the visible surface belongs, because a failed WRITE is
reachable everywhere.

---

## §1 — The three guards (AUD-011)

Three loaders read `localStorage.getItem` outside a `try`. Verified at
`127a0cef`:

| loader | file | the getter |
|---|---|---|
| `loadRun` | `app/src/session/run.ts` | `localStorage.getItem(RUN_KEY)` |
| `loadDraft` | `app/src/session/draft.ts` | `localStorage.getItem(DRAFT_KEY)` |
| `loadTodayPick` | `app/src/today/todayPick.ts` | `localStorage.getItem(TODAY_PICK_KEY)` |

**The audit's own list said `logDraft.ts` for the second; the loader lives
in `draft.ts`.** `loadTodayOverrides` (`todayOverrides.ts`) and
`logDoorDiagnostics` already read inside a `try`; `loadMonitorRun` was
closed at PR #239. Those three are the whole remaining set.

- **I-1** A denied getter reads as ABSENT, never as an exception. Each
  loader wraps the getter (not merely the `JSON.parse` that follows) in a
  `try` and returns `null` on any throw.
- **I-2 The catch is BARE, not `SecurityError`-typed.** The getter's
  non-throwing failure paths return `nullptr`, which surfaces to JS as a
  `TypeError` on property access, not a `SecurityError` — a typed catch
  would miss it (research §1's corollary).
- **I-3 The guard changes no successful path.** A present value, an absent
  key and malformed JSON all behave exactly as today; only the throwing
  case is new. In particular no guard SELF-CLEARS — PR #239's F-2 fix
  established that a loader must leave malformed bytes for their owner's
  deferred clear, and these three inherit that rule.

**Scope, stated because the research earned it:** these guards defend the
web arm — the dev loop, the Playwright harness, and the browser fallback —
where a user CAN block site data. On iOS they are unreachable hardening,
and the comment at each site says so, with the tripwire: **every argument
here rests on `server.iosScheme` being unset. Setting it to `"file"` makes
the origin local and the throw immediately reachable.**

## §2 — The blocked start (AUD-015)

`Countdown` (`app/src/session/Countdown.tsx`, the build effect) calls
`saveRun(run)` and ignores the boolean it returns, then navigates. When the
write fails, Timer's own guard sends the rower back to Today with nothing
said.

- **I-4** Countdown does not leave for Timer unless the active run is
  durable. On `saveRun(run) === false` it stays, and says so.
- **I-5** The rower is never trapped: the state offers **Retry** (attempt
  the write again) and **Row anyway** (proceed with a memory-only run,
  stated as such). This is the same shape PR #239 shipped for the
  hand-off's `COULD NOT KEEP THE RECORD ON THIS PHONE.` state, and it
  reuses that state's vocabulary rather than inventing a second one.
- **I-6** "Row anyway" does not lie: it names what the rower gives up (the
  row is not kept on this phone if the app closes), in the notes' voice,
  not a technical word.

**Gate 0 (the only one):** the rendered Countdown blocked-start state, both
orientations, against the current Countdown, with the two controls at
44 px and every colour pairing's contrast ratio stated as a number. The
copy is approved there, not here — the strings above are drafts.

## §3 — The composed test the anchor asked for

Three conditions came from the 2026-08-28 anchor pass. Two survive as
written; the third is retired by James's ruling.

1. **A Today fixture that actually reaches `loadTodayPick`.** The audit's
   mounted-Today probe never got there because `loadRun` (`Today.tsx`'s
   mount) throws first. The fixture needs a plan and a pool so the call is
   reached, and the leg asserts Today renders with a denied getter rather
   than crashing.
2. **One COMPOSED denial-then-Start test.** After I-1, a denied getter
   makes `loadRun()` return `null`, so Start PROCEEDS and then meets
   `saveRun === false` — a path neither finding's own tests cover, and the
   reason these two ship together. The leg drives Today → Start → the
   blocked state, under one denial.
3. ~~A Retry surface for the denied getter needs a non-retry exit.~~
   **RETIRED:** no such surface ships (the ruling above). The non-retry
   exit still exists where it is reachable — "Row anyway" on the blocked
   start, I-5.

## §4 — What the research settled, so nothing re-derives it

- **PRIMARY, WebKit `Source/WebCore/page/LocalDOMWindow.cpp`:** the
  `localStorage` getter has exactly ONE throw, gated on
  `canAccessResource(ResourceType::LocalStorage) == HasResourceAccess::No`.
- **PRIMARY, `Source/WebCore/dom/ScriptExecutionContext.cpp`:** for
  `LocalStorage` that returns `No` on exactly three routes — an opaque
  origin, an origin equivalent to local (`file://` and friends), and
  `StorageBlockingPolicy::BlockAll`. `BlockThirdParty`, WKWebView's
  default, returns `DefaultForThirdParty`, never `No`.
- **PRIMARY, `UnifiedWebPreferences.yaml`:** `StorageBlockingPolicy` is
  embedder-set; Lockdown Mode changes neither it nor `LocalStorageEnabled`.
- **Our origin is `capacitor://localhost`** — no `server` block in
  `app/capacitor.config.ts`, served by `WebViewAssetHandler.swift`. Not
  opaque, not local, not `BlockAll`.
- **Already vetted in-repo, cited not re-derived:** the WHATWG rule that a
  `SecurityError` fails EVERY access (antagonist ledger); `removeItem`
  carries no throw condition (same); the hand-off store already wraps its
  getter (`2026-08-30-handoff-protocol-design.md` §8); `loadMonitorRun` is
  off the list (PR #239).
- **Could not establish, named:** no device observation (source and config
  only); whether an MDM payload can reach `_WKStorageBlockingPolicy` on a
  third-party app; whether Screen Time's web-content restrictions touch
  storage rather than navigation. None of the three changes the shape: each
  would make the guards MORE useful, never less, and the guards ship
  regardless.
- **A Capacitor version correction:** the research brief said 7; the repo
  is on 8.5. The cited WebKit paths are current either way.

## §5 — Decomposition, gates, skips

One PR, four tasks, no migration and no stored shape.

1. The three guards + their unit legs (each: a getter that throws → the
   loader returns `null`; a getter that returns a malformed value → today's
   behaviour, unchanged). Mutation per leg: remove that guard → red.
2. Countdown's blocked start: the boolean honoured, the state rendered,
   Retry and Row anyway wired. Legs at the component. Mutation: ignore the
   boolean again → red.
3. The two composed tests from §3.
4. e2e + captures (the blocked state, both orientations), the ROADMAP tick,
   the release note line if the state is tester-visible (it is: a rower who
   fills their phone now reads a sentence instead of bouncing).

**Gates skipped, spoken:** no PM open gate (the scope is this spec and
James ruled it item by item); the antagonist pass on the plan is a DELTA
against the research's vetted ground — no novel mechanism, no session state,
no stored shape; no PM final gate (not TRIAD, and nothing a tester receives
beyond one blocked-start state whose copy Gate 0 approves).
