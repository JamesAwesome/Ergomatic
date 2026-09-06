# Phase NF follow-on — self-mutation record (2026-09-06)

One mutation per new assertion, deciding source only, on a clean committed
tree (`mutate-followon.py` beside this file; every anchor asserted to one hit, M6
re-anchored after Prettier reformatted its button and re-run). Native: the
patch's rejection message mutated to `"Failed to read the tag"` → 2 of 31
Swift tests fail (`NdefSessionEndingTests.swift` pins the exact line);
restored, 31 green. Design geometry (Just Row pair 56/12, Cancel 52) is
asserted in e2e with literals independent of the tokens; not mutated (a
compose rebuild per probe), said aloud.

| Mutation | Result | Named failures |
| --- | --- | --- |
| M1 not-advertising detail drops the line break | BIT | ["a targeted failure renders the two-line card and Try again REPLAYS the same targeted request, never the picker (antagonist F2, spec 'Design' 1)", 'maps each named targeted failure to its reason and the approved copy (independent literals)'] |
| M2 not-advertising detail drops the name | BIT | ["a targeted failure renders the two-line card and Try again REPLAYS the same targeted request, never the picker (antagonist F2, spec 'Design' 1)", 'maps each named targeted failure to its reason and the approved copy (independent literals)'] |
| M3 interstitial renders the whole detail as one serif line (no split) | BIT | ['target-not-advertising: the first line is the serif line, the second the body line, the DETAIL panel keeps both'] |
| M4 tagFailure maps back to the generic line | BIT | ["{ kind: 'invalidated', cause: 'tagFailure' } shows Couldn't scan the monitor tag. Try again. inline", "{ kind: 'invalidated', cause: 'tagFailure' } → { kind: 'inline-error', copy: 'Couldn\\'t scan the monitor tag. Try again.' }"] |
| M5 targeted picking variant rendered for the PICKER kind too | BIT | ['phase picking renders the quiet backdrop, not nothing', 'picking on the PICKER route is unchanged: the backdrop, no Cancel'] |
| M6 targeted picking Cancel does nothing | BIT | ['picking on the NFC route names the target and offers Cancel; Cancel cancels the session and exits (follow-on Gate 0 §2)'] |
| M7 fake pending settles without an abort | BIT | ['pending: settles ONLY on abort, as TargetScanInterruptedError (the seam that holds the targeted-scan screen open)'] |
| M8 Just Row proceeds a picker request on an nfc intent | BIT | ['a cancelled sheet returns quietly: no line, both buttons back', 'a non-PM5 tag shows `Unsupported NFC tag` inline between the pair and Start Timer, stays on the door, discards the staged receipt', "a targeted failure renders the two-line card and Try again REPLAYS the same targeted request, never the picker (antagonist F2, spec 'Design' 1)"] |
| M9 Just Row Try again mints a picker after a targeted failure | BIT | ["a targeted failure renders the two-line card and Try again REPLAYS the same targeted request, never the picker (antagonist F2, spec 'Design' 1)"] |
| M10 Just Row forges busy=false at the seam | BIT | ['both hardware buttons are disabled and aria-busy while the read is live (antagonist F3)'] |
| M11 Just Row failure card collapses the break | BIT | ["a targeted failure renders the two-line card and Try again REPLAYS the same targeted request, never the picker (antagonist F2, spec 'Design' 1)"] |
| M12 hook keeps the staged receipt on a non-handoff outcome | BIT | ['a cancelled sheet returns quietly: no error, both buttons back', 'a cancelled sheet returns quietly: no line, both buttons back', 'a lifecycle listener that will not register ends the attempt with the approved stopped line, discards the staged receipt, and frees the buttons'] |
| M13 hook swallows a registration failure silently | BIT | ['a lifecycle listener that will not register ends the attempt with the approved stopped line, discards the staged receipt, and frees the buttons'] |
| M14 hook never publishes the probe timeout | BIT | ['a capability probe that never answers leaves the button absent (unknown) and publishes capability-timed-out on a fresh process'] |
| M15 BLE: a resolved stop still poisons the tail | BIT | ["a second targeted scan waits for the first one's drain (stopLEScan completion)", 'aborts to TargetScanInterruptedError only after stopLEScan resolves'] |
