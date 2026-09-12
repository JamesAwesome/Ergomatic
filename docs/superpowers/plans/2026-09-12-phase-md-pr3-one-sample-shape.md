# Phase MD PR 3 — One `Sample` Shape: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Revision 2 (harden lens 1).** Six findings folded. The largest: **the server no longer hand-copies the shape at all.** `logs.ts`'s "server code never imports from `src/`" reason stopped covering this case the moment `Sample` moved to `domain/`, so `LogSeriesSample`/`LogSeries` become `-readonly` mapped types of `Sample`/`SeriesData` and six declarations become **TWO** (Task 3 Step 1). The fake logs store is fixed rather than worked around (Task 4). The `hr` spread keeps a new reason and loses a false one (Task 3 Step 2). The seam test gains a divergence pin (Task 5 Step 4). `schema.test.ts`'s replacement pin is stated honestly (Task 6 Step 3). The three artifacts now live in the repo (Task 5 Step 4, Task 4 Step 1).

**Goal:** the series sample is declared ONCE, in the domain. `domain/monitor/types.ts` owns `Sample`/`SeriesData`; every other type that names `t`/`d`/`p`/`spm`/`hr`/`r` — the recorder's re-export, the domain's heart-rate input, the server store's two types, and the two Concept2 sites — derives from it. The rest flag `r` becomes a REQUIRED key valued `true | undefined`, so a sample built without spelling it is a compile error — and zero bytes change on disk or on the wire.

**Architecture:** SIX declarations become TWO, and neither is a copy. `Sample`/`SeriesData` move into `domain/monitor/types.ts` (NOT a new `series.ts` — ruled); `seriesRecorder.ts` re-exports both and writes `r: f.state === "resting" ? true : undefined`. `HeartRateSample` = `Pick<Sample, "t" | "hr" | "r">`. `server/stores/logs.ts`'s `LogSeriesSample`/`LogSeries` become `-readonly` mapped types of the same pair — `tsconfig.server.json` already includes `domain`, server modules already import from it, and `server/concept2/mapping.ts` already imports `deriveAverageHeartRate` from the very module whose input is a `Pick` of this shape, so the compiler edge exists today. The two Concept2 sites are `Pick`s of the store's type. What stays the server's own is the BOUNDS, not the shape. The chain the compiler still cannot check — a field the validator's rebuild list quietly drops, a value that fails to survive the POST — gets the RF24 test it has never had: the real recorder's output, across the real POST, to the real Concept2 payload.

**Tech Stack:** React 19 + Vite, TypeScript, Vitest (`unit` = node, `client` = jsdom, `integration` = Docker Postgres), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-09-12-one-sample-shape-design.md` revision 3. Census: `docs/superpowers/audits/2026-09-12-architecture-walk/pr3-census.md`.

**Artifacts (paste-tested, committed with this plan):** `docs/superpowers/plans/2026-09-12-phase-md-pr3-artifacts/` — `seriesSeam.test.ts`, `asSerialized.ts`, `paste-tested.patch`. The implementer copies the first two to their real paths; the patch is the whole paste-tested tree, for reference when a block below is ambiguous.

**Baseline:** every number and every failure message below was MEASURED by the plan author in a throwaway worktree at `3fc49767` (main, `#409`), run from `app/`, and RE-MEASURED after revision 2's changes. Every code block below was pasted to its real path there and taken through `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and the named vitest files. Blocks that changed under that test are recorded inline as **RF10**. A number here without a command beside it is a plan defect.

**TRIAD: stored shape.** Full antagonist pass is folded into spec rev 2 and harden lens 1 into rev 3; `/harden` runs on THIS plan (two passes max) before Task 1; PM final-PR gate on the PR.

---

## Global Constraints

- **No behaviour change a rower can see. No screenshot is committed** (no screen's layout changes; RF-"no screenshots for copy").
- **Invariants, not mechanisms** (spec §3): (1) one spelling per tree, derived not copied; (2) THE BYTES ARE UNCHANGED — gated by PR 1's `handoffStoreBytes.test.ts`, which stays green with its captured fixtures UNTOUCHED; (3) a rest sample is a rest sample at every consumer, and an omitted flag is a compile error; (4) the server mirror is gated by a test that starts at the recorder; (5) `r: null` and `r: false` stay refused at the validator (400, `"r must be true or absent"`).
- **If this PR needs to regenerate a byte fixture it has broken invariant 2.** `git status --short app/src/monitor/fixtures/monitorRun-bytes` must stay EMPTY through every task. (`monitorRunShapes.ts` — the fixture INPUT — is modified on purpose in Task 2; its output is byte-identical, measured.)
- **`src/` is still off-limits to server code; `domain/` never was.** `tsconfig.server.json`'s `include` is `["server", "domain", "src/vite-env.d.ts"]` and `grep -rl 'domain/' server --include='*.ts' | wc -l` → **28**. That is the whole basis for Task 3 Step 1, and it is why the ROADMAP row's caveat ("the spec must engage `stores/logs.ts:120-127`") is answered by DELETING that comment's reason rather than honouring it. `LogStep` beside it keeps the old reason and stays a hand-written mirror — its twin is `logDraft.ts`, which IS in `src/`.
- **`exactOptionalPropertyTypes` is set in none of the repo's tsconfigs**, which is what makes a required key valued `true | undefined` accept an explicit `undefined` and reject an omitted one. If anyone enables it this design inverts. Do not enable it here.
- **Every new assertion gets a mutation that makes it fail**, and the task report states what was mutated and what the failure said (RF21). **Commit before every probe** and confirm with `git log -1` (RF22); a probe's revert must be a no-op against a clean file. A mutation must COMPILE (RF12 corollary) — three of the mutations below exist in the shape they do BECAUSE the required key makes the obvious rename uncompilable.
- **Test invocation:** `pnpm test --project client -- <pattern>` silently runs the whole suite. For one file: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project <p> <file>` (collapses signal deaths to exit 1 — RF40; never re-run a run showing exit ≥128 or `Allocation failed`). Read BOTH summary lines.
- **Run `git rev-parse --show-toplevel` before every commit** and confirm it prints your worktree path. Every subagent reads `.claude/agent-briefing.md` first. Never merge, never remove the worktree.
- **PM5 in copy:** nothing here touches copy. Comments are not copy.
- **Key ORDER in the stored JSON is not load-bearing and no comment may claim it is.** Postgres normalizes jsonb keys by length then bytewise on ingest — measured on 18.4: `'{"t":1,"d":4,"p":121,"spm":25,"hr":140}'::jsonb` reads back `{"d": 4, "p": 121, "t": 1, "hr": 140, "spm": 25}`. The phrase "re-serializes to the bytes the client sent" appears nowhere in this PR.
- **Anything with a life after merge goes in `ROADMAP.md` at the moment it is found** (RF14), stamped `· dies YYYY-MM-DD · <why a row>`.

## Names this plan fixes (every task uses exactly these)

| Symbol | After this PR | Module |
| --- | --- | --- |
| `Sample` (with `readonly r: true \| undefined`), `SeriesData` | DECLARED here | `app/domain/monitor/types.ts` |
| `Sample`, `SeriesData` | RE-EXPORTED (`export type { Sample, SeriesData }`) — all importers keep their path | `app/src/monitor/seriesRecorder.ts` |
| `HeartRateSample` | `Pick<Sample, "t" \| "hr" \| "r">` | `app/domain/monitor/derivedHeartRate.ts` |
| `LogSeriesSample`, `LogSeries` | `{ -readonly [K in keyof Sample]: Sample[K] }` and the same over `SeriesData` — DERIVED, not mirrored | `app/server/stores/logs.ts` |
| `SERIES_SAMPLE_FIELDS: string[]` | new export — `Object.keys({…} satisfies Record<keyof LogSeriesSample, true>)` | `app/server/stores/logs.ts` |
| `SessionLogRow.series.samples` | `readonly Pick<LogSeriesSample, "t" \| "hr" \| "r">[]` | `app/server/concept2/mapping.ts` |
| `toMappingRow`'s series cast | the same `Pick`, not an inline literal | `app/server/routes/concept2.ts` |
| `EndedBy` | `(typeof endedByEnum.enumValues)[number]` | `app/server/stores/logs.ts` |
| `ENDED_BY_VALUES` | new export — `endedByEnum.enumValues`; `data.ts` imports it | `app/server/stores/logs.ts` |
| `asSerialized<T>(value: T): T` | new test helper (`JSON.parse(JSON.stringify(v))`) | `app/src/test/asSerialized.ts` (new) |
| `asStored` | REJECTED as a second name for the same idea; `storeContracts.ts` declares its own `asSerialized` because server code never imports from `src/` | — |
| the fake logs store's `create` | round-trips `series` through JSON, the way the jsonb column does | `app/server/testing/fakes.ts` |

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

After Task 1 lands the required key, `pnpm typecheck` prints every construction site that omits `r`. Do not pre-enumerate them: work the list the compiler gives, then re-run until it is empty. **Measured, for a sanity check only:** the first pass listed sites in `src/justrow/totals.test.ts`, `src/log/FromTheLog.test.tsx`, `src/log/storedSummary.test.ts`, `src/log/traceModel.test.ts`, `src/monitor/fixtures/monitorRunShapes.ts`, `src/monitor/handoffStore.test.ts`, `src/monitor/monitorRun.test.ts`, `src/session/LogSession.test.tsx`, `src/session/PostWorkoutSummary.test.tsx`; later passes added `src/monitor/derivedHeartRate.replay.test.ts`, `server/concept2/mapping.test.ts`, `server/routes/concept2.test.ts`, `server/stores/contracts/storeContracts.ts`. **`tsc -b` stops at the first failing project, so the list arrives in waves — an empty run is the only proof you are done.** The whole edit is **24 files changed, +488/−237** including the two new files (revision 2 figure — `server/testing/fakes.ts` joined at Task 4).

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
// The SERVER derives from here too: `server/stores/logs.ts`'s
// `LogSeriesSample`/`LogSeries` are `-readonly` mapped types of this pair,
// which the old "server code never imports from `src/`" rule permits
// because this file is `domain/`, not `src/` — `tsconfig.server.json`
// includes `domain` and server modules already import from it. What the
// server still owns alone is the BOUNDS: `routes/data.ts`'s validator is
// the trust boundary for an untrusted POST body, and sharing the shape does
// not share the bands. `server/routes/seriesSeam.test.ts` is the RUNTIME
// gate over that chain (validator, store, mapping).

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

  **That test's own title has to change with it (harden lens 1).** It reads *"excludes the rest the RECORDER marked, without this test naming the field"* — and after these edits the file writes `r` three times, so the title is false. Rename it to **"excludes the rest the RECORDER marked"** and replace the comment above the strip with one that says what the leg still proves: a rename is now caught by the COMPILER (`HeartRateSample` is a `Pick` of the recorder's own `Sample`), so what is left for this leg is that the exclusion RUNS over real recorder output. Measured after the rename: `derivedHeartRate.replay.test.ts` 9 passed.

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

### Task 3: The server tree — the shape DERIVES, the bounds stay

**Files:** Modify `app/server/stores/logs.ts`, `app/server/routes/data.ts`, `app/server/concept2/mapping.ts`, `app/server/routes/concept2.ts`, plus `mapping.test.ts` / `concept2.test.ts` literals the compiler names.

- [ ] **Step 1: the server DERIVES the shape, and keeps the witness**

**RF10 / harden lens 1 — this replaces revision 1's "C keeps its hand-written mirror".** The spec's reason for the mirror was `logs.ts`'s own comment: *"Server code never imports from `src/` (the client tree)"*. Task 1 moved `Sample` OUT of `src/`, so that sentence stops reaching this case — and keeping a hand-copy beside a compiler edge that already exists is the RF33 defect this PR exists to close.

Add to `logs.ts`'s imports:

```ts
import type {
  Sample,
  SeriesData,
} from "../../domain/monitor/types.js";
```

Replace the `LogSeriesSample`/`LogSeries` interfaces with:

```ts
export type LogSeriesSample = { -readonly [K in keyof Sample]: Sample[K] };
// `SeriesData`'s own two fields are already mutable, so this mapped type is
// an alias in practice and `LogSeries["samples"]` is `Sample[]` — a stored
// sample's FIELDS stay `readonly`, which nothing on this path assigns to.
// Written as the mapping anyway so the two derivations read alike and a
// later `readonly` on `SeriesData` needs no edit here.
export type LogSeries = { -readonly [K in keyof SeriesData]: SeriesData[K] };
```

Rewrite the comment above them. It must say, in this order: the block used to be a hand-written copy and its stated reason no longer reaches this case; the evidence (`tsconfig.server.json` includes `domain`; `grep -rl 'domain/' server --include='*.ts' | wc -l` → 28; `server/concept2/mapping.ts` already imports `deriveAverageHeartRate` from the module whose input is a `Pick` of this shape); that a renamed field must be a compile error on BOTH sides and a copy cannot do that (RF33); that what the server still owns alone is the BOUNDS, and `validateSeries` is the trust boundary, and sharing the shape does not share the bands; and that `LogStep` above is still an independent own-bounds mirror because ITS twin (`logDraft.ts`) really is in `src/`. Verbatim in `docs/superpowers/plans/2026-09-12-phase-md-pr3-artifacts/paste-tested.patch`.

Keep `SERIES_SAMPLE_FIELDS` exactly as spec §4 prescribes — it now gates the validator's rebuild list against the DOMAIN's shape, which is strictly more than it gated before. Its comment says what the seam test actually compares:

```
 *  `server/routes/seriesSeam.test.ts` is what turns this array into a
 *  runtime assertion: it compares it against the KEY UNION over every sample
 *  the real recorder produced AND over every sample the real validator
 *  rebuilt on the far side of a real POST. The union, not a single sample —
 *  `hr` and `r` are absent from most samples individually, so only the union
 *  can see a field the list dropped.
```

**Mutation (run it):** delete `r: true,` from the witness literal. Measured: `server/stores/logs.ts(172,3): error TS1360: Type '{ t: true; d: true; p: true; spm: true; hr: true; }' does not satisfy the expected type 'Record<keyof LogSeriesSample, true>'.`

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

Extend the existing "explicit field list" comment to say three things. (1) This is the list that drops a field SILENTLY — a field added to the domain's `Sample` and not added here never reaches the column, and no band check would be missing to notice; `SERIES_SAMPLE_FIELDS` asserted in `seriesSeam.test.ts` is what makes that red. (2) **`hr` is SPREAD rather than assigned, and that is load-bearing: the spread leaves the key genuinely ABSENT in memory when there is no reading, which is what keeps every `toStrictEqual` comparing a stored sample against a hand-built one honest. `r` cannot do the same — it is a required key, and its present-but-undefined value is exactly what the compile gate buys.** (3) Key ORDER is NOT load-bearing: Postgres normalizes jsonb keys by length then bytewise on ingest (measured on 18.4 — the Global Constraints carry the reading), so no ordering here survives the column. **The six per-field predicates, their order and their pinned messages are UNCHANGED.**

**RF10 ×2:** the spec said the rebuild keeps its two post-assignment `if`s — it cannot, a required key must be present at construction. And revision 1 of this plan justified the spread by byte order, which the jsonb measurement falsifies; the spread is right for a different reason, stated above (harden lens 1).

- [ ] **Step 3: the stale `SERIES_SPM_MAX` comment (census §0.5)**

The comment above `const SERIES_SPM_MAX = 255;` says the recorder "stores it unbanded" — falsified by RC-6 (`seriesRecorder.ts` collapses anything outside 10..60 to `0`). Replace the falsified half; keep 255 with its honest reason (the wire byte is a u8) and say plainly that this is a trust boundary, not a mirror of the producer, and that the previous wording was corrected here.

- [ ] **Step 4: E and F derive**

`mapping.ts` — widen its `stores/logs.js` type import to `{ LogSeriesSample, LogStep }` and replace the inline literal:

```ts
  series?: {
    samples?: readonly Pick<LogSeriesSample, "t" | "hr" | "r">[];
  } | null;
```

Comment: derived since PR 3; it was a hand-spelled inline literal and a rename of `r` here would have silently stopped excluding rest from a rower's logbook heart-rate (RF33 one layer up). The `Pick` now reaches the DOMAIN's shape through the store's mapped type, so the whole chain producer → store → mapping is one declaration. `samples` stays optional and `truncated` stays absent — neither is read on this path.

`concept2.ts` — same import widening, same `Pick` inside `toMappingRow`'s cast, plus one sentence saying this cast is UPSTREAM of `mapping.ts`'s row, so a rename that fixed that one and not this one would still have broken the exclusion silently.

- [ ] **Step 5: the server test literals the compiler names, and gates**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test --project unit
```

---

### Task 4: The fake store learns that jsonb is a serializer

**RF10 — THIS TASK IS NOT IN THE SPEC, and it is the largest thing the paste-test found.** The spec's §1 records that `Object.keys`, `"r" in s` and `toStrictEqual` all distinguish present-undefined from absent, and then swept only for `Object.keys`. Measured after Tasks 1-3: **5 client tests and 3 real-Postgres store-contract cases fail**, every one a `toStrictEqual`/`toMatchObject` comparing an in-memory series (now carrying `r: undefined`) against the same series after a trip through `localStorage`, a POST body, or a jsonb column.

**The three contract cases passed against the in-memory fake and failed only against real Postgres** — the one thing a contract suite must not do. Revision 1 of this plan wrapped BOTH sides and left the fake alone; harden lens 1 ruled that wrong. **The fake is fixed here**, and the helper wraps the EXPECTED side only, so these cases keep their ability to see a backend returning a key the column cannot hold.

**Files:** Create `app/src/test/asSerialized.ts`; modify `app/server/testing/fakes.ts`, `app/server/stores/contracts/storeContracts.ts` (3 assertions), `app/src/monitor/handoffStore.test.ts`, `app/src/session/LogSession.test.tsx` (3 assertions), `app/src/workout/WorkoutDetail.postReleaseCommit.test.tsx`.

- [ ] **Step 1: the helper** — copy `docs/superpowers/plans/2026-09-12-phase-md-pr3-artifacts/asSerialized.ts` to `app/src/test/asSerialized.ts`. `src/test/**` is excluded from coverage (`vitest.config.ts`), so it adds no coverage burden.

```ts
export function asSerialized<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
```

Its doc comment states: why the in-memory and serialized sides differ; that `toEqual` does NOT distinguish them but `toStrictEqual` does; that you wrap the IN-MEMORY side; that a missing field, a changed number and a renamed key all still red, and only an `undefined`-valued key becomes invisible. **And the one place it must never go:** `handoffStoreBytes.test.ts` compares STRINGS against captured bytes, so it is already immune to the distinction, and a JSON round-trip near it would be a way to make a byte assertion stop being about bytes.

- [ ] **Step 2: the fake logs store round-trips `series`**

In `fakes.ts`'s logs `create`, destructure `series` out alongside `advancesPlan` and rebuild `stored`:

```ts
      const { advancesPlan, series: rawSeries, ...rest } = input;
      // jsonb IS a serializer, and this fake stands in for the column. Phase
      // MD PR 3 made `Sample.r` a required key whose value may be
      // `undefined`; `JSON.stringify` drops such a key, so real Postgres
      // hands back a sample with no `r` while this fake, keeping the object
      // it was handed, handed back one WITH it. Three store-contract cases
      // passed here and failed against real Postgres because of it, which is
      // the one thing a contract suite must not do. Round-trip `series` so
      // both backends agree.
      //
      // `steps` and `machineSummary` are jsonb too and are deliberately NOT
      // round-tripped: nothing writes an undefined-valued key into either
      // today, so the infidelity is unobservable, and widening this to every
      // jsonb column is a change with no failing case behind it. The
      // ROADMAP carries the row.
      const stored = {
        ...rest,
        series:
          rawSeries === undefined
            ? undefined
            : (JSON.parse(JSON.stringify(rawSeries)) as LogSeries | null),
      };
```

Add `type LogSeries` to this file's existing `../stores/logs.js` import.

- [ ] **Step 3: `storeContracts.ts` — EXPECTED side only**

Declare `asSerialized` beside `NON_EXISTENT_UUID` (server code never imports from `src/`; the duplication is deliberate and the comment names the client copy). Its comment says: wrap the EXPECTED side ONLY, because the ACTUAL side is what the backend handed back and must be compared as it is, or these cases stop being able to see a backend returning a key the column cannot hold — which is precisely what the fake was doing until Step 2.

```ts
expect(row).toMatchObject({ series: asSerialized(series) });   // "get still returns the full row"
expect(row!.series).toStrictEqual(asSerialized(series));       // ×2, the two round-trip cases
```

- [ ] **Step 4: the five client assertions** — wrap the in-memory side:

```
handoffStore.test.ts           expect(store.loadMonitorRun()!.series).toStrictEqual(asSerialized(SERIES));
LogSession.test.tsx  ×3        expect(body.series).toStrictEqual(asSerialized(series));   (and bodies[0], bodies[1])
WorkoutDetail.postReleaseCommit.test.tsx
                               expect(body.series).toStrictEqual(asSerialized(atRelease!.run.series));
```

- [ ] **Step 5: prove the fake fix is load-bearing (red-then-green), then gate**

Commit Steps 1/3/4 WITHOUT Step 2 (or revert Step 2's three lines after committing — RF22, the file is clean either way), and run the fake contract suite. **Measured: `2 failed | 128 passed`**, both `toStrictEqual` cases, and the diff names the cause on the RECEIVED side:

```
AssertionError: expected { …(2) } to strictly equal { …(2) }
+       "r": undefined,
AssertionError: expected { samples: [ …(14400) ], …(1) } to strictly equal { samples: [ …(14400) ], …(1) }
+       "r": undefined,
```

(The `toMatchObject` case stays green: it ignores keys the expectation does not name. Say so in the report rather than claiming three.)

Restore Step 2 and run all three legs:

```bash
pnpm typecheck && pnpm lint && pnpm format:check
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit server/stores/contracts/contracts.fake.test.ts
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project integration server/stores/contracts/contracts.real.integration.test.ts
pnpm test --project client
```

**Measured, all green:** fake 130 pass · real Postgres 132 pass · client 222 files / 5949 tests.

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

**RF10: this describe block has no `frame()` helper in scope** (the two in this file are private to earlier describes), so the frame literal is written out in full — 15 fields, `state: "rowing"`, `heartRateBpm: 140`. Copy it from `docs/superpowers/plans/2026-09-12-phase-md-pr3-artifacts/paste-tested.patch`.

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

**File: `app/server/routes/seriesSeam.test.ts`** — 278 lines, paste-tested verbatim at `docs/superpowers/plans/2026-09-12-phase-md-pr3-artifacts/seriesSeam.test.ts`; the implementer copies that file to its real path and reads it. It is NOT `*.integration.test.ts` (that suffix routes to the Docker-only `integration` project) and needs no database. Precedent for the cross-tree import — this file DOES reach into `src/`, for the recorder itself: `server/routes/data.test.ts:15` already imports `../../src/session/partialGateFixture.js` in this same `unit` project.

**Its header does not say the compiler cannot cross this seam** (harden lens 1): after Task 3 the compiler DOES cross it and catches a renamed field. What it cannot catch is a field the validator's rebuild list quietly drops, or a value that fails to survive the POST — and that is what this file is the runtime gate for.

What it does, in order:

1. `framesFrom(capture)` — re-declared here (no test file in this tree imports another), decoding `walk-2026-08-16/session-2-wu-4unequal.jsonl` through the real `parseGeneralStatus` / `parseAdditionalStatus1`.
2. Drives the real `createSeriesRecorder` and takes `snapshot()`.
3. Computes the ORACLE on the client side, over the recorder's own objects, before anything is serialized: `deriveAverageHeartRate(series.samples)` — **and pins that the rests MATTER on this capture**, so a mutation that drops `r` cannot land on the same average by luck and leave the oracle agreeing with a broken seam.
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
    const restIncluded = deriveAverageHeartRate(
      series.samples.map((s) => ({ t: s.t, hr: s.hr, r: undefined })),
    );
    expect(restIncluded).not.toBe(expectedAverage);
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

Commit first (`git log -1`), then run each and revert (RF22). **All three were re-measured against revision 2's tree** (derived server types, honest fake, divergence pin).

**Mutation 1 — the flag does not survive F.** The spec prescribed "rename `r` in F's cast to `rest`". **That mutation cannot compile any more**, which is the point: `Pick<LogSeriesSample, "t"|"hr"|"r">` cannot spell a field the shape does not have, and the renamed shape is no longer assignable to `HeartRateSample`. The compiling equivalent, in `toMappingRow`, strips the mark at exactly that site:

```ts
        ? {
            samples: (
              (row.series as { samples?: readonly LogSeriesSample[] })
                .samples ?? []
            ).map(({ t, hr }) => ({ t, hr, r: undefined })),
          }
```

Measured: `AssertionError: expected { average: 131 } to strictly equal { average: 129 }` — the rest samples are counted and the rower's logbook average moves by 2 bpm. (131 is also what the divergence pin computes, which is the pin doing its job.)

**Mutation 2 — drop `r` from the rebuild list.** In `data.ts`, `r: r === true ? true : undefined` → `r: undefined`. Measured: `AssertionError: expected [] to have a length of 21 but got +0` (the rest-count assertion, which runs first). **With the honest fake it reds a SECOND, independent assertion** — measured by relaxing the rest-count line for one diagnostic run: `AssertionError: expected [ 'd', 'hr', 'p', 'spm', 't' ] to strictly equal [ 'd', 'hr', 'p', 'r', 'spm', 't' ]`. Against revision 1's fake, which kept `r: undefined`, that key-union assertion stayed green — so Task 4 Step 2 strengthens this gate as well as fixing the contract suite. Report BOTH.

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

- [ ] **Step 3: replace the tautological `EXHAUSTIVE` test**

`schema.test.ts`'s `Record<EndedBy, true>` pin cannot go red once `EndedBy` derives from `endedByEnum` — the two sides are the same expression (RF21). Delete it, **drop the now-unused `import type { EndedBy } from "../stores/logs.js"` at the top** (`noUnusedLocals` errors otherwise, measured: `error TS6133: 'EndedBy' is declared but its value is never read`), keep the file, and replace the pin with one that CAN fail:

```ts
describe("endedByEnum (server/db/schema.ts) is the one source for ended_by", () => {
  it("carries exactly these six values, pinned by independent literals", () => {
    expect([...endedByEnum.enumValues]).toStrictEqual([
      "finished", "rower", "link-lost",
      "program-failed", "program-dropped", "interrupted",
    ]);
  });
});
```

The file header names the replacement rather than only the deletion, and states the residue HONESTLY (harden lens 1 corrected revision 1 here):

- the new pin's literals are owned by nothing else, so a member **ADDED** to the pgEnum reds it, and so does one removed or renamed — it is strictly stronger than the pin it replaces in the direction that matters;
- what it deliberately does NOT do is tie the DB to a TS type, because there is no longer a type to tie it to;
- `endedBy.integration.test.ts` round-trips each value through real Postgres;
- **`data.test.ts`'s POST loop is the one that stays GREEN on a member added** (an added member widens the route automatically); it catches only a member removed.

The reason goes in the COMMIT MESSAGE too, checked against the diff before it is written (RF36). Measured: `schema.test.ts` 1 passed, `pnpm typecheck` clean.

---

### Task 7: Bookkeeping, the exit criteria, the full gate, the PR

- [ ] **Step 1: ROADMAP**

1. `## Phase MD` PR 3 row: tick `- [x]` and append **LANDED as PR #\<n\>**, plus the corrections this work made to the row's own claims (RF10): SIX declarations, not five — the sixth, `server/routes/concept2.ts`, is UPSTREAM of the mapping; `+19.1%` belongs to `r: null`, which this PR does not write (a required KEY with an `undefined` value is ZERO bytes, measured on four serializers); the promised `createSeriesRecorder`-driven test already existed on the CLIENT (`derivedHeartRate.replay.test.ts`) and the one that was missing is the SERVER seam. **And the row's own caveat is answered, not honoured:** it required the spec to engage `stores/logs.ts:120-127`'s "deliberate mirror" comment, and the answer is that that comment's REASON ("server code never imports from `src/`") stopped covering this case the moment `Sample` moved to `domain/` — so the mirror is gone and six declarations became two.
2. `## Codebase-audit owners`, the `EndedBy` row: mark **DONE — landed in Phase MD PR 3 (#\<n\>)**, and correct its two errors: there were FOUR mirrors, not three (the error-message prose), and the gate it named ("the POST seam test") was not the gate — `schema.test.ts`'s `EXHAUSTIVE` was, and this PR deletes it as tautological. **Campsite rule: that row carries no `dies` date; give it one on the way past.**
3. Add the phase-exit grep to the Phase MD section, as Task 7 Step 2 states it.
4. Propose ONE new row (hand-back, below): **the fake logs store's OTHER jsonb columns keep the infidelity.** Task 4 taught `create` to round-trip `series` the way the column does; `steps` and `machineSummary` are jsonb too and are not round-tripped · **dies 2026-11-14** · nothing writes an undefined-valued key into either today, so the infidelity is unobservable and widening it now is a change with no failing case behind it.

- [ ] **Step 2: the exit criteria, each run on main FIRST (RF21 — a criterion that is green before the work proves nothing)**

| # | Command (from `app/`) | On main `3fc49767` | After |
| --- | --- | --- | --- |
| 1 | `grep -rnE '(^\|[^a-zA-Z])r\??: true' src domain server --include='*.ts' --include='*.tsx' \| grep -v '\.test\.' \| wc -l` | **7** | **3** |
| 2 | `git status --short app/src/monitor/fixtures/monitorRun-bytes` | empty | **empty** |
| 2b | `pnpm exec vitest run --project client src/monitor/handoffStoreBytes.test.ts` | 20 pass | **20 pass** |
| 5a | `grep -n 'export type EndedBy' server/stores/logs.ts` | `export type EndedBy =` (union, prettier-wrapped) | `= (typeof endedByEnum.enumValues)[number];` |
| 5b | `grep -c '"finished"' server/stores/logs.ts server/routes/data.ts` | `2` / `1` | **`1` / `0`** (the surviving hit is prose inside an unrelated comment) |

**RF10 — the count matches the spec's "after: 3" and the COMPOSITION does not.** Re-measured on revision 2's tree, the three lines are:

```
src/monitor/fixtures/monitorRunShapes.ts:86:    { t: 2, d: 8, p: 122, spm: 25, r: true as const },
domain/monitor/types.ts:824:  readonly r: true | undefined;
server/stores/logs.ts:191:  r: true,
```

— PR 1's hand-authored rest sample, THE declaration, and `r: true` inside the exhaustiveness witness. The spec expected `seriesRecorder.ts`'s producer line and `server/stores/logs.ts`'s own declaration; **the producer drops OUT** (`r: f.state === "resting" ? true : undefined` does not match the pattern) and **the server declaration is GONE** (Task 3 Step 1 derives it). Revision 1 of this plan measured **4** here, because it kept the hand-written mirror. **Print the three lines in the PR body, not only the count**, so the criterion cannot drift into being about a number.

Criteria 3 and 4 are Task 5's mutations, already measured. Criterion 7 is the PR body's first sentence.

- [ ] **Step 3: the full gate (RF1 — this diff touches `app/src/`)**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test                    # all three projects; integration needs Docker
pnpm test:coverage           # per-file rows for every file touched (RF2)
pnpm e2e                     # full suite locally; READ the result, then read the e2e job on the PR
git status --short docs/screenshots   # must be EMPTY
```

**Measured:** `unit` 69 files / 2167 pass + 1 skip; `client` 222 files / 5949 pass; `integration` 25 files / 402 pass.

**A SUITE-LEVEL integration flake, which goes in the PR BODY and not only here (RF14).** Across four full-`integration` runs, two showed one file failing at SUITE level rather than on an assertion — `contracts.real.integration.test.ts` on one run, `testHistoryDecouple.integration.test.ts` on another — and each passed when re-run alone and on the next full run. Two different files points at container startup under parallel load, not at either file. **Exit code was 0 every time, so it is NOT RF40**; if it recurs, capture the suite-level error text before re-running.

`pnpm e2e` was NOT run by the plan author — `e2e/seriesStorage.spec.ts` and `e2e/connected.spec.ts` are the named specs.

- [ ] **Step 4: the PR**

`gh pr create` from `phase-md-pr3`. **Line one is the OUTCOME** (CLAUDE.md "Write for James first"): "This PR makes the series sample one declaration instead of six, so the next rename of the rest flag is a compile error rather than a silently wrong heart rate in a rower's logbook." Then ≤6 bullets: six declarations → two, and the server stopped hand-copying the shape; zero bytes changed and the byte gate proves it with its original fixtures; the chain the compiler still cannot check now has a test that starts at the real recorder; the in-memory store fake was hiding a difference from real Postgres and no longer does; four copies of `endedBy` became one; tester impact = none.

Then a collapsed `<details>` "Record (for agents and audits)" carrying: **which module got deeper and what its interface now is** (one sentence — it belongs here, not in line one); the exit-criteria table with its before/after column and criterion 1's three lines printed; all three seam mutations with their verbatim failure text, including mutation 2's second assertion, and both compile-gate directions; the fake's red-then-green measurement; the five client `toStrictEqual` sites; every RF10 deviation named in this plan; the jsonb key-order measurement; **the suite-level integration flake and its two files**; the per-file coverage rows; the e2e run URL and conclusion.

Then the hand-back, in ONE message, and STOP: **Proposed to add** (the OTHER-jsonb-columns row, with its `dies 2026-11-14` and its why-not-now clause) and **Now overdue** (`grep -n 'dies 2026' ROADMAP.md`, oldest first, re-checked on the day).

---

## Self-review (revision 2, after harden lens 1)

- **Spec coverage.** §3 invariants 1-5 → Tasks 1+3 (1), Task 2 Step 2 + Task 7 criterion 2 (2), Tasks 1-3 + Task 5 (3), **Task 5 Step 4 as the RUNTIME gate over a chain the compiler now partly covers** (4), untouched validator predicates in Task 3 Step 2 (5). §4's bullets → Tasks 1, 2, 3, 6. §5's four tests → Task 5. §6's criteria → Task 7 Step 2, with criterion 1 re-measured. §7's deviations → Task 7 Step 1's ROADMAP text.
- **What revision 2 changed**, all six foldable to a task: the server derives instead of mirroring (Task 3 Step 1); the fake is fixed and `asSerialized` wraps the expected side only (Task 4 Steps 2-3); the `hr` spread keeps a true reason and loses a false one (Task 3 Step 2); the seam test gains a divergence pin and loses the "no compiler crosses this" claim (Task 5 Step 4); `derivedHeartRate.replay.test.ts`'s title and comment stop claiming the test avoids naming the field (Task 2 Step 3); `schema.test.ts`'s replacement pin is described honestly (Task 6 Step 3). Plus: artifacts moved into the repo, and exit criterion 1 re-measured from 4 to 3.
- **Blocks changed under paste-test, recorded inline as RF10:** the `HeartRateSample` unit comment's new home; the validator rebuild's spread form (the spec's two `if`s cannot compile) AND revision 1's wrong reason for it; the seam test's `steps` array, its `LogSeries` cast and its lint-forbidden message argument; the byte test's inline frame literal; exit criterion 1's after-count and composition, twice; Task 4 in its entirety, which the spec does not contain.
- **The one thing a reviewer should probe hardest** (revised): Task 3 Step 1 makes the server import a type from `domain/`. The evidence that this is allowed is a `tsconfig` include plus 28 existing importers, and the argument that it is RIGHT is that a copy cannot make a rename a compile error. If a reviewer holds that the store's type must be able to diverge from the domain's on purpose — a version skew between a deployed server and an older stored row, say — that is the case against, and it should be argued from a row the column actually holds.
- **Placeholders:** the seam test and `asSerialized.ts` are handed as files under `docs/superpowers/plans/2026-09-12-phase-md-pr3-artifacts/`, not reprinted — 303 lines whose transcription is where an error would hide. The full paste-tested diff is `paste-tested.patch` beside them.
- **Type consistency:** `Sample`, `SeriesData`, `HeartRateSample`, `LogSeriesSample`, `LogSeries`, `SERIES_SAMPLE_FIELDS`, `ENDED_BY_VALUES`, `asSerialized` are used with the same names and signatures in every task that names them.
