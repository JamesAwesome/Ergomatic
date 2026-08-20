# Phase LT spec 2 device pass — 2026-08-19 (PR #130, series capture)

**Verdict: all three §6.8 device items ANSWERED. S2 PASS on the real
WKWebView; S6 DENIED exactly as predicted; the fast-rate re-measure came
back ~10 Hz — the phone gets a rate the laptop never does, and the
decimator was indifferent to it.**

Medium: native DEV build of branch `lt-series` (`pnpm ios:build` + Xcode
Run) on James's iPhone, real PM5 432331249, pointed at prod. No lab stack
(every item's evidence is on-device — the phone-only exception the walk
skill's laptop-first rule allows, declared in the plan). Rowing: ~45 s of
easy paddling, one connect. Budget was 1 piece / ~1 min; not exceeded.

## Provenance

| Artifact | What |
| --- | --- |
| `ring.json` | The diagnostics ring, copied in-app (MONITOR LOG · COPY) after the session — 33 entries, seq 0-32 |
| `console-probe.json` | The S2 storage probe + stored-series read-back, run in Safari Web Inspector against the app's own webview |
| `sample-times.txt` | The 23 stored samples' `t` values (tenths), the fast-rate evidence |

## Item 1 — S2: does the real WKWebView hold a worst-case series? **PASS**

Probe wrote a full 14,400-sample record (**718,863 bytes**) to
`localStorage` and read it back **byte-identical**, then cleaned up.

Settles §4's S2 row, which carried an unresolved conflict between MDN's
10 MiB Web-Storage sub-cap claim (SECONDARY) and WebKit's 15%-of-disk
origin-quota claim (PRIMARY): whichever governs, iOS held ~702 KB with
room to spare. The evidence class moves from "two sources disagree" to
MEASURED ON THE TARGET PLATFORM.

## Item 2 — S6: is `persist()` denied on iOS? **DENIED (predicted)**

Ring seq 0: `storage-persist: denied (tolerated — design spec §4 S6, not
mitigation)`.

Exactly the predicted outcome (WebKit grants durable storage on
heuristics that a Capacitor webview does not satisfy). Tolerated by
design; no behaviour depends on it. The prediction is now an observation.

## Item 3 — the fast-rate re-measure: **~10 Hz on iOS, decimation unaffected**

The stored samples' `t` values (tenths of a work-second):

    9,10,21,31,41,50,60,71,81,91,100,110,120,131,141,150,160,170,181,190,201,211,221

Each sample is the FIRST frame to cross a whole work-second, so the
residual (`t mod 10`) is bounded by the inter-frame gap. Every residual
is 0.0 s or 0.1 s; none is 0.2-0.5 s. Under a 500 ms gap (the measured
Chrome rate, 1.97 frames/s) residuals would spread uniformly across
0-0.5 s, and 22 consecutive residuals ≤ 0.1 s would occur with
probability ≈ 0.2^22 ≈ 4e-16. **The inter-frame gap is ~100 ms: the
native path honours the 0x0034 fast sample rate the web transport does
not.**

Consequences, all favourable:

- The memo's iOS hint ("duration populates ~180 ms ≈ 2 status ticks
  later", INFERENCE) is upgraded to MEASURED.
- §4's S7 (decimation is platform-independent) was proven BY
  CONSTRUCTION in the unit suite against a synthetic 10 Hz stream. It is
  now verified against a REAL 10 Hz wire: 23 samples across 22.1 s of
  work, exactly one per work-second, no duplicates, no gaps.
- James's 1 Hz ruling is retroactively vindicated: at raw device rate a
  70-minute session would be ~1.9 MB rather than ~190 KB.

## The recorder on iOS, incidentally proven

`series`: 23 samples, `truncated: false`, `seriesDropped: false`.
First `{t:9, d:20, p:0, spm:0}` (0.9 s in, before the first stroke — the
machine's own zeros, not ours). Last `{t:221, d:601, p:1707, spm:19}`.
Against the driver's own `final-totals` (`accumulator=60.6m
accumulatorElapsed=22.3s`): the series ends at 60.1 m / 22.1 s — a
0.5 m / 0.2 s trail, inside the sub-one-second gap §6.1 asserts BY
CONSTRUCTION and never loosens. No `hr` on any sample (no belt — the
descoped field behaving as descoped).

## Findings

**F-1 (process, mine): the ring does NOT carry per-frame hex, and I said
it did.** Planning this walk I claimed the diagnostics ring records every
notification with its bytes, from `driver.ts:1725`'s `log.record("notify",
…)`. The two lines above it gate that: only the FIRST notification per
characteristic, and thereafter only 0x0037/0x0038 boundary frames —
status frames were deliberately silenced because at ~2/s they flooded the
500-entry ring in under 4 minutes. The claim cost James one paste before
the ring itself falsified it. Recurring failure #13's class (an assertion
about the system that was grepped, not read); the fix that recovered the
item — inferring the rate from the decimator's own bucket residuals —
used data already captured, and is the technique worth keeping.

**F-2 (product, real): the totals oracle went blind on this session.**
`final-totals` (seq 31) reads `accumulator=60.6m … machineTotal=0m`, and
both `twd-sample` entries (seq 6, 29) are at `elapsed=0s workoutState=0`
— the machine's own total was sampled only BEFORE rowing, so the
Sun-fret comparison had nothing live on one side and compared against a
stale zero. Not a wrong number (the accumulator is independently
corroborated by the series' own 60.1 m), but the one check whose entire
purpose is catching a wrong number silently had no second opinion.
Whether that is native-path-specific (a TWD sample cadence question) or
general is unestablished — no rest occurred in this 45-second piece, and
rests are where the CR2 walks sampled TWD successfully. **Filed for the
next connected-surface phase; not a spec-2 defect.**


## Item 4 — S5b: the on-disk footprint (added by James at the first pass's close, measured 2026-08-19 second pass)

**Measured on a REAL trace in a REAL database, and heart rate was
witnessed for the first time in the process.**

Medium: laptop (Chrome + Web Bluetooth) against the walk-lab stack built
from `lt-series`, real PM5, one 3-minute easy piece, logged through the
shipped Save door. Rowing: ~3 min. Budget was 1 piece / ~3 min; not
exceeded. Belt worn (see the HR finding below).

| Measure | Real session (3 min work) | Realistic 4-hour ceiling |
| --- | --- | --- |
| Samples | 180 (exactly one per work-second) | 14,400 (the cap) |
| JSON bytes | 10,107 (56.2 B/sample, `hr` present) | 862,024 |
| **Stored bytes (Postgres)** | **2,006** | **161,127** |
| Compression ratio | **5.04×** | **5.35×** |

The ceiling row was NOT the synthetic probe record (whose constant
`p`/`spm`/`hr` compress unrealistically — the trap §4's S5b row names).
It was built by tiling THIS session's own 180 real samples 80 times with
`t`/`d` offset per tile, so the value distributions are the rower's.

**What this means at his cadence:** a typical 45-minute-work session
stores ~30 KB on disk; ~300 sessions/year ≈ **9 MB/year per rower**.
Five years of daily rowing is well under 100 MB. The 4-hour ceiling is
161 KB — a session nobody rows. Series storage is a non-issue at
household scale, and the number is now measured rather than inferred.

Caveat, stated: `pg_column_size` reports the datum's stored size, which
is authoritative here because both rows compressed small enough to stay
inline (the real row at 2,006 B; the ceiling row at 161 KB is
out-of-line TOAST and its number is the compressed payload). The
per-year figure is arithmetic on the measured ratio, not a measured
year.

**F-3 (finding, and a good one): the heart-rate belt DELIVERS.** Spec 2
descoped HR because "belt delivery on James's PM5 remains unwitnessed."
This session's trace carries `hr` on every sample, rising 83 → 123 bpm
across three minutes of easy rowing — physiologically sensible, wire-
sourced, and the first time the app has seen it. Consequences: the
`hr` field records exactly as designed (20-254 band, no dropped values);
spec 3's HR leg, descoped at the phase-open gate "until a belt is
confirmed", is **now unblocked**; and every size number above is the
WITH-HR case, i.e. the expensive one.

## What was NOT established

The FIRST pass's build talked to prod, whose schema predates migration
0011, so no series reached a server from the phone (the client posted
it; the old validator ignored the unknown key, as designed). The
end-to-end device→server→column path is still proven only in CI — the
second pass closed the server half on the laptop path, not the phone's.

The per-year storage figure is arithmetic on a measured ratio, not a
measured year; and the compression ratio of a session with WILDLY
different values (a max-effort piece with a thrashing HR trace) could
differ from this easy-paddle sample, though not by an order of
magnitude.
