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
| Warm-up row + TOTAL recount | The card's existing preview + `PieceRegion`-style totals already state the workout; the warmup joins the session at `buildRun` as today. No replacement UI |
| `isStartBlocked`/`needsBaselines` guard (`:110-112`) | Moves to the entry buttons: Start Timer and BaselineCard's Start render disabled with a caption when baselines are missing, the same dashed idiom `ConnectBlock` uses (`index.css:5028`) |
| Started-draft re-entry bounce (`:166-168`) | The `/session/confirm` redirect shim (below) |
| Legacy-`wu` strip notice (sole caller of `loadDraftWithNotice`, `draft.ts:172`) | The strip goes SILENT inside `loadDraft`; the notice UI dies. Pre-#71 drafts are a month stale and the strip itself remains as data hygiene |

**Entry-point rewiring** (each becomes: `saveDraft(buildNudgedDraft(workout, nudges))` → `clearRun()`/`clearMonitorRun()` → `navigate("/session/countdown")` — the `handleRowInstead` shape at `WorkoutDetail.tsx:334-344` with the route swapped):

1. `useStartWorkout` (`useStartWorkout.ts:81`): gains a `nudges` parameter; navigates to countdown. Its replace-confirm flow is unchanged in shape, only the destination and the draft builder move.
2. WorkoutDetail Start Timer (`WorkoutDetail.tsx:458`): passes the card's live `nudges` state — closing the documented gap at `WorkoutDetail.tsx:65-72` where the timer path DROPPED the preview nudges. After this wave, one nudge model feeds both paths.
3. BaselineCard Start (`BaselineCard.tsx:70`): passes `{}` (no preview there) and is deliberately EXEMPT from the baselines guard — the card exists precisely for the no-baselines state, and its Start launches the baseline-setting workout. The guard lives on WorkoutDetail's Start Timer only.
4. Countdown CANCEL (`Countdown.tsx:385`): clears the draft and navigates to the workout's detail page (`/library/{draft.workoutId}`); falls back to `/today` if the draft carries no workout id.
5. Countdown's no-baselines bounce (`Countdown.tsx:333`): retargets `/today` (where BaselineCard lives).
6. `/session/confirm` becomes a REDIRECT SHIM (stale deep links and back-swipes are documented real, `monitorRun.ts:436`): started draft → `/session/run`; live unstarted draft → `/session/countdown`; no draft → `/today`. The shim is a route element with no UI.

`startDraft`/`cancelStart` (`draft.ts`) lose their only consumers if Countdown stops needing `startedAt` — the implementer verifies Countdown's actual reads and removes or rehomes them honestly; `SessionDraft`'s shape does NOT change (`effectiveSteps` at `draft.ts:212-229` keeps handling `spmOverrides`/`removed` for old drafts).

## 4. Buttons and the blue

- **New token** in `theme/tokens.css`: `--action-connect: #2a6275` and `--action-connect-hover` (a darkened step). The value intentionally echoes `--type-o2` but is a SEPARATE token: type-badge semantics and action semantics must be independently changeable. The "accent means exactly four things" rule comment (`tokens.css:36-44`, `index.css:280-283`) is AMENDED in place to name the fifth: the Connect action, and why it is not accent (the flagship hardware path gets its own color so the screen has one red and one blue, never two reds).
- **New class** `.button-connect`: L1 geometry (56px, from the shared base at `index.css:213-227`), `--action-connect` fill, white text. Used ONLY by `ConnectAction` (`ConnectAction.tsx:100-102` swaps `button-l2` → `button-connect`).
- **Order** in the action stack (`WorkoutDetail.tsx:456-537`): ConnectBlock (with its LAST USED caption and dashed states) FIRST, then Start Timer as `.button-l2`, then Log it after, Edit, Delete as today.
- **Copy:** the Start button reads `Start Timer` exactly. No other copy changes. No em-dash anywhere.
- **Design-system pins:** `design.spec.ts:586-600` (one L1, `toHaveText("Start")`, 56px) retargets: the one 56px primary is now `.button-connect` reading `Connect`; a companion assertion pins Start Timer at L2. The axe/tap-target/token-palette sweeps in that describe must pass with the new token (add it to the palette allowlist where the sweep enumerates).

## 5. R1 — the summary pair becomes the finish authority

Per the ecosystem review (ORM's emulation and the ErgData CSAFE-refetch mitigation): the final 0x0037/0x0038 split can be dropped entirely, not just late. The driver subscribes **0x0039 (End of Workout Summary) and 0x003A (End of Workout Additional Summary)** alongside the existing set:

- `SERVICE_OF` gains both UUIDs (rowing service); `pm5/uuids.ts` gains the constants; the driver subscribes them at construction with the others.
- Parsing lives in `pm5/` beside the split parsers, covering only the fields the record needs: total elapsed, total distance, avg pace/spm/HR as available (the interface notes' layout discipline: cite the C2 spec section in the parser header, verify on the wire at the walk).
- **Precedence:** splits remain authoritative. The summary RECONCILES: if the final interval's actual is still missing when the summary pair arrives (the dropped-split case), the driver emits it as the vouched final boundary — same `finalBoundary: true` channel, same five bounds, same record acceptance (`acceptableFinalBoundary` unchanged). If the split already landed, the summary is compared and a `summary-divergence` wire-log entry records any disagreement (data kept from the split; the log tells the story).
- **The hold:** a summary-sourced final boundary releases the handoff hold exactly like a split-sourced one. The coupled 3000ms constants (`FINISH_GRACE_MS` / `FINISH_HANDOFF_HOLD_MS`, their marriage documented at both sites) are UNCHANGED — the summary is a second chance inside the same window, not a wider window.
- **Observability:** `split-half`-style entries for 0x0039/0x003A receipt (`summary-half`), plus the reconciliation verdict (`summary-reconciled` filled-gap / confirmed / divergence). The stash must answer "which source fed the record" in one read.
- Single-interval and multi-interval both covered by tests; the walk's confirmation row reads the stash for the new entries.

## 6. R2-web — the last unbounded connect

`webBluetooth.ts`'s `connect()` wraps `gatt.connect()` in a 10_000ms race (matching the iOS native bound, `Plugin.swift` CONNECTION_TIMEOUT): on expiry, reject with an Error whose message contains "Connection timeout." — the SAME literal the iOS plugin uses, so the classifier's existing fall-through to `link-failed` (pinned by the capacitorBle test) covers both transports with one vocabulary. Late settle of the abandoned native promise is explicitly caught (the raceScanTimeout lesson; reuse its shape). This is the phase's ONE touch of `webBluetooth.ts`; its write semantics stay untouched (R3 is not this wave).

## 7. Testing and acceptance

- **Unit:** R1 parser + reconciliation precedence + hold release + divergence log; R2-web race (fake timers, late-settle swallow); `useStartWorkout` nudge threading; the redirect shim's three arms; guard relocation; button order/class/copy pins. `ConfirmTargets.test.tsx` (34 tests) retires WITH the screen; `WorkoutDetail.test.tsx`'s ~25 whole-string "Start" pins rename to "Start Timer".
- **e2e/screenshots:** the confirm-screen describe (`design.spec.ts:1451-1626`, 8 tests) and `confirm.png` retire; flow helpers (`startFromLibrary`, `startAndSkipCountdown`) lose their confirm-screen click; `design.spec.ts:591`'s L1 text pin retargets to Connect; substring "Start" pins survive per the scout's audit. New capture: the reordered action stack (`workout-detail` capture updates); `today-rolled.png` and friends untouched.
- **Gates ×2** on the per-worktree stack; baselines measured fresh at plan time (post-#83 main).
- **The erg row (James, one minute, nudged):** save screen ALL-measured; stash shows the summary entries (`summary-half` ×2 and the reconciliation verdict) alongside the split chain; the nudged pace on the PM5 and in the log. Plus one timer-path start on the phone: card nudge → Start Timer → countdown directly, nudged target visible in the session.
- Wrong-layer rule stands: any surprise at the erg gets a stash read before a theory.

## 8. Docs

- ROADMAP: the fast-follow phase entry; CL2's nudge-unification filing MOVES here (with the "rate display only" resolution recorded); the step-detail memory's owed CL2 line lands in the same touch; R3/R4 recorded as the remaining ecosystem follow-ons.
- The next release's notes owe #80 (step detail), #81 (shorthand article), #83 (Ostro roll-up), and this wave — drafted at this phase's close, dated at its tag.
- DEVIATIONS: none expected; the §3 casualty list is a James-approved design, recorded here, not a deviation.
- `pm5-interface-notes.md`: the summary pair's verified-on-wire layout lands after the walk (new § or §21 extension).
