# Trace Rendering Implementation Plan (Phase LT spec 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A connected session's trace draws as one chart under the interval list — pace by default, rate and heart rate a tap away — on both the live summary and the from-the-log view.

**Architecture:** Pure primitives first (`src/charts/` — scales and axes that know nothing about traces, so Phase 6J inherits them), then one trace component consuming them, then both hosts through the single component, then the witness sweep.

**Tech Stack:** Existing only. NO charting dependency (ruled after measuring Recharts at +94 KB gzipped / +325 KB raw — see the spec's ruling 3).

## Global Constraints

- VALUE AUTHORITY: `docs/superpowers/specs/2026-08-19-trace-rendering-design.md` — §1 surfaces, §2 the chart/module/sentinels, §3 the scale, §4 (boundaries CUT and why), §5 accessibility, §7 criteria. THE SPEC GOVERNS on any mismatch.
- NOT triad (renders what spec 2 stores; no stored shape, no wire semantics, no number's meaning changes). Antagonist DELTA pass already run and folded — two design rules died to it; do not resurrect them.
- **Sentinels are not readings**: `p === 0` and `spm === 0` are ABSENT everywhere — excluded from the domain, excluded from the line (it breaks), never drawn. Measured reality: 26% of samples across the committed captures carry `p === 0`, 262 of them in state `rowing`, in runs up to 85 s.
- **Scale**: full range of real readings, padded to a round number. NO clipping, NO outlier marks, NO percentile. Per-measure minimum domain height (pace 10 s/500m, rate 6 spm, hr 20 bpm) so a near-constant session never divides by zero.
- **Pace axis INVERTED** (faster is up). Rate/HR normal.
- Horizontal domain computed ONCE per session, shared by every measure (so a late-starting HR line reads as a late start).
- Decimation ~2 points/pixel, min/max preserved per column, computed PER MEASURE.
- Line BREAKS across a real gap > 3 s (captures carry 5-6 per session, largest 41 s — from rejected resets and dropped frames, NEVER from rests: the work clock freezes, so a rest leaves no gap at all).
- NO boundary marks (§4's cut — assert their absence so a future re-add is deliberate).
- Absent chart when: no series, or fewer than 3 real readings FOR THE MEASURE DRAWN. The HR toggle is absent when HR has none. No empty frames, no placeholders.
- Toggle reuses the house segmented-control idiom (`PaceRefInput` / the connected LIVE|GRID switcher) — do not hand-roll (recurring failure #8).
- Accessibility: text alternative naming measure, range and direction, computed from the same model that draws; accessible names on the toggle; 44px targets; WCAG AA with computed numbers in the report.
- Commands in app/; `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` first; `pnpm test --project client` for src (never unit); failing-test-first; e2e + screenshots FOREGROUND (blocking, 590000ms — never background); per-file coverage; self-mutations byte-identical-restored; `git rev-parse --show-toplevel` before every commit.

---

### Task 1: The chart primitives

**Files:** Create `app/src/charts/scale.ts` (+test), `app/src/charts/axis.ts` (+test).

**Interfaces:** Produces `linearScale({domain: [number, number], range: [number, number], invert?: boolean}): (v: number) => number`; `domainFromReadings(values: number[], opts: {minHeight: number; pad?: number}): [number, number] | null` (null when fewer than 2 real values — the caller decides what absence means); `decimate(points: {x: number; y: number}[], columns: number): {x: number; y: number}[]` (min/max preserved per column, order stable); `chooseTicks(domain: [number, number], count: number): number[]`; `formatTick(value: number, kind: "pace" | "rate" | "hr"): string` (pace via the house `fmtSplit`, never a bespoke formatter). None of these know what a trace is — 6J's bars consume the same file or the spec's tripwire fires.

- [ ] Failing tests first: `linearScale` maps endpoints and midpoint; with `invert` the LOW value maps to the HIGH range end (the pace case, asserted numerically). `domainFromReadings` pads to round numbers, enforces `minHeight` on a constant input (all-identical values yield a domain of at least minHeight, centred), returns null below 2 values. `decimate` on a 14,400-point input yields ≤ 2×columns points AND preserves the global min and max (the spike-survives property — red-provable by removing the min/max rule). `chooseTicks` returns round values inside the domain; `formatTick` delegates to the house formatters (a pace tick reads `2:10.0`).
- [ ] Self-mutation: drop `invert` handling (the inverted-endpoint test reds); make `decimate` take every Nth point (the spike test reds). Restore byte-identical, diff-verified. `pnpm test --project client`, full `pnpm test`; per-file coverage ~100% (pure modules). Commit.

### Task 2: The trace model and the chart component

**Files:** Create `app/src/log/traceModel.ts` (+test — the pure "series → drawable" step), `app/src/log/TraceChart.tsx` (+test); Modify `app/src/index.css`.

**Interfaces:** Consumes Task 1. Produces `buildTrace(series: SeriesData | undefined, measure: "pace" | "rate" | "hr"): TraceModel | null` where `TraceModel = {points: {x: number; y: number}[][]; domainX: [number, number]; domainY: [number, number]; ticksY: number[]; invert: boolean; summary: string}` — `points` is an ARRAY OF SEGMENTS (a gap > 3 s starts a new segment, so the line breaks); `summary` is §5's text alternative; null when the measure has < 3 real readings. Produces `<TraceChart series={...} />` rendering the toggle + SVG, or nothing.

- [ ] Failing tests on `buildTrace` FIRST, against REAL data: replay a committed capture (`docs/monitor/sessions/walk-2026-08-17/step-3.jsonl`) through spec 2's recorder to get a real series, then assert — every `p === 0` sample is absent from both `points` and `domainY` (the 26% case, red-provable by treating 0 as a value); segments split at the capture's own real gaps (> 3 s) and NOT at its rest (which produces no gap at all — the rest case is a NON-split assertion); `domainY` spans the real readings with no clipping; pace `invert` true, rate/hr false; the per-measure `< 3 readings` null.
- [ ] `summary` asserted with real values on a real capture (measure, range, direction, interval-free wording — it must not claim boundaries the chart does not draw).
- [ ] The component: renders a `<polyline>` per segment, axis labels from `chooseTicks`, the segmented toggle (house idiom), the text alternative on the figure; renders NOTHING when `buildTrace` is null for the default measure; the HR toggle option is ABSENT when hr has < 3 readings. Assert absence of any boundary-mark element (§4's cut, pinned).
- [ ] CSS with contrast computed (numbers in the report); 44px toggle targets.
- [ ] Self-mutation: treat `p === 0` as a value (the sentinel test reds); merge segments across a gap (the break test reds); render the HR option unconditionally (its absence test reds). Restore byte-identical. `pnpm test --project client`, full `pnpm test`. Commit.

### Task 3: Both hosts, the sweep, and the captures

**Files:** Modify `app/src/session/PostWorkoutSummary.tsx` (+test — the live host), `app/src/log/FromTheLog.tsx` (+test — the stored host), `app/e2e/design.spec.ts`, `app/e2e/screenshots.spec.ts`, `docs/design/DEVIATIONS.md`, `ROADMAP.md` (LT spec 3 status).

**Interfaces:** Consumes Task 2's component. Both hosts pass their own series and render identically — one component, one rule (spec 1's `SummaryIntervalsBlock` is the precedent for the shared-block pattern).

- [ ] Failing tests: the live host renders the chart from the session record's series and NOTHING when the door has none (timer/by-hand); the stored host renders it from the fetched log's series and NOTHING for a pre-spec-2 row (fixture: a stored log with `series: null`). Placement asserted by DOM order (below the intervals block) on both — the same order-assertion technique spec 1's fix round established.
- [ ] Design witnesses: the polyline's computed stroke token, the axis label's token and contrast, the toggle's 44px targets and accessible names live, the figure's accessible description present with real values, and the absence of boundary marks.
- [ ] Screenshots: recapture the summary and log-detail with a REAL multi-interval trace visible (seed via the fake transport's own frames — check whether the existing capture fixtures already produce a series now that spec 2 ships; if not, extend that seed, do not hand-write a series). Open every changed capture and describe it, checking the drawn shape against the row values in the same frame.
- [ ] DEVIATIONS: a row for the chart's geometry if it departs from any handoff; ROADMAP: LT spec 3 status.
- [ ] Full gates: `pnpm test` (both summary lines), `pnpm e2e` FOREGROUND, `pnpm screenshots` FOREGROUND; per-file coverage for every file this plan created. Self-mutation: swap the two hosts' data sources (each host's own test reds). Commit.

---

## Self-review

- Spec coverage: §1→T3 (hosts/absence) + T2 (the component's own absence); §2→T2 (sentinels, toggle, HR absence) + T1 (the module split); §3→T1 (domain/minHeight/decimation/invert) + T2 (segments, per-measure gates); §4→T2/T3 (absence pinned); §5→T2 (summary, names) + T3 (live witnesses); §7: 1→T2/T3, 2→T2 (real-capture sentinel test), 3→T1+T3 (numeric invert + tick coordinates), 4→T2 (no marks; real-gap break), 5→T1 (spike survives, per measure), 6→T2/T3, 7→T3 captures, 8→post-merge notes (recorded).
- Placeholders: none; the spec's tables carry every value.
- Type consistency: `SeriesData`/`Sample` are spec 2's shipped types (`app/src/monitor/seriesRecorder.ts`); `TraceModel`/`buildTrace` (T2) consume Task 1's `linearScale`/`domainFromReadings`/`decimate`/`chooseTicks`/`formatTick` by those exact names; `<TraceChart series>` is the only host-facing surface.
