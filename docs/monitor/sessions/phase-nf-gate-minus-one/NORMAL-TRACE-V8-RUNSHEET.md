# NF-NORMAL-TRACE-v8 — collect the final receipt before cleanup

**PM PASS — `/root/walk_pm`, 2026-09-04. No scan authorized yet.**
The reviewer independently verified the restored installation and wireless
rehearsal, and approved this exact one-attempt protocol with no remaining
readiness findings. Consent must still arrive before the eight-minute clock
or a new scan starts.
No scan is authorized by “keep going.” Approved product design is unchanged;
product implementation remains gated. V7 is preserved in
`NORMAL-TRACE-V7-RUNSHEET.md` and `NORMAL-TRACE-V7-RESULT.md`.

## One target

Retain the automatic final receipt from one normal NFC attempt, whether the
targeted BLE handoff completes or a pending no-match scan is cancelled.
V7 established RF activation and entry into BLE scanning, then Codex stopped
the process prematurely. Do not repeat native activation as a separate case.

The existing Cancel sample handler exports before and after awaited cleanup.
The focused no-match test at `89946462` passes through the component's button,
real receipt exporter and host extractor; both export-removal mutations fail.
This proves the desk path with mocked native ports. **Reaching that button on
the phone after the NFC sheet closes remains unobserved.** If needed, that
action is an explicit feasibility experiment within this single attempt,
not a known-working prerequisite. Inaccessible control means stop, not improvise.

## Preparation and resolved installation mismatch

The original pinned app still exists at
`/tmp/ergomatic-phase-nf-ready.WQJqQu/Build/Products/Debug-iphoneos/App.app`.
On 2026-09-04 its executable/probe hashes, bundle/version/build, strict/deep
signature, CDHash, NFC entitlement `[TAG]` and usage text matched the exact
values in `NORMAL-TRACE-V7-RUNSHEET.md`. Probe/receipt sources match its source
commit `7e10d2897a3d9c00685374695410a59213beb679`. Metadata is already prefilled.

A fresh read-only CoreDevice app listing after unplugging succeeded over the
network. It shows `haus.waffle.ergomatic` **0.37.0 / 848**, at a different install
URL from diagnostic **0.23.0 / 789**. Why it changed is unknown. PM correctly
identified restoration as already authorized by James's original request;
Codex announced the mismatch and restored the pinned artifact wirelessly.
At 20:47:05–20:47:14 UTC, install and independent installed-app listing matched
bundle/version/build/new installation URL; the production verifier passed and
cleanup rehearsal succeeded. This preparation took 8.141 seconds. The earlier
0.37.0 listing remains as evidence, not the current installed state.

Private directory, mode 0700:
`/var/folders/m8/wdf8_49130z_j4m94t3rj3w80000gn/T/ergomatic-nf-v8.ags14zdx`.
It holds fresh `install.json`, `installed-apps.json`, `preparation.json` and
retained `prior-*` provenance. `current-installed-apps.json` is the pre-restore
0.37.0 observation. V7 logs remain untouched. No normal capture/evidence file
exists at this directory's root, so it is ready for the authorized sample.

The separate `transport-rehearsal/` subdirectory holds a wireless, zero-scan
console rehearsal: live host plus WebView loaded, exact controller-PID SIGINT,
exit 0 and verified cleanup in 4.655 seconds. Zero reader starts, native NFC
diagnostics or receipt exports. `transport-rehearsal-summary.json` records it.
Neither USB reconnection nor a phone action was required.

Controller `dd11d3da` and classifier are unchanged; their hashes and actual
installation, listing, console and exact-bundle cleanup rehearsals remain in
`OPERATOR-WORKFLOW-V6.md`. No new controller, app change, rebuild or repeat of
unchanged suites is required by this procedure. Direct Node SIGINT is the
verified finish mechanism; never signal the pnpm wrapper or use a debugger.

## Cost and permission

One NFC attempt/presentation, zero retries, rowing, HR, screenshots, console
typing, metadata entry, manual exports or programming. One explicit **go**
reply authorizes the scan; an optional **blocked** reports unavailable UI.
Readiness for setup is not scan consent. “I did it” is not a completion signal.

Finish installation/identity preparation and PM review before inviting the
sample. Report preparation time already spent, including installation,
separately from the remaining operator session. The invitation requests only
**go**, explicitly consenting to one scan, with no prior physical setup action.
No timer or controller runs while waiting for that reply.

The remaining session has an eight-minute TOTAL cap from receipt of **go**:
fresh identity check, console attachment, the subsequent PM5/phone setup block,
chat waiting, scan, observation and cleanup all count. Reserve the final
45 seconds for cleanup; never reset or extend the original clock. If fewer
than two minutes remain before delivering the physical block, stop without NFC.

## Exact action feasibility

| Starting state and action | Evidence / limit |
| --- | --- |
| Paired iPhone: install/list/launch/capture/cleanup | Actual v6/v7 and fresh wireless v8 results above. Pinned app restored and independently verified; wireless console and cleanup pass. No phone settings, debugger or trust-prompt workaround. |
| PM5: More Options → Connect Device, Ready for App Connection | Earlier PM5 captures and successful samples in `REPAIRED-NORMAL.md`. NFC does not substitute for this setup step. |
| Fresh app: YOU → probe → enabled Run normal sample, no modal | James demonstrated on the pinned build in v7. Recheck visibly after any relaunch; missing/disabled control, login or unexpected popup stops the walk. |
| Tap normal then immediately present at the previously working NFC spot | V7 and previous normal samples demonstrate this sequence. No chat reply or app tap through the native sheet. |
| Sheet closed; probe says Scanning for the PM5's exact local name: reach/tap Cancel sample | Candidate verified in unchanged source and desk test, NOT yet demonstrated in that phone/modal state. This is the explicit conditional feasibility experiment. At most three scrolls, then stop if unavailable. |

## Short blocks for James

Deliver only after PM has approved this exact revision. The untimed invitation
states measured prior preparation cost and asks: “Reply go when you want to
start the eight-minute, one-scan test. No rowing or heart-rate belt.” It requests
no setup gesture and starts no timer. This is the one explicit scan decision.

**Codex after go, before the physical block:** record consent-received time and
its original eight-minute deadline. Check remaining time and fresh installed identity.
Attach direct Node capture and retain its exact PID. Require a live console
and WebView-loaded line; launch JSON is absent until exit. Failure stops the
session without repair. No phone scan before these checks.

**Setup and one scan — one complete block**

1. On the PM5, choose More Options → Connect Device; leave Ready for App Connection showing.
2. On the phone, open YOU and scroll to NFC GATE -1 PROBE (at most three scrolls). If Run normal sample is missing/disabled or a popup appears, stop and reply **blocked**.
3. Tap Run normal sample once and immediately hold the phone at the same PM5 NFC spot used earlier. Do not tap through the NFC sheet or scan again.
4. Leave it while I collect the result. I will tell you when finished or send the cancellation block if Bluetooth keeps searching.

**Conditional cancellation — the declared feasibility experiment**

Send only after 30 seconds of observed native BLE scanning without a final
receipt, with at least two minutes left before the total cap. Thirty seconds
is an operator observation allowance, not a radio guarantee or new app timeout.
Do not wait for a “done” acknowledgement before sending this block.

1. If the NFC sheet has closed and the probe still says “Scanning for the PM5's exact local name,” scroll to Cancel sample (at most three scrolls) and tap once.
2. Leave the app open while I save the result. If that status/control is missing, disabled or covered, stop and reply **blocked**. Do not start another sample.

Unknown UI, an unexpected prompt, capture loss or an action that cannot fit
the cap ends the walk. No extra sheet-dismissal gesture or repair/rebuild loop.

## Agent observation and finish

Read the live log at most 15 seconds apart. Use the existing
`extractGateConsoleEvidence` to validate each distinct receipt envelope and
`classifyGateConsoleEvidence` on the newest. Inspect only allowlisted output;
raw native logs include secure-storage data and must not be printed/committed.

Desk rehearsal through the existing extractor passed all five framing checks:
v7's actual zero-export log waits; one complete export waits; two distinct
complete exports for the same attempt satisfy final framing; a truncated second
or duplicated first export waits. Retained reload-labelled producer frames
tested framing only, not new normal/RF behavior. Results are in the private
`observation-rehearsal.json`; the focused normal/Cancel producer test is separate.

On this unchanged normal/Cancel path, drain automatically exports once before
cleanup and once after awaited BLE/listener cleanup. **Before early SIGINT,
require two distinct complete canonical exports for the same single normal
attempt.** An end marker alone is not proof; neither is the first complete
but pre-cleanup snapshot. Never fall back from a truncated newest export.
The final deadline and an explicit abort still stop even when evidence is absent.

After the final export, signal only the exact Node controller PID. Freeze,
classify and require verified bundle cleanup. At the observation deadline,
an explicit abort or capture failure, finish without extending the clock.
Missing evidence or failed cleanup is inconclusive. If host cleanup cannot be
verified, the previously approved fallback is one side-button lock; do not
claim it proves process termination. Release James and record actual total time.

## Outcomes

Positive: final receipt and generation-1 ordered begin/return/RF-active trace
meet the classifier's pinned normal criteria, including targeted connect and
disconnect. Negative observed attempt: final receipt and native trace show
criteria unmet. A cancelled no-match result does not establish why advertising
was absent or whether it could appear later. Missing/invalid evidence,
inaccessible action, exhausted cap or unverified cleanup is inconclusive.

Record Cancel feasibility independently: demonstrated only if its declared
button action produces automatic exports and BLE stop. If the normal handoff
completes first, mark Cancel not exercised; no extra case to force it. This
walk cannot close the remaining Gate -1 matrix or authorize product work.
