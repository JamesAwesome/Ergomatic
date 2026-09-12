# Phase MD PR 3 — One `Sample` Shape: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the series sample is declared ONCE per tree. `domain/monitor/types.ts` owns the client/domain shape and `server/stores/logs.ts` owns the one hand-written server mirror; every other type that names `t`/`hr`/`r` becomes a `Pick` of one of those two. The rest flag `r` becomes a REQUIRED key valued `true | undefined`, so a sample built without spelling it is a compile error — and zero bytes change on disk or on the wire.

**Architecture:** six declarations become three, and only one of the three is a copy. `Sample`/`SeriesData` move into `domain/monitor/types.ts` (NOT a new `series.ts` — ruled); `seriesRecorder.ts` re-exports both and writes `r: f.state === "resting" ? true : undefined`. `HeartRateSample` = `Pick<Sample, "t" | "hr" | "r">`. `LogSeriesSample` stays hand-written (`logs.ts:120-128` rules the mirror deliberate) and gains a `Record<keyof LogSeriesSample, true>` exhaustiveness witness; the two Concept2 sites derive from it with `Pick`. The seam no compiler can cross gets the RF24 test it has never had: the real recorder's output, across the real POST, to the real Concept2 payload.

**Tech Stack:** React 19 + Vite, TypeScript, Vitest (`unit` = node, `client` = jsdom, `integration` = Docker Postgres), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-09-12-one-sample-shape-design.md` revision 2. Census: `docs/superpowers/audits/2026-09-12-architecture-walk/pr3-census.md`.

**Baseline:** every number and every failure message below was MEASURED by the plan author in a throwaway worktree at `3fc49767` (main, `#409`), run from `app/`. Every code block below was pasted to its real path there and taken through `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and the named vitest files. Six blocks changed under that test; each change is recorded inline as **RF10**. A number here without a command beside it is a plan defect.

**TRIAD: stored shape.** Full antagonist pass is folded into spec rev 2; `/harden` runs on THIS plan (two passes max) before Task 1; PM final-PR gate on the PR.

---

## Global Constraints

- **No behaviour change a rower can see. No screenshot is committed** (no screen's layout changes; RF-"no screenshots for copy").
- **Invariants, not mechanisms** (spec §3): (1) one spelling per tree, derived not copied; (2) THE BYTES ARE UNCHANGED — gated by PR 1's `handoffStoreBytes.test.ts`, which stays green with its captured fixtures UNTOUCHED; (3) a rest sample is a rest sample at every consumer, and an omitted flag is a compile error; (4) the server mirror is gated by a test that starts at the recorder; (5) `r: null` and `r: false` stay refused at the validator (400, `"r must be true or absent"`).
- **If this PR needs to regenerate a byte fixture it has broken invariant 2.** `git status --short app/src/monitor/fixtures/monitorRun-bytes` must stay EMPTY through every task. (`monitorRunShapes.ts` — the fixture INPUT — is modified on purpose in Task 2; its output is byte-identical, measured.)
- **`exactOptionalPropertyTypes` is set in none of the repo's tsconfigs**, which is what makes a required key valued `true | undefined` accept an explicit `undefined` and reject an omitted one. If anyone enables it this design inverts. Do not enable it here.
- **Every new assertion gets a mutation that makes it fail**, and the task report states what was mutated and what the failure said (RF21). **Commit before every probe** and confirm with `git log -1` (RF22); a probe's revert must be a no-op against a clean file. A mutation must COMPILE (RF12 corollary) — three of the mutations below exist in the shape they do BECAUSE the required key makes the obvious rename uncompilable.
- **Test invocation:** `pnpm test --project client -- <pattern>` silently runs the whole suite. For one file: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project <p> <file>` (collapses signal deaths to exit 1 — RF40; never re-run a run showing exit ≥128 or `Allocation failed`). Read BOTH summary lines.
- **Run `git rev-parse --show-toplevel` before every commit** and confirm it prints your worktree path. Every subagent reads `.claude/agent-briefing.md` first. Never merge, never remove the worktree.
- **PM5 in copy:** nothing here touches copy. Comments are not copy.
- **Anything with a life after merge goes in `ROADMAP.md` at the moment it is found** (RF14), stamped `· dies YYYY-MM-DD · <why a row>`.

## Names this plan fixes (every task uses exactly these)

| Symbol | After this PR | Module |
| --- | --- | --- |
| `Sample` (with `readonly r: true \| undefined`), `SeriesData` | DECLARED here | `app/domain/monitor/types.ts` |
| `Sample`, `SeriesData` | RE-EXPORTED (`export type { Sample, SeriesData }`) — all importers keep their path | `app/src/monitor/seriesRecorder.ts` |
| `HeartRateSample` | `Pick<Sample, "t" \| "hr" \| "r">` | `app/domain/monitor/derivedHeartRate.ts` |
| `LogSeriesSample` (with `r: true \| undefined`), `LogSeries` | the ONE hand-written server mirror, unchanged in status | `app/server/stores/logs.ts` |
| `SERIES_SAMPLE_FIELDS: string[]` | new export — `Object.keys({…} satisfies Record<keyof LogSeriesSample, true>)` | `app/server/stores/logs.ts` |
| `SessionLogRow.series.samples` | `readonly Pick<LogSeriesSample, "t" \| "hr" \| "r">[]` | `app/server/concept2/mapping.ts` |
| `toMappingRow`'s series cast | the same `Pick`, not an inline literal | `app/server/routes/concept2.ts` |
| `EndedBy` | `(typeof endedByEnum.enumValues)[number]` | `app/server/stores/logs.ts` |
| `ENDED_BY_VALUES` | new export — `endedByEnum.enumValues`; `data.ts` imports it | `app/server/stores/logs.ts` |
| `asSerialized<T>(value: T): T` | new test helper (`JSON.parse(JSON.stringify(v))`) | `app/src/test/asSerialized.ts` (new) |
| `asStored` | REJECTED as a second name for the same idea; `storeContracts.ts` declares its own `asSerialized` because server code never imports from `src/` | — |

## How this plan is executed

The controller coordinates. Tasks are STRICTLY SEQUENTIAL: Task 1 makes the whole tree not compile and Tasks 2-4 are what make it compile again. A fresh subagent may implement Tasks 5, 6 and 7; Tasks 0-4 are one unit and should be one dispatch (splitting them hands someone a red tree with no way to run a test). Each task ends with a commit on `phase-md-pr3` and a report naming: commands run with both summary lines, every mutation and what its failure said, and any place the plan contradicted what the implementer observed (RF10 — say so, do not work around it).

---

### Task 0: The census, as a command

**Nothing is transcribed into this plan. Run these; the outputs ARE the census** (a hand-copied table goes stale against the plan's own later steps — the PR1.75b lesson).

- [ ] **Step 1: the six declarations, and what each spells**

```bash
cd app
grep -rnE '(^|[^a-zA-Z])r\??: true' src domain server --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
grep -rn 'interface Sample\|interface SeriesData\|HeartRateSample\|interface LogSeriesSample' --include='*.ts' src domain server | grep -v '\.test\.'
```

**Measured on main at `3fc49767`:** the first returns **7** lines — `seriesRecorder.ts:238` (the declaration), `seriesRecorder.ts:425` (the producer), `src/monitor/fixtures/monitorRunShapes.ts:82`, `derivedHeartRate.ts:68`, `mapping.ts:64`, `logs.ts:138`, `concept2.ts:253`. **RF10 — the spec says 6.** The seventh is `monitorRunShapes.ts`, which landed with PR 1 (#408) AFTER the census was taken. Exit criterion 1 is restated in Task 7 against the measured 7.

- [ ] **Step 2: the `r` producer and its consumers**

```bash
grep -rnE '\.r === true|\.r !== true|r: true as const' --include='*.ts' --include='*.tsx' src domain server | grep -v '\.test\.'
```

Measured: one producer (`seriesRecorder.ts:425`) and two consumers (`derivedHeartRate.ts:103`, `traceModel.ts:182`).

- [ ] **Step 3: the hand-built typed sites — the COMPILER lists them, not this plan**

After Task 1 lands the required key, `pnpm typecheck` prints every construction site that omits `r`. Do not pre-enumerate them: work the list the compiler gives, then re-run until it is empty. **Measured, for a sanity check only:** the first pass listed sites in `src/justrow/totals.test.ts`, `src/log/FromTheLog.test.tsx`, `src/log/storedSummary.test.ts`, `src/log/traceModel.test.ts`, `src/monitor/fixtures/monitorRunShapes.ts`, `src/monitor/handoffStore.test.ts`, `src/monitor/monitorRun.test.ts`, `src/session/LogSession.test.tsx`, `src/session/PostWorkoutSummary.test.tsx`; later passes added `src/monitor/derivedHeartRate.replay.test.ts`, `server/concept2/mapping.test.ts`, `server/routes/concept2.test.ts`, `server/stores/contracts/storeContracts.ts`. **`tsc -b` stops at the first failing project, so the list arrives in waves — an empty run is the only proof you are done.** The whole edit is **23 files changed, +414/−210** including the two new files.

- [ ] **Step 4: which captures reach the recorder** (input for Task 5)

```bash
grep -rln 'createSeriesRecorder' src --include='*.test.*'
grep -rn 'docs/monitor/sessions' src/monitor/derivedHeartRate.replay.test.ts
```

Task 5 uses `walk-2026-08-16/session-2-wu-4unequal.jsonl` — the capture `derivedHeartRate.replay.test.ts` already drives the recorder over, and the one whose rest stretch makes the derived average DIFFER from the rest-included one.

---

### Task 1: The declaration moves, and `r` becomes a required key

**Files:** Modify `app/domain/monitor/types.ts`, `app/src/monitor/seriesRecorder.ts`.

- [ ] **Step 1: append `Sample` and `SeriesData` to `domain/monitor/types.ts`**

Append at the END of the file (after `hasTargetedScan`). `types.ts` already carries runtime code, so this adds no coverage burden under `domain/**`'s 100% threshold — which a new `domain/monitor/series.ts` would have done, and is why the types go here (ruled).

```ts
// ---------------------------------------------------------------------
// The recorded series: one sample per whole second of a connected piece.
//
// Phase MD PR 3 moved this pair here from `src/monitor/seriesRecorder.ts`
// so that every consumer in `domain/` derives from ONE declaration rather
// than re-spelling the field names (RF33: `derivedHeartRate.ts` once
// spelled the rest flag `rest`, structural typing accepted the real
// `Sample` with the key simply absent, and the rest exclusion was dead on
// every production path while every test passed). The recorder still owns
// the VALUES and re-exports both names, so its importers are unchanged;
// this file owns the SHAPE.
//
// `server/stores/logs.ts`'s `LogSeriesSample` is still a hand-written
// mirror — server code never imports from `src/`, and this file is the
// client/domain tree. That seam is gated by a test, not a compiler:
// `server/routes/seriesSeam.test.ts`.

export interface Sample {
  readonly t: number;
  readonly d: number;
  readonly p: number;
  readonly spm: number;
  readonly hr?: number;
  /** trace-truth Task 2 (spec §3, James's ruling: rests are DRAWN, but
   *  MARKED). `true` ONLY for a sample recorded while the winning frame's
   *  own `state` was `"resting"`; `undefined` means work.
   *
   *  A REQUIRED KEY whose value may be `undefined` (Phase MD PR 3), not an
   *  optional key: `JSON.stringify` drops an `undefined`-valued key, so a
   *  work sample still costs zero SERIALIZED bytes — the key is present in
   *  memory and absent on disk and on the wire. What the required key buys
   *  is that a hand-built sample which does not SPELL `r` fails to
   *  compile, which is the exact defect RF33 recorded.
   *
   *  On every READ path (a `localStorage` parse, a jsonb read-back, a POST
   *  body) the key is genuinely absent while this type says required —
   *  these types describe construction sites, and `s.r === true` is correct
   *  either way. `exactOptionalPropertyTypes` is set in none of the repo's
   *  tsconfigs; if it is ever enabled this inverts (an explicit `undefined`
   *  becomes the error) and the producer line stops compiling.
   *
   *  The renderer cannot recover this later (a stored log's steps never
   *  carry a warm-up row, and no step carries a marker to key a positional
   *  derivation off), so the recorder — the only place that ever saw the
   *  wire's own state byte — must mark the sample at construction. */
  readonly r: true | undefined;
}

export interface SeriesData {
  samples: Sample[];
  truncated?: true;
}
```

- [ ] **Step 2: `seriesRecorder.ts` re-exports, and the producer spells the key**

Widen the existing type-only import at the top of the file:

```ts
import type {
  MonitorFrame,
  Sample,
  SeriesData,
} from "../../domain/monitor/types.js";
```

Replace the `Sample`/`SeriesData` declarations and the doc comment above them with a re-export. **Keep every sentence of the existing doc comment** — the C2-stroke-object shape, the `hr` banding, the `readonly`/`Object.freeze` paragraph — under a new opening paragraph saying the pair is declared in `domain/monitor/types.ts` and re-exported here so importers keep their path. Then:

```ts
export type { Sample, SeriesData };
```

`verbatimModuleSyntax` accepts this form; all importers keep compiling (probed — a clean `pnpm typecheck` after Tasks 2-4).

Replace the producer's conditional spread (the LAST field in the sample literal — keeping it last is what keeps the serialized key order identical):

```ts
      // trace-truth Task 2 (spec §3): the WINNING frame's own state marks
      // the sample. `r` is a REQUIRED key valued `true | undefined` (Phase
      // MD PR 3), so this cannot be the conditional spread `hr` above
      // uses — a spread cannot satisfy a required key. The OUTPUT is
      // unchanged: `JSON.stringify` drops an `undefined`-valued key, so a
      // work sample still costs zero SERIALIZED bytes.
      r: f.state === "resting" ? true : undefined,
```

- [ ] **Step 3: run the compiler and read the wave**

```bash
pnpm typecheck   # EXPECTED TO FAIL — this is the census of Task 0 Step 3
```

Do not fix anything yet. Tasks 2-4 are the fix, in order.

---

### Task 2: The client/domain tree compiles again

**Files:** Modify `app/domain/monitor/derivedHeartRate.ts`, `app/src/monitor/fixtures/monitorRunShapes.ts`, plus every test file the compiler named.

- [ ] **Step 1: `HeartRateSample` derives**

Add `import type { Sample } from "./types.js";` and replace the interface with:

```ts
export type HeartRateSample = Pick<Sample, "t" | "hr" | "r">;
```

Rewrite its doc comment to keep the RF33 incident paragraph and say the link is now the compiler's. **Move the DECISECONDS sentence into that comment** — it hung off `t`'s own field doc, which a `Pick` has nowhere to put, and it is the load-bearing unit note (`Math.round(seconds * 10)`; a weighted mean is scale-invariant so no assertion on the RESULT can catch a unit error, only a threshold can). **RF10: the spec did not say where that sentence goes; losing it would have been a silent deletion.**

- [ ] **Step 2: PR 1's fixture input**

```ts
// `r: undefined` on the two work samples is REQUIRED-KEY bookkeeping from
// Phase MD PR 3, not a shape change: `JSON.stringify` drops an
// `undefined`-valued key, so these three samples serialize byte-identically
// to the captured fixtures and leg (a) stays green without a recapture.
const SERIES = {
  samples: [
    { t: 0, d: 0, p: 120, spm: 24, r: undefined },
    { t: 1, d: 4, p: 121.5, spm: 25, hr: 140, r: undefined },
    { t: 2, d: 8, p: 122, spm: 25, r: true as const },
  ],
};
```

- [ ] **Step 3: the test literals the compiler named**

For each site: add `r: undefined` to a work sample, keep `r: true as const` on a rest sample. Two sites are NOT a plain literal and need a decision:

- `src/log/storedSummary.test.ts`'s `at()` helper ends with `...(resting === undefined ? {} : { r: resting })`. Replace with `r: resting,` plus one comment sentence (a spread cannot satisfy a required key; `undefined` serializes to nothing, exactly as the absent key did).
- `src/monitor/derivedHeartRate.replay.test.ts`'s `samplesFrom` ends with `...(resting ? { r: true as const } : {})`. Replace with `r: resting ? (true as const) : undefined,`. Its three "strip whatever marks rest" rebuilds — `.map(({ t, hr }) => ({ t, hr }))` — become `.map(({ t, hr }) => ({ t, hr, r: undefined }))`, which makes the strip EXPLICIT rather than incidental.

- [ ] **Step 4: the `"r" in s` comment (spec §5)**

`derivedHeartRate.replay.test.ts`'s rest count reads `produced.filter((s) => "r" in s && s.r === true)`. Keep it, and say why above it:

```ts
    // `r` is a REQUIRED key valued `true | undefined` since Phase MD PR 3,
    // so `"r" in s` is now true of EVERY sample and does no discriminating;
    // `s.r === true` is what counts the rests. Kept as-is because the count
    // it produces is still the producer-side assertion this leg needs.
```

- [ ] **Step 5: gates**

```bash
pnpm typecheck   # client/domain wave clean; the SERVER wave is Task 3's
```

---

### Task 3: The server tree — one mirror, one witness, two `Pick`s

**Files:** Modify `app/server/stores/logs.ts`, `app/server/routes/data.ts`, `app/server/concept2/mapping.ts`, `app/server/routes/concept2.ts`, plus `mapping.test.ts` / `concept2.test.ts` literals the compiler names.

- [ ] **Step 1: `LogSeriesSample`'s `r`, and the exhaustiveness witness**

`r?: true;` becomes `r: true | undefined;` with a comment saying it matches the client's `Sample` exactly, costs zero stored bytes, and is genuinely absent on the read path. Then, immediately after `LogSeries`:

```ts
/** Every field of `LogSeriesSample`, as a runtime array.
 *
 *  The exhaustiveness witness is `Record<keyof LogSeriesSample, true>`:
 *  TypeScript rejects a MISSING key (TS2741) and an EXTRA one, so this
 *  literal compiles only when its keys are exactly the interface's. The
 *  weaker `as const satisfies readonly (keyof LogSeriesSample)[]` was the
 *  first draft and is silent on an omission — it cannot go red on the
 *  defect this exists for (RF21).
 *
 *  What it gates: `routes/data.ts`'s `validateSeriesSample` REBUILDS its
 *  result from an explicit field list rather than spreading the raw input,
 *  and a field added here without being added there is silently dropped
 *  from every stored trace. It does NOT gate the six per-field predicates
 *  — those are six different checks with four different ceilings and are
 *  deliberately written out one by one. The same array is compared against
 *  the CLIENT recorder's own emitted keys by
 *  `server/routes/seriesSeam.test.ts`, which is the only gate across the
 *  `src/` -> `server/` boundary this mirror cannot cross with a compiler. */
export const SERIES_SAMPLE_FIELDS = Object.keys({
  t: true,
  d: true,
  p: true,
  spm: true,
  hr: true,
  r: true,
} satisfies Record<keyof LogSeriesSample, true>);
```

**Mutation (run it):** delete `r: true,` from that literal. Measured: `server/stores/logs.ts(172,3): error TS1360: Type '{ t: true; d: true; p: true; spm: true; hr: true; }' does not satisfy the expected type 'Record<keyof LogSeriesSample, true>'.`

- [ ] **Step 2: the validator's rebuild list**

`data.ts`'s `validateSeriesSample` currently ends `const sample: LogSeriesSample = { t, d, p, spm }; if (hr…) …; if (r === true) …;` — which no longer compiles. Replace with one literal that keeps the serialized key order (`hr` before `r`, both dropped when undefined):

```ts
  const sample: LogSeriesSample = {
    t,
    d,
    p,
    spm,
    ...(hr !== undefined ? { hr } : {}),
    r: r === true ? true : undefined,
  };
  return { ok: true, sample };
```

Extend the existing "explicit field list" comment to say: this is the list that drops a field SILENTLY; `SERIES_SAMPLE_FIELDS` is asserted against a fully-populated sample built by this function in `seriesSeam.test.ts`; the key ORDER matches the recorder's construction order so a validated sample re-serializes to the bytes the client sent. **The six per-field predicates, their order and their pinned messages are UNCHANGED.** **RF10: the spec said the rebuild keeps its two post-assignment `if`s; it cannot — a required key must be present at construction, and the spread form is what preserves byte order.**

- [ ] **Step 3: the stale `SERIES_SPM_MAX` comment (census §0.5)**

The comment above `const SERIES_SPM_MAX = 255;` says the recorder "stores it unbanded" — falsified by RC-6 (`seriesRecorder.ts` collapses anything outside 10..60 to `0`). Replace the falsified half; keep 255 with its honest reason (the wire byte is a u8) and say plainly that this is a trust boundary, not a mirror of the producer, and that the previous wording was corrected here.

- [ ] **Step 4: E and F derive**

`mapping.ts` — widen its `stores/logs.js` type import to `{ LogSeriesSample, LogStep }` and replace the inline literal:

```ts
  series?: {
    samples?: readonly Pick<LogSeriesSample, "t" | "hr" | "r">[];
  } | null;
```

Comment: derived since PR 3; it was a hand-spelled inline literal and a rename of `r` here would have silently stopped excluding rest from a rower's logbook heart-rate (RF33 one layer up). `samples` stays optional and `truncated` stays absent — neither is read on this path.

`concept2.ts` — same import widening, same `Pick` inside `toMappingRow`'s cast, plus one sentence saying this cast is UPSTREAM of `mapping.ts`'s row, so a rename that fixed that one and not this one would still have broken the exclusion silently.

- [ ] **Step 5: the server test literals the compiler names, and gates**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test --project unit
```

---

### Task 4: The five `toStrictEqual`s that compare memory against JSON

**RF10 — THIS TASK IS NOT IN THE SPEC, and it is the largest thing the paste-test found.** The spec's §1 records that `Object.keys`, `"r" in s` and `toStrictEqual` all distinguish present-undefined from absent, and then swept only for `Object.keys`. Measured after Tasks 1-3: **5 client tests and 3 real-Postgres contract cases fail**, every one a `toStrictEqual`/`toMatchObject` comparing an in-memory series (now carrying `r: undefined`) against the same series after a trip through `localStorage`, a POST body, or a jsonb column.

The fake store keeps the object it was handed, so all three contract cases **passed against the fake and failed against real Postgres** — the fake was hiding the difference. Fix both sides of each comparison, not the fake.

**Files:** Create `app/src/test/asSerialized.ts`; modify `app/src/monitor/handoffStore.test.ts`, `app/src/session/LogSession.test.tsx` (3 assertions), `app/src/workout/WorkoutDetail.postReleaseCommit.test.tsx`, `app/server/stores/contracts/storeContracts.ts` (3 assertions).

- [ ] **Step 1: the helper** — `app/src/test/asSerialized.ts`, 20 lines, verbatim at `scratchpad/patches/pr3-asSerialized.ts`. `src/test/**` is excluded from coverage (`vitest.config.ts`), so it adds no coverage burden.

```ts
export function asSerialized<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
```

Its doc comment states: why the in-memory and serialized sides differ; that `toEqual` does NOT distinguish them but `toStrictEqual` does; that you wrap the IN-MEMORY side; that a missing field, a changed number and a renamed key all still red, and only an `undefined`-valued key becomes invisible — which is exactly what a serializer makes invisible.

- [ ] **Step 2: the client assertions** — wrap the in-memory side:

```
handoffStore.test.ts           expect(store.loadMonitorRun()!.series).toStrictEqual(asSerialized(SERIES));
LogSession.test.tsx  ×3        expect(body.series).toStrictEqual(asSerialized(series));   (and bodies[0], bodies[1])
WorkoutDetail.postReleaseCommit.test.tsx
                               expect(body.series).toStrictEqual(asSerialized(atRelease!.run.series));
```

- [ ] **Step 3: `storeContracts.ts`** — declare a local `asSerialized` beside `NON_EXISTENT_UUID` (server code never imports from `src/`; the duplication is deliberate and the comment says so, naming the client copy). Wrap BOTH sides, because the fake and the real backend differ:

```ts
expect(asSerialized(row)).toMatchObject({ series: asSerialized(series) });   // "get still returns the full row"
expect(asSerialized(row!.series)).toStrictEqual(asSerialized(series));       // ×2, the two round-trip cases
```

Its comment records the measurement: without it, these three cases passed against the fake and failed against real Postgres.

- [ ] **Step 4: gates**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test --project client                 # measured: 222 files / 5949 tests, all pass
pnpm test --project unit                   # measured: 69 files / 2167 pass, 1 skipped
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project integration \
  server/stores/contracts/contracts.real.integration.test.ts   # measured: 132 pass
```

---

### Task 5: The two gates the shape owes — the compiler gate and the seam test

**Files:** Modify `app/src/monitor/seriesRecorder.test.ts`; create `app/server/routes/seriesSeam.test.ts`.

- [ ] **Step 1: re-point the `Object.keys` proxy (it is RED after Task 1)**

Measured failure before the fix: `AssertionError: expected [ 't', 'd', 'p', 'spm', 'hr', 'r' ] to not include 'r'`.

```ts
    // A work sample costs ZERO SERIALIZED bytes. This used to read
    // `Object.keys(...).not.toContain("r")`, which was a PROXY for that: it
    // was true only while `r` was an optional key. Phase MD PR 3 made `r` a
    // REQUIRED key valued `true | undefined`, so the key is present in
    // memory and the proxy went red while the invariant it stood for was
    // untouched. Asserting on the JSON is strictly stronger — it is the
    // thing that reaches localStorage, the POST body and the jsonb column.
    expect(
      JSON.stringify(samples.find((s) => s.r === undefined)!),
    ).not.toContain('"r"');
```

- [ ] **Step 2: the byte-identity test, with independent literals**

Added to the same describe. The literals are written out by hand, not built from `Sample` or the recorder's constants, so a change to either type cannot retune them (RF21).

```ts
  it("serializes a work sample and a rest sample to exactly these bytes", () => {
    const work = { t: 1, d: 4, p: 121, spm: 25, hr: 140, r: undefined };
    const rest = { t: 2, d: 8, p: 122, spm: 25, hr: 141, r: true as const };
    expect(JSON.stringify(work)).toBe('{"t":1,"d":4,"p":121,"spm":25,"hr":140}');
    expect(JSON.stringify(rest)).toBe(
      '{"t":2,"d":8,"p":122,"spm":25,"hr":141,"r":true}',
    );
    // And the recorder's own output obeys the same rule: the sample it just
    // built from a rowing frame carries no `r` in its JSON.
    const rec = createSeriesRecorder();
    rec.onFrame({ /* a full rowing MonitorFrame, state: "rowing" */ });
    expect(JSON.stringify(rec.snapshot()!.samples[0]!)).not.toContain('"r"');
  });
```

**RF10: this describe block has no `frame()` helper in scope** (the two in this file are private to earlier describes), so the frame literal is written out in full — 15 fields, `state: "rowing"`, `heartRateBpm: 140`. Copy it from `scratchpad/patches/pr3-paste-tested.patch`.

- [ ] **Step 3: the compile gate**

Add `type Sample` to this file's `./seriesRecorder.js` import, then:

```ts
  it("refuses to compile a Sample built without spelling `r`", () => {
    // The compile-time half of the change, proved the repo's own way
    // (`useMonitorSession.test.ts`'s directive idiom): `@ts-expect-error` is
    // itself an error when the line below compiles, so this file stops
    // typechecking the moment `r` goes back to being optional.
    // @ts-expect-error `r` is a REQUIRED key valued `true | undefined`
    const missing: Sample = { t: 0, d: 0, p: 0, spm: 0 };
    expect(missing.r).toBeUndefined();
  });
```

**Both directions measured.** Delete the directive line → `src/monitor/seriesRecorder.test.ts(1136,11): error TS2741: Property 'r' is missing in type '{ t: number; d: number; p: number; spm: number; }' but required in type 'Sample'.` Restore the OLD shape (`readonly r?: true` in `types.ts`), keeping the directive → `src/monitor/seriesRecorder.test.ts(1136,5): error TS2578: Unused '@ts-expect-error' directive.` **That second one is the RF33 direction**: it is the compiler saying the omission compiles again.

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/monitor/seriesRecorder.test.ts` → measured **46 passed** (44 before).

- [ ] **Step 4: the seam test (RF24)**

**File: `app/server/routes/seriesSeam.test.ts`** — 268 lines, paste-tested verbatim at `scratchpad/patches/pr3-seriesSeam.test.ts`; the implementer copies that file and reads it. It is NOT `*.integration.test.ts` (that suffix routes to the Docker-only `integration` project) and needs no database. Precedent for the cross-tree import: `server/routes/data.test.ts:15` already imports `../../src/session/partialGateFixture.js` in this same `unit` project.

What it does, in order:

1. `framesFrom(capture)` — re-declared here (no test file in this tree imports another), decoding `walk-2026-08-16/session-2-wu-4unequal.jsonl` through the real `parseGeneralStatus` / `parseAdditionalStatus1`.
2. Drives the real `createSeriesRecorder` and takes `snapshot()`.
3. Computes the ORACLE on the client side, over the recorder's own objects, before anything is serialized: `deriveAverageHeartRate(series.samples)`.
4. POSTs that `SeriesData` to the real `/api/logs` (real `createDataRouter`, fake stores) — **D**.
5. Reads the row back through `stores.logs.get` and asserts the rest count survived — **C**.
6. Asserts the KEY UNION over every stored sample equals `SERIES_SAMPLE_FIELDS`, and the same union over what the recorder emitted — the only comparison in the repo that crosses `src/` → `server/`.
7. POSTs `/api/concept2/results/:id` (real `createConcept2Router`, stub `C2Client`) — **F** then **E** — and asserts `posted.heart_rate` equals `{ average: <the oracle> }`.

The load-bearing assertions, verbatim:

```ts
    const series = recordedSeries();
    const restCount = series.samples.filter((s) => s.r === true).length;
    expect(restCount).toBeGreaterThan(0);
    const expectedAverage = deriveAverageHeartRate(series.samples);
    expect(expectedAverage).not.toBeNull();
    /* … POST /api/logs … */
    const storedSeries = stored!.series as LogSeries;
    expect(storedSeries.samples).toHaveLength(series.samples.length);
    expect(storedSeries.samples.filter((s) => s.r === true)).toHaveLength(restCount);
    const keyUnion = (samples: readonly object[]) =>
      [...new Set(samples.flatMap((x) => Object.keys(x)))].sort();
    const expectedFields = [...SERIES_SAMPLE_FIELDS].sort();
    expect(keyUnion(storedSeries.samples)).toStrictEqual(expectedFields);
    expect(keyUnion(series.samples)).toStrictEqual(expectedFields);
    /* … POST /api/concept2/results/:id … */
    expect(posted.heart_rate).toStrictEqual({ average: expectedAverage });
```

**RF10, three corrections the paste-test forced:**
- The POST 400s with `{"error":"steps must be a non-empty array","field":"steps"}` on `steps: []` — the body carries one step.
- `stored.series` is `unknown` off `get` (the jsonb column has no `.$type<>()`), so the test names the store's own `LogSeries` in a cast — the same cast `toMappingRow` makes on the production path.
- `expect(x, "msg")` is a lint error here (`vitest/valid-expect`); do not add a message argument to get a better failure.

- [ ] **Step 5: the mutations — all three MEASURED, all three COMPILE**

Commit first (`git log -1`), then run each and revert (RF22).

**Mutation 1 — the flag does not survive F.** The spec prescribed "rename `r` in F's cast to `rest`". **That mutation cannot compile any more**, which is the point: `Pick<LogSeriesSample, "t"|"hr"|"r">` cannot spell a field the mirror does not have, and the renamed shape is no longer assignable to `HeartRateSample`. The compiling equivalent, in `toMappingRow`, strips the mark at exactly that site:

```ts
        ? {
            samples: (
              (row.series as { samples?: readonly LogSeriesSample[] }).samples ?? []
            ).map(({ t, hr }) => ({ t, hr, r: undefined })),
          }
```

Measured: `AssertionError: expected { average: 131 } to strictly equal { average: 129 }` — the rest samples are counted and the rower's logbook average moves by 2 bpm.

**Mutation 2 — drop `r` from the rebuild list.** In `data.ts`, `r: r === true ? true : undefined` → `r: undefined`. Measured: `AssertionError: expected [] to have a length of 21 but got +0`.

**Mutation 3 — drop a DIFFERENT field from the rebuild list**, which is what proves the witness↔rebuild-list link rather than the flag. Delete `...(hr !== undefined ? { hr } : {}),`. Measured: `AssertionError: expected [ 'd', 'p', 'r', 'spm', 't' ] to strictly equal [ 'd', 'hr', 'p', 'r', 'spm', 't' ]`.

---

### Task 6: The `EndedBy` rider (James, 2026-09-12)

**Files:** Modify `app/server/stores/logs.ts`, `app/server/routes/data.ts`; rewrite `app/server/db/schema.test.ts`.

- [ ] **Step 1: derive the type and the array**

```ts
export type EndedBy = (typeof endedByEnum.enumValues)[number];

/** The same six values as a runtime array, for the route's own bounds check
 *  and for the message it prints when that check refuses. Exported from here
 *  rather than re-typed in `routes/data.ts`: that file already imports
 *  `EndedBy` from this module and does not import `db/schema.js` at all, so
 *  this adds no import edge into the schema for the route layer. */
export const ENDED_BY_VALUES = endedByEnum.enumValues;
```

Replace the "HAND-COPIED literal union" comment with one saying the four copies (pgEnum, this union, `ENDED_BY_VALUES`, and the prose inside the route's error message) are now one, and that `PARTIAL_ENDED_BY`'s `satisfies` clause a few hundred lines below is the in-file precedent that this compiles.

- [ ] **Step 2: `data.ts` — delete the array, import it, derive the prose**

Delete the local `const ENDED_BY_VALUES: EndedBy[] = [...]` and its comment; add `ENDED_BY_VALUES` to the existing value import from `../stores/logs.js`. Then the FOURTH copy — the error message:

```ts
    // The value list is DERIVED (Phase MD PR 3), not typed out: this prose
    // was the fourth hand-copy of the enum and could go stale without any
    // gate noticing. `data.test.ts` keeps the full string as an INDEPENDENT
    // literal, which is what pins the wording.
    return `endedBy must be one of ${ENDED_BY_VALUES.join("|")} or null`;
```

`data.test.ts`'s literal assertion on that string is UNCHANGED and is the pin. Measured: `pnpm test --project unit` green with no edit to `data.test.ts`.

- [ ] **Step 3: delete the tautological `EXHAUSTIVE` test**

`schema.test.ts`'s `Record<EndedBy, true>` pin cannot go red once `EndedBy` derives from `endedByEnum` — the two sides are the same expression (RF21). Delete it, keep the file, and replace it with a pin that CAN fail: `expect([...endedByEnum.enumValues]).toStrictEqual([six independent literals])`.

The comment above it states the honest residue, which the spec's §4 required and the ROADMAP row got wrong: what still gates the value set is `endedBy.integration.test.ts` (real Postgres round-trip) plus `data.test.ts`'s POST loop over six independent literals — **and that loop catches a member REMOVED from the enum (the POST 400s), while a member ADDED widens the route automatically and leaves the loop green.**

The reason goes in the COMMIT MESSAGE too, checked against the diff before it is written (RF36).

---

### Task 7: Bookkeeping, the exit criteria, the full gate, the PR

- [ ] **Step 1: ROADMAP**

1. `## Phase MD` PR 3 row: tick `- [x]` and append **LANDED as PR #\<n\>**, plus the corrections this work made to the row's own claims (RF10): SIX declarations, not five — the sixth, `server/routes/concept2.ts`, is UPSTREAM of the mapping; `+19.1%` belongs to `r: null`, which this PR does not write (a required KEY with an `undefined` value is ZERO bytes, measured on four serializers); the promised `createSeriesRecorder`-driven test already existed on the CLIENT (`derivedHeartRate.replay.test.ts`) and the one that was missing is the SERVER seam.
2. `## Codebase-audit owners`, the `EndedBy` row: mark **DONE — landed in Phase MD PR 3 (#\<n\>)**, and correct its two errors: there were FOUR mirrors, not three (the error-message prose), and the gate it named ("the POST seam test") was not the gate — `schema.test.ts`'s `EXHAUSTIVE` was, and this PR deletes it as tautological. **Campsite rule: that row carries no `dies` date; give it one on the way past.**
3. Add the phase-exit grep to the Phase MD section, as Task 7 Step 2 states it.
4. Propose ONE new row (hand-back, below): the fake logs store keeps `undefined`-valued keys that a jsonb column drops, so the contract suite cannot see that difference — Task 4 papered over it on both sides rather than fixing the fake.

- [ ] **Step 2: the exit criteria, each run on main FIRST (RF21 — a criterion that is green before the work proves nothing)**

| # | Command (from `app/`) | On main `3fc49767` | After |
| --- | --- | --- | --- |
| 1 | `grep -rnE '(^\|[^a-zA-Z])r\??: true' src domain server --include='*.ts' --include='*.tsx' \| grep -v '\.test\.' \| wc -l` | **7** | **4** |
| 2 | `git status --short app/src/monitor/fixtures/monitorRun-bytes` | empty | **empty** |
| 2b | `pnpm exec vitest run --project client src/monitor/handoffStoreBytes.test.ts` | 20 pass | **20 pass** |
| 5a | `grep -n 'export type EndedBy' server/stores/logs.ts` | `export type EndedBy =` (union, prettier-wrapped) | `= (typeof endedByEnum.enumValues)[number];` |
| 5b | `grep -c '"finished"' server/stores/logs.ts server/routes/data.ts` | `2` / `1` | **`1` / `0`** (the surviving hit is prose inside an unrelated comment) |

**RF10 — criterion 1's "after: 3" is wrong, and so is its composition.** Measured after: **4** — `domain/monitor/types.ts` (the declaration), `server/stores/logs.ts` (the mirror), `server/stores/logs.ts` again (`r: true` inside the exhaustiveness witness), and `src/monitor/fixtures/monitorRunShapes.ts` (PR 1's hand-authored rest sample). **The producer line drops OUT of this grep**, because `r: f.state === "resting" ? true : undefined` does not match the pattern. Print the four lines in the PR body rather than only the count, so the criterion cannot drift into being about a number.

Criteria 3 and 4 are Task 5's mutations, already measured. Criterion 7 is the PR body's first sentence.

- [ ] **Step 3: the full gate (RF1 — this diff touches `app/src/`)**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test                    # all three projects; integration needs Docker
pnpm test:coverage           # per-file rows for every file touched (RF2)
pnpm e2e                     # full suite locally; READ the result, then read the e2e job on the PR
git status --short docs/screenshots   # must be EMPTY
```

**Measured:** `unit` 69 files / 2167 pass + 1 skip; `client` 222 files / 5949 pass; `integration` 25 files / 402 pass. **Note for the runner:** one full-integration run showed `contracts.real.integration.test.ts` failing at SUITE level (a container-startup error, not an assertion) and passed on the next full run and every scoped run. Exit code was 0 both times, so it is not RF40; if it recurs, capture the suite-level error before re-running. `pnpm e2e` was NOT run by the plan author — `e2e/seriesStorage.spec.ts` and `e2e/connected.spec.ts` are the named specs.

- [ ] **Step 4: the PR**

`gh pr create` from `phase-md-pr3`. Line one: "This PR makes the series sample one declaration per tree, so the next rename of the rest flag is a compile error instead of a silently wrong number in a rower's logbook." Then ≤6 bullets: six declarations → three; zero bytes changed and the byte gate proves it with its original fixtures; the one seam no compiler can cross now has a test that starts at the recorder; three mirrors of `endedBy` became one and a tautological test was deleted; tester impact = none; how to try it = nothing to try.

Then a collapsed `<details>` "Record (for agents and audits)" carrying: the exit-criteria table with its before/after column; all three seam mutations with their verbatim failure text and both compile-gate directions; the five `toStrictEqual` sites Task 4 found and why the fake hid three of them; every RF10 deviation named in this plan; the per-file coverage rows; the e2e run URL and conclusion.

Then the hand-back, in ONE message, and STOP: **Proposed to add** (the fake-store jsonb-fidelity row, with its `dies` date and its why-not-now clause) and **Now overdue** (`grep -n 'dies 2026' ROADMAP.md`, oldest first, re-checked on the day).

---

## Self-review (done by the author before /harden)

- **Spec coverage.** §3 invariants 1-5 → Tasks 1+3 (1), Task 2 Step 2 + Task 7 criterion 2 (2), Tasks 1-3 + Task 5 (3), Task 5 Step 4 (4), untouched validator predicates in Task 3 Step 2 (5). §4's seven bullets → Tasks 1, 2, 3, 6. §5's four tests → Task 5 (all four). §6's seven criteria → Task 7 Step 2, with criterion 1 corrected. §7's deviations → Task 7 Step 1's ROADMAP text.
- **Six blocks changed under paste-test, all recorded inline as RF10:** the `HeartRateSample` unit comment's new home; the validator rebuild's spread form (the spec's two `if`s cannot compile); the seam test's `steps` array, its `LogSeries` cast and its lint-forbidden message argument; the byte test's inline frame literal; exit criterion 1's after-count and composition; and Task 4 in its entirety, which the spec does not contain.
- **The one thing a reviewer should probe hardest:** Task 4 wraps BOTH sides of three store-contract assertions, which makes an `undefined`-valued key invisible to them. That is defensible only because every consumer downstream of the store re-serializes — if a reviewer can name a consumer that reads a stored sample object WITHOUT a serializer in between, Task 4 is wrong and the fake must be fixed instead.
- **Placeholders:** the seam test and `asSerialized.ts` are handed as files (`scratchpad/patches/`), not reprinted — 288 lines whose transcription is where an error would hide. The full paste-tested diff is `scratchpad/patches/pr3-paste-tested.patch`.
- **Type consistency:** `Sample`, `SeriesData`, `HeartRateSample`, `LogSeriesSample`, `SERIES_SAMPLE_FIELDS`, `ENDED_BY_VALUES`, `asSerialized` are used with the same names and signatures in every task that names them.
