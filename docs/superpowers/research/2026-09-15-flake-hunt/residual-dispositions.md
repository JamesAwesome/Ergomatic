# Residual failure triage — 2026-09-15

## Scope and result

This is offline source/log/history analysis only. No test, container, download,
source edit, ROADMAP edit, commit, or rerun was performed.

The 23 automatically unclassified events resolve into **20 deterministic or
source-attributed repaired events and 3 unresolved timing/tool events**. A red
multi-failure job is not itself evidence of a runner event:

- job `103829038779` is three deterministic consumers of one export-schema
  change, fixed by an exact follow-up commit;
- job `101506257739` is four deterministic tests missing the same browser
  capability fixture, fixed by an exact follow-up commit;
- job `103672406399` contains three different exhausted shapes plus one already
  classified retry-recovered Stats read. No evidence ties the three exhausted
  shapes to one cause, so they remain three separate residuals.

No disposition below uses post-fix absence as proof. “Repaired” means source
history contains a change that names or mechanically removes the observed
failure mechanism.

## The 23 automatically unclassified events

| Events | Exact observed shape | Evidence and history | Disposition |
| ---: | --- | --- | --- |
| 1 | No-plan log door waited for `Save without logging` | Job `100474094416`, `logs/100474094416.log:1137-1168`: both attempts time out at the same locator. Commit `193552f5613eee3bb5238e375a67b244246d5fa8` changed no-plan doors to the lone `Save`; integrated commit `e6f456cea4ab104c24b4345b890735b5dd53d5a1` adds this exact connected-no-reading test with `getByRole(... "Save", exact: true)`. | **Deterministic stale copy expectation**, not a flake. The failed PR integration carried the old locator against the new no-plan contract. |
| 1 | `postLogForWorkout("Occluded Front")` returned synthetic 404 | Job `101226262723`, `logs/101226262723.log:1144-1172`: both attempts return 404. At head `c54be0a`, `postLogForWorkout` deliberately filters to `!w.isGlobal`, while `Occluded Front` was only a global library row. Commit `ebfa232458603c853297b66864b7199341a5937d` imports a personal `Today Reroll After Log E2E` fixture, pins it, and logs that title. | **Deterministic fixture-domain error**, repaired in the feature’s landing commit. |
| 4 | Release list count/text was one release behind | Jobs `101249430143` (`logs/...:1150`, expected 37/received 38), `101402752181` (`:1153`, 39/40), `101406548058` (`:1148`, expected v0.38.0/received v0.38.1), and `104037820908` (`:1187`, 50/51); each exhausted its retry with the same mismatch. Commits `5fae2b245a3fbd8cf9fd4c1c0a13e3c5b5d185a6`, `eb881505da66588d757d42e84e7fa3fd694ff962`, and `c77b37922bfed249f8434e841e507aba8fd2415b` update the corresponding independent E2E pins as each release note is added. | **Deterministic release-branch pin drift**. These are useful red gates, not flakes. |
| 4 | `Connect` existed but stayed disabled | Job `101506257739`, `logs/101506257739.log:1150-1204,1226-1280,1302-1356,1378-1432`: two design and two session tests all resolve the locator to `<button disabled ...>Connect</button>` on both attempts. `canConnectMonitor()` returns false on a headless browser without `navigator.bluetooth`. Commit `1cda41e7609393c7758aed470ed9bf1b8f2fab71` adds `stubBluetoothScanFailure()` before navigation to exactly these four tests. | **Deterministic missing host-capability fixture**, not a shared runner failure. |
| 2 | WorkoutDetail preferences-error test received `skipWrites=[false]` instead of `[]` | Jobs `101835494920`, `logs/101835494920.log:3927-3944`, and `101850260678`, `logs/101850260678.log:3991-4008`. Commit `a1967244248c66ecd9e19d0891c465f8565f1e7f` names the exact assertion and replaces two asynchronous `vi.doMock` registrations for one path with one parameterized registration. | **Known repaired mock-registration race** from #346. This validates the existing attribution; it does not reopen or duplicate the inventory. |
| 1 | `isCI(undefined)` expected false but observed the ambient CI value true | Job `102321282914`, `logs/102321282914.log:4099`: the parameterized case explicitly supplies `undefined`, which activates `isCI(v = process.env.CI)`’s default. Commit `dd843d55c16cd3cb87b2170a9e83b8831b01545a` removes that invalid table row and separately controls the ambient environment. | **Deterministic JavaScript default-parameter fixture error**, repaired. |
| 4 | Article-read isolation expected the retired `pain-scale` alias | Jobs `103563516975`, `logs/103563516975.log:4169,4192`, and `103563914895`, `logs/103563914895.log:4191,4214`: expected effort + pain, received effort only in both assertions in both jobs. Commit `13adce4ba10498cfc9b3f25cb70360aa4d6add12` removes the pain/effort compatibility layer and updates both expectations to only `effort-scale`. | **Deterministic fixture expectation lag during a compatibility removal**, repaired. |
| 1 | NFC accepted status was never observed | Job `103672406399`, `logs/103672406399.log:1444-1490`: `getByRole('status')` never finds `✓ Monitor found` in either attempt. The status is intentionally transient: `runNfcAttempt` commits it, waits a two-`requestAnimationFrame` `paintBarrier`, then replaces the detail screen with the interstitial. The test still asserts this transient DOM node, and no later commit changes the test or barrier. | **Unresolved timing-sensitive observable.** The source explains why the window is narrow, but the log does not distinguish “never painted” from “painted between Playwright polls.” Do not call it repaired or a generic runner event. |
| 1 | PAIRING was visible before axe, gone after axe | Job `103672406399`, `logs/103672406399.log:1536-1582`: the initial 10 s visibility assertion passed; the 1 s assertion after `sweep(page)` failed in both attempts. The fixed `INTERSTITIAL_DELAY_WRITES_MS=1200` controls the stage lifetime. | **Cause established, unrepaired.** Retained retry trace below shows a 2.54 s sweep crossing that lifetime. A shared cause with NFC or the FILTER scan is not established. |
| 1 | Axe `page.evaluate` exhausted the whole 30 s test budget | Job `103672406399`, `logs/103672406399.log:1502-1526`: both attempts time out; retry identifies `AxeBuilder.analyze()` on the open Library FILTER sheet. This exact error occurs nowhere else in the retained logs, and history contains no repair for this test. | **Budget collision established, scan-cost cause unknown.** Retained retry trace below locates 23.439 s in a completed main-frame axe partial run after roughly 6.6 s setup. No runner-family or product-defect inference follows. |
| 3 | Export readers treated the new envelope as the old array | Job `103829038779`, `logs/103829038779.log:1192,1232,1272`: portrait and landscape throw `entries.some is not a function`; Just Row throws `ring.map is not a function`, all on both attempts. Commit `6718ddca555e12e87f9280e85e73a33cadc9f7d2` changes the JSON export from an array to `{meta, entries}`. Commit `b76396dd01af72a41eea50500ee26927de037406` changes these exact consumers to `parseLogExport(...).entries`; main representation is `55031f6bb4f11348b25c2777669b7abf47ec740c`. | **Deterministic schema/consumer drift**, repaired. FLAKE 5’s “four failures at once = runner event” inference is false for these three failures. The co-located Apple retry recovery has its own known navigation mechanism. |

Count check: `1+1+4+4+2+1+4+1+1+1+3 = 23`.

## Apple status-copy mismatches

These two exhausted failures are distinct from the earlier missing
`Usual sign-in confirmed` continuation failures. Jobs `104452620517`
(`logs/104452620517.log:1249-1281`) and `104456898945`
(`logs/104456898945.log:1240-1279`) repeatedly resolved the status element and
read **`You can sign in either way.`**, while the E2E expected **`Apple is now
connected. You can sign in either way.`**. That exact, stable received text
rules out the earlier missing-continuation shape.

Commit `c0d9406ca6de4d7daf5bc9f47d2e9bbef1592c58` intentionally deletes the
duplicated first sentence from `SignInMethods.tsx` and updates the client test.
Commit `c7addbadcbf7c13565479c4cccea266a2cdf0d58` updates the exact E2E assertion
to the shorter copy and asserts the provider sentence is absent; the landing
commit is `8536de998dbf4e325d389a79d2f69074b884f2b9` (#453). Disposition:
**deterministic stale E2E copy assertion, source-attributed and repaired**, not
Apple navigation intermittence.

## Command-only failures

| Jobs | Evidence and exact repair | Disposition |
| --- | --- | --- |
| `101235081560`, `101236455010`, `101236934130`, `101238595196` | Raw lines `2773`, `2763`, `2761`, `2776`: domain branch coverage 99.88%. The uncovered branch was `domain/duration.ts`’s later lower upper-bound path; `8da1e710948b744b5bbbddf3f232ee368afe2ab0` adds order-independent range cases that exercise it. | **Deterministic coverage debt**, not a flaky test. |
| `103643332420` | `logs/103643332420.log:4612-4613`: domain statements 99.93%, branches 99.9%; table points at `domain/stats/gate0Seed.ts:47`. Commit `7077bf27304947ed1a92bbd09a0b0a7e806c0760` adds the malformed seed-date throw witness. | **Deterministic coverage debt**, repaired. |
| App `101807324349`, `101861059654`; E2E `101807324375`, `101861059605` | Widespread TS2339 loss of jest-dom matchers (representative raw lines `3252`, `3294`, `6800`, `6888`) on two duplicate dependency heads that raised Vitest and coverage 4.1.11 to 5.0.0. Commit `0d642d4e644c01abef52ddd7ac3ffda25f2ed2c1` takes the 16 safe bumps but explicitly holds Vitest/coverage at 4.1.11 for a separate migration. | **Deterministic incompatible dependency update**; compilation/build stopped before tests. |
| `104492060469` | `logs/104492060469.log:4383-4395`: all 357 files/9,122 tests passed, then Vitest reported an unhandled `access_denied` rejection from `attempts.ts`; it did not name a failed assertion. Commit `9954fb905488a027f82922e8a13e880674a39505` names failed head `d2409c09` and attaches `void running.catch(() => {})` immediately after creating the promise, before the up-to-one-second lock poll. The later assertion still awaits the same promise. | **Known repaired test-harness handler-attachment race**, not unresolved auth/product intermittence. The rejection could occur before the later assertion attached a handler; the fix changes reporting order, not the asserted authorization outcome. |

## FLAKE 5 reconciliation

The existing FLAKE 5 sentence that treats the three four-failure jobs as
runner events should not survive unchanged:

- `103829038779`: three exhausted events are one proven export-envelope drift;
  the fourth event is a retry-recovered Apple continuation with a separately
  documented cause. This is not a runner cluster.
- `101506257739`: all four exhausted events found the same disabled Connect
  control and were corrected by the same explicit Bluetooth fixture. This is
  not a runner cluster.
- `103672406399`: the three exhausted events are NFC transient-status
  observation, post-axe PAIRING lifetime, and an axe `page.evaluate` timeout.
  The fourth event is a retry-recovered Stats stale read already assigned to
  the read-after-write class. Co-location is insufficient to merge the three
  residuals or to assign them to FLAKE 2.

Thus the bounded residual population from these 23 events is exactly three
observed shapes, all in `103672406399`; it is not “three multi-failure runner
jobs.”

## Retained retry traces: one cause established, two limits retained

Original-attempt artifact `10311637594` (`playwright-report`, 6,231,646
bytes) from run `34737876236`, workflow attempt 1, retains traces for all
three residuals. These are **test retry 1**, not attempt zero: the workflow
used `on-first-retry`. The newer same-named artifact contains only the later
workflow rerun's HTML and must not substitute for these failed retries.
Raw artifacts remain ignored; no cookies or full trace payloads are committed.
Trace files inside the artifact are NFC
`6f567d35e374c51d783d5c9b673368418192ab55.zip`, PAIRING
`5b333597dc3a36cc8068b3fff7d4fdf6b5e83021.zip`, and FILTER
`c6a5d950183f2fc07a4d5fd44097a96e96080681.zip`.

- **NFC:** Scan NFC click ends at trace time 128363.911 ms; the status
  assertion begins at 128367.812 ms. The first captured DOM snapshot at
  128387.331 ms already shows CONNECTING; the failure snapshot shows READY.
  No retained snapshot contains `✓ Monitor found`. The trace bounds when
  the status was absent, but does not prove it never painted or was absent
  when the assertion began. The one-paint observation hypothesis remains
  unresolved, not a product verdict.
- **PAIRING:** the first visibility assertion ends at 703174.054 ms;
  axe begins at 703183.020 ms; the DOM is PROGRAMMING by 704442.520 ms.
  The sweep finishes at 705726.264 ms and the second PAIRING assertion starts
  at 705728.379 ms. The approximately 2.54 s sweep exceeds the fake's 1.2 s
  connection delay. **Cause established: the test's fixed state lifetime
  expires during its own sweep. Unrepaired.** The final state assertion is
  valuable: removing it would silently certify the wrong screen.
- **FILTER sheet:** retry `AxeBuilder`'s `runPartial` evaluation takes
  23.439 s (199295.764–222735.342 ms), following roughly 6.6 s of setup.
  The 30 s test budget expires as `finishRun` begins. This localizes the
  time spent to the axe scan; it does not explain why that scan was slow,
  establish an infinite hang, or attribute host memory pressure.

No new tests or compose stack were launched to obtain these observations.
The PAIRING repair needs deterministic state ownership across the sweep and
a served-application regression proof, not a larger sleep. The existing
`delayWrites(ms)` only supplies wall-clock delay; the separate `holdOpen`
instrument controls disconnect, not connect. This capture/inventory increment
does not invent a new fake transport API without its own fail-first producer
and E2E seam tests. Local compose ownership/cleanup and resource calibration
remain prerequisites for that next probe.

## Bounded residual ownership proposal

No ROADMAP change was made. These are proposed amendments under the existing
FLAKE 5 inventory / `Hunt the e2e flakes` rows, not new product work.

| Residual | Owner | Next observable (one bounded receipt) | Review date |
| --- | --- | --- | --- |
| NFC `✓ Monitor found` status | Hunt controller / Connected NFC tests | Retain attempt-zero trace plus accepted-commit, both rAF callbacks and handoff timing; distinguish a missed one-paint node from no committed paint. Retry snapshots cannot settle that boundary. | 2026-09-22 |
| PAIRING after axe | Hunt controller / Connected design tests | Add a deterministic hold/release at the fake connection boundary with fail-first tests; prove the real served PAIRING screen survives an intentionally slower sweep and still transitions after release. Do not increase delays or remove the final state assertion. | 2026-09-22 |
| FILTER-sheet axe timeout | Hunt controller / Design a11y tests | Preserve scan/rule timing and runner resource evidence on the next occurrence or one bounded named CI probe. Explain the 23.439 s scan before changing the time budget. | 2026-09-29 |

The existing FLAKE 5 expiry (`2026-11-14`) remains the outer stop. These
earlier review dates keep each residual finite; lack of another sighting by a
date is not evidence of repair.
