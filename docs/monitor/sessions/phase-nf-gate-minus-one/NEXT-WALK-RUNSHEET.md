# NFC walk checkpoint

**V8 completed: the one-scan normal trace passed; cleanup verified.**
See [NORMAL-TRACE-V8-RESULT.md](NORMAL-TRACE-V8-RESULT.md). Total operator time
was 1 minute 46 seconds. No walk clock is running or further scan authorized.

The exhausted [v8 runsheet](NORMAL-TRACE-V8-RUNSHEET.md) and
[operator card](OPERATOR-CARD.md) are retained history. Do not execute them again.
The broader Gate -1 matrix remains incomplete; no next walk is prepared or
approved by this result. Every phone install requires explicit permission.

[REMAINING-PROOF.md](REMAINING-PROOF.md) reconciles existing evidence and names
the remaining recovery evidence. Desk preparation produced a signed,
reviewed temporary recovery build, subsequently installed in the setup below. See
[RECOVERY-PREPARATION.md](RECOVERY-PREPARATION.md) for actual time and limitations.

[NF-RECOVERY-SETUP-v1](ZERO-SCAN-SETUP-RUNSHEET.md) is now completed. James
explicitly authorized one install; it succeeded and was independently verified.
The idle Inspector check stopped at an unidentified RuntimeError guard, and
bundle cleanup was verified within 1m38. See
[the result](ZERO-SCAN-SETUP-V1-RESULT.md). No NFC scan occurred. The install
permission is consumed; there is no approved retry or new erg invitation.

[Simulator preparation](SIMULATOR-CONTROL-PROOF.md) fixed Inspector target
selection and demonstrated component reload; its fixture did not exercise the
actual authenticated You route. [Setup v2](ZERO-SCAN-SETUP-V2.md) then installed
and independently verified 0.23.0/789, but its idle check stopped before the
canary. Cleanup completed in **2m14.519s total**, with zero NFC attempts. See
[the result](ZERO-SCAN-SETUP-V2-RESULT.md). That installation permission and run
are consumed; do not repeat them.

The [host loading correction](INSPECTOR-LOADING-FIX.md) addresses a reproduced
lazy-mount guard defect; the actual phone stop's exact cause remains unknown.
The next bounded prerequisite is [no-install setup v3](ZERO-SCAN-SETUP-V3.md).
It has PM PASS and final code-review PASS; the sole next user action is its
ready/unlock block. It reuses the existing installation only
if a fresh listing still matches; a mismatch aborts without reinstalling.
Do not invite James to the erg or start a scan before phone preparation passes
and the separate [recovery protocol](RECOVERY-WALK-V1.md) has PM readiness PASS
and explicit scan consent. No short timer starts before a required reply.
