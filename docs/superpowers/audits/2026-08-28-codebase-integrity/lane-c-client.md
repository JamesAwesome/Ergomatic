# Lane C — Client Workflow, Recovery, and Log Truth

Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

Status: COMPLETE — fresh high-end semantic review approved after corrections.

Evidence snapshot: this lane records Task 7's pre-validation dispositions.
`findings.md` is authoritative after Tasks 11–14; in particular, AUD-020's
fabricated cleanup trigger no longer carries a P1/P2 disposition.

## Scope and authorities

Lane C traced the active phone session, monitor hand-off into logging, saved-log
construction and display, every production `app/src` directory, browser
storage access, successful API readers, and the client half of the realistic
library path. The expected authorities were the explicit client/server product
contract, the approved active-session recovery outcome, independently read
stored rows, and the platform storage failure contract. Interfaces, casts,
saved hero scalars, and the product's own summary functions were not treated as
oracles.

Two Terra-high read-only investigations covered active-session recovery and
saved-log truth. The planned Luna mechanical scout could not be opened because
the agent-thread limit was full, so the active-session investigator reused its
already-open client context for a separately labelled, non-defect-declaring
directory census. The controller alone ran temporary biting probes; every
mutation was removed and the product diff returned to empty.

## Active-session writer and recovery trace

| State                  | Authoritative writer                                                                                                                                   | Recovery readers                                                                                                                                                                     | Cleanup / replacement                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session draft          | Start saves the stamped draft before clearing either run (`app/src/session/useStartWorkout.ts:95-103`).                                                | Countdown, Timer, Log Session, and Today (`app/src/session/Countdown.tsx:102-111`, `Timer.tsx:354-361`, `LogSession.tsx:1127-1131`, `today/Today.tsx:338-355`).                      | Cancel, abandon, discard, successful save, or stale-draft cleanup.                                                                                                                    |
| Phone-timer run        | Countdown freezes and saves resolved phases; Timer writes every real engine transition (`app/src/session/Countdown.tsx:177-227`, `Timer.tsx:394-407`). | Countdown resumes progressed runs, Timer reloads, and Today identifies live/unlogged work (`Countdown.tsx:177-184,254-260`, `Timer.tsx:354-361,450-467`, `today/Today.tsx:273-280`). | Phone replacement occurs only after draft save; monitor rowing replaces it when the monitor record opens.                                                                             |
| Monitor run            | `createMonitorRun` opens it; boundary/terminal writers return and persist new records (`app/src/monitor/monitorRun.ts:560-584,785-857,898-921`).       | Today and the guarded monitor log door (`app/src/today/Today.tsx:282-288,604-687`, `session/LogSession.tsx:260-304`).                                                                | Phone replacement after draft save, successful monitor log, or explicit monitor discard. Late writers identity-check storage before persisting (`monitorRun.ts:1002-1025,1085-1100`). |
| Today pick / overrides | Shuffle and filter actions write client convenience state (`app/src/today/Today.tsx:933-939,1149-1173`).                                               | Remount readers bind it to date, plan, and position.                                                                                                                                 | Context mismatch returns the default without altering durable workout/session state.                                                                                                  |

The baseline freeze point held: `buildRun` resolves targets once and Timer does
not read changing baselines (`app/src/session/engine.ts:65-94`). Timer,
Countdown, and staged discard clean their intervals/listeners/timeouts on
unmount. Browser evidence does not establish whether native backgrounding
always delivers Timer's DOM visibility event; that remains a Lane D boundary.

## Storage fault matrix

| Operation                                 | Disposition                                                                                                                                                                                     | Evidence                                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Read active state                         | **Confirmed P1, AUD-011.** Four loaders access `localStorage` before their guard; the default Today mount already reproduced the block.                                                         | `run.ts:134-148`, `draft.ts:138-152`, `monitorRun.ts:497-520`, `todayPick.ts:48-69`                                                         |
| Write draft / run / monitor / preferences | The writes catch storage errors. Most callers react correctly to draft failure.                                                                                                                 | `run.ts:120-127`, `draft.ts:116-123`, `monitorRun.ts:475-491`, `todayPick.ts:75-81`, `todayOverrides.ts:233-238`, `builderDraft.ts:81-106`  |
| Countdown run write                       | **Confirmed P1, AUD-015.** `saveRun()` returns false, but Countdown ignores it, commits in-memory countdown state, and navigates to Timer; Timer reloads no run and returns the rower to Today. | `Countdown.tsx:219-227,338-343`; `Timer.tsx:354-361,456-458`                                                                                |
| Clear active state                        | **AUD-011 scope extension.** `clearRun`, `clearDraft`, and `clearMonitorRun` call `removeItem` without guards across cancel, abandon, discard, and successful-save paths.                       | `run.ts:147-149`, `draft.ts:151-153`, `monitorRun.ts:519-521`                                                                               |
| Successful save followed by cleanup       | **AUD-011 reproduced consequence.** A 201 followed by a throwing draft clear is caught as a save failure; records remain and one retry sends a second POST.                                     | `LogSession.tsx:755-781,1173-1175`                                                                                                          |
| Session-storage UX helpers                | Cleared: Library, News, history scroll, filters, and monitor-log reads guard normal production access. The only unguarded stash is dev/E2E hold-open instrumentation.                           | `library/*Scroll.ts`, `libraryFilters.ts`, `newsScroll.ts`, `logScroll.ts`, `LogSession.tsx:942-987`, `monitor/transports/index.ts:277-397` |

No production `localStorage.clear()` exists. The controller's calibrated
Countdown probe failed only the `RUN_KEY` write after a real draft save. The
real Countdown → Timer route returned to Today with no run; the other 4,032
client tests passed. A separate real Log Session probe returned an independently
shaped 201, made only `DRAFT_KEY` removal fail, observed the false error and
retained records, restored storage, retried, and observed two POST calls; the
other 4,032 client tests passed.

## Saved-log truth trace

| Door / tier     | Stored source                                                                                                                                                                                                  | Display truth disposition                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual          | Prescribed targets only; no hero scalars are posted (`app/src/session/logDraft.ts:525`, `LogSession.tsx:1956`).                                                                                                | No measured hero is invented.                                                                                                                                              |
| Phone timer     | Stored rows include prescribed target copies; only distance-step stopwatch actuals can feed average pace. Time is wall-clock and distance hero is absent (`summaryModel.ts:1040-1140`, `LogSession.tsx:1359`). | Detail normally reuses the posted average/time scalars, so that display is not an independent check (`log/storedSummary.ts:705-711`).                                      |
| PM5 Tier A      | Machine totals/detail copied from monitor observations (`monitorRun.ts:1085`, `LogSession.tsx:1750`).                                                                                                          | Time, distance, and average pace are labelled machine observations, not app recomputations (`storedSummary.ts:624-641`).                                                   |
| PM5 Tier B      | Per-step PM5 actuals plus stored work/rest sums (`logDraft.ts:834`, `monitorRun.ts:756`).                                                                                                                      | B1 uses the stored work pair for time/distance; B2 uses guarded step sums. Both derive average pace from qualifying stored PM5 steps (`storedSummary.ts:507-518,663-699`). |
| Legacy fallback | Old saved hero scalars.                                                                                                                                                                                        | Values may be stale/fused by design and are presented as stored legacy fallback, not revalidated truth (`storedSummary.ts:705-711`).                                       |

Manual and timer log builders omit rest rows, so Lane A's preview-rest defect
does not create a second saved-number contradiction here. Whether saved logs
must preserve authored rest is an unresolved product rule and remains inside
AUD-006's design gate.

## API and stored-shape probes

- **AUD-002 promoted to P2 / Probable for initial History.** `useLogHistory` casts a
  successful body directly to an array and enters ready state
  (`app/src/log/useLogHistory.ts:58-68`); `HistoryList` then calls `.map`
  (`HistoryList.tsx:180-199`). A temporary mounted probe supplied `[]` and
  independently observed the normal empty surface, then supplied `{}` and
  observed the real History render fail. It imported neither client interfaces
  nor server serializers. The other 4,032 client tests passed.
- **AUD-013 promoted to P2 / Confirmed for the history-list projection.** The
  server checks that the JSON member is a number, then casts it to PostgreSQL
  `double precision` (`app/server/stores/logs.ts:269-294`). In real PostgreSQL
  18.4, a healthy two-row list returned 200; raw-updating one owned row to the
  database-valid JSON number `1e1000` made the mounted whole-list request return 500. The exact integration file passed 12/12 with the temporary discriminator.
- **AUD-004 remains a hypothesis.** Wrong-typed machine-summary fields have
  known first consumers in stored-summary and verification rendering, but no
  installed-client field contract establishes whether field-level strictness
  or permissiveness is correct.
- Ambiguous network loss after a committed POST remains a hypothesis. The
  server has no session idempotency key, but intentional repeated logs and
  retry duplicates have no established durable identity contract to separate
  them.

## Mechanical coverage disposition

Every production `app/src` area has an owner: shell/root/auth/API (Lanes B/C),
builder/Today/plan/session/library/news/onboarding/You (Lane C),
monitor/connected/native/adapters (Lane D), log/charts/judgment (saved-log
truth), shared components/theme/CSS (their consumer plus design gate), and
test helpers (Lane E). There is deliberately no settings directory; the You
screen owns the available account/baseline functions. No unowned product
directory remains.

The realistic library path reaches `useWorkouts` → Library/Today → Workout
Detail → draft or Connect (`app/src/api/useWorkouts.ts:21-63`,
`app/src/workout/WorkoutDetail.tsx:221-319`). Client import/edit/suggestion and
persisted reload are mapped; the PM5 execution half remains Task 8. The complete
302-row mounted path has not been replayed end-to-end and remains an explicit
Lane D/client-server integration check rather than a clearance claim.

## Cleared probes and unknowns

- Active target baselines are frozen once at run construction.
- Storage functions catch writes; caller recovery is cleared except for
  AUD-015 and the AUD-016 monitor hypothesis. Convenience storage remains
  best-effort.
- Timers/listeners clean up on React unmount in browser execution.
- Saved PM5 Tier B average pace has a distinct stored-step derivation, while
  Tier A and legacy hero displays remain copied observations.
- Native Timer background delivery, installed-client machine-summary field
  compatibility, ambiguous-response idempotency, and the complete 302-row
  client/device path remain unknown or assigned to later lanes.

No contradiction with the accepted Lane A/B evidence was found. The product
diff is empty and all temporary databases, mutations, and tests were removed.
