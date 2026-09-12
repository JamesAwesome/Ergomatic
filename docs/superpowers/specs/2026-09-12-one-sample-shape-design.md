# Phase MD PR 3 — one `Sample` shape

**TRIAD: stored shape.** The series sample is persisted inside
`MONITOR_RUN_KEY` and in Postgres's `session_logs.series` jsonb. Full
antagonist pass on this spec, PM final-PR gate on the PR, `/harden` on the plan.
**No hardware walk**, on the condition the ROADMAP states and this spec keeps:
the shape ON THE WIRE AND ON DISK does not change by one byte (§3.2).

**Revision 2, 2026-09-12** — folds the full antagonist pass (hinge HELD on four serializers; seven corrections; §9). Written from
`docs/superpowers/audits/2026-09-12-architecture-walk/pr3-census.md` (every
number carries its command there). §7 lists what the ROADMAP row got wrong.

## What and why

The series sample — one row per second of a connected piece, with its rest
flag `r` — is declared by hand in **six** places with no compiler between the
producer and any consumer. RF33 already bit here: a consumer spelled the flag
`rest`, structural typing accepted the real sample with the key simply absent,
and the rest exclusion was dead on every production path while every test
passed. The landed fix was a comment. `r` is still optional on both sides, so
the identical rename would reproduce it today — and the census found a sixth
copy the row never listed, upstream of the Concept2 send, where the same
rename would silently stop excluding rest from a rower's logbook heart-rate.

**This PR makes the flag a REQUIRED KEY whose value may be `undefined`, in one
declaration the others derive from.** `JSON.stringify` drops an
`undefined`-valued key (measured: byte-identical to omitting it), so the record
on disk and on the wire does not change — the +19% the row feared belongs to
`r: null`, which this PR does not write and the server validator already
rejects. What changes is that a sample built without spelling `r` no longer
compiles, on the client, in the domain, and at the two server seams that can
share a type. The one seam that cannot share a type (the server mirror, which
the repo forbids importing across) gets the test RF24 says it is missing: the
real recorder's output, carried across the POST, through the store shape, to
the Concept2 payload.

Nothing a rower sees changes. The `EndedBy` mirror rider (James, 2026-09-12)
rides along: three hand-copied lists of one enum become one source.

## 1. Research pass and does-it-exist

- **Platform:** none owns this — the shape is ours end to end. The one
  platform fact the design rests on is JavaScript's own:
  `JSON.stringify({ r: undefined })` → `{}` (ECMA-262 `SerializeJSONObject`,
  step: a property whose value serializes to `undefined` is skipped).
  Measured (PRIMARY, `node -e`) on EVERY serializer the sample reaches
  (antagonist pass): `JSON.stringify` itself; drizzle 0.45.2's jsonb column
  (`pg-core/columns/jsonb.js:22` `mapToDriverValue` is `JSON.stringify`);
  `pg`'s parameteriser (`lib/utils.js:82` `prepareValue` falls through to
  `JSON.stringify`); and the Concept2 POST, which never carries `samples` at
  all (`mapping.ts:673-677` reads `r` only to compute one integer,
  `heart_rate.average`). TypeScript's side: `exactOptionalPropertyTypes` is
  set in NONE of the six tsconfigs (`tsconfig.json`, `.app`, `.node`,
  `.server`, `.server.build`, `e2e/`; the two `extends` children add nothing;
  `vitest.config.ts` runs no typecheck), so `r: true | undefined` as a
  required key accepts an explicit `undefined` and rejects an omitted key —
  the gate wanted. **If anyone ever enables that flag this design inverts:**
  an explicit `undefined` becomes the error and the producer line stops
  compiling. Stated here so the dependency is not silent.
- **In-memory witnesses are NOT byte witnesses.** `Object.keys`, `"r" in s`,
  `hasOwnProperty` and vitest's `toStrictEqual` all distinguish
  present-undefined from absent (measured against `@vitest/expect@4.1.11`:
  strict `false`, loose `true`). One shipped test uses `Object.keys` as a
  proxy for the zero-byte property and would go red — §5 re-points it.
- **Invented mechanism:** none. A mapped/`Pick` type and a `satisfies` pin
  are idioms the repo already uses for the sibling problem
  (`logs.ts:332`'s `satisfies readonly (typeof endedByEnum.enumValues)[number][]`).
- **Does the system have the concept?** The PM5 reports a per-frame `state`
  (`"resting"` among them); the flag is our own one-bit projection of it,
  stamped once by the recorder from the frame that won the bucket
  (`seriesRecorder.ts:425`). Unchanged here.
- **Prior art in the repo:** `logs.ts:120-128` rules the server mirror
  DELIBERATE ("not a shared import … server code never imports from `src/`");
  this spec keeps that rule and gates the mirror by test instead (§5).
  `derivedHeartRate.replay.test.ts:230-251` is already the client-side
  upstream-of-producer test; `MAX_GAP_DECISECONDS`'s boundary pin shipped in
  #345 — nothing to redo.
- **Nothing found** under `docs/superpowers/research/` on the topic.

## 2. Census — the six declarations (census §1, verbatim there)

| | file | role | fields carrying `r` |
| --- | --- | --- | --- |
| A | `src/monitor/seriesRecorder.ts:219` `Sample` | PRODUCER | `readonly r?: true` |
| B | `domain/monitor/derivedHeartRate.ts:59` `HeartRateSample` | consumer input | `readonly r?: true` |
| C | `server/stores/logs.ts:129` `LogSeriesSample` | deliberate server MIRROR | `r?: true` (mutable) |
| D | `server/routes/data.ts:819-933` validator | builds C from an explicit field list; `r` must be `true` or absent, `null` → 400; unknown keys dropped | — |
| E | `server/concept2/mapping.ts:64` inline on `SessionLogRow` | consumer | `r?: true` |
| F | `server/routes/concept2.ts:252-255` inline cast off jsonb | **not in the ROADMAP row**; upstream of E | `r?: true` |

`d`/`p`/`spm` never cross to B/E/F; `truncated` is dropped at E/F; `samples`
is optional at E/F and required at C. Producer of `r`: exactly one line.
Consumers: `derivedHeartRate.ts:103` and `traceModel.ts:182`.

## 3. The invariants this owes

1. **One spelling per tree, derived not copied.** On the client/domain side
   exactly one declaration of the sample shape exists and every other type is
   a `Pick`/mapped type of it. On the server side exactly one hand-written
   mirror exists (C) and E and F derive from it. Six declarations become
   three, and only C is a copy — by the repo's own rule.
2. **The bytes are unchanged.** No sample serialized by the recorder, written
   to `MONITOR_RUN_KEY`, POSTed, stored in jsonb or read back changes by one
   byte. Gated by PR 1's byte-compatibility fixtures, which this PR inherits
   WITHOUT recapture (census §7: `ordinary` and `sacrifice-thrown-with-series`
   both carry a series with one `r: true` sample) — if this PR needs to
   regenerate a fixture it has broken this invariant.
3. **A rest sample is a rest sample at every consumer.** The recorder's
   `r: true` reaches `deriveAverageHeartRate` (excluded from the mean), the
   trace chart (`Reading.rest`), the validator (kept), the store, the Concept2
   mapping (excluded from the logbook average) — and a build that omits the
   flag at any hand-built site is a compile error, not a green test.
4. **The server mirror is gated by a test that starts at the recorder.** No
   compiler crosses `src/` → `server/`; one test does (§5).
5. **`r: null` and `r: false` stay refused** at the validator (400,
   `"r must be true or absent"`) — the persisted idiom is absent-means-work,
   and nothing in this PR writes a falsy `r`.

## 4. What changes

- **The declaration moves to `domain/monitor/types.ts`** (the file
  `seriesRecorder.ts` already imports `MonitorFrame` from — no new file, no
  new edge, and no first types-only file under `domain/**`'s 100% coverage
  threshold, which a new `series.ts` would have been): `Sample` and
  `SeriesData`, with `readonly r: true | undefined` (required key) and
  `readonly hr?: number` (unchanged — `hr` is a value, not a flag, and its
  absence already means "no belt"). `seriesRecorder.ts` re-exports both
  (`export type { Sample, SeriesData }` — `verbatimModuleSyntax` accepts it;
  all 21 importers keep compiling; no lint rule is scoped to `domain/`) and
  writes `r: f.state === "resting" ? true : undefined` in place of the
  conditional spread — a conditional spread cannot satisfy a required key,
  so the producer line MUST change, and its output is byte-identical. The
  recorder's two "costs zero extra bytes" comments become "costs zero
  SERIALIZED bytes — the key is present in memory, absent after
  `JSON.stringify`". The required key is a CONSTRUCTION-SITE gate only: on
  every read path (localStorage parse, jsonb read-back, the POST body) the
  key is genuinely absent while the type says required; `s.r === true` is
  correct either way.
- **B becomes `Pick<Sample, "t" | "hr" | "r">`** — the RF33 comment at
  `derivedHeartRate.ts:50-58` is rewritten to say the link is now the
  compiler's, and to keep the incident's one paragraph.
- **C keeps its hand-written mirror** (`logs.ts:120-128`'s rule stands) with
  `r: true | undefined` required, and gains an EXHAUSTIVENESS witness in the
  repo's own `schema.test.ts:26` idiom:
  `const SERIES_SAMPLE_FIELDS = Object.keys({ t: true, d: true, p: true, spm: true, hr: true, r: true } satisfies Record<keyof LogSeriesSample, true>)`.
  (`as const satisfies readonly (keyof T)[]` was the first draft and cannot go
  red on a MISSING member — `tsc` is silent on the omission; only
  `Record<keyof T, true>` errors, `TS2741`. Antagonist pass, probed.) The
  witness gates the validator's REBUILD list only — the explicit field list
  at `data.ts:892-895` — and the seam test (§5) compares it against the client
  tree's keys. The validator's six per-field predicates, their order and
  their pinned messages are UNCHANGED: they are six different checks with
  four different ceilings and cannot be "iterated", and revision 1's claim
  that they could was wrong.
- **E and F derive from C:** `Pick<LogSeriesSample, "t" | "hr" | "r">`; F's
  cast names that type instead of an inline literal. `truncated` and
  `samples?` at E/F: unchanged (the Concept2 path never reads `truncated`;
  `?? []` absorbs `samples`).
- **D (the validator):** unchanged in behaviour; the rebuild list is checked
  against `SERIES_SAMPLE_FIELDS`; the stale `:813` comment ("stores it
  unbanded") corrected to name the RC-6 band (`seriesRecorder.ts:418`,
  10..60) while keeping `SERIES_SPM_MAX = 255` with its honest reason (the
  wire byte is a u8).
- **`EndedBy` rider:** `logs.ts` — `export type EndedBy =
  (typeof endedByEnum.enumValues)[number]` and
  `export const ENDED_BY_VALUES = endedByEnum.enumValues` (`.includes(value
  as EndedBy)` compiles against drizzle's readonly tuple — probed); `data.ts`
  imports the array from `stores/logs.js` (it already imports the type from
  there — no new import edge into `db/schema`); **the FOURTH copy** — the
  prose list inside `data.ts:175`'s error message — derives too
  (`ENDED_BY_VALUES.join("|")`), with `data.test.ts:1305`'s literal kept as
  its independent pin; `schema.test.ts:26-40`'s `EXHAUSTIVE` test is DELETED
  because it can no longer go red (RF21 — the DB↔server-TS edge it gated no
  longer exists; the client union and its runtime validator were never
  gated by it). The POST loop in `data.test.ts:1309-1325` keeps its untyped
  six-value literal, and the spec says honestly what it catches: a member
  REMOVED from the enum (the POST 400s); a member ADDED widens the route
  automatically and the loop stays green.
- **Hand-built test samples that are TYPED** gain `r: undefined` or
  `r: true` explicitly — the compiler lists them (`traceModel.test.ts`,
  `TraceChart.test.tsx`'s `sample()` helper body, `derivedHeartRate.replay.test.ts`,
  `mapping.test.ts`). **Untyped `.send()` bodies are NOT touched**
  (`data.test.ts:3352`'s `validSample()`, `seriesCapture.integration.test.ts:89-95`):
  adding `r: undefined` there turns three `toStrictEqual` assertions red for
  no gain.
- **PR 1's `monitorRunShapes.ts` gains `r: undefined` on the two `SERIES`
  samples that lack it** — a compile error otherwise (`TS2322`, probed) —
  and PR 1's byte gate leg (a) is unaffected because the literal SERIALISES
  identically (measured). The census's "do not touch the literal" was about
  its output, not its text; corrected there too.

## 5. Tests — replace, don't layer

- **The server seam test (RF24, the one the census says nobody has):** drive
  `createSeriesRecorder` over a committed capture (the client tree), POST its
  `SeriesData` through the real `validateSeries` (server), store it through
  `stores/logs`'s input shape, run `toMappingRow` (F) and the Concept2 mapping
  (E), and assert the payload's derived heart-rate average equals
  `deriveAverageHeartRate` over the recorder's own samples — and that a
  recorder sample with `r: true` is still `r: true` after D. File:
  `server/routes/seriesSeam.test.ts` — NOT `.integration.test.ts` (that
  suffix routes to the Docker-only `integration` project); it runs in the
  node `unit` project, DOM-free (`seriesRecorder.ts` imports exactly one
  type from `domain/`). Precedent: `server/routes/data.test.ts:15` already
  imports `../../src/session/partialGateFixture.js` in that project — one
  of FOUR such files, so "the one sanctioned cross-tree import" was wrong
  and `partial.integration.test.ts` was the wrong one to cite. Mutation: rename `r` in the F cast to
  `rest` — the payload average changes (rest samples included) and the test
  fails; a second mutation drops `r` from `SERIES_SAMPLE_FIELDS` — the
  validator stops carrying it and the same assertion fails.
- **The compiler gate, proved:** one `@ts-expect-error` test in
  `seriesRecorder.test.ts` builds a `Sample` without `r` — the directive is
  green only while the omission is an error (the repo's own idiom at
  `useMonitorSession.test.ts:9130-9135`).
- **Byte identity:** PR 1's `handoffStoreBytes.test.ts` unchanged and green;
  additionally one recorder test serializes a work sample and a rest sample
  and pins the exact bytes with independent literals
  (`{"t":1,"d":4,"p":121,"spm":25,"hr":140}` has no `r`). **The existing
  proxy assertion `seriesRecorder.test.ts:1077-1080`
  (`Object.keys(...).not.toContain("r")`) goes RED under this change and is
  re-pointed at the invariant it stood in for:
  `expect(JSON.stringify(work)).not.toContain('"r"')` — strictly stronger.**
  `derivedHeartRate.replay.test.ts:246`'s `"r" in s && s.r === true` keeps
  its count right but the `in` half stops discriminating; one comment.
- `derivedHeartRate.replay.test.ts:230-251` stays; its `:246` sanity count
  keeps naming `r` — that is the flag's producer-side assertion, wanted.
- `schema.test.ts`: the tautological test goes; `endedBy.integration.test.ts`
  stays as the DB round-trip.

## 6. Exit criteria

1. From `app/`: `grep -rnE '(^|[^a-zA-Z])r\??: true' src domain server --include='*.ts' --include='*.tsx' | grep -v '\.test\.'` → on main today **6** hits (five declarations + the producer line — measured, so the criterion is red before the work); after: **3** — `domain/monitor/types.ts`, `server/stores/logs.ts`, and `seriesRecorder.ts`'s producer line (B/E/F are `Pick`s and do not spell the field).
2. PR 1's byte fixtures untouched (`git diff --stat main -- app/src/monitor/fixtures` empty) and `handoffStoreBytes.test.ts` green.
3. The server seam test exists, starts at `createSeriesRecorder`, and both mutations in §5 are shown red.
4. The `@ts-expect-error` compile gate exists; removing the directive's line makes `pnpm typecheck` fail (shown).
5. From `app/`: `grep -n 'export type EndedBy' server/stores/logs.ts` prints the derived form (`(typeof endedByEnum.enumValues)[number]`) — the old union is prettier-wrapped across six lines, so a one-line string grep was green on main and proved nothing; `grep -c '"finished"' server/stores/logs.ts server/routes/data.ts` drops by the number of hand-copies removed (measured before/after in the PR body); `schema.test.ts`'s `EXHAUSTIVE` deleted with the reason in the commit.
6. `pnpm test` (all three projects — integration needs Docker), `pnpm typecheck`, `pnpm lint`, a full `pnpm e2e` whose result was read (RF1); no screenshot committed.
7. PR body's first sentence: which module got deeper and what its interface now is.

## 7. Deviations from the ROADMAP row, stated (RF10)

- Five declarations → **six** (`server/routes/concept2.ts:252-255`, upstream of the mapping).
- "Required with `null` meaning absent … +19.1%" → the spec uses a required
  KEY with an `undefined` value: zero bytes, and the percentage is not a single
  number anyway (18.0%–21.9% depending on the belt fraction, census §5).
- "One new test builds its input by driving `createSeriesRecorder`" → the
  client one already exists (#345's file, `:230-251`); the missing one is the
  SERVER seam, and that is the test §5 prescribes.
- The `EndedBy` row names "the POST seam test" as the gate; the real gate is
  `schema.test.ts:26-40`, which this PR deletes as tautological once the type
  derives — and says so.
- `MAX_GAP_DECISECONDS` boundary pin: already shipped, not redone.
- The `EndedBy` row says "three mirrors"; there are four (the error-message prose at `data.ts:175`).

## 9. What revision 2 changed, and why (antagonist full pass)

- A shipped test (`seriesRecorder.test.ts:1077`) uses `Object.keys` as a proxy for zero bytes and goes red; §5 re-points it, §1 records the in-memory/serialized distinction.
- The `satisfies readonly (keyof T)[]` pin could not catch a missing field; replaced by the `Record<keyof T, true>` witness.
- "The validator iterates the field list" was not a thing six different predicates can do; dropped — the witness gates the rebuild list only.
- The census forbade touching PR 1's `SERIES` literal; a required key makes it a compile error. The prohibition is about the literal's OUTPUT; two `r: undefined` are byte-free.
- The cross-tree precedent was a Docker-only integration file; the right precedent (`data.test.ts:15`) runs in `unit`, and there are four.
- Exit criteria 1 and 5 were green on main (a regex matching `readonly reason`; a union prettier had wrapped); both rewritten to be red today.
- `domain/monitor/series.ts` would have been the first types-only file under a 100% coverage threshold; the types go into `domain/monitor/types.ts` instead.
- The fourth `EndedBy` copy (the error-message prose) and what the POST loop really catches.

## 8. Settled by the antagonist pass (were open in revision 1)

- The re-export keeps all 21 importers compiling (probed); no lint rule
  restricts `domain/`.
- The producer's spread sites serialize byte-identically with an explicit
  `r: undefined` (measured); `Object.freeze` is indifferent to it.
- The validator is not iterated (see §4), so no refusal order or message
  moves.
