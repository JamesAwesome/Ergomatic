# Phase NF product PR — self-mutation record (spec "Self-mutation", Task 10)

Every mutation edited the DECIDING source on a clean tree, ran the named suites,
and was restored before the next (`scratchpad/mutate-task10.py`, anchors grep-pinned
to one hit each). Verdict BIT = at least one named test failed. Native mutations
(spec items 14 and 15) ran in the pnpm patch workspace as Swift mutations M1-M10
(`REMAINING-PROOF.md`). The Task 3 sweep (T3-1..T3-10) covers spec items 2, 3, 5,
10, 11, 13, 18, 20 and 25 at the transport; the table below is the second sweep
over the assembled product, 2026-09-06. Two survivors were REDUNDANT guards and
were deleted (S6: an early return behind `disabled={busy}`; S12: a cancel-site
abort duplicated by `teardown()`), and two survivors exposed missing tests that
were added (S22: foreground loss during an NFC read; S29: a malformed scripted
record). Every row now bites.

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
literals (S7 shows the request being dropped is caught by it). Items 1 = S1,
2 = S2/T3-1, 3 = S3/T3-2, 5 = S5, 10 = S10/T3-3, 11 = S11/T3-5, 13 = T3-7,
18 = T3-6/T3-10, 20 = T3-9, 25 = T3-8. Domain parser mutations (Task 2): TNF
`>= 1` and name limit 64 both bit (`nfc.test.ts`).
