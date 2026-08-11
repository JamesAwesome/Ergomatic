# Fast-follow design — the finish gets an authority, the start gets one door

**Status:** James approved the design 2026-08-11 ("both are good, this is approved") after ruling scope ("pull it forward"), rate semantics ("rate display + pace only"), the §3 casualty list, and Connect-as-single-primary. First post-release wave; v0.7.0 (build 564) is on TestFlight.

**Evidence base:** `docs/monitor/pm5-ble-ecosystem-review.md` (R1/R2 with their upstream links), `docs/monitor/pm5-interface-notes.md` §21-§22 (the walk facts), and a file-level blast-radius scout of this worktree performed 2026-08-11 (all §-cites below re-read then; the worktree sits on main at `ea3dec6`, post-#83).

## 1. Goal and non-goals

**Goal:** three tester-facing hardenings in one wave: (a) a dropped final split can no longer cost the last interval's data (R1); (b) no connect path anywhere can hang unbounded (R2-web); (c) starting a workout has ONE nudge model and ONE visual hierarchy — the Connect card's — on both the timer and PM5 paths.

**Non-goals:** rate/duration/reps nudging (James: "rate display + pace only"); any reconnect work; the CL2 builder-parity slate; R3 (web acked writes) and R4 (base-service scan filter) stay post-release follow-ons per the ecosystem review's own sequencing.

## 2. James's rulings (PINNED, 2026-08-11)

1. The nudge unification rides this wave (pulled forward from CL2).
2. The unified card nudges PACE ONLY; rate is read-only display. The secondary screen's duration/reps/spm steppers and per-row REMOVE/RESTORE die with it, uncompensated (the §3 casualty list, approved explicitly). Structural changes route through Edit.
3. Connect becomes the screen's SINGLE primary: L1 geometry, a NEW blue token, positioned above Start; "Start" renames to "Start Timer" and demotes to secondary.
4. Any finish-path change ends in a 1-minute confirmation row at the erg, stash read.

## 3. The unification (ConfirmTargets dies)

`app/src/session/ConfirmTargets.tsx` (642 lines) and its route `/session/confirm` (`AppRoutes.tsx:113`) are removed. What it carried, and where each responsibility lands:

| ConfirmTargets carried | Fate |
|---|---|
| Pace nudge arrows | Already on the card (`WorkoutDetail.tsx:429-446`, `StepRow.tsx:136-152`); now the ONLY nudge surface |
| DUR (30s grid) / REPS / SPM steppers; REMOVE/RESTORE rows | DIE (ruling 2). Edit is the structural door |
| Warm-up row + TOTAL recount | DIE with the screen (within the approved casualty ruling). Stated honestly (adversarial I2): the card's duration line EXCLUDES the warm-up (`WorkoutDetail.tsx:377-379`) and shows no recount; the warmup still joins the session at `buildRun`. The rower's first warm-up-inclusive total appears on the session itself |
| `isStartBlocked`/`needsBaselines` guard (`:110-112`) | Moves to WorkoutDetail's Start Timer ONLY, as the same per-workout predicate ConfirmTargets used: disabled + caption when THIS workout needs baselines the account lacks (dashed idiom, `index.css:5028`). BaselineCard needs no exemption clause: its baseline workout requires no baselines by construction, so the predicate never blocks it |
| Started-draft re-entry bounce (`:166-168`) | The `/session/confirm` redirect shim (below) |
| Legacy-`wu` strip notice (sole caller of `loadDraftWithNotice`, `draft.ts:172`) | The strip goes SILENT inside `loadDraft`; the notice UI dies. Pre-#71 drafts are a month stale and the strip itself remains as data hygiene |

**Entry-point rewiring** (each becomes: `saveDraft(buildNudgedDraft(workout, nudges))` → `clearRun()`/`clearMonitorRun()` → `navigate("/session/countdown")` — the `handleRowInstead` shape at `WorkoutDetail.tsx:334-344` with the route swapped):

1. `useStartWorkout` (`useStartWorkout.ts:81`): gains a `nudges` parameter; navigates to countdown. Its replace-confirm flow is unchanged in shape, only the destination and the draft builder move.
2. WorkoutDetail Start Timer (`WorkoutDetail.tsx:458`): passes the card's live `nudges` state — closing the documented gap at `WorkoutDetail.tsx:65-72` where the timer path DROPPED the preview nudges. After this wave, one nudge model feeds both paths.
3. BaselineCard Start (`BaselineCard.tsx:70`): passes `{}` (no preview there) and is deliberately EXEMPT from the baselines guard — the card exists precisely for the no-baselines state, and its Start launches the baseline-setting workout. The guard lives on WorkoutDetail's Start Timer only.
4. Countdown CANCEL (`Countdown.tsx:385`): clears the draft AND the run — Countdown builds its `SessionRun` at mount (`Countdown.tsx:234-235`), and a leftover run would make `connectGuardStage` stage a bogus "in progress" confirm (adversarial I3) — then navigates to the workout's detail page (`/library/{draft.workoutId}`), `/today` fallback.
5. Countdown's no-baselines bounce (`Countdown.tsx:333`): retargets `/today` (where BaselineCard lives).
6. `/session/confirm` becomes a REDIRECT SHIM (stale deep links and back-swipes are documented real, `monitorRun.ts:436`): a session that got past the countdown → `/session/run`; a draft queued but not yet counted down → `/session/countdown`; no draft → `/today`. The shim is a route element with no UI.

   **POST-REVIEW CORRECTION (final whole-branch review MIN-2, 2026-08-11).** This entry originally read "started draft → `/session/run`; live unstarted draft → `/session/countdown`", and B1's own resolution — two paragraphs down, in this same section — made that undecidable before a line of it was written: every rewired entry now stamps `startedAt` at navigation, so a stamped draft no longer distinguishes "past the countdown" from "queued". The shipped shim re-derives the discriminator correctly from the `SessionRun` RECORD instead (`AppRoutes.tsx`'s `ConfirmRedirect`: `loadRun() !== null` → `/session/run`, since Countdown builds and saves the run at mount), which is the same key `connectGuardStage` already reads. The code, its own doc comment, and `docs/design/DEVIATIONS.md`'s bottom row all state the run-record rule; only this sentence still described arms the shim does not have. Amended here so the § numbers stay honest. No code changed for this correction.

**`startedAt` is load-bearing and gets restamped, not removed (adversarial B1):** its real readers are `useStartWorkout.ts:113` (the ONLY guard that stages "in progress" for a live phone session — without the stamp, Start on workout B silently destroys a live session), `Today.tsx:331`'s stale-draft janitor, and the shim's started arm (that third reader did not survive the correction above — the shim keys on the `SessionRun` record, not on `startedAt`; the first two are the real ones). Every rewired entry point therefore stamps at navigation: `saveDraft(startDraft(buildNudgedDraft(...)))` — the session is "started" from countdown on. `cancelStart` dies (CANCEL now clears the draft outright); `startDraft` lives with new callers. `SessionDraft`'s shape does NOT change (`effectiveSteps` at `draft.ts:212-229` keeps handling `spmOverrides`/`removed` for old drafts).

## 4. Buttons and the blue

- **New token** in `theme/tokens.css`: `--action-connect: #2a6275` and `--action-connect-hover` (a darkened step). The value intentionally echoes `--type-o2` but is a SEPARATE token: type-badge semantics and action semantics must be independently changeable. The "accent means exactly four things" rule comment (`tokens.css:36-44`, `index.css:280-283`) is AMENDED in place to name the fifth: the Connect action, and why it is not accent (the flagship hardware path gets its own color so the screen has one red and one blue, never two reds).
- **New class** `.button-connect`: L1 geometry (56px, from the shared base at `index.css:213-227`), `--action-connect` fill, white text. Used ONLY by `ConnectAction` (`ConnectAction.tsx:100-102` swaps `button-l2` → `button-connect`). The dashed-state selectors keyed on the old class (`.connect-block-dashed .button-l2`, `index.css:5030`) retarget in the same edit, with a render test proving the dashed treatment survives the swap (adversarial I9).
- **Order** in the action stack (`WorkoutDetail.tsx:456-537`): ConnectBlock (with its LAST USED caption and dashed states) FIRST, then Start Timer as `.button-l2`, then Log it after, Edit, Delete as today.
- **Copy:** the Start button reads `Start Timer` exactly. No other copy changes. No em-dash anywhere.
- **Design-system pins:** `design.spec.ts:586-600` (one L1, `toHaveText("Start")`, 56px) retargets: the one 56px primary is now `.button-connect` reading `Connect`; a companion assertion pins Start Timer at L2. The axe/tap-target/token-palette sweeps in that describe must pass with the new token (add it to the palette allowlist where the sweep enumerates).

## 5. R1 — the summary becomes the finish FALLBACK (revised per adversarial B2/B3)

Per the ecosystem review: the final 0x0037/0x0038 split can be dropped entirely. The adversarial pass established the summary CANNOT ride the split path's five bounds (the vouched channel's entrance is the 0x0037/0x0038 pairing gate, `driver.ts:1709-1745`, and bound 4 keys on the frame's Split/Interval Number, `driver.ts:1799-1803` — a field 0x0039/0x003A do not carry) and that 0x0039/0x003A carry WORKOUT TOTALS, not per-interval data (B3). The design is therefore a separate, narrower driver-side gate that SYNTHESIZES the final boundary:

- **Subscribe 0x0039 only as the gate's trigger** (I5: all needed fields ride 0x0039; pair-gating on 0x003A would recreate the drop fragility). 0x003A is subscribed for observability/enrichment but never gates.
- **Precedence, pinned (I4):** the split is authoritative and IMMEDIATE, any time inside the grace window. The summary fills ONLY AT GRACE EXPIRY: a wall-clock reconcile at `FINISH_GRACE_MS` (the driver owns a bounded timer from the natural finish, same injected clock) checks "final interval still missing AND a summary arrived" and only then emits. A summary can never displace a merely-late split.
- **The synthesized boundary:** index = the armed program's last interval (known, not read off the wire); emitted `finalBoundary: true` into the EXISTING downstream channel (`driver.ts:1930` emit → hook release `useMonitorSession.ts:1049` → `acceptableFinalBoundary` `monitorRun.ts:256-265`, all unchanged). The gate re-derives the split path's non-index bounds itself: natural-finish-only (never post-terminate), the final interval still missing, consumed once ACROSS BOTH SOURCES (one final boundary per run, whichever source fires).
- **Honest field derivation (B3):** single-interval program: the summary's totals ARE the interval's elapsed/meters. Multi-interval: the last interval's elapsed/meters = summary totals MINUS the sum of the recorded prior actuals, and ONLY when every prior interval is recorded (the evidence says it is the FINAL split that drops); if priors are incomplete, the gate declines and logs why. Per-interval avg split/spm/HR are NOT derivable from workout averages: those fields are omitted from the synthesized actual (the implementer verifies `IntervalActual`'s optionality at `types.ts:114-146` and the log screen's rendering of an actual with elapsed/meters only).
- **The re-fire wrinkle (I5, review:420-422):** 0x0039 can re-fire on late HRM data ~a minute after the finish. The grace window (3000ms) plus consumed-once makes a late re-fire inert; it is logged (`summary-half` with an out-of-window marker), never filed.
- **The hold:** the summary fill happens AT grace expiry, so the handoff hold must outlive it: `FINISH_HANDOFF_HOLD_MS` rises to **3500** (grace 3000 + fill margin), and BOTH coupled-constant comments update — the documented inequality (hold >= grace) becomes strict with the reason.
- **Layout evidence first (I6):** no in-repo source currently states 0x0039/0x003A's byte layout. The plan's FIRST R1 task commits the layout to `pm5-interface-notes.md` (from the official C2 BLE spec, section cited, the same discipline every other characteristic in the notes carries) BEFORE any parser pins offsets; the walk verifies it on the wire.
- **Observability:** `summary-half` on receipt (both chars), and a `summary-reconciled` verdict entry: `split-won` / `filled-from-summary` (with the derivation) / `declined` (with the missing-priors reason) / `out-of-window`. The stash answers "which source fed the record" in one read.

## 6. R2-web — the last unbounded connect

`webBluetooth.ts`'s `connect()` wraps `gatt.connect()` in a 10_000ms race (matching the iOS native bound, `Plugin.swift` CONNECTION_TIMEOUT): on expiry, reject with an Error whose message contains "Connection timeout." — the SAME literal the iOS plugin uses, so the classifier's existing fall-through to `link-failed` (pinned by the capacitorBle test) covers both transports with one vocabulary. Late settle handling is NOT raceScanTimeout's swallow (adversarial I7): a `gatt.connect()` that resolves after the race lost is a ZOMBIE LIVE LINK, not a harmless stale pick — the late-resolve arm calls `gatt.disconnect()` on the zombie before dropping it, and the test pins that call. Additionally (I8): `webBluetooth.ts` has its OWN `SERVICE_OF` map (`webBluetooth.ts:95`) — 0x0039/0x003A join BOTH maps, with a test on the web side too (a missing entry there is an unhandled rejection and a silently dead subscription, `webBluetooth.ts:106-113`). These are the phase's only touches of `webBluetooth.ts`; write semantics stay untouched (R3 is not this wave).

## 7. Testing and acceptance

- **Unit:** R1 parser + reconciliation precedence + hold release + divergence log; R2-web race (fake timers, late-settle swallow); `useStartWorkout` nudge threading; the redirect shim's three arms; guard relocation; button order/class/copy pins. `ConfirmTargets.test.tsx` (34 tests) retires WITH the screen; `WorkoutDetail.test.tsx`'s ~25 whole-string "Start" pins rename to "Start Timer".
- **e2e/screenshots:** the confirm-screen describe (`design.spec.ts:1451-1626`, 8 tests) and `confirm.png` retire; flow helpers (`startFromLibrary`, `startAndSkipCountdown`) lose their confirm-screen click; `design.spec.ts:591`'s L1 text pin retargets to Connect; substring "Start" pins survive per the scout's audit; PLUS the two confirm consumers outside the helpers (adversarial I10): `onboarding.spec.ts:180-184` and `flows.spec.ts:354`. New capture: the reordered action stack (`workout-detail` capture updates); `today-rolled.png` and friends untouched.
- **Gates ×2** on the per-worktree stack; baselines measured fresh at plan time (post-#83 main).
- **The erg row (James, one minute, nudged):** save screen ALL-measured; stash shows the summary entries (`summary-half` ×2 and the reconciliation verdict) alongside the split chain; the nudged pace on the PM5 and in the log. Plus one timer-path start on the phone: card nudge → Start Timer → countdown directly, nudged target visible in the session.
- Wrong-layer rule stands: any surprise at the erg gets a stash read before a theory.

## 8. Docs

- ROADMAP: the fast-follow phase entry; CL2's nudge-unification filing MOVES here (with the "rate display only" resolution recorded); the step-detail memory's owed CL2 line lands in the same touch; R3/R4 recorded as the remaining ecosystem follow-ons.
- The next release's notes owe #80 (step detail), #81 (shorthand article), #83 (Ostro roll-up), and this wave — drafted at this phase's close, dated at its tag.
- DEVIATIONS: none expected; the §3 casualty list is a James-approved design, recorded here, not a deviation.
- `pm5-interface-notes.md`: the summary pair's verified-on-wire layout lands after the walk (new § or §21 extension).
