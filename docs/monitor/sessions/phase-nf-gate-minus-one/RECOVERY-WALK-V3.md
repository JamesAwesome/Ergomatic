# NF-RECOVERY-v3 — re-run the four A → B checks with the fixed helper

Status: RUN 2026-09-05 — case 1 COMPLETE, case 2 stopped before any tag read; see [RECOVERY-WALK-V3-RESULT.md](RECOVERY-WALK-V3-RESULT.md). Run and consent consumed.

Identical to `RECOVERY-WALK-V2.md` in every case, cap, physical block,
stopping rule, evidence requirement and cleanup step (read that file and
`RECOVERY-WALK-V1.md`; not restated). Two things changed since v2, both
already landed at the desk:

1. **The helper guard is fixed.** v2 case 1 stopped on
   `FinalDisplayMismatch`, which `RECOVERY-GUARD-FIX.md` shows was a false
   negative: the helper compared the redacted exported receipt against the
   un-redacted DOM display, so any real PM5 (non-zero MAC bytes 0-5) tripped
   it. `inspector-recovery.py` now redacts the DOM side before comparing
   (`display_matches`); 15 helper tests pass and both mutations bite. New
   hashes are in `INSPECTOR-LOADING-FIX.md`.
2. **Transport preflight and ready-state invitation** carry forward from v2
   unchanged (read-only preflight before the invitation; cable preferred; the
   ready state stated in the consent text). Tonight's v2 preflight read
   `transportType wired`.

Nothing else changed: same signed build 0.23.0/789, same capture controller,
same receipt verifier, same four scenarios in order, same eight-minute total,
same one-attempt-per-case and stop-on-first-failure rules. No install.

## Why re-run rather than accept case 1

The v2 case-1 receipt shows B connected and disconnected with the exact name
`PM5 432331249 Row`, so the stop-during-connect recovery very likely
succeeded. But the helper aborted before its full success path (post-drain
idle reset and per-case adjudication), so case 1 is not closed on that
evidence. v3 re-runs all four cleanly so each case reaches its own verdict.
`staleACannotAffectB` and the native-ownership observations are only complete
on a clean run.

## Consent invitation (v2's, verbatim)

> Four recovery pairs are ready: at most eight NFC reader starts, eight
> minutes total, no retries or installation. No rowing or heart-rate belt.
> Before you reply: be at the erg with the phone unlocked in your hand,
> Ergomatic open, and plugged into the Mac if a USB-C cable reaches the PM5.
> The Mac starts talking to the phone the moment you reply.
> Reply **go** when that is true and you want to begin.

The v2 rule stands: consent is consumed by reader starts, not the clock; a
stop before the first reader start with zero NFC attempts earns one explicit
re-invitation, a second releases him. Scan consent is James's **go** alone.

## PM disposition

`/root/walk_pm`, 2026-09-05: **PASS (delta) — NF-RECOVERY-v3.** A false-negative
guard fixed in a private diagnostic, re-running an already-approved protocol; not
TRIAD. Re-run all four, do NOT accept case 1 from the v2 receipt: that verdict
came from the broken helper and the abort preceded post-drain adjudication. No
RF26 over-claim in the runsheet. Consent invitation approved verbatim (above).
Standing watch, not a gate: the Python redaction mirrors `redactNfcRecord` (TS);
if that rule changes, the mirror must change with it or the guard mis-scores.
