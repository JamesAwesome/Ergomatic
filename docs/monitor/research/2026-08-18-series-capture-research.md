# Spec 3 gating research — per-interval traces + HR: can we record time-series, at what rate, in what budget?

Date: 2026-08-18. Sources in order of authority: Concept2 PM5 BLE Interface Definition rev 1.30 and
CSAFE Communication Definition rev 0.27 (both re-fetched today from the `.nl` mirror and re-extracted
via `pdftotext -layout` — same revisions the house notes pin: `docs/monitor/pm5-interface-notes.md`
header table); the repo's own committed recordings (`docs/monitor/sessions/walk-2026-08-17/`);
repo source; WebKit blog; Concept2 Logbook API docs; forums last and labelled.

---

## Q1 — What the wire already delivers, and how often

**Fields already parsed per frame and currently dropped after display** (PRIMARY — repo source
`app/domain/monitor/pm5/parse.ts`, offsets cited to interface-notes §10 / BLE doc pp.13-15):

- 0x0031 (19 B, ~2/s measured): per-interval elapsed (0.01 s), per-interval distance (0.1 m),
  workout/interval/rowing/stroke state, total work distance, drag factor.
- 0x0032 (17 B, same cadence): **current pace** (0.01 s/500m), **stroke rate** (whole spm),
  **heart rate** (bpm, 255 = no belt → `heartRateBpm: null`), speed (0.001 m/s), rest time/distance.
- 0x0033 (20 B, same cadence): interval count, average power (watts), calories, split averages.

Every `MonitorFrame` therefore already carries `currentSplit`, `spm`, `heartRateBpm`,
per-interval elapsed/distance and the driver's session accumulators (`app/domain/monitor/types.ts`
lines 30-125). **Spec 3's series is a retention problem, not a wire problem** — the samples flow
today and are discarded after the live pane renders them.

**Documented rates** (PRIMARY — BLE doc p.16, attribute 0x0034, confirmed verbatim in today's
re-fetch): "Determines how often slave sends general status and additional status data as
notifications": 0 = 1 s, 1 = 500 ms (default), 2 = 250 ms, 3 = 100 ms. Note the wording covers
*general/additional status* only — it does not claim to govern the stroke-data characteristics.

**Measured rate vs configured rate — a real discrepancy** (measured, see numbers section):
`driver.ts:1478` writes `buildSampleRateConfig()` = `0x03` (100 ms) at connect
(`app/domain/monitor/pm5/commands.ts:513`, `FASTEST_SAMPLE_RATE`), the walk recordings show the
write on the wire (`{"dir":"tx","char":"ce060034-...","hex":"03"}`), no `transport-error` appears
in any committed diagnostics ring — and the PM still delivered **1.97 frames/s (median gap 540 ms)**
on all three status characteristics, across all three Chrome/macOS recordings. So on the
web-transport path the effective ceiling is ~2 Hz regardless of 0x0034. INFERENCE on the cause
(CoreBluetooth connection-interval coalescing vs PM firmware): undetermined. Counter-evidence that
the 100 ms rate IS honored on iOS: interface-notes item quoting the iOS path — duration populates
"~180ms (~2 status ticks) later" (interface-notes.md line 4451), implying ~90-100 ms ticks under
Capacitor BLE. **Design at 2 Hz; treat anything faster as a bonus, and re-measure on iOS hardware
before promising finer resolution** (a candidate item for the next hardware walk).

**Per-stroke characteristics exist and we do not subscribe to them** (PRIMARY — BLE doc pp.17-18,
attribute table):

- 0x0035 "C2 rowing stroke data" (20 B): elapsed, distance, drive length (0.01 m), drive time
  (0.01 s), stroke recovery time, stroke distance, peak/avg drive force (0.1 lbf), work per stroke
  (0.1 J), **stroke count**.
- 0x0036 "C2 rowing additional stroke data" (15 B): elapsed, **stroke power (watts)**, stroke
  calories, stroke count, projected work time/distance.
- 0x003D "C2 force curve data" (2-288 B split across successive notifications; not supported on
  PM5v1) — full per-stroke force plot, BLE doc p.23.

The attribute table prints 0x0035/0x0036 permissions as READ, but the multiplexing note (BLE doc
p.10: Android apps "should enable this notification in lieu of the following UUIDs; 0x31, 0x32,
0x33, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x3B") shows they are notification sources. Cadence of
0x0035/0x0036 notifications: the spec states none. SECONDARY (c2forum): they notify once per
stroke, when intermediate data updates. Either way, dedupe by the Stroke Count field, which both
carry. The current driver subscribes to 0022/0031/0032/0033/0037/0038/0039/003a only (measured
from the recordings' subscribe events) — adding 0x0035/0x0036 is new subscription surface, new
parse tables (the multiplexed-vs-GATT field-layout trap of interface-notes §10 applies), and on a
~24 spm row adds ~0.4 notifications/s.

## Q2 — Storage budget

**What exists today** (PRIMARY — repo source):

- The record-replay tap (`app/src/monitor/transports/recording.ts`) holds `RecordedEvent[]`
  **in memory only** and serializes on demand for the manual RECORDING · DOWNLOAD button; nothing
  is persisted. No size cap on the array.
- The diagnostics ring (`app/src/monitor/eventLog.ts`) caps at **500 entries** — and
  interface-notes line 2501 records that ~2/s status traffic "was overwhelming the 500-entry ring
  in under 4 minutes", i.e. the one bounded buffer we have is sized for diagnostics, not series.
- `MonitorRun` is a **single localStorage key** (`ergomatic.monitorRun`), best-effort writes,
  strict-shallow validator, **no-throw / no-migration contract**: unknown `v` or bad shape is
  discarded and the key cleared (`app/src/monitor/monitorRun.ts` header + lines 98-145).
- Saved logs live server-side: `POST /api/logs` → Postgres (`app/server/routes/data.ts:769`,
  `app/server/db/schema.ts`). localStorage only ever needs to carry the in-flight run.

**What the never-migrate contract implies for adding a series** (PRIMARY — monitorRun.ts comments):
the sanctioned move is an **additive optional field** (the `endedBy?` precedent, lines 89-95:
"Additive and optional on purpose: a v1/v2 record without it reads exactly as before"). A `v` bump
is priced as data loss — the version arm discards on mismatch, and the file documents rejecting a
v3 bump precisely because a rower with an unlogged connected piece would lose the PM5's numbers
(the F5 class). So: `series?: ...` on MonitorRun, no reader touches it unconditionally, no v bump.
Size is the one new pressure this contract has never faced — the record today is O(KB); a series
makes it O(100 KB) under a 10 MiB ceiling (below), so a cap-and-truncate rule belongs in the spec.

**Platform quotas** (PRIMARY — WebKit blog "Updates to Storage Policy", webkit.org/blog/14403,
policy as of iOS 17/Safari 17): origin quota for **WKWebView-embedding apps is up to 15% of total
disk**; localStorage is subject to the origin quota and **is evictable** — best-effort mode by
default, LRU eviction by last interaction/storage operation; persisted mode (`navigator.storage
.persist()`) excludes an origin from eviction. SECONDARY (MDN "Storage quotas and eviction
criteria"): Web Storage specifically is capped at **10 MiB** on all browsers, a stricter limit
than the origin quota. IndexedDB has no such sub-cap (shares the 15%-of-disk origin quota) and is
the natural home if series ever outgrow Web Storage — but at the sizes below they do not.

**Extrapolated budgets, 70-minute session** (arithmetic from measured frame sizes; sample shaped
like the C2 logbook stroke object `{"t":…,"d":…,"p":…,"spm":…,"hr":…}` ≈ 40-50 B as JSON):

| Sampling | Samples in 70 min | JSON bytes (≈45 B/sample) |
| --- | --- | --- |
| Per-frame (2 Hz measured) | 8 400 | ~380 KB |
| 1 Hz decimated | 4 200 | ~190 KB |
| Per-stroke (~22 spm avg) | ~1 540 | ~70 KB |
| Per-frame at spec'd 100 ms (if iOS honors it) | 42 000 | ~1.9 MB |

Columnar arrays (`{t:[],p:[],spm:[],hr:[]}`, delta-encoded ints) roughly halve these. Every row
except the 100 ms one fits comfortably inside even MDN's 10 MiB Web Storage figure; the 100 ms row
is why the series should be decimated at write time, not at render time.

## Q3 — Who solved this already

- **Concept2 Logbook API** (PRIMARY — log.concept2.com/developers/documentation, fetched today):
  first-class per-stroke series. `POST /api/users/{user}/results` accepts `stroke_data`, an array
  of objects with **`t` (tenths of a second), `d` (decimeters), `p` (tenths of a second per 500 m),
  `spm`, `hr`** — "Time and distance are incremental rather than the difference between the
  previous stroke" (i.e. cumulative). Retrieval: `GET .../results/{result_id}/strokes`; 404 when
  absent. **This is the shape precedent**: Concept2's own canonical stored series is exactly the
  four numbers we already parse per frame plus timestamps — no force curve, no drive metrics.
  Adopting `{t,d,p,spm,hr}` keeps a later "sync to C2 logbook" feature a serializer, not a model
  change. SECONDARY (c2forum t=207810): bulk logbook export returns summary only; stroke detail is
  per-result — corroborates that even Concept2 treats series as per-workout attachments.
- **ErgData** (SECONDARY/INFERENCE): captures during the row over BLE/USB and uploads to the
  logbook — consistent with the PM not storing strokes (Q4); nothing found documenting its internal
  buffer strategy. **ErgZone / asensei** (nothing found beyond marketing claims of per-stroke
  capture; no engineering write-ups located — recorded as a "nothing found" result per house rule).
- **Open-source** (SECONDARY): Py3Row and the c2forum BLE threads all sample the status/stroke
  characteristics live and dedupe strokes by stroke count; none fetch history from the PM.

## Q4 — Does the PM5 itself store a fetchable series? **No stroke series. Splits/intervals only.**

- The PM5 does keep an internal workout log and exposes raw access (PRIMARY — CSAFE doc rev 0.27):
  `CSAFE_PM_GET_INTERNALLOGPARAMS` (0x99) returns log start address + last entry length;
  `CSAFE_PM_GET_INTERNALLOGMEMORY1/2/3` (0x6A) read it out; BLE characteristic **0x003F "C2 rowing
  logged workout"** notifies the just-logged workout's hash, internal log address, and size after
  each workout (CSAFE doc p.29 restatement of the BLE table).
- What that log contains (PRIMARY — CSAFE doc p.102, "Log Structure Identifiers", the complete
  list): `LOGHEADER`, `LOGFIXEDHEADERDATA`, `LOGSPLITDATA`, `LOGFIXEDINTERVALHEADER/DATA`,
  `LOGVARIABLEINTERVALHEADER/DATA` plus combined-header forms. **There is no per-stroke or
  per-sample record identifier in the list.** The 0x003F "Logged Workout Size" field is 2 bytes
  (max 65 535), sized for summary-plus-splits, not an 8 000-sample series.
- INFERENCE (from that exhaustive identifier list plus the ecosystem behavior in Q3): the PM5
  stores per-split/per-interval aggregates only; a pace/SPM/HR time-series **cannot be fetched
  after the fact. Capture-during-row is the only route**, which makes spec 3's series best-effort
  by construction: link drop or app death mid-row loses the samples not yet persisted, exactly the
  bounded-loss posture `MonitorRun`'s accumulators already take.

## Measured from the repo's own recordings

`docs/monitor/sessions/walk-2026-08-17/` (Chrome + Web Bluetooth, real erg, 0x0034 written to
0x03=100 ms in every file; inter-notification gaps computed per characteristic from the recorded
`t` values):

| Recording | Span | 0x0031 n / rate | gap median / p95 / max (ms) | Same for 0x0032, 0x0033 |
| --- | --- | --- | --- | --- |
| step-2 (2×250 m) | 203 s | 391 / **1.97 per s** | 540 / 547 / 721 | identical n and rate |
| step-3 (wu + intervals) | 313 s | 608 / **1.97 per s** | 540 / 543 / 637 | identical |
| step-4 (END mid-piece) | 51 s | 94 / **1.99 per s** | 540 / 540 / 541 | identical |

- Payload sizes exactly per spec: 19 B (0x0031), 17 B (0x0032), 20 B (0x0033).
- Raw recording-tap throughput: step-2 = 182 801 B / 202.9 s = **901 B/s ≈ 54 KB/min ≈ 3.8 MB per
  70 min** (uncompressed JSONL, hex payloads, all subscribed characteristics — the three status
  characteristics are ~906 B/s of it). This is the ceiling for "just persist the tap"; a decimated
  `{t,d,p,spm,hr}` series is ~10-50× smaller (table in Q2).
- No 0x0035/0x0036 traffic exists in any committed recording (never subscribed), so per-stroke
  cadence could not be measured from house data — recorded as a gap.

## Open questions

1. **Why 2 Hz on Chrome/macOS despite 0x0034=3?** Write acked, no transport-error, delivery still
   ~500 ms. Re-measure on the iOS/Capacitor path (the ~180 ms two-tick observation suggests iOS
   gets ~10 Hz) before any design leans on sub-500 ms resolution.
2. **0x0035/0x0036 actual cadence and payload** — no house capture exists; one walk with those two
   subscriptions added would settle both cadence and the stroke-count dedupe rule.
3. **HR coverage in practice** — every committed recording predates a paired belt (0x0032 byte 6
   would be 255/0); whether James's setup delivers HR through the PM5 at all is unverified on the
   wire.
4. **Eviction posture on iOS** — localStorage is best-effort-evictable in WKWebView;
   whether to call `navigator.storage.persist()` (and whether Capacitor's WKWebView grants it) is
   a small spec decision; the safe posture is "series rides the log to Postgres at Log time,
   localStorage is only the in-flight buffer".

## What this means for spec 3's design

The series is already flowing and merely dropped: every 0x0031/0x0032/0x0033 tick delivers pace,
SPM, and HR that `parse.ts` decodes into `MonitorFrame` today, at a measured 2 Hz on the real link
(hold the spec to 2 Hz; the configured 100 ms rate is demonstrably not delivered on the web path).
The PM5 itself stores only split/interval aggregates — its internal log has no stroke record type —
so capture-during-row is the only route, and mid-row loss is inherently bounded-best-effort.
Store the series in Concept2's own logbook shape (`{t,d,p,spm,hr}`, cumulative t/d), decimated at
write time (1 Hz or per-stroke), as an **additive optional field** on `MonitorRun` per its
never-migrate contract (the `endedBy?` precedent) with a hard sample cap, then move it to Postgres
with the log at Log time: a 70-minute session costs ~70-200 KB in that shape, comfortably inside
WKWebView's quota (15% of disk origin quota; ~10 MiB Web Storage sub-cap per MDN) and small enough
for a Postgres jsonb column. Per-stroke drive metrics (force, drive length, power via 0x0035/0x0036)
are real and unsubscribed today — treat them as a separately-gated extension needing one hardware
walk to characterize cadence, not as part of spec 3's floor.
