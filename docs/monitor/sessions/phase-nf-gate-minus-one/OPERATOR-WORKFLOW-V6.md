# NFC operator preparation — 2026-09-04

The pinned diagnostic app is now installed. The previous v5 attempt installed
nothing and made no NFC attempt; that historical outcome is unchanged.
The current session authorizes preparation, not a new scan. Gate -1 is still
incomplete and product implementation remains gated.

## Measured preparation and device state

First recorded clock: **19:52:57 UTC**. This preparation includes recovering the
record, controller work, installation, actual command checks and PM review.
Its duration must be reported separately from, and in addition to, any proposed
remaining operator session. No short-duration promise was made for this work.
Final preparation elapsed time is recorded at handoff below.

Private evidence directory:
`/var/folders/m8/wdf8_49130z_j4m94t3rj3w80000gn/T/ergomatic-nf-preparation.r7pytwiu`.
It was created with `mkdtemp` and contains source-artifact verification,
CoreDevice JSON and local logs. Do not commit or paste native console: the
Capacitor debug stream includes secure-storage data. Export only allowlisted
NFC diagnostics and redacted framed receipts through the existing classifier.

Checks actually performed on Kaito (iPhone 17 Pro, iOS 26.6.1):

- `devicectl device info details` established a paired, wired device with
  developer services enabled. No USB or unlock request was needed.
- SHA-256 of the App executable and `GateMinusOneProbe-O_TBUSFS.js`, exact
  bundle/version/build, strict/deep code-sign verification, CDHash, TAG-only
  NFC entitlement and usage text all matched v5's pinned values. The product
  source diff from `7e10d289` was empty after excluding the four host
  controller/classifier files. See `artifact-verification.json`.
- At 19:55 UTC `device install app` accepted that exact artifact. Independent
  `device info apps --bundle-id haus.waffle.ergomatic` reported 0.23.0 / 789
  at the same installation URL. See `install.json` and `installed-apps.json`.
  This is install-source plus installed-list evidence, not a phone-binary hash.
- Suspended replacement with `--terminate-existing --start-stopped` produced
  PID 51977. `process terminate --pid 51977 --kill` succeeded; an unfiltered
  process listing proved it absent. See `cleanup-rehearsal-*.json`.
- Fresh `process launch --terminate-existing --console` captured WebView-loaded
  and JS/native bridge output. Its JSON result was absent while attached and
  present with success after termination. Do not depend on launch JSON to
  establish readiness while the process is running.
- Post-capture suspended replacement, terminate and unfiltered process listing
  proved both the original attached PID 51991 and replacement PID absent.
  See `console-cleanup-*.json`. The host exit status after remote termination
  was 1 despite successful launch JSON; host exit alone is not an NFC result.
- The attempted `executable ENDSWITH` process filter failed because CoreDevice
  exposes an NSURL there. The procedure uses the already-working unfiltered
  JSON process list. This failure required no phone action.

## Screen inspection failure and correction

A second console launch started PID 52010 for desk screen inspection. LLDB
attached and stopped the main thread. Before a DOM result was obtained, James
reported: “the app isnt responding.” The debugger's paused process caused that
interruption; it was not an NFC or app-behavior result.

Codex immediately issued `process detach`; LLDB confirmed PID 52010 detached
and exited. An ordinary foreground `devicectl device process launch` then
succeeded with PID 52024. A host process census found no LLDB or device-console
process remaining. **Responsiveness and the rendered screen are not independently
verified by successful launch.** No more debugger inspection is planned.

No Run normal sample action, tag presentation, NFC attempt, PM5 action, rowing
or programming occurred during preparation. James was not asked to gather any
console text, metadata or receipt. The interruption and elapsed preparation
are part of the cost, even though no timed scan session started.

## Controller change and scoped verification

The revised host controller separates preparation from capture, removes timed
stdin acknowledgements and emits no physical scan instructions. A capture has
an explicit agreed total deadline; setup responses never start an NFC attempt.
The signed app and classifier remain unchanged. Scoped controller tests passed
9/9 after the four baseline regression failures and the review fixes. Targeted
ESLint and Prettier checks passed. Reviewer `/root/controller_review` returned
PASS with no remaining findings: malformed cleanup process rows now fail closed,
previous capture evidence is refused before device commands, and finish before
launch is inconclusive.

The final controller verification functions also accepted today's actual
CoreDevice JSON: installed identity and URL match; rehearsal PID absent;
original console and replacement PIDs absent; exact installed executable absent.
This is a real-producer check in addition to fixtures, without another install
or phone command. Controller SHA-256:
`2136f3ffedb5c1ddb085a394173e40cf320a403f9529c490e1e6397239643c96`.

Unchanged browser, native and full NFC suites are
not repeated; their artifact evidence remains in `DIAGNOSTIC-CAPTURE.md`.

The real CLI was rehearsed off-device with a private fake `xcrun` on PATH.
Direct `node --import tsx scripts/nfc-normal-trace-controller.ts capture ...`
printed `CAPTURE_ATTACHED`; SIGINT to that exact controller PID finished in
under one second with exit 0, `cleanupVerified=true`, empty stderr and the
expected inconclusive result from a log containing no NFC evidence. The raw
console file mode was 0600. This proves CLI/signal plumbing, not device behavior.
Signalling the pnpm wrapper instead returned -2 despite child cleanup; the
runsheet now prescribes direct Node invocation and controller-PID signalling.

Real changes were committed as `fcfec920` before mutation probes; hooks fired
and enforced staged format/lint followed by whole-project typecheck. No push,
merge, release, browser lab or Docker stack was involved.


Eight deciding-source mutation probes each failed the scoped suite (exit 1);
restoring the committed source returned 9/9 PASS. No controller source diff
remained. The host scripts are outside the configured coverage graph.

| Deliberate break | Failure observed |
| --- | --- |
| setup elapsed discarded | AssertionError: expected { ready: true, …(3) } to match object { ready: true, elapsedMs: 5000 } |
| installed build check removed | AssertionError: expected [Function] to throw an error |
| original app absence check removed | AssertionError: expected [Function] to throw an error |
| process shape proof removed | AssertionError: expected [Function] to throw an error; AssertionError: expected [Function] to throw an error |
| prelaunch interruption ignored | AssertionError: expected { …(5) } to match object { cleanupVerified: true, …(1) } |
| capture preservation guard removed | AssertionError: expected [Function] to throw error including 'already contains capture evidence' but got 'ENOENT: no such file or directory, op…' |
| finish-now successful evidence suppressed | AssertionError: expected { …(5) } to match object { cleanupVerified: true, …(1) } |
| eight-minute limit extended | AssertionError: expected [Function] to throw error including 'deadline' but got 'ENOENT: no such file or directory, op…' |

## Review and handoff

PM reviewer `/root/walk_pm`: **PASS for one untimed zero-scan screen
description only**: “Tell me what screen Ergomatic shows.” One short reply,
no gesture, running controller, timer or NFC attempt. That reply starts no
sample clock and grants no scan permission. **Normal sample NOT READY** until
the current rendered screen, reachable probe and enabled normal button are
observed in the freshly captured process. This verdict does not authorize the
future capture/sample execution; no new product design review was requested.

The reviewer independently read the artifact and successful install/list
records. Further intrusive inspection would repeat the disruption; the screen
observation is the one remaining fact host checks cannot establish. Controller
code review is recorded separately below.

Preparation handoff checkpoint: **2026-09-04 20:13:08 UTC**,
20 minutes 11 seconds since the first recorded clock.
This includes installation, the debugger interruption, code review, PM review
and desk verification. No normal-sample clock or NFC attempt is running.
