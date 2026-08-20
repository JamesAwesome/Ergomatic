# Trace Truth Implementation Plan (Phase LL spec 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The stored trace stops under-reporting when a gap spans an interval boundary, marks rests as rests instead of drawing them as rowing, and gains the time axis that lets anyone check it against the session's own TIME.

**Architecture:** Replace the recorder's edge-triggered boundary heuristic with a level-triggered, index-keyed max-merge register map (the same shape `driver.ts` already runs); add a rest marker to the stored `Sample` and carry it through the server and the renderer; add a fourth tick kind to the shared chart primitives and draw an x-axis.

**Tech Stack:** Existing only. No new dependencies (Phase LL's own buy-nothing ruling).

## Global Constraints

- VALUE AUTHORITY: `docs/superpowers/specs/2026-08-20-trace-truth-design.md`. §1 accumulator, §2 null-key policy, §3 rests, §4 axis, §5 stored corpus, §6 testing, §7 exit criteria, §8 vetted ground, §9 out of scope. **THE SPEC GOVERNS on any mismatch — say so in your report rather than working around it.**
- **TRIAD** (a number's meaning AND a stored shape). Full cycle: no fast path, antagonist pass already done (spec §8), PM final-PR gate on each PR.
- **`Sample.t` and `Sample.d` are TENTHS**, not seconds and metres: the recorder emits `Math.round(workClockSeconds * 10)` and `Math.round(workClockMeters * 10)`. Every expected value in this plan is in tenths. Do not "fix" this.
- **Key on `frame.intervalIndex` (the EMITTED index), never on `toProgramIndex`'s raw output.** The stale-count rest clamp raises the emitted value (`driver.ts:1970-1987`) and fired live in `walk-2026-08-20-lt-close/ring.json` seq 39. Keying on the raw normaliser reads `t=3024` against a true `2422`.
- **The current key is monotonic non-decreasing** — `max(seenKeys)`, the same floor `driver.ts`'s `activeKey` uses (spec §2).
- **A null index continues the last key**; an all-null run accumulates under synthetic key `0`. **Falling back to edge detection on a null key is FORBIDDEN** (spec §2).
- `BUCKET_EPSILON_SECONDS` REMAINS (whole-second flooring). `RESET_EPSILON_SECONDS`, `MIN_COMPLETED_INTERVAL_SECONDS`, `MAX_BOUNDARY_RESET_METERS` and `isGenuineBoundary` are DELETED.
- Commands run in `app/`. `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` first. `pnpm test --project client` for `src/` (never `unit`), `--project integration` for `server/`. Failing test first. Self-mutations restored byte-identical and diff-verified. Per-file coverage for every file touched. **`pnpm e2e` and `pnpm screenshots` FOREGROUND (blocking, 590000ms) — never backgrounded.** `git rev-parse --show-toplevel` before every commit; it must print the worktree path.
- **Read both vitest summary lines** — "Tests" says all-passed while a file that failed to LOAD collects zero; grep "Test Files" too.

---

### Task 1: The accumulator — delete the heuristic, key on the machine's index

**Files:**
- Modify: `app/src/monitor/seriesRecorder.ts`
- Modify: `app/src/monitor/seriesRecorder.test.ts`

**Interfaces:**
- Consumes: `MonitorFrame` (`app/domain/monitor/types.ts`) — specifically `intervalIndex: number | null`, `elapsedSeconds`, `distanceMeters`, `currentSplit`, `spm`, `heartRateBpm`.
- Produces: `createSeriesRecorder(): SeriesRecorder` — **signature unchanged**, `{ onFrame, snapshot, stop }`. `Sample` and `SeriesData` are **unchanged in this task** (the rest marker is Task 2). `isGenuineBoundary` **ceases to exist** and its test section goes with it.

- [ ] **Step 1: Write the failing regression pin — a clean capture must not change**

Add to `app/src/monitor/seriesRecorder.test.ts`. This is the "did I break the working case" pin and it should be GREEN before and after; write it first so you know the harness works.

```ts
it("replays step-3 to the same 242 samples the shipped recorder produced (t and d in TENTHS)", async () => {
  const frames = await loadCaptureFrames(
    "docs/monitor/sessions/walk-2026-08-17/step-3.jsonl",
  );
  const rec = createSeriesRecorder();
  for (const f of frames) rec.onFrame(f);
  const snap = rec.snapshot();
  expect(snap?.samples).toHaveLength(242);
  expect(snap?.samples.at(-1)?.t).toBe(2422);
  expect(snap?.samples.at(-1)?.d).toBe(8072);
});
```

**`loadCaptureFrames` must drive the real driver, not build frames by hand** (spec §6's harness rule). If the file has no such helper, write one that feeds the capture's raw notifications through the production parser and driver and collects emitted `MonitorFrame`s. **Do not call `toProgramIndex` in the harness** — that reproduces a version broken in a way production is not.

- [ ] **Step 2: Write the failing gap-injection tests — the actual defect**

```ts
// Drops `n` frames immediately after the interval-0 -> interval-1 boundary,
// so the first observed post-boundary frame is already past 3.0 m — the exact
// shape `isGenuineBoundary` rejects today.
function dropAfterBoundary(frames: MonitorFrame[], n: number): MonitorFrame[] {
  const b = frames.findIndex(
    (f, i) => i > 0 && f.elapsedSeconds < frames[i - 1]!.elapsedSeconds,
  );
  expect(b).toBeGreaterThan(0); // the capture really does contain a boundary
  return [...frames.slice(0, b), ...frames.slice(b + n)];
}

it.each([4, 20, 60])(
  "loses NOTHING when %i frames are dropped across an interval boundary",
  async (n) => {
    const frames = await loadCaptureFrames(
      "docs/monitor/sessions/walk-2026-08-17/step-3.jsonl",
    );
    const rec = createSeriesRecorder();
    for (const f of dropAfterBoundary(frames, n)) rec.onFrame(f);
    const last = rec.snapshot()!.samples.at(-1)!;
    // Identical totals to the ungapped replay: the fold cannot be missed,
    // because there is no fold — the key carries it.
    expect(last.t).toBe(2422);
    expect(last.d).toBe(8072);
  },
);
```

- [ ] **Step 3: Run them and confirm the gap tests FAIL against today's code**

Run: `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH" && pnpm test --project client seriesRecorder`

Expected: the clean pin PASSES; all three gap cases FAIL with `t` short by roughly 597 tenths (59.7 s) and `d` short by roughly 1593 tenths. **If the gap cases pass against unmodified code, the injection is not reproducing the defect — stop and report, do not proceed.**

- [ ] **Step 4: Write the null-key and monotonic-key tests (spec §2)**

```ts
it("continues the last key when intervalIndex goes null, never resetting accumulation", () => {
  const rec = createSeriesRecorder();
  rec.onFrame(frame({ intervalIndex: 0, elapsedSeconds: 10, distanceMeters: 40 }));
  rec.onFrame(frame({ intervalIndex: 1, elapsedSeconds: 5, distanceMeters: 20 }));
  rec.onFrame(frame({ intervalIndex: null, elapsedSeconds: 6, distanceMeters: 24 }));
  const last = rec.snapshot()!.samples.at(-1)!;
  expect(last.t).toBe(160); // (10 banked + 6) * 10 tenths
});

it("accumulates under a single synthetic key when intervalIndex is null throughout", () => {
  const rec = createSeriesRecorder();
  rec.onFrame(frame({ intervalIndex: null, elapsedSeconds: 1, distanceMeters: 4 }));
  rec.onFrame(frame({ intervalIndex: null, elapsedSeconds: 2, distanceMeters: 8 }));
  expect(rec.snapshot()!.samples).toHaveLength(2); // records, does not refuse
});

it("never lets a backward key move the cumulative clock backwards", () => {
  const rec = createSeriesRecorder();
  rec.onFrame(frame({ intervalIndex: 0, elapsedSeconds: 10, distanceMeters: 40 }));
  rec.onFrame(frame({ intervalIndex: 1, elapsedSeconds: 5, distanceMeters: 20 }));
  rec.onFrame(frame({ intervalIndex: 0, elapsedSeconds: 7, distanceMeters: 28 }));
  const ts = rec.snapshot()!.samples.map((s) => s.t);
  expect(ts).toStrictEqual([...ts].sort((a, b) => a - b));
});
```

`frame()` is a local helper building a `MonitorFrame` with sane defaults; if the file already has one, reuse it rather than adding a second.

- [ ] **Step 5: Implement the register map**

Replace `baseSeconds` / `baseMeters` / `lastReading` and the whole reset-detection block with:

```ts
/** Per-interval registers, MAX-merged. `driver.ts:1072` runs the identical
 *  shape and states the reason: "Maximum, not last-write-wins, for two
 *  independently-found reasons". A `(0,0)` frame arriving late under a
 *  completed interval's key cannot poison a register, because
 *  `max(existing, 0) === existing`. */
const registers = new Map<number, { seconds: number; meters: number }>();
/** Monotonic non-decreasing (spec §2): `max(seenKeys)`, the same floor
 *  `driver.ts`'s `activeKey` uses. A backward key would otherwise shrink
 *  the prefix sum and walk the cumulative clock backwards. */
let currentKey = 0;

function onFrame(f: MonitorFrame): void {
  if (stopped || truncated) return;

  // A null index CONTINUES the last key (spec §2) — it never starts a
  // register and never resets accumulation. Before any non-null key has
  // been seen, `currentKey` is already 0, so an all-null run records
  // under one synthetic register rather than recording nothing.
  if (f.intervalIndex !== null && f.intervalIndex > currentKey) {
    currentKey = f.intervalIndex;
  }

  const reg = registers.get(currentKey) ?? { seconds: 0, meters: 0 };
  reg.seconds = Math.max(reg.seconds, f.elapsedSeconds);
  reg.meters = Math.max(reg.meters, f.distanceMeters);
  registers.set(currentKey, reg);

  let baseSeconds = 0;
  let baseMeters = 0;
  for (const [k, v] of registers) {
    if (k < currentKey) {
      baseSeconds += v.seconds;
      baseMeters += v.meters;
    }
  }

  const workClockSeconds = baseSeconds + f.elapsedSeconds;
  // ... bucket guard and sample construction UNCHANGED from here down
}
```

Then delete `isGenuineBoundary`, `MIN_COMPLETED_INTERVAL_SECONDS`, `MAX_BOUNDARY_RESET_METERS`, `RESET_EPSILON_SECONDS`, and the header paragraphs that derive them. Keep `BUCKET_EPSILON_SECONDS`. Rewrite the header comment to describe the register map and cite spec §1/§2 — **do not leave the old derivation prose in place describing code that no longer exists** (recurring failure 9's shape).

- [ ] **Step 6: Run the tests**

Run: `pnpm test --project client seriesRecorder`
Expected: all PASS, including the three gap cases and the clean 242/2422/8072 pin.

- [ ] **Step 7: Delete the orphaned `isGenuineBoundary` tests and prove the symbols are gone**

Remove the test file's H1 section that exercised `isGenuineBoundary` directly. Then:

```bash
grep -rn "isGenuineBoundary\|MIN_COMPLETED_INTERVAL_SECONDS\|MAX_BOUNDARY_RESET_METERS\|RESET_EPSILON_SECONDS" app/src app/domain app/server app/e2e
```
Expected: **no output.** Paste that command and its empty result into your report — exit criterion 3 is proven by grep, not by assertion.

- [ ] **Step 8: Self-mutation**

Make `currentKey` assignment unconditional (`currentKey = f.intervalIndex ?? currentKey` becomes `currentKey = f.intervalIndex ?? 0`): the null-key test must go RED. Then make the merge last-write-wins (`reg.seconds = f.elapsedSeconds`): a gap test must go RED. Restore byte-identical and verify with `git diff` showing no change.

- [ ] **Step 9: Full gates and commit**

```bash
pnpm test        # read BOTH summary lines
pnpm lint && pnpm typecheck
pnpm test:coverage   # check the per-file number for seriesRecorder.ts
git rev-parse --show-toplevel   # must print the worktree path
git add app/src/monitor/seriesRecorder.ts app/src/monitor/seriesRecorder.test.ts
git commit -m "fix: the trace stops losing an interval to a gap"
```

`pnpm e2e` is NOT required for this task — no file under `app/src/` that renders is touched. Say so explicitly in your report rather than silently skipping it.

---

### Task 2: Rests are marked, end to end

**Files:**
- Modify: `app/src/monitor/seriesRecorder.ts` (+ `seriesRecorder.test.ts`)
- Modify: `app/server/routes/data.ts` (+ its integration test)
- Modify: `app/server/stores/logs.ts` (the `LogSeriesSample` type)
- Modify: `app/src/log/traceModel.ts` (+ `traceModel.test.ts`)
- Modify: `app/src/log/TraceChart.tsx` (+ `TraceChart.test.tsx`)
- Modify: `app/src/index.css`
- Modify: `app/e2e/design.spec.ts`

**Interfaces:**
- Consumes: Task 1's recorder.
- Produces: `Sample` gains `readonly r?: true`. `TraceModel` gains per-segment or per-point rest information — **name it `rest: boolean` on the point**, so `TraceChart` can tint spans without re-deriving anything.

- [ ] **Step 1: Failing test — a real non-frozen rest emits marked samples**

**Use `walk-2026-08-16/session-2-wu-4unequal.jsonl`, NOT `step-3`.** Step-3's first rest is frozen (the rower stopped) and is exactly how the false premise survived; session-2 contains rests that advance.

```ts
it("marks every sample recorded while the machine was resting (real capture, non-frozen rest)", async () => {
  const frames = await loadCaptureFrames(
    "docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl",
  );
  const rec = createSeriesRecorder();
  for (const f of frames) rec.onFrame(f);
  const samples = rec.snapshot()!.samples;
  expect(samples).toHaveLength(421);
  const rested = samples.filter((s) => s.r === true);
  expect(rested).toHaveLength(21);
  // work samples carry NO key at all — absent, not false (the `hr` idiom)
  expect(Object.keys(samples.find((s) => s.r === undefined)!)).not.toContain("r");
});
```

- [ ] **Step 2: Run it, confirm FAIL** (`r` does not exist yet).

- [ ] **Step 3: Implement in the recorder**

```ts
export interface Sample {
  readonly t: number;
  readonly d: number;
  readonly p: number;
  readonly spm: number;
  readonly hr?: number;
  /** Present and `true` only for a sample recorded while the machine was
   *  resting. ABSENT means work — the same absent-not-false idiom `hr`
   *  uses, so a work sample costs zero extra bytes (spec §3). */
  readonly r?: true;
}
```

In the sample construction, alongside the existing `hr` spread:

```ts
...(f.state === "resting" ? { r: true as const } : {}),
```

- [ ] **Step 4: Failing test — the server must not silently drop `r`**

`validateSeriesSample` destructures `{ t, d, p, spm, hr }` and rebuilds the object, so an unknown key vanishes at the boundary. Add to the server's integration test:

```ts
it("round-trips a rest-marked sample through POST and GET", async () => {
  const posted = { t: 10, d: 40, p: 1200, spm: 20, r: true };
  // ... POST a log whose series.samples is [posted], then GET it back
  expect(fetched.series.samples[0]).toStrictEqual(posted);
});

it("rejects r when it is not literally true", async () => {
  // r: false, r: 1, r: "yes" must all 400 — the shape is `true` or absent
});
```

- [ ] **Step 5: Implement the server side**

In `server/stores/logs.ts`, add `readonly r?: true` to `LogSeriesSample`. In `server/routes/data.ts`'s `validateSeriesSample`, destructure `r`, validate `r === undefined || r === true`, and include it in the returned sample with the same conditional-spread idiom `hr` uses. Reject anything else with `at("r must be true or absent")`.

- [ ] **Step 6: Failing test — the model carries rest through to the renderer**

```ts
it("marks trace points recorded during a rest", () => {
  const series = { samples: [
    { t: 10, d: 40, p: 1200, spm: 20 },
    { t: 20, d: 45, p: 1400, spm: 18, r: true as const },
    { t: 30, d: 80, p: 1200, spm: 20 },
  ]};
  const model = buildTrace(series, "pace")!;
  expect(model.points[0]!.map((pt) => pt.rest)).toStrictEqual([false, true, false]);
});

it("does NOT break the line across a rest — a rest is data, not a gap", () => {
  // same series: exactly ONE segment, not three
  expect(buildTrace(series, "pace")!.points).toHaveLength(1);
});
```

- [ ] **Step 7: Implement in `traceModel.ts`** — add `rest: boolean` to the point type, populated from `sample.r === true`. **Do not touch the gap-splitting rule**: `GAP_BREAK_SECONDS` splits on missing data, and a rest is present data (spec §3).

- [ ] **Step 8: Render the tint**

In `TraceChart.tsx`, draw rest spans in a distinct tone beneath or along the polyline. Add the CSS to `index.css`. **Compute the contrast ratio against the card background and put the number in your report** (recurring failure 6 — a token shipped at 3.29:1 once and only an automated scan caught it).

- [ ] **Step 9: Design witness in `e2e/design.spec.ts`** — assert the rest element exists with its computed token on a fixture that actually contains a rest, and that the polyline is unbroken across it.

- [ ] **Step 10: Self-mutation** — emit `r: true` unconditionally (the work-sample key test reds); split segments on rest (the one-segment test reds). Restore byte-identical.

- [ ] **Step 11: Full gates and commit**

```bash
pnpm test && pnpm lint && pnpm typecheck
pnpm e2e            # FOREGROUND — src/ renders changed
git rev-parse --show-toplevel
git commit -m "feat: rests are drawn as rests, not as rowing"
```

---

### Task 3: The chart gets a time axis

**Files:**
- Modify: `app/src/charts/axis.ts` (+ `axis.test.ts`)
- Modify: `app/src/log/TraceChart.tsx` (+ `TraceChart.test.tsx`)
- Modify: `app/src/index.css`
- Modify: `app/e2e/design.spec.ts`, `app/e2e/screenshots.spec.ts`
- Modify: `docs/design/DEVIATIONS.md`, `ROADMAP.md`

**Interfaces:**
- Consumes: `chooseTicks(domain, count)` unchanged; `formatTick(value, kind)` gains a `"time"` kind.
- Produces: nothing new for later tasks — this is the last task.

- [ ] **Step 1: Failing test on the shared primitive**

```ts
it("formats a time tick as m:ss from tenths of a second", () => {
  expect(formatTick(0, "time")).toBe("0:00");
  expect(formatTick(2422, "time")).toBe("4:02");   // step-3's own final t
  expect(formatTick(600, "time")).toBe("1:00");
});
```

`Sample.t` is TENTHS — the formatter takes tenths and must route through the house time formatter, never a bespoke one.

- [ ] **Step 2: Run it, confirm FAIL** (`"time"` is not a `TickKind`).

- [ ] **Step 3: Implement** — add `"time"` to `TickKind` and the branch to `formatTick`. **`scale.ts`/`axis.ts` are contracted to be trace-agnostic and shared with Phase 6J (spec §4). Adding a member is exercising that contract, not breaking it — but keep the file free of anything trace-specific.**

- [ ] **Step 4: Failing test on the component**

```ts
it("renders x-axis tick labels spanning the trace's own duration", () => {
  render(<TraceChart series={realSeriesFromCapture} />);
  const labels = screen.getAllByTestId("trace-x-tick");
  expect(labels.length).toBeGreaterThanOrEqual(2);
  expect(labels.at(0)).toHaveTextContent("0:00");
  expect(labels.at(-1)!.textContent).toMatch(/^\d+:\d\d$/);
});
```

- [ ] **Step 5: Implement the axis in `TraceChart.tsx`**, reusing the existing tick-render loop shape rather than hand-rolling a second one. CSS in `index.css`; contrast computed and reported.

- [ ] **Step 6: Recapture and LOOK at the images**

```bash
pnpm e2e          # FOREGROUND
pnpm screenshots  # FOREGROUND
```

Then **open `docs/screenshots/log-detail.png` and `log-monitor.png` and describe them in your report**, and — exit criterion 7 — **read the axis's last label against the `TIME` hero in the same frame and say whether they reconcile.** That reconciliation is the whole point of the axis; a capture that shows an axis nobody checked is worth nothing (recurring failure 7).

- [ ] **Step 7: `DEVIATIONS.md` row (spec §5)** — traces stored before this spec may under-run permanently and draw rest as work, cannot be distinguished from correct ones, and cannot be repaired. Also reconcile any existing DEVIATIONS row describing the old boundary heuristic.

- [ ] **Step 8: ROADMAP** — tick Phase LL spec 1 and note the notes clause owed for the axis (spec §7 criterion 9).

- [ ] **Step 9: Self-mutation** — render the axis with a fixed `[0, 100]` domain (the span test reds). Restore byte-identical. Full gates, commit.

---

## Self-review

- **Spec coverage:** §1→T1; §2→T1 steps 4-5 (all three cases); §3→T2; §4→T3; §5→T3 step 7; §6→every task's harness note plus T1 step 1's real-driver rule; §7: 1→T1 s1, 2→T1 s2, 3→T1 s7, 4→T1 s4, 5→T2 s1, 6→T2 s8-9, 7→T3 s6, 8→T3 s7, 9→T3 s8; §8 is context, not work; §9 is exclusions.
- **Placeholders:** none — every step carries the code or the exact command.
- **Type consistency:** `Sample.r?: true` (T2) is the same name the spec's §3 declares and the same the server validates in T2 step 5; `rest: boolean` on the model point (T2 step 7) is what `TraceChart` consumes in T2 step 8; `"time"` is the `TickKind` member in T3 steps 1 and 3. `createSeriesRecorder()` keeps its zero-argument signature throughout.
- **Known corpus limit, carried from spec §6:** only `step-3` of the six committed recordings has a program header, so it is the only capture that can exercise a non-null key. Tasks 1 and 2 use different captures deliberately — step-3 for the key, session-2 for a real non-frozen rest.
