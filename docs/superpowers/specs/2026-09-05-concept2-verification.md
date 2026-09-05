# Wave E PR C — send the number the verification code was minted over

## 1 · What and why

When a rower sends a monitor row to Concept2 and then enters the PM5's
verification code on the logbook, Concept2 refuses it: _"This workout cannot be
verified. Please check your date, time and distance exactly match the monitor."_
The code is right. The distance we send is not: for an interval row we post the
**sum of the interval distances we assembled** (`work_meters`), and Concept2
checks the code against the **monitor's own whole-workout total**, which differs.
On James's 2026-09-04 walk the two were 5708 m (ours) and 5706 m (the monitor).

This PR sends the monitor's own numbers — the same ones the app **already
displays** — for the fields the code is checked against, instead of our derived
accumulators. It is the last piece of Wave E's point: the verification code
exists so a logbook row reads as machine-confirmed, and today, for an interval
row whose totals differ, it cannot.

**The fix is small and the risk is a wrong number to a third party, which is
why it is TRIAD:** it changes what a stored number *means on the wire*
(`distance` stops being "our interval sum" and becomes "the monitor's logged
total"). It takes the full antagonist pass on this spec and a PM gate on its PR,
and it does not bundle with anything.

## 2 · The measured answer (PRIMARY — live, 2026-09-05)

**This is no longer an open question.** §5.4 of the walk-fixes spec
(`2026-09-04-concept2-walk-fixes.md`) named four questions and said a walk or a
document would settle them. They were settled by a live API test against
`log-dev.concept2.com` (account 2211, the dev token), posting the **same code**
James's PM5 minted, `D9BD-F964-32E2-7F18`, with the walk row's exact
date/time/type and only the distance varied:

| POST | distance | result |
| --- | --- | --- |
| the monitor's total | **5706** | **`verified: true`** |
| our interval sum (the existing row 85921) | 5708 | `verified: false` |

`rest_distance: 525` rode along on the verifying POST and it still verified, so
**rest is not part of the check** (confirms the walk-fixes spec §3.8 D). The
test row was deleted; the real row was untouched. Full record:
`.superpowers/research/2026-09-05-c2-verification-code.md`.

**What this establishes, each tagged:**

- **PRIMARY.** The authoritative distance is the monitor's own whole-workout
  total, stored on our row as `machine_work_meters` (0x0039's
  `workDistanceMeters`, rounded). Not `work_meters` (our `Σ actuals.distance`).
- **PRIMARY.** The code is validated against the **submitted fields**, exactly,
  with no trusted-client relationship and no ErgData upload — log-dev accepted
  a code minted by a physical PM5 against a plain API POST. So the check is
  reproducible by us, and the walk-fixes spec's "no gate this repo owns can
  tell us what Concept2 accepts" is now weaker than it was: we have a live
  oracle for it, off the send path.
- **PRIMARY**, developer docs, quoted: _"For the verification code to be
  accepted, the date, time, distance, workout_type and machine type must match
  that of the code."_ Five fields, exact, no band.
- **INFERENCE, by parity, and the antagonist should rule on it.** Only
  **distance** was empirically divergent on James's row; `time` happened to
  agree (25:00.0 both). But `time` is in the checked-field list and we derive it
  the same way we derive distance (`Σ`, not the machine's own), so the same
  divergence class applies. See §4.

## 3 · Research record

- **C1 (what Concept2 compares against) — ANSWERED**, above: the five submitted
  fields, exact. `.superpowers/research/2026-09-05-c2-verification-code.md`
  carries the quotes and the fetch log.
- **The byte → display-code transform is a GAP, and it bounds scope.** We store
  `machineSummary.verificationBytes` (the raw 0x003F payload), but a prior
  measurement (`docs/monitor/c2-crossconnect-2026-09/README.md`, "Verification
  stretch") posted those bytes reformatted into the 16-digit shape and got
  `verified: false`. We do **not** know the transform from the stored bytes to
  the `D9BD-…` code the PM5 displays. My test used James's **displayed** code,
  which we cannot reconstruct from the stored bytes today. **So this PR cannot
  auto-submit the code** (§8).
- **Why nothing caught it before** (walk-fixes spec §3.8, carried): a Just Row
  send already posts the machine's own number (`justrow/totals.ts` reads
  `summaryTotals` first), so the one path the feature was most walked on is the
  one path that cannot exhibit the defect.

## 4 · The design

**One principle: the send posts the monitor's own numbers for every field the
code is checked against — the same numbers the app already displays.**

Today the app is already internally split, and the send is the outlier:

- **Display** (`src/log/LogRow.tsx` `heroDistanceMeters`/`heroTimeSeconds`, and
  the `MACHINE CONFIRMED · WORK ONLY` block in `src/log/FromTheLog.tsx`) prefers
  `machineWorkMeters` and `machineWorkSeconds` when present. A rower already
  sees 5706, not 5708.
- **Send** (`server/concept2/mapping.ts` `buildC2Payload`) posts
  `distance: workMeters` and `time: c2Tenths(workSeconds)` — our accumulators.

**The change:** thread the machine totals to the payload builder and prefer them.

- `machineWorkMeters` (typed `integer` column `machine_work_meters`) and
  `machineWorkSeconds` (`doublePrecision` column `machine_work_seconds`) are
  already stored per row (`server/db/schema.ts`). They are **not** on
  `SessionLogRow` (`server/concept2/mapping.ts`) or in `toMappingRow`
  (`server/routes/concept2.ts`) or the loader's select — add them (nullable).
- `buildC2Payload` posts, for the code-checked fields:
  - `distance: machineWorkMeters ?? workMeters`
  - `time: c2Tenths(machineWorkSeconds ?? workSeconds)`
  - `workout_type` — already machine-sourced (`machineSummary.workoutType`).
  - `date`/`timezone` — already the row's own completion instant; unchanged.
- **Fallback is deliberate, not incidental.** Eligibility already requires
  `source: "pm5"`, `finished`, and non-null work totals — but a `pm5`/`finished`
  row can still carry `machineWorkMeters: null` (0x0039 never arrived, or a row
  logged before the column existed). Those keep sending `workMeters`/`workSeconds`
  — today's exact behavior, no regression: such a row could not be verified
  before this PR either, because its code and its totals never came from a
  machine summary at all.
- **Rest is untouched** (`rest_distance`/`rest_time`): proven not in the check.

**The scope antagonist must rule (INFERENCE half):** whether `time` moves now
or waits. Case for now: same authority, same derivation, same checked-field
list; the display already uses `machineWorkSeconds`, so moving `time` keeps
send = display = machine, and a future row whose work-seconds sum diverges from
0x0039 (as distance did) fails verification silently if we don't. Case for
waiting: only distance is empirically proven divergent, and a change we cannot
show going wrong today is a change we cannot gate on real divergence (no capture
in the corpus has divergent seconds — the antagonist should check that claim
against `oracleCorpusReplay`). **The spec's recommendation: move both, gate
distance on the divergent capture and gate time structurally (the payload reads
the machine field), and say plainly in the PR that time is by-parity.**

## 5 · What can and cannot be gated (C4)

**The gate the walk-fixes spec §5.4 specified, built:** a replay test whose
oracle is the capture's own 0x0039 summary, comparing it against the distance
the send path would post for the same run.

- **Expected value from the capture's own summary frame**, never our
  accumulator (RF11 — every gate we own compares `work_meters` with the
  intervals that produced it and agrees with itself; `recordTwdVerdict` was
  retired at RC-9c for exactly this).
- **Starts upstream of the producer** (RF24): begins at the recorded wire bytes,
  drives the real driver/hook/store, and asserts on the built C2 payload — not
  on a seeded `machineWorkMeters`.
- **Proven to go red on a DIVERGENT capture.** `rest-boundary` (machine 198 m,
  ours 197 m — `oracleCorpusReplay.test.ts` RC-9(b)) is the fixture: with the
  fix, the payload posts 198; a mutation reverting to `workMeters` posts 197 and
  the test reddens. The three captures that agree to the metre cannot gate this
  (RF21) and are not the fixture.
- **The honest limit is now smaller but real:** CI proves which of our two
  numbers we send and that it equals the machine's summary for that capture. It
  does **not** re-run Concept2's acceptance — but §2's live test did, once, and
  the PR body carries that as the end-to-end evidence CI cannot be.

## 6 · What a rower sees (C5)

**No displayed number moves.** The hero distance/time and the MACHINE CONFIRMED
block already render `machineWorkMeters`/`machineWorkSeconds` (§4). This PR makes
the **wire** match what the screen and the machine already say. The standing
design gate's "a number change is a design question too" clause is satisfied by
that fact: the PR body states which screens were checked
(`LogRow`, `FromTheLog`, the send block) and that each already shows the machine
number, so there is no before/after for a rower to read. **If the antagonist or
the PM finds a surface that displays `work_meters`, that surface is the design
question and Gate 0 opens; the spec's claim is that none does, and it is
checkable by grep.**

## 7 · Exit criteria

- **C1.** Answered (§2): the five checked fields, exact, no band; distance
  authoritative = the monitor's total. Citation + live measurement both on file.
- **C2.** Answered by the live API test (§2) rather than a walk — cheaper and
  reproducible. The PR body may still recommend one confirming hardware send,
  but it is not required for the number to be settled.
- **C3.** The authoritative number is named with its reason and its
  falsifier: `machine_work_meters` (0x0039's own total), because the code
  verified against 5706 and refused 5708; it would be wrong only if a future
  monitor row's 0x0039 total itself disagreed with what its code was minted
  over, which the same live test re-checks for any new capture.
- **C4.** The gate is specified (§5) before it is built: capture-summary oracle,
  upstream-of-producer, proven red on `rest-boundary`, honest about CI's limit.
- **C5.** No rower-visible number moves (§6); the PR body names the screens
  checked. If one does move, Gate 0 opens first.
- **C6.** The antagonist FULL pass runs on this spec (TRIAD), and a PM gate on
  the PR. Both non-negotiable. The antagonist's first job is the §4 `time`
  ruling and the §6 "no surface shows work_meters" claim.

## 8 · Out of scope, named

- **Auto-submitting the verification code.** We store `verificationBytes` but
  not the transform to the displayed 16-digit code (§3); until that is known we
  cannot post a code that verifies. When it is, a row could arrive already
  verified with no manual entry — a real follow-on, filed here, not built.
- **The 2 m interval-assembly discrepancy itself.** Our `Σ actuals` is 2 m over
  the monitor's own total on James's row. That is a question about how we
  assemble interval distances from 0x0037/0x0038, and it affects our per-interval
  breakdown, not verification. This PR routes around it by sending the machine's
  total; it does not explain or fix the 2 m.
- **Legacy rows with no machine summary.** They keep sending `work_meters` and
  remain unverifiable, exactly as today. No migration, no backfill.
- **Changing `rest_distance`/`rest_time`.** Proven not in the check; untouched.
