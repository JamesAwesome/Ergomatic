# Walk 2026-08-23 — the combined walk: Phase RC's wire questions + Phase LL's exit

One erg session, ~6 minutes of rowing, both phases' open questions answered.
Laptop leg ran main `f7e8672` (PR #167's hold-open instrument) via
`walk-lab.sh`; phone leg ran the stock TestFlight build (v0.17.0, build 717 —
v0.18.x had not installed on the phone yet; the walk card's re-check rule was
applied and the delta noted: none of today's items touch BL's post-test
prompt, which the phone leg never reached).

## Provenance

| Artifact | What it is |
| --- | --- |
| `keystone-pm5-recording-1787491974452.jsonl.gz` | The laptop keystone (2×250m, no rest) with the hold-open armed: 791 events, full byte stream incl. the summary burst and 90.3 s held-open window |
| `photo-w1-product-id.jpeg` | SCREEN: PM5 Product ID — **firmware 459.069, hardware 134, serial 432331249, datecode 192026, model D\|E** (first time recorded anywhere in this repo) |
| `photo-w3-view-detail-totals.jpeg` | SCREEN: memory View Detail, Total Time page — v250m…2, Aug 23 2026, Total 2:18.7 / 500m / 2:18.7 avg / 25 spm; splits 1:10.2 (2:20.4, 26) r:00, 1:08.6 (2:17.2, 25) r:00 |
| `photo-w4-verification-code.jpeg` | SCREEN: same View Detail, Verification page — **6EF3-D827 5B55-52E1** |
| `ring-phone-1-btoff-at-ready.json` | Phone ring: BT killed at READY — clause (a) pre-stroke + W5's off-direction |
| `ring-phone-2-background-continuity-kill.json` | Phone ring: W6's 30 s background — the continuity false-kill (finding F2) |
| `ring-phone-3-menu-terminate.json` | Phone ring: W7 — PM5 Menu press mid-piece terminates the workout (state 11) |
| `ring-phone-4-btoff-midpiece.json` | Phone ring: BT killed mid-piece — clause (a) mid + End under the banner |

The laptop's hold-open ring (per-second tee of every characteristic during
the session and hold) was captured via `__pm5HoldOpen__.ring()` and is
byte-redundant with the recording's rx events; the recording is the
canonical copy.

## Wire-side checks (computed from the recording, not asked of the operator)

- **The summary burst exists, and we had been hanging up inside it.** At the
  finish: 0x0037+0x0038 at t=171860 ms, **0x0039+0x003A at t=172130,
  0x003F at t=172168** — all within ~310 ms of the boundary frames. The
  pre-LL code disconnected 21.7–107.3 ms after the terminal 0x0031, i.e.
  BEFORE the burst, every time. The "0x0039 has delivered zero notifications
  ever" corpus fact is fully explained: the app was deaf by construction,
  not the machine silent.
- **0x0039 decode vs the machine's own screen, field for field:** date
  u16 13688 → 8/23/2026 ✓; time u16 0x091C → 09:28 ✓ (**hours:minutes only —
  the wire genuinely carries no seconds**, hardware-confirmed); elapsed
  u24 13870 → 138.70 s = screen's 2:18.7 ✓; distance u24 5000 → **500.0 m
  work-only** = the keystone's a-priori truth ✓.
- **0x003F byte order settled (W4):** wire `27 d8 f3 6e | e1 52 55 5b` read
  as two little-endian u32 words = `6EF3D827 5B5552E1` = the PM5's own
  verification screen, exactly. The BLE table's "(Lo)"-first is correct; the
  CSAFE 0x72 "Byte 0: MSB" note describes the CSAFE framing, not this
  characteristic. Trailing bytes `f8 14 01 00 94 00 …` are undecoded
  (candidates: log pointer/size — RC-2-era work).
- **Workout state 12 (WORKOUTSTATE_WORKOUTLOGGED) observed for the first
  time**: post-finish 0x0031 frames carry state 12 through the hold window.
- **Frame cadence (finding F4):** 254 0x0031 frames, in-stream median gap
  990 ms, worst 1260 ms — the corpus's ~2.2/s with worst 810.3 ms does NOT
  bound this walk; 252 of 253 gaps exceed the old corpus worst. The 2500 ms
  watchdog held (no false banner) but its measured margin today is ~2.0×,
  not the corpus's 3.09×.
- **Held-open window:** disconnect at 90.3 s after the summary burst — the
  instrument's one-shot deferral behaved exactly as specced, and the record
  closed normally at the finish while the radio stayed up.

## Findings

- **F1 — Try again never revives after a mid-session BT-off.**
  `ring-phone-1` seq 23 records `onEnabledChanged reported false`; no
  enabled-true event ever follows, because the failure disposal tears down
  the per-session listener that would hear it. The button stays disabled
  forever on that screen. **Sharper repro from the operator:** a connect
  attempt STARTED with BT already off fails and leaves Try again clickable
  and working — the dead state is specific to BT dying mid-session.
  Cancel → Connect recovers cleanly (no app deletion — the brick is dead).
- **F2 — the continuity guard kills a healthy row on iOS background-resume.**
  `ring-phone-2`: 30 s backgrounded mid-piece; on resume liveness recovered
  (seq 29-32), then seq 33 carries a frame with `machineTotal=0` while
  elapsed/distance advanced (81 m → 0 at 59.3 s) and seq 34 closes the
  record as link-lost. The rower saw normal numbers, pulled, and landed on
  an end screen with NOTHING MEASURED. The guard's corpus-derived "healthy
  resumes never go backward" bound is web-derived; iOS resume produces a
  transient zeroed-TWD frame the corpus never contained. TWD's own
  semantics are also now suspect as a continuity key on native (see F5).
- **F3 — `endedBy: "link-lost"` is stored but rendered nowhere.** The saved
  session's log detail shows no lost-link marking (verified on-device and by
  grep: no component renders the value). v0.17.0's notes claim "your
  history can finally tell the difference" — the RECORD can; the rower
  cannot. One-line surface follow-up.
- **F4 — the web cadence halved vs the corpus** (numbers above). The
  watchdog threshold is fine today; the finding is that the distribution is
  environment-variable, which is 9a's point made on web. Native distribution
  remains unmeasured (the phone rings log events, not per-frame gaps).
- **F5 — TWD behaved as a boundary-ish accumulator on time intervals, then
  contradicted itself.** `ring-phone-3`: machineTotal read 0 through 11 s of
  interval 1 (terminated before any boundary — consistent with
  boundary-accumulator semantics). But `ring-phone-2` read 81 m at 56 s
  mid-interval-1 — inconsistent with that same theory. RC-1's spec must not
  assume either semantic without the captures in front of it.

## Walk-item verdicts

| Item | Verdict |
| --- | --- |
| W1 (RC) firmware | ANSWERED: 459.069 — and empirically inside a 0x003F-emitting band |
| W2 (RC) summary reachable | **YES** — burst at finish+~300 ms; 90 s hold unnecessary beyond ~1 s; recovery-HR re-fire NOT observed (no belt worn; HR fields zero) |
| W3 (RC) identity | ANSWERED: date/time bit-packing confirmed; no seconds on the wire |
| W4 (RC) hash | ANSWERED: fires on our firmware, at the finish, LE-word order |
| W10 (RC) distance-shaped summary | Answered in substance: the keystone IS a distance program and its summary decoded work-only |
| LL (a) pre-stroke + mid-piece | PASS — honest failure screen at READY; LOST header + banner + frozen numbers mid-piece |
| LL (b) recover without deleting | PASS in substance (Cancel → Connect reaches READY; no reinstall) with F1's named defect on the Try again button |
| LL (c) ring retrievable | PASS — copied from the failure screen and the summary screen, four times |
| LL (d) iOS residue | No unfixable residue observed; F1 is ours, not iOS's |
| LL (e) trace criteria | Carried by the shipped suites; the walk added the F2 counterexample at the record-closure layer |
| W5 power-cycle | Off-direction caught by `onEnabledChanged` (button correctly disabled while off); on-direction is F1 |
| W6 background 30 s | Backlog drains, liveness passes — and F2 fires. The guard, not the link, is the defect |
| W7 menu quiet period | **The question dissolves**: Menu mid-workout TERMINATES on the machine (state 11). No quiet period exists; no watchdog disarm needed |
| W8 self-TERMINATE | Not observed across the session's idle windows (longest ~90 s armed). Unresolved, low priority |
| W9 getConnectedDevices | Guard ran "no already-connected device; scanned normally" on every attempt. The cross-app danger scenario was untestable (no second app holding a different PM5) |
| Two-centrals probe | **A connected PM5 stops advertising** — Chrome's chooser cannot see it while the phone holds the link. Settles ROADMAP's contradiction with hardware: single-link in practice, by advertising, not by doctrine |
| §2b resume-band flash | Not observed during any piece this walk |

## Operational notes

- The lab's stack was per-worktree and was torn down at close
  (`walk-lab.sh down`). The phone leg's discarded/deleted sessions left no
  library or plan residue; the saved link-lost session was deleted after
  its F3 check.
- `storage-persist: denied (tolerated)` appears in every phone ring — the
  design's S6 stance, working as written.
