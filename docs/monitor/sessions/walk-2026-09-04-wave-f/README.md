# Wave F exit walk — 2026-09-04

Both planned pieces passed on James's iPhone running reported TestFlight
**v0.36.1**, with PM5 **432331249 Row**. The pre-pull lock retained the
complete interval through the saved-detail door; a deliberate Bluetooth-off
then retained a completed interval and a separate last partial reading.
This is evidence for these two runs, not a universal lifecycle guarantee.

## Provenance and budget

- James reported installed version 0.36.1; the build number and iOS version
  were not captured. Tag `v0.36.1` points at `c5015c2e` and contains
  partial-saving PR #279 (`e0912b32`). PM5 firmware was not captured.
- Native phone against the normal app service; no local lab or Docker stack
  was started, no dev flags, and no raw BLE recording exists. Native builds
  do not expose the web recording seam.
- Two pieces, approved budget about two minutes easy work, no heart-rate
  requirement. Piece 1 was a full minute. Piece 2 was one 100 m interval
  plus about ten seconds of the next, then stop; no repeat was requested.
- The two JSON files are the complete diagnostics arrays pasted by James,
  extracted verbatim from this conversation, with a final newline. They
  have 58 and 54 contiguous entries respectively; no entries were curated,
  reconstructed, or dropped. These are diagnostic rings, not raw recordings.
- All three JPEGs are original, unedited phone screenshots. They are
  **CORRELATED**, not same-frame PM5/app photographs. Correlation is the
  requested operator sequence, workout title, PM5 serial, displayed minute,
  and the matching values below. No separate PM5-screen oracle was captured.
- The operator was instructed to Save, reopen the saved row from Today,
  and capture it. The supplied images show the saved-detail surface
  (including Delete session), not the unsaved feedback form. No server DB
  query or network capture was taken; the images are saved-door evidence,
  not independent inspection of database bytes.
- James explicitly requested batched instructions after the initial
  one-tap-at-a-time setup. The remaining steps were delivered in batches
  before work, with no mid-piece requests and no increase in rowing.

| Artifact | Evidence |
| --- | --- |
| `lock-ring.json` | Piece 1, seq 0–57; pre-pull lock, recovery, finish, boundary and summary receipts |
| `lock-saved-detail.jpg` | Piece 1 reopened saved detail, 10:35 local |
| `drop-ring.json` | Piece 2, seq 0–53; completed boundary, partial interval, native Bluetooth-off, End |
| `drop-before-disconnect.jpg` | Piece 2 stopped in interval 2, before Bluetooth was disabled |
| `drop-saved-detail.jpg` | Piece 2 reopened saved detail, 10:40 local |

The import block was run through `parseBulk`, `validateWorkoutInput`,
`phases`, and `compileProgram` before it was handed to James. It compiled
to one 60-second work interval and two 100-metre work intervals, all with
zero programmed rest. The validation used example baselines only; the phone
used James's baselines (the captured target is 2:05.0).

```text
94 | Walk F Lock | O2 | easy | 1
w 1' 6k @20

95 | Walk F Drop | O2 | easy | 1
x2
w 100m 6k @20
```

## Piece 1 — lock before the first pull: PASS

James was at READY with nothing rowed, locked the phone before pulling,
rowed about 20 seconds, unlocked, and finished the original minute.

| Ring seq | Observation |
| --- | --- |
| 15–18 | Armed; elapsed and distance zero; one interval programmed |
| 20–21 | Resume gap 23,029 ms; `phase=ready`, two frames while hidden |
| 22–26 | Stream recovered; first rowing frame 21.1 s / 69.6 m, raw rowing state 1, not stale; record opened and durable commit accepted |
| 29–35 | Natural finish at 60 s; `partial-refused reason=finished`; closed record saved |
| 42–44 | Final split arrived through finish grace; interval 0 accepted, actual count 0 → 1; saved |
| 45–55 | Machine summary 60 s / 200 m and verification bytes received, stored; hand-off released with one measured interval |

**SCREEN transcription:** Walk F Lock; PM5 432331249 Row; AVG SPLIT
2:30.0; TIME 1:00; DISTANCE 200. One interval, 1:00, target 2:05.0,
actual 2:30.0, rate 25 / 20. MACHINE CONFIRMED · WORK ONLY; 1:00 work ·
200 m; CODE `3F1B-E2E3 C9CD-DE3F`.

Independent arithmetic: 60 / 200 × 500 = 150 seconds/500 m = 2:30.0.
The interval actual and received machine summary both report 60 s / 200 m;
the saved door agrees. The ring's 200.1 m live accumulator is not the
saved-distance oracle.

**Limit:** the app opened its record at resume, 21.1 seconds into the piece.
The screenshot's trace starts after unlocking. The full machine-reported
interval survived; the unreceived trace head was not recovered. This pass
does not claim continuous background sampling or recover missing samples.

## Piece 2 — real link loss, then End/save: PASS

James completed interval 1, rowed briefly into interval 2 and stopped.
After the live screenshot, he was instructed to turn Bluetooth OFF in
iPhone Settings (not Control Centre), return, End, Save and reopen the row.
There was no further rowing.

| Ring seq | Observation |
| --- | --- |
| 24–34 | Interval transition; machine interval 1 became app index 0; `record-actual … accepted (actuals 0 -> 1)`; saved |
| 35–39 | Rowing in interval 2, then stopped at 20.4 m; `pause-declared` follows |
| 40–45 | A separate 7,230 ms foreground-resume gap recovered; **not the radio drop** |
| 47 | `disconnected: capacitorBle: Bluetooth disabled (onEnabledChanged reported false)` — authoritative native loss event |
| 50–51 | After the disconnect, End banks `partial-written idx=1 m=20.4 s=59.74`; durable commit revision 5 accepted |
| 52–53 | Teardown closes the stale-frame instrument and exports the latch count |

**SCREEN before disconnect:** PM5 432331249 Row; 2 OF 2 · WORK;
120 m total; dash current heroes; target 2:05.0; AVG 3:57.8;
PULL TO RESUME. This is state/timing evidence, not proof of a radio loss.

**SCREEN saved detail:** Walk F Drop; PM5 432331249 Row;
LINK LOST · the app lost the monitor · 1 of 2 intervals measured.
AVG SPLIT 1:57.0; TIME 0:23; DISTANCE 100. Interval 1 actual 1:57.0,
rate 26 / 20. Interval 2 target 100 m, with a separate `20 m · 1:00`
reading and no actual-pace value. Caption:
INTERVAL 2 · LAST READING BEFORE THE LINK WENT.

The completed 100 m remains the headline distance; the partial is separate,
rounded on screen from the ring's 20.4 m / 59.74 s. It does not turn
“1 of 2 measured” into “2 of 2”, and is not added to the completed-work
heroes. The partial's elapsed time includes the stopped time while the
PM5 clock continued; it is not pulling time and does not imply another
minute of rowing. Screenshot 0:23 is rounded display time; do not recompute
1:57.0 from that rounded integer.

**Limits:** this is one deliberate native radio-off path, not evidence of
the frequency of natural Bluetooth loss, automatic reconnect, continued
collection after loss, or whole-workout recovery. `liveness-silence` alone
would not have passed this leg. The `machineTotal=200m` diagnostic at seq 38
is not used as a work-distance oracle.

**Secondary observation, not new work:** despite zero programmed rest, seq
25 briefly reports `state=resting` (workoutState 7), followed by rowing at
seq 26 and the accepted boundary at seq 33. “Zero rest” must not be used as
proof that no resting status frame can occur; this run demonstrates otherwise.
Partial eligibility is instead evidenced by the accepted first actual, the
second interval's rowing reading, and its later `partial-written` receipt.

## Exit evidence reused, not re-rowed

- **Mid-row background:** `../walk-2026-09-03-resume-edge/` records a
  35.5-second lock while live, continued rowing after resume, the same
  session key and successful durable receipts. It does not itself contain
  a saved-detail screenshot. Today's first leg adds the native
  resume-to-saved-door proof, but is explicitly a different lock timing.
- **Rejected durable write:** current automated gates cover denied-from-open,
  denied-at-close, Retry, memory-only recovery through real navigation to
  Log and the Save request, and all three real-capture finish-grace
  actuals surviving a failed close write. No quota/eviction event was
  induced on James's phone, and `storage-persist: denied` in these rings
  is a persistence-permission result, NOT a failed `setItem`.
- **Accepted exclusions remain:** Correct Resume is in the Icebox. Same-row
  reattachment, post-drop collection, MISSED/trace-break writers, reload
  after a rejected write, and later local-store eviction are not passed
  by these walks and are not reopened by them.

## Verification and release

The pre-walk evidence check ran seven client suites, 358 tests, all passed
at `9baa4fa7`: `useMonitorSession`, `partialReplay`,
`handoffStoreReplay`, `lifecycleReplay`, `handoffStore`,
`WorkoutDetail.connectedRecovery`, and `WorkoutDetail.programDropped`.
The walk used the later v0.36.1 tag containing the same lifecycle fixes.

The docs closeout at base `c5015c2e` reran the whole unit/client suite:
231 files passed, 6,616 tests passed and one skipped. Lint, all three
TypeScript projects (including the 19/19 e2e membership census), and app
format checking passed. There are no product-code changes; integration,
browser e2e, screenshots and a new build were skipped for this docs-only
closeout. The three supplied images are the native visual evidence.

Both phase-close gates returned GO: the antagonist checked the ordered
actual → loss → partial evidence and narrowed the zero-rest premise; the PM
accepted reuse of the prior mid-piece evidence and the scoped failed-write
gates. Their lessons are in the canonical agent ledgers. No new implementation
or release is authorized by that verdict.

Pre-walk main CI's latest five runs were all successful, including
`c5015c2e`'s run 33828866824. The closeout PR records its fresh doc gates
separately. No TestFlight release is needed for archiving this evidence;
the tested behavior is already in v0.36.1. No lab was booted, so there is
no walk stack to leave running.
