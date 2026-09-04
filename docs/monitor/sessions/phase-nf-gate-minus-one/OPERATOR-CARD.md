# V8 operator card — use this at the erg

**COMPLETED: do not execute again.** V8's one authorized scan passed; cleanup
was verified at 22:29:37 UTC. See `NORMAL-TRACE-V8-RESULT.md`. The commands and
instructions below are retained execution history, not a new scan permission.

Preparation is complete. Follow the PM-approved `NORMAL-TRACE-V8-RUNSHEET.md`;
do not restart research, planning, reviews, builds, installation or test suites.
Every phone install requires its own explicit permission. No scan is authorized
yet and no walk clock is running. “At the erg” means setup readiness only;
ask for the already-described explicit **go** before starting this one scan.

## Verified ready

- Pinned diagnostic **0.23.0 / 789** explicitly reinstalled and independently
  verified at 21:36 UTC. The current install/listing inputs are already staged.
- Latest-install wireless preflight at **21:55:45–21:55:54 UTC**: current
  installed identity accepted, live console plus WebView loaded, exact-PID
  finish, exit 0 and verified cleanup in **8.502 seconds**. Zero reader starts.
  This is measured preparation, not a guarantee of future wireless latency.
- Read-only `observe.mjs` below passed eight actual CLI cases through the real
  emitter/extractor, including normal, no-match, partial, duplicate, wrong
  scenario and different-attempt input. Reviewer `/root/controller_review`
  returned PASS: finish rule matches v8 and output exposes no raw logs/receipts.
- PM `/root/walk_pm` approved v8. The operator sequence, bounds and conditional
  Cancel feasibility experiment are unchanged. No further review is needed to
  execute this same approved scope.

All commands below are for Codex, never for James. Workdir:
`/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf-nfc-design/app`.
Private capture directory:
`/var/folders/m8/wdf8_49130z_j4m94t3rj3w80000gn/T/ergomatic-nf-v8.ags14zdx`.
Its root normal-console/evidence paths remain unused. `final-preflight/` holds
the separate zero-scan rehearsal; `final-preflight-summary.json` records it.
Raw native logs contain private storage data: never print or commit them.

## After explicit go

Immediately record the go-received clock and its **eight-minute absolute
deadline**. Do no other preparation first. Start the existing controller using
the direct Node command below with that ISO deadline. The shell's printed PID
becomes Node's PID through `exec`; retain it. The controller already rechecks
current installation before launching, so do not duplicate that device query.

```sh
printf 'CONTROLLER_PID=%s\n' "$$"
exec node --import tsx scripts/nfc-normal-trace-controller.ts capture \
  /var/folders/m8/wdf8_49130z_j4m94t3rj3w80000gn/T/ergomatic-nf-v8.ags14zdx \
  '<GO-RECEIVED-TIME-PLUS-EIGHT-MINUTES-ISO>'
```

Require a live host and the literal `WebView loaded` in the new console before
the physical block. Read only that boolean, not the surrounding raw output.
The launch JSON is written at exit; its absence while live is expected. If
identity/transport fails, stop; do not repair or reinstall while James waits.

Then send this complete block:

> 1. On the PM5, choose More Options → Connect Device; leave Ready for App Connection showing.
> 2. On the phone, open YOU and scroll to NFC GATE -1 PROBE (at most three scrolls). If Run normal sample is missing/disabled or a popup appears, stop and reply **blocked**.
> 3. Tap Run normal sample once and immediately hold the phone at the same PM5 NFC spot used earlier. Do not tap through the NFC sheet or scan again.
> 4. Leave it while I collect the result. I will tell you when finished or send the cancellation block if Bluetooth keeps searching.

## Observe and finish

Poll this read-only command at most 15 seconds apart; it prints only fixed
status fields. Do not reconstruct receipt extraction interactively.

```sh
node --import tsx \
  /var/folders/m8/wdf8_49130z_j4m94t3rj3w80000gn/T/ergomatic-nf-v8.ags14zdx/observe.mjs \
  /var/folders/m8/wdf8_49130z_j4m94t3rj3w80000gn/T/ergomatic-nf-v8.ags14zdx/normal-console.log
```

Observer SHA-256:
`a17890d8ba164811a9e63bca7201ba9a4b08b857e556cb2607ec508612ec30cb`.
It reads only; it cannot install, launch, scan, write, wait or signal anything.

- `finalReceiptAvailable=true`: two distinct canonical exports for the same
  single normal attempt are present and the newest was selected. Signal the
  exact retained controller PID with SIGINT; require exit and cleanup proof.
- Otherwise, record the first observation of `bleScanObserved=true`. After
  30 seconds without final receipt, with at least two minutes left on the total
  clock, send the conditional block below. A “done” reply never triggers finish.
- Explicit abort, broken capture or the observation deadline stops even without
  evidence. The controller reserves the final 45 seconds for cleanup. No retry
  or clock extension; release James after cleanup, reporting actual time.

Conditional block, unchanged from the PM-approved experiment:

> 1. If the NFC sheet has closed and the probe still says “Scanning for the PM5's exact local name,” scroll to Cancel sample (at most three scrolls) and tap once.
> 2. Leave the app open while I save the result. If that status/control is missing, disabled or covered, stop and reply **blocked**. Do not start another sample.

The post-sheet Cancel action is the declared on-phone uncertainty, not a desk
preparation task. Its unavailable UI ends the attempt as inconclusive; no new
gesture or extra scan is invented. All remaining outcomes and cleanup fallback
are fixed in the approved runsheet.
