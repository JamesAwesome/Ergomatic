# Series capture: the row's own trace, kept (Phase LT spec 2)

## What and why

Every connected session's pace, stroke rate, and heart rate already stream
to the phone about twice a second and evaporate after the live pane paints
them. This spec keeps them: a 1 Hz, Concept2-logbook-shaped series recorded
during the row and saved with the log — the raw material spec 3's traces
will render, shaped so a future C2-logbook sync is a serializer, not a
model change. Capture only: nothing renders in this spec.

**James's rulings (2026-08-19):**

1. **1 Hz, decimated at write time** — platform-independent by
   construction (a 10 Hz iOS stream and a 2 Hz web stream decimate to the
   same series).
2. **Hard cap, honest flag**: 4 hours of samples (14,400); at the cap
   recording stops and the record carries `truncated: true`. No eviction
   machinery.
3. **"Extra cautious about storage assumptions — check them thoroughly."**
   §4 is that section: every storage claim carries its evidence class and
   a named check; two design mechanisms (§2's flush policy, §3's
   sacrifice ordering) exist BECAUSE source-checking the assumptions
   changed the design before it was written.

**PM re-gate conditions (phase-open, 2026-08-18) — all met at this open:**
the research memo is COMMITTED (`docs/monitor/research/
2026-08-18-series-capture-research.md`, moved from the scratchpad in this
spec's own commit); the storage ceiling is RULED (ruling 2); HR promises
stay descoped to spec 3 (the field records when a belt delivers — belt
delivery on James's PM5 remains unwitnessed and gates nothing here).

## §1 The sample and the series

| Property | Value |
|---|---|
| Shape | `{t, d, p, spm, hr?}` — C2 logbook stroke-object semantics (memo Q3, PRIMARY): `t` cumulative tenths of a second, `d` cumulative decimeters, `p` tenths of a second per 500m, `spm` whole strokes/min, `hr` bpm ABSENT when the wire says no belt (255 → null → omitted) |
| Source fields | The frames already parsed and dropped (memo Q1): 0x0031 elapsed/distance, 0x0032 current pace / stroke rate / heart rate. No new subscriptions — 0x0035/0x0036 drive metrics stay unsubscribed wire surface, out by decomposition |
| Decimation | One sample per elapsed-second boundary: the FIRST frame whose elapsed crosses each whole second wins that second; later frames in the same second are dropped. Keyed on the WIRE's elapsed (`t`), never wall clock — reconnects and stale gaps produce missing seconds, never duplicates |
| Cap | 14,400 samples (ruling 2). At the cap the recorder stops appending and sets `truncated: true` once. Arithmetic: 14,400 × ≈45 B ≈ 650 KB worst case |
| Doors | Monitor only. The timer door has no wire; by-hand has nothing |
| Rest samples | RECORDED (the machine keeps reporting through rests — the trace shows the whole session the way DISTANCE counts the whole session, R-B's own precedent). Spec 3 decides rendering; this spec stores what happened |

## §2 The recorder and the flush policy (the first storage-driven design)

**The source-checked fact that shaped this (memo + `monitorRun.ts` read at
brainstorm, PRIMARY):** `MonitorRun` is written ONLY at run start,
interval boundaries, and close — about a dozen writes per session. A naive
append-and-save per sample would multiply that cadence ~350× and, by
minute 70, re-serialize ~190 KB every second. Rejected before design.

| Decision | Value |
|---|---|
| Buffer | The recorder accumulates samples IN MEMORY on the live session (beside the driver's existing accumulators) |
| Flush | The buffer flushes into `MonitorRun.series` and saves at: every interval BOUNDARY (riding the existing `recordActual` write — zero new write events), every 30 seconds of wall clock (its own timer), and at CLOSE (riding the existing completion write) |
| Loss window | A crash/reload loses at most 30 seconds of TRACE; the run's own integrity (actuals, boundaries, totals) is untouched — it never depended on the new writes |
| Storage home | `MonitorRun.series?: {samples: Sample[]; truncated?: true}` — the never-migrate contract's sanctioned additive-optional move (the `endedBy?` precedent, memo Q2 PRIMARY); no `v` bump; no reader touches it unconditionally; a pre-series record reads exactly as before |
| Replay/tap | The record-replay harness captures frames upstream of the recorder, so a replayed recording reproduces the series deterministically — the §6 oracle rides this |

## §3 Save, server, and the sacrifice ordering (the second storage-driven design)

**The source-checked fact that shaped this (`monitorRun.ts:186-189`,
PRIMARY):** `saveMonitorRun` is best-effort — a thrown `setItem` (quota)
is swallowed and the WHOLE write is lost, run and all. Today's record is
O(KB) and that risk is negligible; a ~650 KB worst-case record changes
the odds, and the failure must never cost the run.

| Decision | Value |
|---|---|
| Sacrifice ordering | On a failed save WITH a series present: retry the same write WITHOUT the series, set `seriesDropped: true` on the retried record. The RUN always outlives the TRACE. Red-provable: a mocked throwing storage must show the run surviving, the series gone, the flag set |
| POST | The series rides the existing `POST /api/logs` at Log time as a new optional `series` field: `{samples: [...], truncated?: true}`. Absent when the run has none (older records, dropped series, non-monitor doors) |
| Server home | `session_logs.series` — new NULLABLE jsonb column, migration 0011, additive only. A column, not a table: one lifecycle (the log's), DELETE cascades free, and nothing streams or paginates samples in this phase (YAGNI, recorded) |
| Server bounds | Each sample shape-validated (t/d/p/spm integers in sane bands, hr optional 20-254); max 14,400 samples; a total serialized byte ceiling of 1 MB; field-named 400s; unknown sample keys ignored (the POST idiom) |
| List projection | The history list EXCLUDES `series` (the LOG_LIST_COLUMNS pattern); the drift pin updates deliberately: list = get minus `steps` minus `series`. `GET /api/logs/:id` carries it |
| Compat | v0.14.0-era clients post no `series` — unaffected, pinned with the frozen-body idiom. PATCH does not accept `series` (immutable measured record, the standing rule) |

## §4 Storage assumptions, checked thoroughly (ruling 3 — the caution section)

Every claim this spec rests on, its evidence class, and its named check.
The plan carries each check; an assumption without a passing check is an
open item, not a fact.

| # | Assumption | Evidence today | The check |
|---|---|---|---|
| S1 | MonitorRun writes are boundary-cadence today, and this spec adds only the 30s flush timer | PRIMARY (source, read at brainstorm) | A write-counting test: instrumented storage counts saves across a replayed session; asserted ≈ boundaries + duration/30s +2, red-provable by writing per-sample |
| S2 | Web Storage on the shipped platforms holds a 650 KB value: MDN claims a 10 MiB sub-cap (SECONDARY), WebKit's policy blog claims 15%-of-disk origin quota (PRIMARY) — the claims DISAGREE about the mechanism; the design fits under the STRICTER one with 15× headroom | SECONDARY+PRIMARY, unresolved discrepancy | An empirical probe test in the e2e layer (Chrome): write a worst-case record + series, read it back byte-identical. An iOS device leg on the phase walk sheet: same probe in the real WKWebView (the harness cannot see iOS — stated, not hidden) |
| S3 | A quota failure surfaces as a catchable exception from `setItem`, and the sacrifice ordering works | INFERENCE (standard behavior; unwitnessed in OUR webview) | The mocked-throw unit test (red-provable) AND the e2e probe fills storage to force a REAL QuotaExceededError once, asserting the run survives with `seriesDropped` |
| S4 | Serializing the worst case is cheap enough for a 30s flush cadence | ASSUMED until measured | A perf probe test: `JSON.stringify` of a 14,400-sample record, the measured milliseconds STATED in the test output and asserted under a generous bound (100 ms); the number goes in the task report |
| S5 | Postgres round-trips a 650 KB jsonb value without surprises (TOAST compresses; latency sane; the list projection genuinely never reads it) | ASSUMED until measured | An integration test posting the full worst case: insert + `GET /:id` read-back sample-identical + the list query timed with the column proven absent from its SELECT |
| S6 | Best-effort mode means the OS can evict the origin BETWEEN sessions — an in-flight unlogged run is losable TODAY, series or not | PRIMARY (WebKit policy) | This spec REQUESTS persistence: one `navigator.storage.persist()` call at first monitor connect; grant/denial logged to the diagnostics ring, denial tolerated (behavior unchanged — the request is free protection for the F5 class). Witness: the call is made once, the outcome logged. The iOS grant status: a walk-sheet observation item |
| S7 | The 1 Hz decimation is platform-independent | By construction | The §6 dual-rate test: a synthetic 10 Hz stream and the real 2 Hz recording decimate to identical series |

## §5 Research note (house rule)

- The committed memo IS the research pass (rates measured from committed
  recordings; quotas from WebKit/MDN with the discrepancy named; the C2
  shape from the logbook API docs; the PM5-stores-no-series answer from
  the CSAFE log-structure table). New mechanism invented HERE: the
  decimating recorder + flush policy + sacrifice ordering — the
  antagonist pass anchors on §2/§3/§4.
- **Does the system have the concept?** A per-second sample: yes — the
  wire delivers faster than needed and `t` is the wire's own elapsed. A
  stored series: the PM5 does NOT have it (memo Q4, PRIMARY) — we assert
  it on the app's behalf, and when it matters (a gap in the trace), the
  record shows missing seconds honestly rather than interpolating.
- Nothing found contradicting; the S2 discrepancy is carried as an open
  check, not resolved by assertion.

## §6 Exit criteria

1. THE REPLAY ORACLE: a committed walk recording replayed through the
   real transport tap produces a series whose FINAL sample's `t`/`d`
   agree with the machine's own terminal totals (the same
   external-number discipline as R-B), and whose sample count equals the
   session's elapsed seconds (minus documented gaps). Red-provable by
   breaking the decimation key.
2. §4's table: every S-row's check passing, or named OPEN on the walk
   sheet (S2-iOS, S6-iOS grant). The write-count (S1), forced-quota
   (S3), perf-number (S4), and Postgres-round-trip (S5) witnesses each
   red-provable.
3. The cap and flag: sample 14,401 never appends; `truncated: true` set
   exactly once; red-provable.
4. The sacrifice ordering end to end: mocked throw AND the real forced
   quota both show the run surviving series-less with the flag.
5. The dual-rate decimation test (S7).
6. Old records: a pre-series MonitorRun reads exactly as before
   (never-migrate contract test); a v0.14.0-era POST body pinned frozen.
7. The notes clause for the release that ships spec 3's rendering (this
   spec alone is rower-invisible; internal-only per the notes rule —
   stated so the next gate does not hunt for a missing clause).
8. The phase walk sheet gains: the iOS storage probe (S2), the persist()
   grant observation (S6), and the fast-rate re-measure (the memo's iOS
   ~10 Hz hint) — three device items, one sheet entry.

## §7 Vetted ground inherited

Phase LT's anchor ground carries (the band, the member set, the
sound-by-construction split); PW's carries (absence idiom, owner-404s,
additive-API discipline, the frozen-body pin idiom). The antagonist pass
is FULL (triad: stored shape ×2 — the MonitorRun field and the jsonb
column — plus an invented mechanism), anchored on §2's flush policy,
§3's sacrifice ordering, and §4's checks.
