# CI failure inventory — 2026-09-15

## Receipt and coverage

The window was minted once: **2026-09-01T23:59:49Z through
2026-09-15T23:59:49Z**, inclusive. The execution baseline is
`5fc01cce3db5dfdd64fa0a80b086a7debd13a2d2`; the tracked tree was clean at
collection start. The controller's reliability spec, plan and research record
were present as separate untracked files.
No tests, containers or CI reruns were launched.

The attempt-specific Actions API enumerated **639 CI workflow runs, 645
workflow attempts and 1,290 app/E2E job records**. The run search reported
639 results, below GitHub's 1,000-result search cap. There were zero metadata
errors. Every one of the **1,036 completed jobs** has a downloaded log: 518
app and 518 E2E. The remaining 254 records are 127 app plus 127 E2E jobs whose
conclusion is `skipped`; their log endpoints returned the expected 404. They
are exclusions, not missing completed evidence. The complete sanitized input
ledger is [ci-jobs.tsv](ci-jobs.tsv); aggregate counts are in
[ci-jobs.summary.json](ci-jobs.summary.json). Raw API responses, logs, parsed
receipts and the retained report are ignored under
`.superpowers/sdd/2026-09-15-test-reliability-hunt/inventory/`.
The named final-failure and retry-recovery numerators below are reproduced by
[extract_failure_events.py](extract_failure_events.py) and listed one event
per row in [failure-events.tsv](failure-events.tsv), including the raw-log line
that names each failure. This export includes unknown families; the job ledger
alone contains metadata, not failure-title dispositions.

The collector paginates runs and every attempt-specific jobs endpoint,
deduplicates job IDs, filters each job by its own `run_attempt`, downloads at
most two logs concurrently, strips authorization on the cross-host signed-blob
redirect, and parses one log at a time.

New downloads use a temporary file, published after a successful complete read
(and Content-Length match when supplied), with a byte-count/SHA-256 completion
receipt. Cache reuse validates that receipt against current bytes. A nonempty
legacy cache without a receipt is refused, preserved and reported as unverified;
it is never silently reused or implicitly redownloaded. This collection predates
those receipts: its original successful collection manifest is the provenance
for the existing 1,036 logs, not a universal guarantee about arbitrary old
cache files. The review fix re-extracted these inputs offline without refetching
or minting retroactive completion receipts. The collector command below needs a
new evidence directory; the extractors reproduce this record offline from the
existing directory:

```text
python3 docs/superpowers/research/2026-09-15-flake-hunt/collect_ci_inventory.py \
  --start 2026-09-01T23:59:49Z --end 2026-09-15T23:59:49Z \
  --evidence .superpowers/sdd/2026-09-15-test-reliability-hunt/inventory-new
python3 docs/superpowers/research/2026-09-15-flake-hunt/summarize_ci_inventory.py \
  --evidence .superpowers/sdd/2026-09-15-test-reliability-hunt/inventory \
  --output docs/superpowers/research/2026-09-15-flake-hunt/ci-jobs.tsv
python3 docs/superpowers/research/2026-09-15-flake-hunt/extract_failure_events.py \
  --evidence .superpowers/sdd/2026-09-15-test-reliability-hunt/inventory \
  --output docs/superpowers/research/2026-09-15-flake-hunt/failure-events.tsv
```

Sixteen app failures and thirteen E2E failures reached their test summaries;
two failures in each job class stopped before a test summary. A summary is a
job-level exposure only. Vitest's ordinary historical output does not name
individual successful tests, and Playwright's dot reporter does not name
ordinary passes. Therefore this report gives **no test-specific rate or
denominator**. The only justified broad denominator is 516 fetched completed
jobs with a test summary in each job class.

## Previously investigated recurrent title families

| Rank | Family | Observed first failures | Final outcome in the same job | Disposition at baseline |
| --- | --- | ---: | --- | --- |
| 1 | E2E read-after-write: stored baseline reset | 9 | 7 retry pass; 2 exhausted | Prior fix represented on main by `70e857b2`; exhausted sightings are retained, not independently attributed to that mechanism here. |
| 2 | E2E Library SOURCE filter save/read | 6 | retry pass | Fixed before baseline by `70e857b2`; it replaced a URL predicate that also matched `/library/new`, so navigation did not prove the save landed. |
| 3 | `Releases.test.tsx` synchronous render timeout | 5 | app job failed | Fixed before baseline by #452's main commit `1a2ffe41`; the quadratic DOM query was replaced by one linear walk. |
| 4 | Apple link Google-proof continuation | 5 | 3 retry pass; 2 exhausted | #453 (`8536de99`) addresses the continuation failure; the two exhausted status-copy assertions are separate deterministic drift repaired by `c7addbad` in the same landing. |
| 5 | Stats delete/read | 3 | retry pass | Fixed before baseline in the same read-after-write census represented by `70e857b2`; the failure read the exact pre-delete total. |

These include **19 retry-saved E2E test failures in 18 jobs**; one job carried
two recovered families. Sixteen jobs finished green; `103672406399` and
`103829038779` contained recovered and exhausted failures and finished red.
The populations overlap. The
bounded receipt therefore gives a **retry-recovered job incidence of 18/516**
among fetched E2E jobs that reached a Playwright summary. It deliberately does
not call that the incidence of all first-attempt failures: thirteen E2E jobs
reached a summary and finished red, including those two overlapping jobs.
It is not a per-test rate
or a causal rate.

The strongest exact historical example is Library job `101546294246`, run
`34055396726`, attempt 1: `Expected: 303`, `Received: 302` at
`await expect(rows).toHaveCount(baselineCount + 1)`. It passed on Playwright's
retry. [Run/job](https://github.com/JamesAwesome/Ergomatic/actions/runs/34055396726/job/101546294246).
The same title appeared six times under the same file/title identity before
`70e857b2`; none appears afterward.

The five Releases failures are runs `34845000865`, `34876650602`,
`34877745107`, `34973719187` and `34975109761`. The last is job
`104400813906`: `Releases > renders each release's version, date, and every
item` followed by `Error: Test timed out in 5000ms.` and a complete
`1 failed | 9083 passed | 1 skipped` summary. [Run/job](https://github.com/JamesAwesome/Ergomatic/actions/runs/34975109761/job/104400813906).
Runs `34845000865` and `34877745107` subsequently had green whole-workflow
attempt 2 app jobs on the identical SHA. This confirms intermittent outcomes;
it does not independently prove the historical cause. Source history plus
the measured fix supplies that attribution.

The exhaustive named-title export contains **51 events**: 19 recovered E2E
executions, 20 exhausted E2E executions in 13 jobs, and 12 app final failures
in ten jobs. **23 events have no automatic family classification** (seven app
and sixteen exhausted E2E). They are not excluded as fixed, deterministic, or
irrelevant; manual source-history dispositions remain separate from extraction.
WorkoutDetail's `still navigates when preferences errored` fails with `[false]`
versus `[]` in jobs `101835494920` and `101850260678`, raw lines 3927 and 3991.
Both jobs (September 7 at 18:28Z and 19:45Z) precede main commit `a1967244`
(#346, 20:33Z). That change replaces two asynchronous registrations of the same
preferences mock with one parameterized registration; its source and commit
record explicitly identify this assertion and the registration race. This is
a previously repaired family, not a new fix or an independent revalidation of
that repair. Other unclassified titles
include article-read isolation assertions, release-list assertions, connected/
session flows and design checks. Every occurrence carries job/title/error/line
in the TSV.

Manual source-history triage now attributes **20 of those 23 automatically
unclassified events** to deterministic fixture drift or prior repairs.
Three distinct cases remain unrepaired: NFC transient status, PAIRING lifetime
across an axe scan, and a FILTER-sheet axe timeout, all in job `103672406399`.
Retained retry traces establish PAIRING's cause: its 1.2 s fake delay expires
during a 2.54 s sweep. The FILTER timeout spends 23.439 s inside axe after
roughly 6.6 s setup; the reason for that scan cost remains unknown. NFC's
earliest captured assertion snapshot already shows CONNECTING, but cannot
prove whether the accepted status painted before it.
The [complete dispositions](residual-dispositions.md) preserve each title,
raw-log reference and repair commit. Sharing a job does not establish a
shared runner cause; two previously suspected multi-failure clusters instead
have exact Bluetooth-fixture and export-envelope repairs.

These command-level failures have no final failing-test title and do not enter
the test-event count. They remain evidence, not clean jobs or guessed outcomes:

| Jobs | Raw log evidence | Disposition |
| --- | --- | --- |
| `101235081560`, `101236455010`, `101236934130`, `101238595196` | Lines 2773, 2763, 2761, 2776 respectively: domain branch coverage 99.88% below 100% | Coverage failures; excluded only from named-test event count |
| `103643332420` | Lines 4612–4613: domain statements 99.93%, branches 99.9%, below 100% | Coverage failure; no causal test classification |
| App `101807324349`, `101861059654`; E2E `101807324375`, `101861059605` | TS2339 matcher errors in SplitInput.test.tsx, e.g. lines 3252, 3294, 6800, 6888 respectively | Compilation stopped before tests; excluded from test-summary exposure |
| `104492060469` | Lines 4383–4395: unhandled rejection `access_denied`; Vitest names a potentially associated test, not a failed assertion | Prior handler-attachment race repaired in `9954fb90`; no invented failed-test identity or auth behavior change |

The exhausted Apple sightings (`104452620517`, `104456898945`) reached the
post-link status assertion, expecting longer text and receiving `You can sign
in either way.` (raw blocks 1249 and 1240). That differs from the earlier
missing-continuation-control failures. No same-cause/fixed disposition follows
from their shared title alone. Source history separately establishes stale
copy: `c0d9406c` intentionally shortened it and `c7addbad` updates this exact
E2E assertion; both land in `8536de99`.

## Retained evidence and current candidate

The highest-ranked family that was not already a read-after-write fix during
collection was the Apple continuation. Its newest retry-saved sighting is run
`34839024427`, attempt 1, E2E job `103959457513`:

```text
[chromium] › e2e/appleAuth.spec.ts:210:1 › linking Apple proves Google then
Apple and preserves the signed-in account's real workout
Locator: getByLabel('Usual sign-in confirmed')
Expected: visible
Timeout: 5000ms
Error: element(s) not found
```

[Run/job](https://github.com/JamesAwesome/Ergomatic/actions/runs/34839024427/job/103959457513).
The retained `playwright-report` artifact was downloaded before expiry. It
contains the original failure context and page tree: after the Google proof
navigation the browser was on the ordinary Today/baseline screen, with no
`Usual sign-in confirmed` control. Because CI used `trace: on-first-retry`,
the retained trace is the successful retry trace, not attempt-zero trace; that
missing observable is explicit. The three recovered missing-control sightings
are a **post-fix verification candidate** for #453. The exhausted status-copy
sightings are independently attributed above; the remaining three unrepaired
shapes have their own bounded probes in the residual disposition record.

This inventory does not establish that every recurrent family is repaired.
The narrower historical `stableBoundingBox`
suspect has zero matching failure/trajectory records in these 1,036 logs.
Historical green logs cannot prove its individual test exposure, so zero is
not a rate and does not close that row.

## Task 4 hypotheses and disposition

The initial candidate was a bounded Apple continuation verification probe:
on pre-#453 code, the Google-proof return could lose its link-continuation
state and fall through to ordinary signed-in routing; a competing explanation
is merely slow rendering after a correct continuation. Run only the named
`appleAuth.spec.ts` test with attempt-zero tracing retained, and vary one thing:
delay the mocked attempt-resume response while recording the resume request,
resolved flow view and final URL. The mechanism predicts ordinary Today plus
no continuation view before #453 and serialized continuation after it; the
render-delay explanation predicts the correct continuation state/URL in both
cases, only appearing late. Stop after the first discriminating trace. Current
main's two green full E2E jobs (`35027627403` and `35034584927`) are useful
post-fix smoke evidence but do not supply a test-specific denominator.

This hunt additionally ran 20 existing App/navigation/native-attach and
release-note regression tests with one worker; all passed with normal pressure.
That is scoped regression evidence, not a browser reproduction of the former
Apple failure. No new auth fix is justified by the inventory.

The retained PAIRING retry now proves the sweep crosses the original 1,200 ms
stage lifetime. The next repair gate is a deterministic fake hold/release,
then an intentionally slower sweep against the real served PAIRING screen:
the screen must remain through the sweep and transition after release.
No larger timeout or removed final-state assertion substitutes for that proof.
NFC paint/observation and the FILTER scan remain separate experiments with
the observables and proposed review dates in [the hand-back](residual-dispositions.md#bounded-residual-ownership-proposal).
