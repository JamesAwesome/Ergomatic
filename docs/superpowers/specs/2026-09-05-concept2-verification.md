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
| the monitor's total | **5706** (fresh) | **`verified: true`** |
| a negative control | **5707** (fresh) | **`verified: false`** |
| our interval sum | 5708 | 409 duplicate of row 85921; not freshly tested (below) |

`rest_distance: 525` rode along on the verifying POST and it still verified, so
**rest is not part of the check** (confirms the walk-fixes spec §3.8 D). All
test rows were deleted; the real row was untouched. **The result is committed at
`docs/superpowers/research/2026-09-05-c2-verification-measurement.md`** — the
requests, the responses, and what was and was not controlled. The sibling
`docs/superpowers/research/2026-09-05-c2-verification-code.md` is the C1 documentation research and only *proposes*
the test; do not cite it for the result (it carries none).

**What was controlled, precisely** — the table is not a clean two-arm A/B. 5706
was a fresh POST and verified; **5707 was a fresh POST and did NOT verify**, and
that is the real control: it proves the check is pinned exactly at 5706, not that
any decodable code passes. 5708 as a fresh POST could not be run — the duplicate
guard (date+time+distance) 409'd it against the existing row 85921. So "5708 does
not verify" rests on 5708 ≠ 5706 (the code is pinned there, per the 5707 control)
plus James's own live website refusal of this code against the 5708 row on
2026-09-04, not on a fresh matched POST.

**What this establishes, each tagged:**

- **PRIMARY.** The authoritative distance is the monitor's own whole-workout
  total, stored on our row as `machine_work_meters` (0x0039's
  `workDistanceMeters`, rounded). Not `work_meters` (our `Σ actuals.distance`).
- **PRIMARY.** The code is validated against the **submitted fields**, exactly:
  log-dev accepted a code minted by a physical PM5 against a plain API POST with
  no trusted-client relationship and no ErgData upload, and rejected the same
  code one metre away (5707). So the check is reproducible by us off the send
  path. **Two unproven edges remain, stated:** this was log-dev, not production;
  and it was one date/time, so nothing here exercises a wrong `time`.
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
  fields, exact. `docs/superpowers/research/2026-09-05-c2-verification-code.md`
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
  already stored per row (`server/db/schema.ts`), and `store.get` already
  `select()`s every column, so the load side needs nothing. They are **not** on
  `SessionLogRow` (`server/concept2/mapping.ts`) or in `toMappingRow`
  (`server/routes/concept2.ts`) — add them to both (nullable). That is the whole
  thread; the loader is untouched.
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
waiting: only distance is empirically proven divergent, and no capture in the
corpus has divergent seconds (confirmed against `oracleCorpusReplay` — every
capture's `machine.elapsedSeconds` equals ours), so time cannot be gated on
observed divergence. **The spec's recommendation, which the antagonist pass
confirmed: move both. Distance is gated by the seam test (§5); time is gated by
a seeded `buildC2Payload` unit test (§5's carve-out, forced because reality has
produced no divergent-seconds capture); and the PR body states time is
by-parity, not observed.**

## 5 · What can and cannot be gated (C4)

**PR C touches ONE seam: the stored row → the C2 payload
(`buildC2Payload`/`toMappingRow`, server-side). It does not touch how
`machineWorkMeters` is computed from the wire** — that is a different, earlier
seam (`monitorRun`/`driver`), already gated by `oracleCorpusReplay.test.ts`,
whose RC-9(b) block asserts the machine's own 0x0039 total against our interval
sum over five captures and records the `rest-boundary` divergence (198 vs 197).
**The walk-fixes spec §5.4's phrasing — "a replay test that posts 198 vs 197" —
was wrong about WHERE**: `oracleCorpusReplay` imports nothing from the server
mapping and never builds a payload. Corrected here.

The gate PR C actually needs, and its two halves:

- **Distance — the seam test (RF24), and it can start from a real stored row.**
  In `server/routes/concept2.test.ts` (the existing send-route suite, e.g. the
  block around the `store.get → toMappingRow → buildC2Payload` path): one case
  seeds a DB row where `machineWorkMeters ≠ workMeters` (5706 vs 5708, the walk's
  own numbers) and asserts the posted `distance` is **5706**. The oracle is the
  row's `machineWorkMeters` — the machine's own stored number, NOT our
  accumulator, so this is not RF11's mirror. **Two mutations must bite:**
  reverting `buildC2Payload` to `distance: workMeters` (posts 5708), and dropping
  the field in `toMappingRow` (the payload silently falls back to `workMeters`
  while the display shows the machine number — the exact send≠display split this
  PR closes, reintroduced one layer down). The second is the RF24 mutation and
  it is why the test must start at the DB row, not at a `SessionLogRow`.
- **Time — gated by a SEEDED unit test, and here is why that exception is
  forced.** No capture in the corpus has divergent work-SECONDS — checked:
  `oracleCorpusReplay`'s `rest-boundary` has `machine.elapsedSeconds` 60.0 =
  ours, and every other capture agrees too. So there is no divergent-seconds
  fixture to gate time the way distance is gated, and a `buildC2Payload` unit
  test with a seeded `machineWorkSeconds ≠ workSeconds` (asserting the posted
  `time` uses the machine value; mutation reverts to `workSeconds`) is the only
  gate that can bite. This is a deliberate carve-out from "not seeded": the seam
  test above cannot exercise time divergence because reality has not produced
  one, and the PR body states that time is moved **by parity** with distance,
  gated structurally rather than on observed divergence.
- **The honest limit:** CI proves which stored number we post. It does not
  re-run Concept2's acceptance — but §2's live test did, once, at one distance,
  and the PR body carries that as the end-to-end evidence CI cannot be, with its
  two edges (log-dev, one date/time) named.

## 6 · What a rower sees (C5)

**No displayed distance a rower reads moves** on a row that carries the machine
total. The hero (`LogRow.tsx` `heroDistanceMeters`/`heroTimeSeconds`) and the
MACHINE CONFIRMED block (`FromTheLog.tsx`) already prefer
`machineWorkMeters`/`machineWorkSeconds` (§4), so the wire simply catches up to
the screen. **The claim is grep-checked, not asserted:** the PR body lists every
`app/src` surface that renders a distance and shows each already prefers the
machine total (or, in a `machineWorkMeters: null` fallback tier, shows
`work_meters` — the same value the send falls back to, so still send = display).
The standing design gate's "a number change is a design question too" clause is
satisfied by that fact. **If the antagonist or
the PM finds a surface that displays `work_meters`, that surface is the design
question and Gate 0 opens; the spec's claim is that none does, and it is
checkable by grep.**

## 7 · Exit criteria

- **C1.** Answered (§2): the five checked fields, exact, no band; distance
  authoritative = the monitor's total. Citation + live measurement both on file.
- **C2.** The POSITIVE is answered by the live API test (§2): 5706 verifies,
  5707 does not, so the code is pinned at the machine's total. The 5708 arm was
  not freshly tested (409 duplicate); it does not verify by exclusion plus
  James's live refusal. **One clean confirming send is still OWED and named in
  the PR body** — either a fresh 5708 POST (needs the real row deleted first, a
  destructive step James rules on) or a production hardware send after PR C
  ships. Not required to settle WHICH number is authoritative; required to close
  the log-dev-vs-production edge.
- **C3.** The authoritative number is named with its reason and its
  falsifier: `machine_work_meters` (0x0039's own total), because the code
  verified against 5706 and refused 5708; it would be wrong only if a future
  monitor row's 0x0039 total itself disagreed with what its code was minted
  over, which the same live test re-checks for any new capture.
- **C4.** The gate is specified (§5) before it is built: the seam test
  (`concept2.test.ts`, a stored row with `machineWorkMeters ≠ workMeters`, two
  mutations incl. the `toMappingRow`-drop), the seeded time carve-out, and the
  honest CI limit. NOT `oracleCorpusReplay` (it builds no payload — corrected).
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
