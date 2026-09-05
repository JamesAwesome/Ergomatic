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

[No-install setup v3](ZERO-SCAN-SETUP-V3-RESULT.md) now **PASS**: fresh install
identity, actual phone controls, all four capture-canary lines, same-process
new document and cleanup verified. Total operator time **1m42.366s**; zero
installs and zero NFC attempts. James was released to lock the phone. Capture
host PID 10805 is retired. Do not reuse this run or its ready permission.

The [recovery protocol](RECOVERY-WALK-V1.md) is the next bounded hardware block.
Its readiness section is authoritative; the successful setup result closes
its previous phone-preparation condition. The next block still requires
separate explicit scan consent. “Ready” for this completed zero-scan setup
never authorizes NFC. No short timer starts before a required reply.

Use the [command card](RECOVERY-COMMAND-CARD.md), current helper pins in
[INSPECTOR-LOADING-FIX.md](INSPECTOR-LOADING-FIX.md), and the existing signed
recovery build. No design, build, helper change or unchanged test suite is
needed when James returns. Fresh installed identity is checked before launch;
any mismatch stops without reinstalling. Product implementation remains gated.
