# Storage denial is recoverable before work (AUD-011 / AUD-015)

**Date:** 2026-09-03 · **Wave:** F · **Class:** not TRIAD (no stored shape,
no number's meaning, no auth) · **Status:** DRAFT, awaiting James's review; hardened 2026-09-03 (lens 1 —
two claims falsified and folded, see §1 scope, §2 and §3) ·
**Gate 0:** ONE, on the Countdown blocked-start state —
**APPROVED by James 2026-09-03** (`2026-09-03-blocked-start-gate.html`, all
four decisions as proposed; see §2).

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
**dev loop and the browser fallback**, where a user can block site data
(Safari's "Block all cookies", Chrome/Firefox site-data blocking). The
Playwright harness is where the denial is SIMULATED, not a context that
blocks storage on its own — no test sets one. On iOS the guards are
unreachable hardening.

**The tripwire goes where the change would be made:** a line in
`app/capacitor.config.ts` (which today has no `server` block at all),
repeated in one line at each loader — **every argument here rests on
`server.iosScheme` being unset; setting it to `"file"` makes the origin
local and the throw immediately reachable.** A comment living only at the
three loaders is not on the path an agent editing the Capacitor config
walks (RF18).

## §2 — The blocked start (AUD-015)

`Countdown` (`app/src/session/Countdown.tsx`, the build effect) calls
`saveRun(run)` and ignores the boolean it returns, then navigates. When the
write fails, Timer's own guard sends the rower back to Today with nothing
said.

- **I-4** Countdown does not leave for Timer unless the run it just wrote
  READS BACK. `saveRun`'s boolean means only that `setItem` did not throw —
  there is no read-back in it (`app/src/session/run.ts`). So Countdown
  confirms with the consumer's own loader, once, at the one place it
  matters: `saveRun(run) === true` AND `loadRun() !== null`. Either failure
  holds the start. (No supported producer of a true-but-absent write was
  found; the check is one call and makes the invariant deterministic
  instead of promised.)
- **I-5 The state offers Retry and Cancel — never "Row anyway"** (James,
  2026-09-03, on the lens-1 finding). A memory-only run cannot be rowed:
  `Timer` and `LogSession` both re-read it with `useState(() => loadRun())`
  at mount and bounce to Today when it is null, so "proceed anyway" would
  reproduce AUD-015's own symptom one navigation later. The free-row door
  has already ruled this way for the identical failure — `JustRow.tsx`'s
  `StartTimerAction`: _"A failed write … says so inline and destroys
  nothing (RF25); navigating to a Timer with nothing behind it would bounce
  to Today with no word."_ Cancel is the exit that already exists on this
  screen; the draft survives it. **If a memory-only run is ever wanted it
  is a two-tier read inside `run.ts` with its own RF27 lifetime table, and
  it is not this PR.**
- **I-6 A successful Retry REBUILDS the run at the moment the write lands**
  (`buildRun(draft, baselines, new Date())`), never re-writes the run built
  at mount. `buildRun` stamps `startedAt`/`phaseStartedAt` from the instant
  it is handed and nothing restamps downstream, so re-writing the original
  would charge every second the rower spent reading this state to phase 1 —
  bounded today by the countdown's own 10 s, unbounded once a hold exists.

**Gate 0 — APPROVED by James 2026-09-03**
(`docs/superpowers/specs/2026-09-03-blocked-start-gate.html`), all four
decisions as proposed:
- **(a) The message is `Couldn't keep your session on this phone.`** — one
  `<p className="mono-status">`, parallel to Countdown's own shipped
  `Couldn't load your baselines.` / `Couldn't load your preferences.`, and
  borrowing "keep" from the hand-off's shipped failure rather than adding a
  word.
- **(b) Retry (`button-outline`) and Cancel (`countdown-cancel`)** — both
  controls already exist on this screen; nothing new is drawn. No "Row
  anyway" (I-5).
- **(c) A successful Retry restarts the count from full**, because it
  rebuilds the run at the moment the write lands (I-6).
- **(d) This vocabulary stands beside the shipped start-error, not instead
  of it.** `Couldn't start this session. Try again.` keeps its place at the
  DRAFT write (`useStartWorkout`, `WorkoutDetail`); this message is the RUN
  write, one screen later, after the rower has committed. Two messages, two
  moments, and the gate showed them side by side.
- **Measured at the gate:** message and Cancel `--ink-3` on `--page`
  6.69:1, Retry `--ink` on `--page` 15.41:1 — all pass; both controls
  render at 48 px. One inherited residual, not introduced here and not
  fixed here: `.countdown-cancel`'s border is `--rule` on `--page` at
  1.32:1 against the 3:1 non-text floor.

The rendered artboard also carried, and Gate 0 approved, the state at both
orientations against the current mid-count screen, and the Retry-restarts
pair. The post-row `COULD NOT KEEP THE RECORD ON THIS PHONE.` state was
shown for reference and ruled a different moment (work already done), not a
candidate.

## §3 — The composed test the anchor asked for

Three conditions came from the 2026-08-28 anchor pass. Two survive as
written; the third is retired by James's ruling.

1. **A Today fixture that actually reaches `loadTodayPick`.** The audit's
   mounted-Today probe never got there because `loadRun` (`Today.tsx`'s
   mount) throws first. The fixture needs a plan and a pool so the call is
   reached, and the leg asserts Today renders with a denied getter rather
   than crashing.
2. **The blocked start's producer is QUOTA, not the getter denial — and
   the two findings do NOT compose.** The original condition said a denied
   getter lets Start proceed to a failed `saveRun`. Walked forward, that is
   unreachable: the denial the research cites fails EVERY access, so
   `useStartWorkout.confirmReplace`'s `saveDraft` returns `false` first and
   shows its existing inline error — Countdown never mounts. Two legs
   replace it:
   - **Quota at the run key.** `setItem` throws for `RUN_KEY` only (the
     draft write succeeds, the run write does not — quota's actual shape,
     live in this app: `e2e/seriesStorage.spec.ts` pins a ~720 KB
     `MonitorRun`, and the log history and the 500-entry session-log ring
     sit beside it). Drive the Start door to the blocked state.
   - **Whole-storage denial stops one screen earlier.** Assert what a
     rower actually gets: `useStartWorkout`'s `startError`, and Countdown
     never reached. This is the leg that keeps the corrected story true.
   **Every injection is key-scoped**, in unit, e2e and capture alike — a
   blanket `Storage.prototype.setItem` denial makes the blocked state
   unreachable (see above), so a blanket probe would go green against a
   screen that never rendered. `handoffStoreReplay.test.ts` already has the
   key-scoped spy to copy.
3. ~~A Retry surface for the denied getter needs a non-retry exit.~~
   **RETIRED:** no such surface ships. The exit on the blocked start is
   Cancel (I-5).

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
   Retry and Cancel wired (NOT "Row anyway" — I-5; this line said otherwise
   until the plan's own review caught it contradicting §2 and Gate 0). Legs
   at the component. Mutation: ignore the boolean again → red.
3. The two composed tests from §3.
4. e2e + captures (the blocked state, both orientations), the ROADMAP tick,
   the release note line (tester-visible: a rower whose phone is full now
   reads a sentence instead of bouncing). **The capture follows the
   `connected-ended-error` precedent** — a fixture HTML emitted by a
   component test (`toMatchFileSnapshot` into `e2e/fixtures/`) and rendered
   by `screenshots.spec.ts` — rather than driving a live quota failure
   through the stack.

**Gates skipped, spoken:** no PM open gate (the scope is this spec and
James ruled it item by item); the antagonist pass on the plan is a DELTA
against this spec's hardened ground — **and that skip is only correct
because "Row anyway" is out**: the memory tier it needed would have been a
new session lifetime, which takes a full pass. No PM final gate (not TRIAD,
and nothing a tester receives beyond one blocked-start state whose copy
Gate 0 approves).

**Not spent on this PR, named:** `clearRun`/`clearDraft` call `removeItem`
unguarded. Under the getter-denial class they would throw, but every call
site is gated behind a loaded run or draft, which is `null` under that
denial — hardening debt with no supported producer, deliberately left.
