# Simulator Inspector correction — 2026-09-04

The simulator reproduced a real target-selection defect and verified the
minimal correction. The actual diagnostic component becomes ready, survives
an idle document reload and becomes ready again in the same native process.
This is preparation evidence, not a new Gate -1 hardware pass.

## Observed failure and correction

The original helper required Web Inspector's application label to equal the
installed bundle identifier. Actual Simulator Inspector metadata instead
reports `process-App`, including for Ergomatic's full sign-in screen. Its PID
matches the separately verified installed executable. Replaying the original
helper against that process returns `TargetMissingAmbiguousOrOccupied`.

The correction removes only that redundant Inspector-label comparison.
Upstream bundle/version/install-URL/executable verification still establishes
the authoritative PID; exact PID, WebView type, unique/unoccupied page and
`capacitor://localhost` origin checks remain. Error output now preserves only
fixed, allowlisted guard reasons. The earlier phone RuntimeError discarded its
reason, so this simulator finding does not establish that phone failure's cause.

## Actual rehearsal

- Built and installed the Debug app on iPhone 17 Pro Simulator, iOS 26.5.
  The full app reached sign-in; no credentials were copied or login requested.
- A separate, explicitly labelled simulator fixture mounts the unchanged
  `GateMinusOneProbe` component with test metadata. It replaces only a private
  simulator app copy's web assets, leaving the signed phone artifact intact.
- The existing pymobiledevice3 11.3.1 Inspector APIs use the Simulator's local
  Web Inspector socket. `simctl launch`, the installed app container and `ps`
  independently agree on executable/PID 83363 for the fixture.
- The preserved original helper rejects the real `process-App` target. The
  corrected helper reads `/you`, a complete document, the actual probe, one
  enabled normal button and four enabled recovery buttons.
- `location.reload()` followed by explicit socket detach/reattach produces a
  newer time origin, 1788564694830 → 1788564737407, in that same process;
  the same controls are ready again. No sample button was invoked.

Seven scoped helper tests passed, including wrong PID/origin, missing,
ambiguous or occupied pages, protocol envelopes, quiet evaluation and socket
cleanup. The original-helper replay is the deciding regression: the old
predicate fails against the exact live target that the correction accepts.
Previously recorded origin/detach mutations are unchanged; no broad suites
were repeated. `/root/controller_review` returned PASS on the final hashes,
with no findings and the scope limitations below.

The fixture was visually inspected. Simulator launch redirection did not
produce files at the requested host log paths, so no native-log counts are
claimed from it. The rehearsal's executed expressions only read readiness and
reload the document; it performed no NFC/BLE operation or phone command.

## Limits and retained evidence

This proves real Simulator DOM access and idle reload, not authenticated You
navigation, physical-phone behavior, an NFC-sheet overlay, held native NFC
continuations, or successful recovery B. No hardware criterion is promoted.
The next phone preflight still needs a concrete PM-reviewed procedure and
James's agreement; no scan or installation permission is implied.

Final helper SHA-256:
`8f114e811f45ac909d3f43d1b5a90438b474ee5717ef7b2b21aedf227d11ea31`.
Test SHA-256:
`dbf136ed8efbad069ca96018d923c3be40a988ac77dec197e8bf6d6000d06dd9`.
Simulator rehearsal SHA-256:
`63650fba2f658c80766a24eda925c571e8c5dd8b592a592fab6eb8dcd7b4787a`.

Original and revised helpers/tests, fixture source, allowlisted JSONL result,
screenshot and cleanup result are retained under the ignored worktree path
`.superpowers/sdd/2026-09-03-phase-nf-gate-minus-one/inspector-v2/`.
The runnable venv, builds and original records remain under
`/var/folders/m8/wdf8_49130z_j4m94t3rj3w80000gn/T/ergomatic-nf-recovery.elsxwlhr`.

Simulator preparation is additional desk cost after the phone check ended at
23:16:02Z; simulator boot began at 23:21:38Z. It does not replace the prior
approximately 37 minutes of desk preparation or the 1m38 phone setup. No human
walk clock or deadline was running during this work. Final cleanup time is
recorded in `simulator-cleanup.json`; the app termination and simulator shutdown
were independently verified. Neither simulator PID may be reused for cleanup.
