# Lane E — Tests, Build/Deploy Paths, and Documentation Truth

Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

Status: COMPLETE — fresh Sol-high semantic review approved after corrections

Lane E found that the shipped gates are broad and currently green, but they do
not enter the fault boundaries behind any of the eight promoted candidates.
That is incomplete evidence, not circular proof: each candidate was reproduced
with an external fault or independently shaped input. A calibrated joined probe
also promoted AUD-016 after proving that a connected workout can finish in
memory while storage loss leaves the real monitor log door empty.

## Gate map

| Gate                 | Input path                                                                                      | Oracle                                                                              | Blind spot                                                                                                                           | Biting control and result                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/client Vitest   | Three configured projects; client runs jsdom                                                    | Test-authored values and rendered/returned consequences                             | Native modules and radio adapters are excluded; normal fixtures do not deny storage or malformed successful HTTP bodies              | Task 3 passed; temporary candidate probes entered the named external faults while the other 4,032 client tests stayed green                                    |
| Coverage             | V8 over configured projects                                                                     | Entry counts and repo-wide 90% thresholds                                           | A new or risky branch can be absent while aggregate coverage stays green; it says nothing about expected-value authority             | Per-file evidence is required with each fix; no aggregate score is used as candidate evidence                                                                  |
| Mutation             | Unit-only Vitest over `domain/**`, routes, and stores                                           | A test fails after source is changed                                                | The surviving 2026-07-29 score covers seven then-current domain modules and excludes client, integration, native, and radio behavior | No full run: its stale aggregate could not change priority; each candidate instead names the exact corruption its regression must kill                         |
| Real store contracts | Fake and PostgreSQL implementations run one shared contract                                     | The real implementation is the contract authority declared by the suite             | Parity is one oracle, not two; ordinary JS writers cannot create every database-valid malformed JSONB value                          | AUD-013 used raw `1e1000` in real PostgreSQL and observed mounted HTTP status                                                                                  |
| Playwright E2E       | Real compose stack; production Vite build with build-time fake monitor                          | Browser-visible flows and structural assertions                                     | The monitor is fake and native/radio branches remain unreachable                                                                     | Task 3 passed 420 tests; this is evidence for browser composition only                                                                                         |
| Production build     | TypeScript plus Vite                                                                            | Successful emitted artifact                                                         | A green build does not prove a module or literal is absent                                                                           | Fresh build passed: 235 modules, 578.23 kB main JS (176.26 kB gzip), with the existing >500 kB warning                                                         |
| `dist:grep`          | Fresh source → Rollup → `app/dist`                                                              | Five stable dev-only literals absent                                                | A green-only exclusion probe could be looking for ineffective needles                                                                | Static reachability of `createFakeTransport` built 237 modules and made `fake transport` fail in the main chunk; reversal built 235 modules and restored green |
| CI path selection    | Synthetic changed-path sets                                                                     | Docs-only skips; code, workflow, unknown, and every uncertainty run code jobs       | It tests the selector, not GitHub's hosted execution                                                                                 | All 15 persistent shell cases passed, including bad-SHA, empty-diff, and script-failure fail-safe cases                                                        |
| Compose readiness    | Rendered base/e2e compose plus Task 3's real stack                                              | PostgreSQL health → API `/api/health` → nginx `/api/health`                         | Configuration does not prove every future image remains healthy; the e2e fake build differs deliberately from production             | Rendered configs preserved the chain; E2E alone adds `TEST_AUTH_SECRET` and `VITE_ENABLE_FAKE_MONITOR=1`, and overrides production's `SITE_URL` with localhost |
| Deploy rollback      | Shell harness with fake git/Docker                                                              | Reject bad SHA/dirty tree; on unhealthy deploy restore `PREV` and invoke `up` again | Does not prove an old real image remains available or healthy on a host                                                              | All persistent cases passed, including unhealthy rollback to `PREV` and the second `up`                                                                        |
| Runtime import graph | TypeScript AST over production relative value imports, including re-exports and dynamic imports | Tarjan strongly connected components                                                | No persistent repository gate; type-only and external-package edges are intentionally outside the question                           | Disposable `a.ts ↔ b.ts` produced one SCC; removal produced 217 files, 489 edges, zero SCCs                                                                    |

No test, container, server, or hardware process remains from these checks. The
bundle marker, cycle pair, and joined storage test were removed, and the product
diff returned to empty before their evidence was accepted.

## Candidate gate independence

| Candidate | Existing persistent evidence                                                      | Why it misses                                                                                          | Required regression discriminator                                                                                                                               |
| --------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUD-002   | Hook tests mock successful arrays; list tests mock the hook with realistic titles | No successful malformed body crosses HTTP → hook → list                                                | Literal `200 {}` must render the bounded load error; deleting the array check must fail                                                                         |
| AUD-006   | Seed sweep and display tests                                                      | No seeded workout has leading or adjacent rest; isolated tests accept the projection's deliberate drop | Independently sum accepted raw rest and require Today, Library, and TOTAL to account for it; omitting either rest must fail                                     |
| AUD-011   | Realistic run round trips and malformed JSON tests                                | They begin after a usable `Storage` object exists and assume cleanup after 201 cannot fail             | Denied getter must leave real routes usable; selective cleanup failure after 201 must still yield one POST and visible success                                  |
| AUD-012   | Seed concurrency integration test                                                 | It begins after migrations rather than launching two full entrypoints on an empty database             | Both processes must reach health with source-derived seed/journal counts; removing migration serialization must fail                                            |
| AUD-013   | Mounted routes, fake/real store contracts, JSON-type cases                        | Writers use ordinary finite JS numbers; type checks do not bound the SQL cast                          | Raw PostgreSQL `1e1000` beside a healthy row must not turn the list into 500; restoring the direct cast must fail                                               |
| AUD-014   | Mocked successful native sign-out                                                 | Coverage excludes native and no case rejects transport before Keychain wipe                            | Reject only the request and require local token deletion; moving deletion below the await must fail                                                             |
| AUD-015   | `saveRun` unit failure plus normal Countdown fixture                              | The caller test assumes persistence succeeds and Timer reads storage on a separate route               | Selective `RUN_KEY` failure must hold a recoverable error rather than reach Today; ignoring the boolean must fail                                               |
| AUD-016   | Monitor persistence unit cases and monitor log-gate cases separately              | One proves swallowed writes; the other receives an already-stored completed fixture                    | Deny only `MONITOR_RUN_KEY`, finish a realistic measured run, and require the log hand-off to retain a safe recovery; restoring the void/swallow path must fail |

The ordinary green suites are incomplete, not self-confirming. Candidate probes
do not import their expected outcomes from production: storage, transport, SQL,
and response-shape cases inject literal external conditions; AUD-006 sums raw
authored seconds; AUD-012 observes independent process and database outcomes.

## Playwright route/state/orientation matrix

The 420-test aggregate is not treated as state coverage. Chromium defaults to
390×844 (`app/playwright.config.ts:20-36`); only named tests override it.

| Surface                    | Persistent realistic path                                                                                                                                                                                   | Orientation entered                                                                                  | Meaningful corruption that bites                                                                                                | Unentered P0–P2 recovery cell                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in / You              | Backdoor creates a real server session, renders Today and You, then signs out (`app/e2e/flows.spec.ts:35-69`)                                                                                               | Portrait default                                                                                     | Retaining the signed-in shell after Sign out fails the Google-link assertion                                                    | AUD-014's rejected native request and Keychain wipe; no native orientation                                                                        |
| Today → History            | API-created logs cover empty/populated History, hero/legacy rows, row links, scroll, and navigation (`app/e2e/log.spec.ts:173-331`)                                                                         | Portrait default; navigation burn uses 390×500                                                       | Removing the row, hero, empty state, detail link, or scroll behavior fails visible/URL/position assertions                      | AUD-002 malformed 2xx, AUD-006 accepted leading/adjacent rest, AUD-011 storage getter denial, AUD-013 extreme JSONB; no landscape recovery matrix |
| Countdown / Timer / Log    | Bulk-imported workouts and real browser storage cover start, resume/BACK, completion, session/manual log doors (`app/e2e/session.spec.ts:183-390,654-1039`)                                                 | Portrait 390×844; timer 844×390 (`session.spec.ts:399-435`) and 844×420 (`design.spec.ts:4207-4281`) | Rebuilding a run on BACK, losing stored bytes, overflowing, or hiding required controls fails route/storage/geometry assertions | AUD-015's selective `RUN_KEY` write failure and retry state                                                                                       |
| Connected / monitor log    | Bulk-imported workout plus the CSAFE fake covers program, pause/resume, End, and Log in portrait and landscape; a real quota probe forces series sacrifice (`app/e2e/connected.spec.ts:917-1035,1142-1242`) | Portrait 390×844 and landscape 844×390                                                               | Keeping the dead driver on retry, losing the smaller quota retry, or breaking the layout fails rendered/storage assertions      | AUD-016's whole-record write denial through the mounted Log surface; every native BLE/lifecycle arm                                               |
| Forced manual monitor door | A shaped mismatched stored monitor record drives the real `?from=monitor` route into the plain manual door (`app/e2e/session.spec.ts:1472-1565`)                                                            | Portrait default                                                                                     | Removing the gate or discard consequence fails form, warning, URL, and storage assertions                                       | A measured run absent because its own writes failed; the existing fixture is stored and mismatched instead                                        |

The matrix covers normal composition and selected recovery, not the eight
candidate triggers. Each fix therefore owns a new realistic state test; no
candidate is cleared by the E2E total or by orientation coverage elsewhere.

## AUD-016 joined-path probe

A temporary client test built the production “Filling Low” workout through
`buildDraft` → `buildRun` → `compileProgram`, denied only writes to
`MONITOR_RUN_KEY`, then used the real record writers to open, record a 2,000 m
interval, and finish. The returned in-memory record retained the measurement
and completion stamp, while `loadMonitorRun()` and
`monitorModeRun(?from=monitor)` both returned `null`. The client suite passed
150 files / 4,033 tests with that expected reproduction.

The temporary probe did not mount the Log component or execute connected
navigation. Its directly observed consequence stops at the real gate returning
`null`. Code then initializes the screen's `monitorRun` state from that result
and selects the manual branch (`app/src/session/LogSession.tsx:1487-1489,
1673-1679,1916-2051`). A separate persistent E2E case proves that another
`monitorModeRun` miss renders that plain manual door
(`app/e2e/session.spec.ts:1472-1565`). The AUD-016 screen consequence is
therefore a code-traced composition across those two controls, not a mounted
observation of the selective write fault.

The probe's first version accidentally passed an undefined workout ID from a
draft shape. Disabling the injected storage failure stayed green, correctly
invalidating that evidence: the serialized record omitted `workoutId`, so the
loader discarded it for an unrelated reason. After the fixture used the
literal authored ID, fault-on passed and fault-off failed at `loadMonitorRun()`
with the complete stored record. That red calibration is why the joined result
is accepted and the earlier apparent confirmation is not.

The approved series-capture design explicitly acknowledges that a second,
smaller storage write can also fail and does not guarantee recovery
(`2026-08-19-series-capture-design.md:63-72`). The reproduced consequence is
therefore **Probable**, not Confirmed against a complete product authority: the
failure is real and loses the connected log hand-off, but the desired behavior
under a genuinely unavailable origin needs a product decision.

## Artifact and operational verdicts

- The E2E stack is a production Vite build with one explicit fake-monitor build
  argument, not a development build.
- The production artifact passed a source-to-artifact exclusion calibration.
  A temporary static import and live reference to `createFakeTransport` built
  the dev-only module into the 591.42 kB main chunk and made `dist:grep` name
  that chunk for `fake transport`. Reversal rebuilt the 578.23 kB main chunk
  without the module and restored green. Configuration alone was not used.
- Compose renders one real readiness chain from database through nginx. Task 3
  exercised it; Lane E did not start a redundant second stack.
- Deploy tests prove checkout/rollback command mechanics, not real-host image
  availability. No broader availability claim is made.
- CI selection has persistent red-path and uncertainty-path controls. Hosted CI
  execution remains a separate artifact, not inferred from the shell test.
- AUD-005 is cleared at this baseline: the calibrated production graph found no
  runtime SCC. The lack of a persistent cycle gate is P3 process debt, not a
  harmful-cycle candidate.
- AUD-003 is a real measurement gap but not a separate product candidate. The
  repository already labels the score stale, and the eight concrete missing
  regressions are more actionable than refreshing an aggregate score.

## Load-bearing prose sample

| Lane | Reopenable source and quoted load-bearing line                                                                                                                                                                                                                                                                                                                                                                        | Needed attribute and verdict                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A    | Concept2 rev. 0.27 says, “The split duration must not cause the total number of splits per workout to exceed the maximum of 50” ([official PDF](https://www.concept2.nl/files/pdf/us/monitors/PM5_CSAFECommunicationDefinition.pdf), as reopened in `lane-a-workout.md:21-30`)                                                                                                                                        | The needed attribute is the general variable-workout interval count, not generated fixed-workout splits. The source is silent; AUD-008 remains Hypothesis.   |
| B    | WHATWG says the `localStorage` getter “Throws a `SecurityError` ... if the request violates a policy decision” ([Web Storage §12.2.3](https://html.spec.whatwg.org/multipage/webstorage.html#dom-window-localstorage), reopened in `lane-b-data.md:15-19`)                                                                                                                                                            | The needed attribute is failure before `getItem`; this exactly supports AUD-011's getter injection.                                                          |
| C    | No Lane-C-specific external-fact assertion was found in the sampled comments and test names.                                                                                                                                                                                                                                                                                                                          | Fixture realism and client route behavior are internal product/test claims; they are bounded in the gate matrix rather than presented as external authority. |
| D    | Bluetooth LE 8.3.0 defines `CONNECTION_TIMEOUT` as 10 and passes that value into connection scheduling ([Plugin.swift](https://github.com/capacitor-community/bluetooth-le/blob/v8.3.0/ios/Sources/BluetoothLe/Plugin.swift#L7), [DeviceManager.swift](https://github.com/capacitor-community/bluetooth-le/blob/v8.3.0/ios/Sources/BluetoothLe/DeviceManager.swift#L268-L275), reopened in `lane-d-monitor.md:41-47`) | This supports the native connection bound only; callback ordering, buffering, and delivery remain unknown.                                                   |
| E    | `compose.yml:40-47` supplies the production `SITE_URL`; `compose.e2e.yml:31-39` overrides it and adds the fake build arg.                                                                                                                                                                                                                                                                                             | These are configuration facts. Source-to-artifact calibration, not prose, establishes production fake exclusion.                                             |

No sampled comment, test name, or spec created an additional fix candidate.
The unsupported “PM5 supports at most 50” claim remains quarantined because its
primary-source mismatch is established but the device's actual general limit
is not.

## Quarantined Task 8 hypotheses

- AUD-001 remains P1 Hypothesis. Production-phone outcomes narrow the concern,
  but no raw native transport trace establishes callback ordering, buffering,
  or lifecycle delivery.
- AUD-007 remains P1 Hypothesis. Acknowledgements and interval-zero readback do
  not establish that a shorter reprogram removed a previous tail.
- AUD-009 remains P2 Hypothesis. Zero was emitted and accepted, but no primary
  definition or PM5 target-display/enforcement control proves “untargeted.”
- AUD-010 remains P1 Hypothesis. Local multi-frame ordering is covered, but no
  device trace reaches a uniquely fingerprinted later-frame interval.
- AUD-018 remains P2 Hypothesis. The two terminate captures disagree about a
  retained partial, and neither supplies a general product rule. Replaying the
  exact orders may describe current policy but cannot decide which PM5 outcome
  is authoritative.
- AUD-019 remains P2 Hypothesis. Code establishes web/native write differences
  and an absent default acknowledgement timeout; it does not establish dropped
  browser delivery. A lost-chunk browser control can test bounded application
  recovery, not physical Web Bluetooth semantics.
- AUD-008 remains P2 Hypothesis as above. A primary general-count statement or
  physical interval-51 result is still required.

No hardware work was performed. Device-only unknowns remain for Task 12, where
they will be priced only if they can change the final ranking.
