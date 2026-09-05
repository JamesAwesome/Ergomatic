# Recovery host preparation — September 4–5, 2026

The original component rehearsal is complete. The real diagnostic component, host
Inspector commands and strict receipt reader completed an idle check and all
four consecutive recovery pairs in Simulator. NFC/Bluetooth callbacks were
explicitly synthetic; physical phone capture/modal behavior remains the next
preflight/feasibility question. The approved product is unchanged.

## Minimal command and deciding checks

`inspector-recovery.py` reuses the reviewed v2 Inspector selection, quiet
evaluation and explicit detach. It takes one fresh run directory, an absolute
deadline and either idle mode or one explicit recovery scenario. It cannot
install, launch or terminate an app, retry a case or advance to another case.
The explicit install command and existing capture controller own those
lifecycle operations.

The helper validates bundle/version/build, install URL and exact executable/PID
from the current run's files. It uses actual existing controls, retains a
complete host-side A export matching the visible record array before reload,
requires a new document in the same process, starts B once and waits for
terminal DOM plus two newest complete canonical exports belonging to that B.
It then retains B and performs one benign idle reload for the next case.

The substantive review fix was the final-receipt boundary: counting any two
end markers could pair a delayed A export with B's first/pre-drain export.
The verifier now strictly reconstructs both newest started groups and requires
the same receipt timestamp, attempt timestamp and scenario. A truncated newest
group blocks progress. The normal-only classifier is not used as recovery proof.

Each pair has a maximum 90-second observation allowance; admission requires
the whole allowance plus at least 45 seconds of cleanup. Every transition is
bounded by the original deadline. Nonfinite deadlines and reserves below 45
seconds are rejected. No human acknowledgement drives automatic completion.

## Actual console and Simulator evidence

The worker observed a truncated synchronous export through Simulator
`simctl launch --console` redirected to a file. The same quiet evaluation
produced a complete canonical export through `--console-pty`. No change to
Inspector's quiet flags was necessary. These observations are about Simulator,
not proof of the physical `devicectl --console` transport.

The idle command therefore emits a harmless unique `NFC_CAPTURE_CHECK` burst
and requires its complete exact host output before reloading. It consists of
three payload lines plus an end line, maximum 3,127 characters per line; v8's
retained real receipt has three frames, maximum 3,071 characters. The canary
is a comparable/larger burst, stays below Capacitor's documented-in-source
4,068-character per-argument limit, and is not an NFC receipt or native call.
Its actual four-line capture and subsequent idle reload passed in Simulator.

The final rehearsal used iPhone 17 Pro Simulator/iOS 26.5, the actual unchanged
GateMinusOneProbe and an explicitly labelled fixture replacing only its native
port with synthetic callbacks. The helper's actual main function ran with only
its phone transport substituted by the existing Simulator Inspector transport.
Simulator app container, Info.plist and process executable independently bound
PID 95207. All four scenarios ran consecutively against that process and one
PTY console, with actual exports, strict extraction, reload/reselection and
idle reset between pairs. Idle plus four pairs completed in **45.392 seconds**.
That is simulator throughput, not an estimate of hardware/operator time.

## Validation and retained files

- Six scoped Python tests passed. They cover run identity, byte offsets and
  changed streams, blocked partial export, retention before final reset,
  missing canary end and invalid budget inputs.
- Four real emitter/extractor cases passed. The original verifier first failed
  the delayed-A/first-B regression by accepting it; the correction rejects it,
  a single B export and a truncated newest export, and accepts two complete B
  exports. No hardware receipt was modified or promoted by these synthetic tests.
- Separate-copy mutations accepting a canary without its end line and disabling
  budget validation failed their focused tests; the fixed source passed.
- `/root/controller_review`: PASS on the final hashes and evidence, all findings
  closed. No broad unchanged suite or product rebuild was repeated.

| Private file | SHA-256 |
| --- | --- |
| inspector-recovery.py | `6bedf93e705b9cf6cdf2b5087186fb8f3a9a150232c8863ddf12e43959778dc2` |
| verify-recovery-receipt.ts | `1a88420706ca3353d9b49c3f6ca9ea627c4074a5543b1882146f8624aaeef34f` |
| test-inspector-recovery.py | `3af687d055e9c5d1c0e53f821293c86d7b1a969930acf9390826fcef70274bf2` |
| test-receipt-pair.mjs | `8b52388a6e720d8b3c1a91a67be760e54b1640ad1b7cd63e1bf779f6a6dd7609` |

Runnable files, venv, raw logs and per-case evidence remain under the private
root named in `RECOVERY-COMMAND-CARD.md`. Source, fixture, mutation summary,
rehearsal summary, canary proof and cleanup record are also preserved in the
ignored worktree `.superpowers/sdd/2026-09-03-phase-nf-gate-minus-one/inspector-v3/`.
Simulator termination and shutdown were verified; PID 95207 is retired.
No phone install, launch, NFC operation or scan happened during this desk turn.
The one read-only phone app listing found the already-recorded identity mismatch.

Desk preparation began at 23:52:06Z on September 4. By the final PM PASS at
approximately 00:28Z on September 5, this turn had consumed about **36 minutes**
of additional desk time, including rehearsal and review. It is additional to
earlier preparation and never represented as part of the five-minute future
phone setup estimate. PM approved setup v2; its later [result](ZERO-SCAN-SETUP-V2-RESULT.md) stopped
before the idle canary. The fixture above did not exercise the actual You lazy
route. Current helper pins and the focused correction are recorded in
[INSPECTOR-LOADING-FIX.md](INSPECTOR-LOADING-FIX.md); the table above preserves
the exact historical rehearsal files. Phone preparation still gates the erg
invitation.
