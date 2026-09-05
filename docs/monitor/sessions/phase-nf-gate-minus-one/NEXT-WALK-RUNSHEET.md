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

[Recovery v1](RECOVERY-WALK-V1-ABORT.md) was explicitly started, then aborted
before app launch when the capture controller's fresh phone listing timed out.
Zero NFC attempts; all four cases remain unrun. Host PID 13869 is retired.
Phone cleanup was not required because this run made no phone mutation.
A later read-only connection check also failed. Do not treat the earlier
installed identity or setup PASS as current connectivity proof.

**Handed to Claude and resumed at the desk, 2026-09-05.**
[RECOVERY-CONNECTION-FINDINGS.md](RECOVERY-CONNECTION-FINDINGS.md) reads
the Mac's own logs: the wireless CoreDevice tunnel dropped 28 s after a good
listing while the Mac's Wi-Fi stayed up; the phone flapped in and out of the
device list for seven minutes; cause on the phone side not observed. A later
read-only check found the phone reachable and 0.23.0/789 still at the
setup-v3 installation URL. [RECOVERY-WALK-V2.md](RECOVERY-WALK-V2.md) is v1
verbatim plus a read-only transport preflight and a wired-cable preference;
its PM disposition is recorded there. No clock, install permission, scan
permission or retry is active until James replies **go** to v2's invitation.
Product implementation remains gated; do not push, merge or release.

**Flipper desk path opened, 2026-09-05.** NF-RECOVERY-v2 case 1 stopped on the
host helper's `FinalDisplayMismatch` guard (two reader starts, both RF-active
and Core NFC 200; not a failed recovery). To cut erg trips, James read the
PM5 tag with a Flipper Zero (NTAG203). NF-FLIPPER-EMU-v1 was NEGATIVE because
the saved file was a truncated 6-page read; see FLIPPER-EMU-V1-RESULT.md. A
complete replica was synthesized from the dated fixture, round-trip validated,
and written to the Flipper as C2_pm5_rebuilt.nfc. NF-FLIPPER-EMU-v2 (same
one-scan runsheet, new file) awaits a fresh PM pass and James's go.

**NF-FLIPPER-EMU-v2 POSITIVE, 2026-09-05.** The phone read the rebuilt replica
as the three PM5 records byte-for-byte (transport fidelity; FLIPPER-EMU-V2-RESULT.md).
The NFC read path and host tooling are now desk-reproducible up to the BLE
boundary, so the recovery FinalDisplayMismatch guard and the unsupported/multi-tag
cases can be built without an erg. BLE connect/disconnect of each recovery B and
any PM5-named criterion still need the machine.

**Recovery guard fixed, 2026-09-05.** The FinalDisplayMismatch that stopped
NF-RECOVERY-v2 case 1 was a false negative: the helper compared the REDACTED
exported receipt against the UN-redacted DOM display, so any real PM5 (whose
MAC bytes are non-zero) tripped it. Fixed in inspector-recovery.py
(display_matches redacts the DOM side too); 15 tests pass, both mutations bite.
See RECOVERY-GUARD-FIX.md. The captured case-1 receipt shows B connected with
the exact PM5 name, so the recovery likely succeeded; a clean re-run
(NF-RECOVERY-v3, same protocol, fixed helper) needs a fresh PM pass, James's
go, and the erg for the BLE half.

**NF-RECOVERY-v3 ran 2026-09-05: case 1 COMPLETE with the fixed helper.** Case 2
stopped twice (one James-authorized diagnostic retry): both A reader sessions
ran the full 60 s and ended Core NFC 201 (session timeout) with NO tag seen,
phone held in place. Corrected diagnosis (my first timing theory was
falsified): the PM5 itself stopped emitting its NFC tag after case 1's BLE
connect and stayed dark until a battery-pull reboot; James's separate phone
NFC app also could not read it. This is a PM5-side confounder for the whole
recovery matrix and a product question for shipped Scan-NFC. The "set reply"
delta is WITHDRAWN. Owed at the desk before any v4: research the PM5 NFC
lifecycle (does a BLE connect suppress the tag) and redesign the between-case
protocol around a PM5-NFC-availability check. See RECOVERY-WALK-V3-RESULT.md.
