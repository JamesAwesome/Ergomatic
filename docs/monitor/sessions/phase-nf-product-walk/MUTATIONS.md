# Phase NF product PR — self-mutation record (spec "Self-mutation", Task 10)

Every mutation edited the DECIDING source on a clean tree, ran the named suites,
and was restored before the next (`scratchpad/mutate-task10.py` for round 1,
`scratchpad/mutate-round2.py` for round 2; every anchor asserted to ONE hit
before the edit). Verdict BIT = at least one named test failed. Native mutations
(spec items 14 and 15) ran in the pnpm patch workspace as Swift mutations M1-M10
(`REMAINING-PROOF.md`). The Task 3 sweep (T3-1..T3-10) covers spec items 2, 3, 5,
10, 11, 13, 18, 20 and 25 at the transport.

**Round 1 (2026-09-06, Task 10) is the first table below, kept as run:** seven
rows read `ANCHOR 0 hits — not run` (their anchors had drifted under later
lens-2 edits) and three read `SURVIVED`. The whole-branch review (B2) caught the
header claiming "every row now bites" over that table. **Round 2 (2026-09-06,
after the review) is the second table:** every not-run row re-anchored and
re-run, the two guards that survived round 1 as decoration (S6's early return,
S12's cancel-site abort) deleted then and their SURVIVING siblings mutated here
(S6b: the NFC button's `disabled={busy}`; S12b: `teardown()`'s abort), S29
re-run, and one mutation per assertion the review round added (N1-N20). **Every
round-2 row bites; the round-1 table is history, not a claim.**

## Round 1 (Task 10, as run)

| Mutation | Result | Named failures |
| --- | --- | --- |
| S1 accept a nonmatching record type | BIT | ['rejects a type that differs by one byte'] |
| S2 use device.name instead of localName | BIT | ['matches only ScanResult.localName, never device.name, and never a prefix'] |
| S3 prefix matching | BIT | ['matches only ScanResult.localName, never device.name, and never a prefix'] |
| S4 remove NFC stop/drain | ANCHOR 0 hits — not run |  |
| S5 remove BLE stop on timeout | ANCHOR 0 hits — not run |  |
| S6 remove the shared single-flight guard | SURVIVED | [] |
| S7 drop the discovery request at the interstitial handoff | ANCHOR 0 hits — not run |  |
| S9 render the button while capability is unknown | BIT | ['is ABSENT when the reader reports unsupported', 'renders Connect ALONE when capability is unknown — no Scan NFC button, no placeholder element'] |
| S10 connect on the first exact-name result without the collision window | BIT | ['F6: a stopLEScan that never settles poisons the tail at the deadline and releases it, so the next scan rejects instead of hanging', 'an abort after the match still returns interrupted, never the device', 'fails closed with TargetMonitorAmbiguousError when two distinct devices carry the exact name inside the window', 'settles on the sole match exactly at the collision window boundary'] |
| S11 auto-select an exact-name held device | ANCHOR 0 hits — not run |  |
| S12 ignore the targeted abort signal in the hook | SURVIVED | [] |
| S16 start NFC before the listeners resolve | BIT | ['a startScanning rejection becomes NfcStartError, traced, with the listeners removed', 'an abort while addListener is still pending removes the handle and never starts', 'registers BOTH listeners before startScanning, starts with the exact options, and on a record stops then removes'] |
| S17 a decorator drops scanTarget | BIT | ["Phase LL Task 2 (§2 mechanism 3): a structural extension beyond the six core Transport methods (onCharacteristicDegraded) survives the withLiveness wrap unchanged — liveness.ts's own '...inner' spread, proven through the REAL composition, not the decorator in isolation", 'native arm: the SAME request object and AbortSignal reach the Capacitor scanTarget seam through withLiveness'] |
| S19 clear the abort ref without identity comparison | ANCHOR 0 hits — not run |  |
| S21 leave the staged receipt live on the unsupported-tag path | BIT | ['a cancelled sheet returns quietly: no error, both buttons back', 'a non-PM5 tag shows `Unsupported NFC tag` inline, stays on detail, discards the staged receipt', 'unmount mid-read aborts the attempt and discards the staged receipt'] |
| S22 foreground loss leaves the NFC attempt armed | ANCHOR 0 hits — not run |  |
| S23 StrictMode rehearsal discards the receipt | BIT | ['StrictMode shape: setup → cleanup → setup within one microtask keeps the lease (no loss)', 'claiming again for the same ID reclaims its own pending release', 'mount lease: a StrictMode double-invoke keeps the staged receipt; a genuine unmount discards it (compare-by-attempt-ID)'] |
| S24 mount the interstitial before the paint barrier | BIT | ['an abort at the paint barrier is quiet: accepted was committed, nothing hands off', 'fixture records → target with the literal name; haptic, accepted, then paint; reader stopped once', 'reaches READY with no picker, the exact decoded name at the scanTarget seam and the fixed attempt ID at the consumer'] |
| S26 trust a bridge value (accept fractional tnf) | BIT | ["rejects a malformed event that carries THIS attempt's ID as invalid-for-attempt (a real producer: readNDEF failed, no ndefMessage)"] |
| S27 drop a diagnostic before the sink (haptic-failed) | BIT | ['a rejected haptic is traced and the target still hands off'] |
| S28 keyed take unkeyed (F7) | ANCHOR 0 hits — not run |  |
| S29 scripted reader | invalid-for-attempt no longer terminal: SURVIVED | [] |
| S8 retire staged set at connect() entry instead of armed | BIT | ['a revision superseded between stage and armed still retires — superseded:true, receipted, not rejected (§1)', "arm then Cancel: the accepted loss — both tiers null, the retire receipt already named 'connect-guard-armed' before Cancel ever ran", "the armed leg: a staged Connect-guard authorization is retired exactly at the wire 'armed' event, never earlier"] |
| S8b retire at connect() entry | BIT | ['a revision superseded between stage and armed still retires — superseded:true, receipted, not rejected (§1)', "arm then Cancel: the accepted loss — both tiers null, the retire receipt already named 'connect-guard-armed' before Cancel ever ran", "cancel before armed DISCARDS the staged set — the record SURVIVES, both tiers (the reviewer's own probe, promoted to a permanent regression test)", "the armed leg: a staged Connect-guard authorization is retired exactly at the wire 'armed' event, never earlier"] |

## Round 2 (after the whole-branch review, 2026-09-06)

| Mutation | Result | Named failures |
| --- | --- | --- |
| S4 remove NFC stop/drain | BIT | ['a rejected stopScanning is recorded as reader-stop-failed, never swallowed silently', 'a tag event for THIS attempt with no ndefMessage (readNDEF failed on a read-write tag) settles as a tagFailure invalidation rather than waiting forever', 'an abort after start awaits stopScanning, then rejects NfcAbortError', 'registers BOTH listeners before startScanning, starts with the exact options, and on a record stops then removes'] |
| S5 remove BLE stop on timeout | BIT | ['F5: a preamble that never settles rejects as interrupted at the deadline and never starts the scan', "a deadline expiry before the radio is live records ble-scan-timed-out 'preamble'", 'times out to TargetMonitorNotAdvertisingError at 10_000 ms and stops the scan first'] |
| S6b NFC button ignores busy (the surviving guard) | BIT | ['both hardware buttons are disabled while the read is live, and a second press changes nothing', 'busy disables BOTH buttons and a press proceeds nothing'] |
| S7 drop the discovery request at the interstitial handoff | BIT | ['a picker request is passed through unchanged too (manual Connect is behaviourally unchanged)', 'crosses the same seam on a REAL library workout with reps and rests (Scud Cloud), programmed byte-for-byte', 'mounts with connect(request) — the SAME request object — and Try again repeats it', 'reaches READY with no picker, the exact decoded name at the scanTarget seam and the fixed attempt ID at the consumer'] |
| S11 auto-select an exact-name held device | BIT | ['a held exact-name device records held-device-conflict', 'fails closed with TargetAlreadyConnectedError on a held exact-name device and never selects it'] |
| S12b teardown() no longer aborts the targeted scan (the surviving abort) | BIT | ["a late-settling attempt A cannot clear attempt B's abort controller", 'cancel() during a pending scanTarget aborts its signal, and the late settle installs nothing', 'unmount during a pending scanTarget aborts its signal'] |
| S19 clear the abort ref without identity comparison | BIT | ["a late-settling attempt A cannot clear attempt B's abort controller"] |
| S22 foreground loss leaves the NFC attempt armed | BIT | ['foreground loss (the pause event) mid-read aborts the attempt: quiet return, reader stopped, no interstitial'] |
| S28 keyed take unkeyed (F7) | BIT | ["F7: a set staged under attempt A is NOT consumed by a zero-argument connect()'s armed event — it is discarded, and A's records are never retired", "a take under another attempt's ID is a PURE READ — the set stays staged for its owner"] |
| S29 scripted reader: invalid-for-attempt no longer terminal | BIT | ["a malformed scripted record (a byte out of range) is terminal as a tagFailure, like the native arm's invalid-for-attempt"] |
| N1 reason before cause (B4 fail-open) | BIT | ['maps each nfcSessionEnd reason and cause to its named error'] |
| N2 stopScanning fire-and-forget (SF5) | BIT | ['the read does NOT settle until stopScanning resolves (the JS half of stop-before-BLE)'] |
| N3a drop the post-read abort guard (SF6) | BIT | ['records that arrive AFTER the signal aborted (reader resolved anyway) are quiet: no parse, no accepted state'] |
| N3b drop the post-paint abort guard (SF6) | BIT | ['a signal that aborted while the paint barrier resolved normally is quiet: accepted was committed, nothing hands off'] |
| N4 listener registration failure untraced (SF10) | BIT | ['a listener that will not register is traced under listener-registration-failed naming the event, and nothing starts'] |
| N5 targeted failure does not publish the trace (B3) | BIT | ['a targeted FAILURE publishes the trace and the export window carries it under the nfc-attempt prefix, BLE kinds included (review B3)'] |
| N6 export window returns [] with no ring (B3) | BIT | ['a targeted FAILURE publishes the trace and the export window carries it under the nfc-attempt prefix, BLE kinds included (review B3)'] |
| N7 ring-prefix copy does not publish (B3) | BIT | ['reaches READY with no picker, the exact decoded name at the scanTarget seam and the fixed attempt ID at the consumer'] |
| N8 manual connect keeps the stale NFC trace in the window (B3) | BIT | ['a targeted FAILURE publishes the trace and the export window carries it under the nfc-attempt prefix, BLE kinds included (review B3)'] |
| N9 probe rejection never publishes (B3) | BIT | ['a probe that REJECTS keeps the button absent and reaches the sink as capability-failed on a fresh process (review B3)'] |
| N10a recording decorator drops the trace (B3) | BIT | ['forwards scanTarget with the SAME request and signal, and records the devices as a scan event'] |
| N10b autoTicking drops the trace (B3) | BIT | ["keeps the fake's scanTarget with the SAME request and signal, and omits it when absent"] |
| N11 fake accepts a picker-kind request (SF2) | BIT | ['validates the request like the Capacitor transport (bad id or name → TargetedRequestInvalidError)'] |
| N12 staging under a different ID than the intent (SF11) | BIT | ["Cancel (the confirm panel's own) discards the staged set", 'View unsaved cancels Connect authorization and preserves both records (timer also retained: false)', 'View unsaved cancels Connect authorization and preserves both records (timer also retained: true)', 'a Scan NFC press mints a v4 UUID, stages under it, and proceeds with an nfc intent'] |
| N13 BLE trace: matched never recorded (B3) | BIT | ['a match records started, matched, then drain-settled; a malformed result records invalid-scan-result'] |
| N14 BLE trace: timeout detail swapped (B3) | BIT | ["a deadline expiry before the radio is live records ble-scan-timed-out 'preamble'", "a timeout with the radio live records ble-scan-timed-out 'not advertising'"] |
| N15 BLE trace: cleanup rejected detail dropped (B3) | BIT | ["a stopLEScan rejection records ble-scan-cleanup-failed 'rejected'"] |
| N16 BLE trace: cleanup did-not-settle detail dropped (B3) | BIT | ["a stopLEScan that never settles records ble-scan-cleanup-failed 'did not settle'"] |
| N17 BLE trace: invalid-scan-result dropped (B3) | BIT | ['a match records started, matched, then drain-settled; a malformed result records invalid-scan-result'] |
| N18 BLE trace: held-device-conflict dropped (B3) | BIT | ['a held exact-name device records held-device-conflict'] |
| N19 BLE trace: drain-settled dropped (B3) | BIT | ['a match records started, matched, then drain-settled; a malformed result records invalid-scan-result'] |
| N20 overlong name accepted (B1) | BIT | ['rejects a 32-byte name that IS zero-terminated inside the 40 bytes (the overlong-name branch)'] |

Not mutated, said aloud: `e2e/design.spec.ts`'s absolute cream label colour
(a compose rebuild per probe; the literal `rgb(255, 253, 247)` is independent
of the token's source) and `monitorTransport.test.ts`'s web-arm composition
(no single-line mutation makes `withLiveness` invent a capability; the
assertion is the spec's stance, pinned). The transport-census gate was proved
red by hand: removing the web stance comment fails `pnpm lint`.

## Task 3 transport sweep (2026-09-06, `capacitorBle.test.ts`)

| Mutation | Result | Named failures |
| --- | --- | --- |
| T3-1 match on device.name too | BIT | ['matches only ScanResult.localName, never device.name, and never a prefix'] |
| T3-2 prefix match | BIT | ['matches only ScanResult.localName, never device.name, and never a prefix'] |
| T3-3 settle on first match immediately | BIT | ['an abort after the match still returns interrupted, never the device', 'fails closed with TargetMonitorAmbiguousError when two distinct devices carry the exact name inside the window', 'settles on the sole match exactly at the collision window boundary'] |
| T3-4 no dedup | BIT | ['deduplicates repeat callbacks from the same deviceId and drops malformed results'] |
| T3-5 held device not refused | BIT | ['fails closed with TargetAlreadyConnectedError on a held exact-name device and never selects it'] |
| T3-6 enabled check after held query | BIT | ['checks enabled after initialize and before the held-device query'] |
| T3-7 no await prior | BIT | ["a manual picker's outer timeout leaves the tail held until the raw picker promise settles", "a second targeted scan waits for the first one's drain (stopLEScan completion)"] |
| T3-8 swallow stopLEScan rejection | BIT | ['stopLEScan rejection outranks a match, poisons the tail, and blocks the next scan without a native call'] |
| T3-9 manual drain on the timeout race | BIT | ["a manual picker's outer timeout leaves the tail held until the raw picker promise settles"] |
| T3-10 drop the abort check before requestLEScan | BIT | ['an abort while the held-device query is pending never starts the scan'] |

Spec item 4 (remove NFC stop/drain) = S4; 6 = S6; 7 = S7; 8 = S8/S8b; 9 = S9;
12 = S12; 16 = S16; 17 = S17; 19 = S19; 21 = S21; 22 = S22; 23 = S23; 24 = S24;
26 = S26; 27 = S27; 28 = the routed proof is `WorkoutDetail.nfc.test.tsx`, which
constructs no request and pins the attempt ID and the exact name as independent
literals (round-2 S7 shows the request being dropped is caught by the
interstitial's own pass-through test). Items 1 = S1,
2 = S2/T3-1, 3 = S3/T3-2, 5 = S5, 10 = S10/T3-3, 11 = S11/T3-5, 13 = T3-7,
18 = T3-6/T3-10, 20 = T3-9, 25 = T3-8. Domain parser mutations (Task 2): TNF
`>= 1` and name limit 64 both bit (`nfc.test.ts`).
