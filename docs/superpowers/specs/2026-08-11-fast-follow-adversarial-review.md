# Adversarial review — 2026-08-11-fast-follow-design.md

Reviewer: adversarial spec pass, 2026-08-11, worktree `fast-follow` @ `fd42d91`
(main `ea3dec6` + the spec commit). Every cite below was read this session in
this worktree. Not committed, per dispatch.

Counts: **3 BLOCKING · 10 IMPORTANT · 7 MINOR · 3 NOTE**

---

## BLOCKING

**B1. §3 — `startedAt` loses its only stamper and the spec defers the wrong
question.** The spec's deferral reads "startDraft/cancelStart lose their only
consumers if Countdown stops needing `startedAt` — the implementer verifies
Countdown's actual reads." Countdown never READS `startedAt` at all — it only
writes it back to null via `cancelStart` (`Countdown.tsx:383`). The one
stamper is the screen being deleted (`ConfirmTargets.tsx:357`,
`startDraft(draft)`), and the readers the spec never names are:

- `useStartWorkout.ts:113` — the ONLY thing that stages "in-progress" for a
  live phone-timer session. A live `SessionRun` (`completedAt === null`)
  falls through the run check at `useStartWorkout.ts:101`
  (`existingRun.completedAt !== null` is false) and is caught solely by the
  draft's `startedAt`. With nothing stamping it, Start on workout B while a
  phone session is live goes straight to `confirmReplace()` →
  `clearRun()` (`useStartWorkout.ts:79`) — silent destruction of a live
  session, the exact F5 class the hook's own header says it exists to
  prevent (`useStartWorkout.ts:52-60`).
- `Today.tsx:331` — the stale-draft janitor's `draft.startedAt === null`
  arm; with `startedAt` never set, its "a started draft is left alone"
  half (`Today.tsx:288`) becomes dead and the 24h wipe applies to every
  draft.
- The spec's own shim, arm 1: "started draft → /session/run" can never fire
  if nothing stamps — the shim as specced ships with a dead arm and no
  discriminator for its middle arm's "live unstarted" wording.

This is an architectural premise, not a scalar, so per the briefing it may
not be deferred. Pin one of: (a) the entry rewiring stamps `startedAt`
before navigating to countdown (countdown IS the session start now —
preserves all three readers unchanged), or (b) re-key the replace guard,
janitor and shim on the run record (the shape `connectGuardStage` already
uses: any `SessionRun` present → in-progress/unlogged,
`monitorRun.ts:527-537`) and delete `startedAt` honestly everywhere. Either
works; the spec must choose.

**B2. §5 — "same five bounds" is false: a summary cannot enter the vouched
channel, let alone satisfy its bounds.** The vouched `finalBoundary: true`
emit is produced in exactly one place, `emitIntervalComplete`, which is
reachable only through the 0x0037/0x0038 pairing gate (`noteBoundaryHalf`,
`driver.ts:1709-1745`) and decodes `toIntervalActual(raw)`'s
`splitIntervalNumber`. The five bounds are `finishGraceIndex`'s five
conditions (`driver.ts:1767-1790`), and bound 4 is
`toActualIndex(rawIndex, run.lastActiveState, programLength)`
(`driver.ts:1799-1803`) — it consumes the frame's own Split/Interval Number,
a field 0x0039/0x003A do not carry. A summary therefore cannot "ride the
same vouched channel within the SAME five bounds": it needs its own
driver-side gate that synthesizes `index = program.intervals.length - 1` and
re-derives bounds 1/2/5's semantics (closed-by-finished, inside the grace
clock, not already recorded). What IS reusable unchanged is everything
downstream of the emit: `MonitorEvent {kind:"intervalComplete", actual,
finalBoundary:true}` (`driver.ts:1930`), the hook's release
(`useMonitorSession.ts:1049`), and `acceptableFinalBoundary`
(`monitorRun.ts:256-265` — flag / non-null index / last index / not held all
pass for a synthesized last-index actual). The spec must say this instead of
"same five bounds"; as written it plans code that cannot exist.

**B3. §5 — multi-interval: the summary's numbers are workout totals, the
record's slot is a per-interval actual, and no derivation rule is given.**
`IntervalActual` is per-interval: `elapsedSeconds`, `distanceMeters`,
`avgSplit`, `avgSpm`, `avgHeartRateBpm` (`types.ts:114-146`). 0x0039/0x003A
carry whole-workout totals and averages (the spec's own field list: "total
elapsed, total distance, avg pace/spm/HR"). Emitting those as the final
interval's actual on a multi-interval program files the whole workout's
elapsed/distance under the last interval — plausible-looking, wrong, and
silent (the exact corruption shape the D4 comment at `driver.ts:1704-1707`
refuses elsewhere). Elapsed/distance for the final interval are derivable by
subtracting the held actuals' sums; final-interval avg split/spm/HR are NOT
exactly derivable from workout averages at all. The spec claims
multi-interval test coverage (§7) but specifies no derivation, no
subtraction, and no rule for the non-derivable fields (null them? weighted
estimate flagged as such?). Single-interval is the only case where
totals == the interval. Pin the derivation table per field, or scope R1's
gap-fill to single-interval and log-only for multi.

---

## IMPORTANT

**I1. §3 — the guard's fate contradicts itself inside one section.** The
fate table: the `isStartBlocked` guard "Moves to the entry buttons: Start
Timer AND BaselineCard's Start render disabled…". Entry item 3:
"BaselineCard … is deliberately EXEMPT from the baselines guard … The guard
lives on WorkoutDetail's Start Timer only." Both cannot be implemented.
Also pin the predicate itself: `isStartBlocked` is
`baselines === null && needsBaselines(draftSteps(d))`
(`ConfirmTargets.tsx:110-112`) — with that predicate the exemption is
unnecessary (the onboarding workouts are effort-only and never block), and
an implementer reading "EXEMPT" is invited to build the cruder bare
`baselines === null` guard Phase 6I explicitly removed
(`ConfirmTargets.tsx:99-109`'s own history comment).

**I2. §3 — the warm-up statement and the nudge-priced total die homeless;
"already state the workout" is false on both counts.** WorkoutDetail's
total is `estimateMinutes(workout.steps, baselines)` over RAW steps
(`WorkoutDetail.tsx:377-379`): it excludes the warm-up minutes ConfirmTargets'
footer included (`ConfirmTargets.tsx:386-390`, `warmupDisplayMinutes`) and
never reprices nudges (`draftMinutes` folds nudges via `draftSteps`,
`draft.ts:239-257` — draft.ts's own comment records that repricing as a
fixed bug, `draft.ts:207-210`). After this wave NO pre-session surface
states the warm-up (ConfirmTargets' WARM-UP row was the only one,
`ConfirmTargets.tsx:416-438`) or a nudged/warmup-inclusive total. James
approved the steppers/REMOVE dying; he did not approve these two — either
add them to the ruled casualty list explicitly or put warmup+nudges into
the card's minute line.

**I3. §3 item 4 — Countdown CANCEL must also `clearRun()`; the spec omits
it.** Countdown builds AND saves the run at mount (`Countdown.tsx:234-235`);
today's CANCEL clears it (`Countdown.tsx:384`). "Clears the draft and
navigates to the detail page" leaves an index-0 `SessionRun` behind:
`connectGuardStage` then stages a bogus "A session is in progress"
confirm on the very screen CANCEL just landed on (`monitorRun.ts:528-530`
treats any run with `completedAt === null` as in-progress), and Today's
cold-start resume card reads it (`Today.tsx:284`).

**I4. §5 — the split-vs-summary race and the hold's release timing are
unspecified, and "splits remain authoritative" is not enforced by any
stated rule.** The grace is consumed by the first boundary that uses it
(`driver.ts:1924-1926`); once consumed, a later real split is refused
(`driver.ts:1804`, `recordedIndices`) and downgraded to
`boundary-out-of-run`. If the summary fills the gap while the real split is
merely LATE (still inside the 3s), the split's better per-interval data is
permanently displaced — and if the summary releases the hold immediately,
navigation tears down the subscription (`useMonitorSession.ts:815`'s own
walk-day-2 fact) and GUARANTEES the split is lost. Ecosystem order evidence
says splits-then-summaries (`pm5-ble-ecosystem-review.md:242`, ORM
trace-derived), which makes summary-first equal dropped-split — but that
ordering is an emulation-derived, never-our-wire premise. Pin the rule:
reconcile at grace EXPIRY (summary fills only if the split hasn't landed by
the deadline; hold releases at expiry either way), or state the
summary-first-means-dropped premise with the :242 cite and a wire-log entry
recording which path fired (the briefing's `rowingActive` pattern).

**I5. §5 — gating the fallback on the PAIR recreates the drop-fragility R1
exists to fix; the re-fire wrinkle is missing.** Every field the spec's
list needs sits on 0x0039 alone; the forum evidence R1 rests on says any of
0x0037-0x003A can be dropped (`pm5-ble-ecosystem-review.md:415`). A
reconcile that waits for both `summary-half`s dies when 0x003A drops even
though 0x0039 arrived complete. Gate the reconcile on 0x0039; treat 0x003A
as enrichment/observability. Separately, the review's own "known wrinkle to
design around" — 0x0039 fires a SECOND time ~1 min later when an HRM is
active; "consume once and ignore the re-fire"
(`pm5-ble-ecosystem-review.md:420-422`) — appears nowhere in §5. The record
bounds happen to refuse a double-file, but the driver's summary gate needs
its own consumed-once bit and a log line, or the stash shows a spurious
divergence on every HRM walk.

**I6. §5 — the 0x0039/0x003A layout has no in-repo evidence to cite.**
`docs/monitor/` holds only the two .md files; `pm5-interface-notes.md`
carries per-field facts about 0x0039 (recovery-HR zero-sentinel, :720,
:2323, :3757) but no layout table, and the ecosystem review gives only
"two new parse tables (BLE doc pp.21-24)" with no fields
(`pm5-ble-ecosystem-review.md:426-427`). The spec's field list ("total
elapsed, total distance, avg pace/spm/HR as available") is therefore
uncitable from the repo — per the briefing ("if the evidence lives outside
the repo, COMMIT IT first"), land the BLE-doc layout excerpt in
interface-notes BEFORE the plan pins parser offsets, not after the walk.

**I7. §6 — "reuse raceScanTimeout's shape" transfers the half that is
unsafe for connect.** That helper DROPS a late resolution, and its own
comment says why that's safe THERE: "requestDevice only PICKS, no connect
was issued" (`capacitorBle.ts:150-155`). For `gatt.connect()` a late
resolve is a LIVE link: the `gattserverdisconnected` listener is already
attached (`webBluetooth.ts:235-239`), `server` is never stored, and the
zombie connection keeps the PM5 bound — blocking exactly the retry the
`link-failed` card offers. The race must, on timeout and on late resolve,
call `device.gatt.disconnect()` (which also aborts a pending connect), not
merely swallow. The spec's "explicitly caught" wording only covers the
unhandled-rejection half.

**I8. §5 — `SERVICE_OF` is TWO maps; the spec says it in the singular.**
`capacitorBle.ts:55` and `webBluetooth.ts:95` each own one. Miss the web
map and `serviceFor` throws inside `getCharacteristic`
(`webBluetooth.ts:106-113`) on a promise `subscribe` void-discards
(`webBluetooth.ts:276`) — an unhandled rejection and a silently missing
summary subscription on the laptop transport. Name both files.

**I9. §4 — swapping ConnectAction to `.button-connect` silently kills the
dashed states the spec says are kept.** The Bluetooth-off/absent treatment
is a descendant reskin of the trigger: `.connect-block-dashed .button-l2`
(`index.css:5030`). §4's order bullet keeps "ConnectBlock (with its LAST
USED caption and dashed states)" while §4's class bullet retargets the
trigger's class — the selector must move to `.button-connect` or the
dashed state stops rendering with no test failing (the dashed pin lives on
class presence, not on this selector's effect).

**I10. §7 — the e2e retire list misses two confirm-screen consumers.**
`e2e/onboarding.spec.ts:180-184` asserts the confirm screen's unblocked
"Looks right, start" primary; `e2e/flows.spec.ts:354` clicks it inline
(not via the named `startFromLibrary`/`startAndSkipCountdown` helpers the
spec audits). Both break; neither is named. (`startAndSkipCountdown`'s own
click is `getByRole("button", { name: "START" })`, `design.spec.ts:218` —
a substring match against "Looks right, start"; its replacement flow must
land on countdown directly.)

---

## MINOR

**M1. §4 cite error — the "four things" rule text exists only at
`tokens.css:36-44`.** `index.css:280-283` is `.button-l3`'s block (the
"Ink rather than accent" comment, `index.css:277-279`); grep for "accent
means" hits tokens.css only. Meanwhile the comment that DOES go stale —
the L1 roster "One per screen (Start, Looks right start, …)"
(`index.css:229-230`) — is not named for amendment.

**M2. §6 pin attribution.** The "Connection timeout." → link-failed pin is
`useMonitorSession.test.ts:458-474`, not "the capacitorBle test"
(`capacitorBle.ts:356` is a comment). The fall-through itself verifies:
`mapRadioFailure`'s regexes (`useMonitorSession.ts:649-666`) don't match
the literal, so it lands at `link-failed` (`useMonitorSession.ts:667-671`)
for both transports — the claim is right, the cite is wrong.

**M3. §7 count.** `ConfirmTargets.test.tsx` has 37 `it(` blocks, not 34.
(`WorkoutDetail.test.tsx`'s 25 whole-string `name: "Start"` pins check out.)

**M4. §3 — `handleRowInstead` is itself a `/session/confirm` navigator
(`WorkoutDetail.tsx:340`)** and is used as the shape template but never
listed for rewiring. Left as-is it works only by bouncing through the shim;
rewire it directly with the others.

**M5. Comment/doc sweep unbudgeted.** Stale references to the dead screen
survive at `monitorRun.ts:431-437` ("or from `ConfirmTargets`"),
`draft.ts:269-280` (`cancelStart`'s whole rationale), `Countdown.tsx:318-333`
(bounce comment), `Today.tsx:286-305`, and `DEVIATIONS.md` rows 33
(the reps-marker deviation — a row ABOUT ConfirmTargets, which must be
removed: DEVIATIONS documents current state) and 92 (lists
`ConfirmTargets.tsx` as a render site). §8's "DEVIATIONS: none expected"
is falsified by row 33 alone.

**M6. §3 item 4 — CANCEL now loses the nudges.** Old CANCEL returned to an
editable confirm with the nudged draft intact; new CANCEL clears the draft
and remounts WorkoutDetail with fresh nudge state (`WorkoutDetail.tsx:177`,
session-only, never persisted). An unlisted casualty — likely acceptable
under the one-door ruling, but say so.

**M7. §4 — BaselineCard's button keeps reading "Start"
(`BaselineCard.tsx:70`) while the same path's button on WorkoutDetail reads
"Start Timer".** Presumably intended ("no other copy changes") since Today
has no Connect to disambiguate from — pin it so the rename doesn't leak.

---

## NOTE

**N1.** `AppRoutes.test.tsx:286`'s shows-tab-bar list keeps
`/session/confirm` — still correct for the shim (`hidesTabBar` is a pure
path function; the shim renders no UI anyway). No change needed.

**N2.** `--action-connect: #2a6275` with `--on-color` (#fffdf7) text
computes ≈6.7:1 — clears the 4.5:1 floor. (Spec says "white text"; house
pairs colored fills with `--on-color`, `tokens.css:48`.) Also note the
guard-move's "same dashed idiom" conflates two documented treatments: the
dashed ConnectBlock state is explicitly TAPPABLE (`index.css:5011-5028`'s
own comment reserves real `:disabled` styling separately, and
`.button-l2:disabled` already exists at `index.css:272-275`) — a disabled
Start Timer should use the `:disabled` idiom, dashed border optional.

**N3.** `connectGuardStage` (`monitorRun.ts:527-537`) already treats a live
`SessionRun` as in-progress — the asymmetry with `useStartWorkout` predates
this wave, and it is the ready-made model for B1's option (b).

---

## §5-R1 verdict

**Needs a bound change — the summary cannot ride the same five bounds; it
needs its own driver-side gate, after which the downstream vouched channel
is reusable unchanged.** Deciding line: `driver.ts:1799-1803` — bound 4 of
`finishGraceIndex` is `toActualIndex(rawIndex, run.lastActiveState,
run.program.intervals.length)` over the frame's own Split/Interval Number,
a field 0x0039/0x003A do not carry (and the channel's sole entrance is the
0x0037/0x0038 pairing gate, `driver.ts:1709-1745`, which a summary frame
never reaches). Record acceptance (`monitorRun.ts:256-265`) and the hook's
release (`useMonitorSession.ts:1049`) accept a synthesized
last-index actual as-is — no hook changes needed — provided the driver
gate re-derives bounds 1/2/5 and B3's per-field derivation plus I4's
ordering rule are pinned.
