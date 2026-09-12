# Phase MD PR 3 — one `Sample` shape

**TRIAD: stored shape.** The series sample is persisted inside
`MONITOR_RUN_KEY` and in Postgres's `session_logs.series` jsonb. Full
antagonist pass on this spec, PM final-PR gate on the PR, `/harden` on the plan.
**No hardware walk**, on the condition the ROADMAP states and this spec keeps:
the shape ON THE WIRE AND ON DISK does not change by one byte (§3.2).

**Revision 3, 2026-09-12** — folds `/harden` lens 1 over the implementation
plan (§9, second block). The one design change: **the server DERIVES the shape
from `domain/` instead of mirroring it**, so six declarations become TWO, not
three. Revision 2 folded the full antagonist pass (hinge HELD on four
serializers; seven corrections; §9, first block). Written from
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
declaration every other type derives from — INCLUDING the server's.** `JSON.stringify` drops an
`undefined`-valued key (measured: byte-identical to omitting it), so the record
on disk and on the wire does not change — the +19% the row feared belongs to
`r: null`, which this PR does not write and the server validator already
rejects. What changes is that a sample built without spelling `r` no longer
compiles, anywhere — and that a RENAMED field is a compile error on both sides
of the POST. The rule that used to forbid the server sharing this type
(`logs.ts`: *"Server code never imports from `src/`"*) does not reach the case
once `Sample` lives in `domain/`, which `tsconfig.server.json` already
includes. What the compiler still cannot see — a field the validator's rebuild
list quietly drops, a value that fails to survive the POST — gets the test
RF24 says is missing: the real recorder's output, carried across the POST,
through the store shape, to the Concept2 payload.

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
  stamped once by the recorder from the frame that won the bucket (the sole
  producer line in `createSeriesRecorder`). Unchanged here.
- **Prior art in the repo:** `logs.ts`'s `LogSeriesSample` comment rules the
  server mirror DELIBERATE ("not a shared import … server code never imports
  from `src/`). **Revision 3 does NOT keep that rule for this type** — the
  rule is about `src/`, and §4's C bullet shows it stops reaching the case
  once `Sample` lives in `domain/`. The rule stands for `LogStep`, whose twin
  is in `src/`.
  `derivedHeartRate.replay.test.ts:230-251` is already the client-side
  upstream-of-producer test; `MAX_GAP_DECISECONDS`'s boundary pin shipped in
  #345 — nothing to redo.
- **Nothing found** under `docs/superpowers/research/` on the topic.

## 2. Census — the six declarations (census §1, verbatim there)

| | file | role | fields carrying `r` |
| --- | --- | --- | --- |
| A | `src/monitor/seriesRecorder.ts`'s `Sample` | PRODUCER | `readonly r?: true` |
| B | `domain/monitor/derivedHeartRate.ts:59` `HeartRateSample` | consumer input | `readonly r?: true` |
| C | `server/stores/logs.ts:129` `LogSeriesSample` | deliberate server MIRROR | `r?: true` (mutable) |
| D | `server/routes/data.ts:819-933` validator | builds C from an explicit field list; `r` must be `true` or absent, `null` → 400; unknown keys dropped | — |
| E | `server/concept2/mapping.ts:64` inline on `SessionLogRow` | consumer | `r?: true` |
| F | `server/routes/concept2.ts:252-255` inline cast off jsonb | **not in the ROADMAP row**; upstream of E | `r?: true` |

`d`/`p`/`spm` never cross to B/E/F; `truncated` is dropped at E/F; `samples`
is optional at E/F and required at C. Producer of `r`: exactly one line.
Consumers: `derivedHeartRate.ts:103` and `traceModel.ts:182`.

## 3. The invariants this owes

1. **One spelling, derived not copied.** Exactly one declaration of the
   sample shape exists in the repo (A, in `domain/monitor/types.ts`) and every
   other type is a `Pick` or mapped type of it — the recorder's re-export, B,
   C, E and F alike. **Six declarations become TWO** (A and `SeriesData`), and
   none of the survivors is a copy. Revision 2 said "three, and only C is a
   copy"; see §9's second block.
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
4. **The server reads the domain's shape through a compiler edge that already
   existed; the seam test is the RUNTIME gate over D/C/F/E.** The compiler
   catches a renamed field on both sides of the POST. It cannot catch a field
   the validator's rebuild list quietly drops, or a value that fails to
   survive the POST — one test that starts at `createSeriesRecorder` does
   (§5).
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
  every importer keeps compiling, probed by a clean `pnpm typecheck`; no lint
  rule is scoped to `domain/`) and
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
- **C DERIVES from A, and the mirror rule does not reach this case.**
  `logs.ts:120-128` justifies the hand-copy with one sentence — *"Server code
  never imports from `src/` (the client tree)"* — and once `Sample` lives in
  `domain/monitor/types.ts` that sentence is about a different directory.
  `tsconfig.server.json`'s `include` is `["server", "domain",
  "src/vite-env.d.ts"]`; `grep -rl 'domain/' server --include='*.ts' | wc -l`
  → **28**; and `server/concept2/mapping.ts` already imports
  `deriveAverageHeartRate` from the very module whose input type becomes a
  `Pick` of this shape. The compiler edge exists today, so a hand-copy beside
  it buys nothing and can drift — which is the RF33 defect this spec exists to
  close, since a renamed field must be a compile error on BOTH sides and a
  copy cannot do that. So:
  `export type LogSeriesSample = { -readonly [K in keyof Sample]: Sample[K] }`
  and the same mapping over `SeriesData` for `LogSeries`. `-readonly` is the
  whole of the difference. **The ROADMAP row's caveat is therefore ANSWERED,
  not honoured:** the row required this spec to engage that comment, and the
  engagement is that its reason has expired. `logs.ts`'s comment is rewritten
  to say what IS still the server's own — the BOUNDS. `routes/data.ts`'s
  validator is the trust boundary for an untrusted body; sharing the SHAPE
  does not share the bands and does not make the route trust the client.
  `LogStep` beside it stays a hand-written mirror, because ITS twin
  (`logDraft.ts`) really is in `src/`.
  C also gains an EXHAUSTIVENESS witness in the repo's own `schema.test.ts`
  idiom:
  `const SERIES_SAMPLE_FIELDS = Object.keys({ t: true, d: true, p: true, spm: true, hr: true, r: true } satisfies Record<keyof LogSeriesSample, true>)`.
  (`as const satisfies readonly (keyof T)[]` was the first draft and cannot go
  red on a MISSING member — `tsc` is silent on the omission; only
  `Record<keyof T, true>` errors, `TS1360` on the literal. Antagonist pass,
  probed.) It now gates the validator's REBUILD list against the DOMAIN's
  shape, which is strictly more than it gated before; the seam test (§5)
  compares it against the key UNION over the recorder's own output and over
  the validator's. The validator's six per-field predicates, their order and
  their pinned messages are UNCHANGED: they are six different checks with
  four different ceilings and cannot be "iterated", and revision 1's claim
  that they could was wrong.
- **E and F derive from C** (and so, transitively, from A):
  `Pick<LogSeriesSample, "t" | "hr" | "r">`; F's cast names that type instead
  of an inline literal. `truncated` and
  `samples?` at E/F: unchanged (the Concept2 path never reads `truncated`;
  `?? []` absorbs `samples`).
- **D (the validator):** unchanged in behaviour; the rebuild list is checked
  against `SERIES_SAMPLE_FIELDS`; the stale comment above `SERIES_SPM_MAX`
  ("the recorder stores it unbanded") corrected to name the RC-6 band
  (`seriesRecorder.ts`, 10..60) while keeping `SERIES_SPM_MAX = 255` with its
  honest reason (the wire byte is a u8). The rebuild builds `r` at
  construction (a required key cannot be assigned after) and keeps SPREADING
  `hr`, which is load-bearing for a reason that is not byte order: the spread
  leaves `hr` genuinely ABSENT in memory when there is no reading, and that is
  what keeps every `toStrictEqual` comparing a stored sample to a hand-built
  one honest. **Key order is NOT load-bearing** — Postgres normalizes jsonb
  keys by length then bytewise on ingest (PRIMARY, measured on 18.4:
  `'{"t":1,"d":4,"p":121,"spm":25,"hr":140}'::jsonb` reads back
  `{"d": 4, "p": 121, "t": 1, "hr": 140, "spm": 25}`), so no ordering chosen
  here survives the column.
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
  recorder sample with `r: true` is still `r: true` after D. **It also pins
  that the rests MATTER on the chosen capture** (the same derivation over
  rest-stripped samples returns a DIFFERENT number), or a mutation that drops
  `r` could land on the same average by luck and leave the oracle agreeing
  with a broken seam. File:
  `server/routes/seriesSeam.test.ts` — NOT `.integration.test.ts` (that
  suffix routes to the Docker-only `integration` project); it runs in the
  node `unit` project, DOM-free (`seriesRecorder.ts` imports exactly one
  type from `domain/`). Precedent: `server/routes/data.test.ts:15` already
  imports `../../src/session/partialGateFixture.js` in that project — one
  of FOUR such files, so "the one sanctioned cross-tree import" was wrong
  and `partial.integration.test.ts` was the wrong one to cite.
  Mutations: the `rest` RENAME no longer compiles once C derives (which is the
  protection working), so the compiling equivalent strips the mark inside
  `toMappingRow` — the payload average changes; a second mutation drops `r`
  from the validator's rebuild list — the rest count and the key-union
  assertion both red; a third drops a DIFFERENT field (`hr`) from that list,
  which is what proves the witness rather than the flag.
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
- `derivedHeartRate.replay.test.ts`'s "over the RECORDER's own samples" leg
  stays and keeps its rest count. **Its TITLE loses the clause "without this
  test naming the field"**, which the required key makes false — the file
  writes `r` three times afterwards — and the comment above its strip says
  what the leg still proves: a rename is now the COMPILER's to catch, so this
  leg proves the exclusion RUNS over real recorder output.
- `schema.test.ts`: the tautological test goes; `endedBy.integration.test.ts`
  stays as the DB round-trip.

## 6. Exit criteria

1. From `app/`: `grep -rnE '(^|[^a-zA-Z])r\??: true' src domain server --include='*.ts' --include='*.tsx' | grep -v '\.test\.'` → on main today **7** hits (measured at `3fc49767`, so the criterion is red before the work; revision 2 said 6, before PR 1's `monitorRunShapes.ts` landed); after: **3**, and the criterion is the LINES, not the count — `domain/monitor/types.ts` (the declaration), `server/stores/logs.ts` (`r: true` inside the exhaustiveness witness) and `src/monitor/fixtures/monitorRunShapes.ts` (PR 1's hand-authored rest sample). The producer line drops OUT (`r: f.state === "resting" ? true : undefined` does not match the pattern) and the server declaration is GONE (C derives).
2. PR 1's byte fixtures untouched (`git diff --stat main -- app/src/monitor/fixtures/monitorRun-bytes` empty — `monitorRunShapes.ts`, the fixture INPUT, gains two `r: undefined` on purpose, §4) and `handoffStoreBytes.test.ts` green.
3. The server seam test exists, starts at `createSeriesRecorder`, and both mutations in §5 are shown red.
4. The `@ts-expect-error` compile gate exists; removing the directive's line makes `pnpm typecheck` fail (shown).
5. From `app/`: `grep -n 'export type EndedBy' server/stores/logs.ts` prints the derived form (`(typeof endedByEnum.enumValues)[number]`) — the old union is prettier-wrapped across six lines, so a one-line string grep was green on main and proved nothing; `grep -c '"finished"' server/stores/logs.ts server/routes/data.ts` drops by the number of hand-copies removed (measured before/after in the PR body); `schema.test.ts`'s `EXHAUSTIVE` deleted with the reason in the commit.
6. `pnpm test` (all three projects — integration needs Docker), `pnpm typecheck`, `pnpm lint`, a full `pnpm e2e` whose result was read (RF1); no screenshot committed.
7. PR body's first sentence is the OUTCOME, in James's words, per CLAUDE.md's "Write for James first" — the "which module got deeper and what its interface now is" sentence belongs in the collapsed Record block, not above the fold.

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
- The `EndedBy` row says "three mirrors"; there are four (the error-message prose in `endedByError`).
- The row required the spec to engage `stores/logs.ts:120-127`'s "deliberate mirror" ruling "rather than treating it as drift". **It is engaged and its reason has EXPIRED** (§4's C bullet): the comment's justification is that server code never imports from `src/`, and after this PR the shape lives in `domain/`. The mirror is deleted rather than defended, and `logs.ts`'s comment is rewritten to name the bounds — not the shape — as the thing the server owns.
- Six declarations become **two**, not three: the row, the census and revision 2 all assumed the server copy was permanent.

## 9b. What revision 3 changed, and why (`/harden` lens 1 over the plan)

- **The server DERIVES.** `logs.ts`'s mirror rule is about `src/`, and A now
  lives in `domain/`, which `tsconfig.server.json` includes and which 28
  server files already import from — `mapping.ts` among them, from the very
  module whose input becomes a `Pick` of this shape. C and `LogSeries` become
  `-readonly` mapped types; six declarations become two; invariants 1 and 4
  rewritten; §7 answers the ROADMAP row's caveat instead of honouring it.
- **"No compiler crosses this seam" is deleted** from the seam test's header
  and from `types.ts`'s comment. One does. What it cannot cross is a dropped
  rebuild-list field or a value that fails to survive the POST, and that is
  what the test is for.
- **The in-memory logs fake is FIXED, not worked around.** It kept
  `undefined`-valued keys that jsonb drops, so three store-contract cases
  passed against it and failed against real Postgres. `create` now round-trips
  `series`; `asSerialized` wraps the EXPECTED side only, so these cases can
  still see a backend returning a key the column cannot hold. `steps` and
  `machineSummary` keep the infidelity, with a dated ROADMAP row.
- **The `hr` spread keeps a true reason and loses a false one.** It is not
  about byte order — Postgres normalizes jsonb key order on ingest (measured
  on 18.4) — it is that the spread leaves `hr` genuinely absent in memory.
  "Re-serializes to the bytes the client sent" is struck everywhere.
- **The seam test gains a divergence pin** so its oracle cannot agree with a
  broken seam by luck.
- **`derivedHeartRate.replay.test.ts`'s title** stops claiming the test avoids
  naming the field, and **`schema.test.ts`'s replacement pin** is described
  honestly: it DOES red on an added member; only `data.test.ts`'s POST loop
  stays green on one.
- Bookkeeping: §2 cites `Sample` by symbol, the "21 importers" figure is
  replaced by the gate that proves it, and §6 criterion 7 follows CLAUDE.md's
  own shape.

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

- The re-export keeps every importer compiling — probed by a clean
  `pnpm typecheck`, which is the gate; the earlier figure of "21" was a count
  nobody reproduced (`grep -rlE 'from "[^"]*seriesRecorder' src e2e
  --include='*.ts' --include='*.tsx' | wc -l` → 17 files, 19 import lines).
  No lint rule restricts `domain/`.
- The producer's spread sites serialize byte-identically with an explicit
  `r: undefined` (measured); `Object.freeze` is indifferent to it.
- The validator is not iterated (see §4), so no refusal order or message
  moves.
