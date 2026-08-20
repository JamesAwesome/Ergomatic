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
| Decimation | One sample per WORK-second: the recorder maintains its own cumulative work clock (`baseTenths` + the current interval's wire elapsed; `baseTenths` folds in each interval's final pre-reset reading when the elapsed resets at a boundary — including the `restSeconds: 0` boundary where wState never leaves 4, antagonist B2's own fixture); the FIRST frame crossing each whole work-second wins it. Never wall clock, never the raw per-interval field alone (B2: the wire's elapsed is per-interval; the "cumulative" field is a derived sum with its own defects — the recorder derives its OWN, frame-stream-local and reset-explicit). Reconnects and stale gaps produce missing seconds, never duplicates |
| Cap | 14,400 samples (ruling 2). At the cap the recorder stops appending and sets `truncated: true` once. Arithmetic CORRECTED (antagonist measured): 50.0 B/sample with `hr` present → **720 KB worst case** |
| Doors | Monitor only. The timer door has no wire; by-hand has nothing |
| Rest samples | NONE — CORRECTED by the antagonist pass (B1, proven on the committed recordings: the wire's elapsed and distance FREEZE for the entire rest — 66 consecutive frames at 60.00/213.7 through step-3's 30s rest; the machine keeps reporting but the clock does not move). The series is a WORK-time trace on a work clock — which is exactly C2's own stroke-data semantics (strokes do not happen during rests). `t` understates wall time by the rests BY DEFINITION, stated; spec 3 renders interval boundaries from the log's own steps, not from series gaps. **[2026-08-20 correction, trace-truth Task 2:** this row's own "proven" freeze holds only for a MID-workout rest with a following interval to reset into (step-3's own 66-frame window, cited above) — it is not a general property of rests. The wire keeps advancing during a rest whenever the rower keeps the flywheel moving, and DOES produce samples: 21 on `session-2-wu-4unequal.jsonl`, and even 3 on `step-3` itself, at its own trailing tail (a rest with no following interval to freeze it). `seriesRecorder.ts`'s `Sample.r` now marks every sample from the winning frame's own `state`, rather than this row's premise that a rest can never produce one. Left here as history, corrected rather than rewritten — pinned in CI, not a report only this session can reach: `app/src/monitor/seriesRecorder.test.ts`'s "marks every sample recorded while the machine was resting (real capture, non-frozen rest)" replays `docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl` and asserts exactly 21 rest samples.] |

## §2 The recorder and the flush policy (the first storage-driven design)

**The source-checked fact that shaped this (memo + `monitorRun.ts` read at
brainstorm, PRIMARY):** `MonitorRun` is written ONLY at run start,
interval boundaries, and close — about a dozen writes per session. A naive
append-and-save per sample would multiply that cadence ~350× and, by
minute 70, re-serialize ~190 KB every second. Rejected before design.

| Decision | Value |
|---|---|
| Buffer | The recorder accumulates samples IN MEMORY on the live session (beside the driver's existing accumulators) |
| Flush | The recorder OWNS its flushes (antagonist B5: `recordActual` cannot see the buffer and returns early without saving on refused actuals — "riding" it was false): the hook layer MERGES the series snapshot into the boundary and close writes themselves (one write, not a chasing second — reconciled at Task 2 review: this makes S1's count exact and shrinks the loss window; a bigger merged write that hits quota routes into §3's sacrifice) plus its own 30-second timer flushes. The recorder STOPS at close — a finish-grace actual after close updates the run per the existing rule but the series ends at close, stated |
| Loss window | A crash/reload loses at most 30 seconds of TRACE; the run's own integrity is untouched. Survives iOS backgrounding for the vetted reason: `Info.plist` declares no `UIBackgroundModes`, so a suspended app receives no frames either — nothing accrues while the timer is frozen (antagonist-verified) |
| Storage home | `MonitorRun.series?: {samples: Sample[]; truncated?: true}` — the never-migrate contract's sanctioned additive-optional move (the `endedBy?` precedent, memo Q2 PRIMARY); no `v` bump; no reader touches it unconditionally; a pre-series record reads exactly as before |
| Replay/tap | The record-replay harness captures frames upstream of the recorder, so a replayed recording reproduces the series deterministically — the §6 oracle rides this |

## §3 Save, server, and the sacrifice ordering (the second storage-driven design)

**The source-checked fact that shaped this (`monitorRun.ts:186-189`,
PRIMARY):** `saveMonitorRun` is best-effort — a thrown `setItem` (quota)
is swallowed and the WHOLE write is lost, run and all. Today's record is
O(KB) and that risk is negligible; a ~720 KB worst-case record changes
the odds, and the failure must never cost the run.

| Decision | Value |
|---|---|
| Sacrifice ordering, localStorage | On a failed save WITH a series present: retry the same write WITHOUT the series inside `saveMonitorRun`'s own catch (the `void` contract unchanged), set `seriesDropped: true`. Honest claim (antagonist's correction): the retried smaller write can ALSO fail — the run's odds return to TODAY'S odds, they do not become certainty. Red-provable both legs (mocked throw; the retry path itself throwing). The validator tolerates the new fields (vetted: `isMonitorRun` is a positive conjunction, no unknown-key check — the `endedBy?` precedent is real) |
| Sacrifice ordering, POST (antagonist B3 — the ordering must repeat at EVERY boundary the payload crosses) | On a non-ok response to a POST carrying `series`: the client retries ONCE without the series (the retried body simply omits `series` — the server stores no drop flag; the localStorage record's own `seriesDropped` is the audit trail), and only a failure of THAT retry surfaces the save error. The rower can always save the run; only the trace is sacrificed. Red-provable: a 413-ing route must show the log saved series-less |
| POST | The series rides the existing `POST /api/logs` at Log time as a new optional `series` field: `{samples: [...], truncated?: true}`. Absent when the run has none (older records, dropped series, non-monitor doors). **The route's body limit is raised DELIBERATELY (B3: the shipped default is body-parser's 100 KB, which 413s a 36-minute trace today): a route-scoped `express.json({limit: "1mb"})` on POST `/api/logs` only — the app-wide default stays, the change is named, and the S5 integration probe posts the full worst case through the real middleware. **ACCEPTED LIMIT, disclosed (PM gate C1):** that parser registers BEFORE `originCheck`/`requireUser`, so an unauthenticated caller can make the server buffer up to 1 MB on this one route (10× the previous ceiling). Ordering is pre-existing; only the ceiling changed. Accepted for a same-origin cookie-authed app with no amplification path; owner = the next server-touching phase if the ordering is ever revisited** |
| Server home | `session_logs.series` — new NULLABLE jsonb column, migration 0011, additive only. A column, not a table: one lifecycle (the log's), DELETE cascades free, and nothing streams or paginates samples in this phase (YAGNI, recorded) |
| Server bounds | Each sample shape-validated (t/d/p/spm integers in sane bands, hr optional 20-254); max 14,400 samples; the route-scoped 1 MB middleware limit IS the byte ceiling (one bound, not two); field-named 400s; unknown sample keys ignored (the POST idiom) |
| List projection | The history list EXCLUDES `series` (the LOG_LIST_COLUMNS pattern); the drift pin updates deliberately: list = get minus `steps` minus `series`. `GET /api/logs/:id` carries it |
| Compat | v0.14.0-era clients post no `series` — unaffected, pinned with the frozen-body idiom. PATCH does not accept `series` (immutable measured record, the standing rule) |

## §4 Storage assumptions, checked thoroughly (ruling 3 — the caution section)

Every claim this spec rests on, its evidence class, and its named check.
The plan carries each check; an assumption without a passing check is an
open item, not a fact.

| # | Assumption | Evidence today | The check |
|---|---|---|---|
| S1 | MonitorRun writes are boundary-cadence today, and this spec adds only the 30s flush timer | PRIMARY (source, read at brainstorm) | A write-counting test: instrumented storage counts saves across a replayed session; asserted ≈ boundaries + duration/30s +2, red-provable by writing per-sample |
| S2 | **VERIFIED ON DEVICE 2026-08-19: PASS — 718,863 B byte-identical in the real WKWebView** (walk-2026-08-19-series). Web Storage on the shipped platforms holds a 650 KB value: MDN claims a 10 MiB sub-cap (SECONDARY), WebKit's policy blog claims 15%-of-disk origin quota (PRIMARY) — the claims DISAGREE about the mechanism; the design fits under the STRICTER one with 15× headroom | SECONDARY+PRIMARY, unresolved discrepancy | An empirical probe test in the e2e layer (Chrome): write a worst-case record + series, read it back byte-identical. An iOS device leg on the phase walk sheet: same probe in the real WKWebView (the harness cannot see iOS — stated, not hidden) |
| S3 | A quota failure surfaces as a catchable exception from `setItem`, and the sacrifice ordering works | INFERENCE (standard behavior; unwitnessed in OUR webview) | The mocked-throw unit test (red-provable) AND the e2e probe fills storage to force a REAL QuotaExceededError once, asserting the run survives with `seriesDropped` |
| S4 | Serializing the worst case is cheap enough for a 30s flush cadence | ASSUMED until measured | A perf probe test: `JSON.stringify` of a 14,400-sample record, the measured milliseconds STATED in the test output and asserted under a generous bound (100 ms); the number goes in the task report |
| S5 | Postgres round-trips a 650 KB jsonb value without surprises (latency sane; the list projection genuinely never reads it) | MEASURED (integration) | An integration test posting the full worst case: insert + `GET /:id` read-back sample-identical + the list query timed with the column proven absent from its SELECT |
| S5b | The ON-DISK footprint after TOAST compression | **MEASURED ON HARDWARE 2026-08-19: 5.04× on a real 180-sample trace (10,107 B JSON → 2,006 B stored); 5.35× on a realistic 14,400-sample ceiling built from those same real samples (862,024 → 161,127 B). ~30 KB per typical session, ≈9 MB/year per rower.** Original plan: | A REAL trace in a REAL database: row a short piece on the laptop path (Chrome + Web Bluetooth) against the walk-lab stack, log it, then measure that row's stored bytes against its JSON bytes. **The measurement must come from a REAL trace, not the synthetic worst case** — the probe record's constant `p`/`spm`/`hr` compress unrealistically well, so the synthetic gives only an optimistic ceiling, never the true ratio. Settle the query shape against the running DB at measurement time (`pg_column_size`'s behaviour on out-of-line TOASTed values is worth verifying rather than assuming; the toast relation's own growth is the fallback authority). Record: JSON bytes, stored bytes, ratio, and the per-year extrapolation at ~300 sessions |
| S6 | **OBSERVED ON DEVICE 2026-08-19: DENIED, as predicted, tolerated** (walk-2026-08-19-series). Best-effort mode means the OS can evict the origin BETWEEN sessions — an in-flight unlogged run is losable TODAY, series or not. The antagonist's correction: `persist()` never prompts anywhere (PRIMARY, WebKit heuristics) AND those same heuristics mean a Capacitor WKWebView is probably DENIED — this is free-but-likely-futile on iOS, recorded as such, NOT as mitigation | PRIMARY (WebKit policy) | The call is still made (free; Chrome may grant); grant/denial logged to the diagnostics ring; denial expected on iOS and tolerated. Witness: call-once + outcome logged. The iOS grant status: a walk-sheet observation item |
| S7 | The 1 Hz decimation is platform-independent | By construction, **and VERIFIED ON A REAL ~10 Hz WIRE 2026-08-19** — iOS honours the fast sample rate Chrome never showed (residual analysis, walk-2026-08-19-series), and the decimator still produced exactly one sample per work-second | The §6 dual-rate test: a synthetic 10 Hz stream and the real 2 Hz recording decimate to identical series |

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

1. THE REPLAY ORACLE, rewritten per the antagonist (B4: zero 0x0039
   frames exist in the whole corpus — the originally-named authority is
   not in the fixtures; and the final sample trails the machine's
   terminal reading by up to one decimation interval BY CONSTRUCTION):
   replaying a committed recording, EACH interval's series segment ends
   within one whole second of that interval's own final pre-reset
   reading (CLAUDE.md item 11's sanctioned per-interval oracle), the
   cumulative `t` at each boundary equals the fold of the preceding
   finals (the B2 seam proven per boundary, incl. the restSeconds:0
   boundary), and the sample count equals the summed work seconds
   (step-2: 139 work-seconds → 139 samples; step-3: 243). The one-
   interval trailing gap is ASSERTED as < 1s, never loosened silently.
   Red-provable by breaking the fold or the decimation key.
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

## §6b Handoffs to spec 3 (rendering), from the device passes

- **The trace's `spm` is INSTANTANEOUS and can legitimately spike far
  above any interval-average band** — a real 164 was measured on
  hardware 2026-08-19 (short quick strokes at ~0.37 s between drives).
  Capture stores it honestly; the RENDERER owes a sane vertical scale
  (clip or percentile, stated in spec 3), never a capture-side drop.
  A controller-raised "impossible value" finding was withdrawn on this
  evidence; `data.ts:483-489`'s band comment was right.
- **HR is confirmed live on both transports** (laptop 83→123; phone
  61/61 samples 103→132, with the PM5's own display witnessing 77 bpm
  before the piece). Spec 3's descoped HR leg is unblocked.
- **A cold strap reads nothing for the first ~30 s.** A trace whose
  early samples lack `hr` and whose later ones carry it is normal, not a
  gap to interpolate.

## §7 Vetted ground inherited

Phase LT's anchor ground carries (the band, the member set, the
sound-by-construction split); PW's carries (absence idiom, owner-404s,
additive-API discipline, the frozen-body pin idiom). The antagonist pass
is FULL (triad: stored shape ×2 — the MonitorRun field and the jsonb
column — plus an invented mechanism), anchored on §2's flush policy,
§3's sacrifice ordering, and §4's checks.
