# Phase MD PR 3 — census: one `Sample` shape

Read-only. Sources: main checkout at `4aa3d132`; PR 1 worktree
`.claude/worktrees/md-pr1` at `4e41d622`. Nothing written outside this file.
PRIMARY = read at the cited line this session · SECONDARY = a repo comment
asserting it · INFERENCE = mine.

## 0. Contradictions against the brief — read first

1. **SIX declarations, not five.** `app/server/routes/concept2.ts:252-255`
   carries a byte-identical twin of `mapping.ts:64` inside `toMappingRow`'s cast
   off the jsonb column (PRIMARY). It is UPSTREAM of E — it builds the
   `SessionLogRow` that `mapping.ts:673` reads. A rename that fixes the five
   named leaves this one, and the Concept2 send silently stops excluding rest:
   RF33 exactly, one layer up.
2. **`deriveAverageHeartRate` has THREE callers, not two** (PRIMARY, `grep -rn`):
   `src/log/storedSummary.ts:835`, `src/session/summaryModel.ts:1269` (both
   client, both pass a real `Sample[]`), `server/concept2/mapping.ts:673`.
3. **The "one new test driving `createSeriesRecorder`" already half-exists.**
   `derivedHeartRate.replay.test.ts:230-251` runs capture → real parsers → real
   recorder → domain function, and strips the flag by rebuilding `{ t, hr }`
   (`:249`) — that leg names no rest field. But `:246`
   (`produced.filter((s) => "r" in s && s.r === true)`) names it for a sanity
   count. Owed work is narrower than the row says.
4. **The `EndedBy` row names the wrong gate.** "The POST seam test is the
   current gate" — the pgEnum↔`EndedBy` gate is actually
   `server/db/schema.test.ts:26-40` (`Record<EndedBy, true>` vs
   `endedByEnum.enumValues`). The POST tests gate `ENDED_BY_VALUES` against a
   FOURTH hand-typed list. See §6.
5. **A stale comment inside the validator PR 3 will touch.** `data.ts:813`:
   *"the recorder stores it unbanded (`seriesRecorder.ts`'s `spm: f.spm ?? 0` —
   no drop-if-out-of-band …)"*. Falsified at `seriesRecorder.ts:418`, which
   bands spm to `SPM_MIN=10 .. SPM_MAX=60` (RC-6). `SERIES_SPM_MAX = 255` is
   still defensible (the wire byte is a u8); its stated reason is not.

---

## 1. The six declarations

### A. `src/monitor/seriesRecorder.ts:219-244` — the PRODUCER (PRIMARY)

```ts
export interface Sample {
  readonly t: number; readonly d: number; readonly p: number;
  readonly spm: number; readonly hr?: number;
  readonly r?: true;              // :238
}
export interface SeriesData { samples: Sample[]; truncated?: true; }
```
`r`'s doc comment (`:231-237`), the load-bearing sentence for the byte
argument: *"ABSENT means work, the same absent-not-false idiom `hr` above
already uses, **so a work sample costs zero extra bytes**."*

Sole producer line, `:425`: `...(f.state === "resting" ? { r: true as const } : {}),`
— reading the frame that WON the whole-second bucket (`:412` returns early
before construction). Every sample is `Object.freeze`d (`:427`).

### B. `domain/monitor/derivedHeartRate.ts:59-69` — the CONSUMER input (PRIMARY)

```ts
export interface HeartRateSample {
  readonly t: number; readonly hr?: number;
  readonly r?: true;              // :68
}
```
The RF33 comment left at `:50-58`, load-bearing lines verbatim:
> The names are NOT a paraphrase: `r` is what `src/monitor/seriesRecorder.ts`
> writes and `server/stores/logs.ts` mirrors. This interface first spelled it
> `rest`, and because the field is optional, structural typing accepted the
> real `Sample` with the key simply absent … Diff a narrowed input interface
> against the producer's real declaration field by field; a renamed optional is
> invisible to the compiler in exactly the direction that matters.

The landed fix is that comment and nothing else — `r` is still `readonly r?: true`
on both sides. Consumed at `:103`: `if (s.hr === undefined || s.r === true) continue;`

### C. `server/stores/logs.ts:120-144` — the deliberate MIRROR (PRIMARY)

The comment PR 3 must engage, `:120-128`, load-bearing lines verbatim:
> a server-side MIRROR of the client's `src/monitor/seriesRecorder.ts`
> `Sample`/`SeriesData` shapes — **not a shared import**. Server code never
> imports from `src/` (the client tree); this is the same "independent,
> own-bounds mirror" idiom `LogStep` above already uses … `routes/data.ts`'s
> `validateSeries` is what actually constructs a value of this shape — every
> field here has already passed its own band check by the time it reaches
> this store.
```ts
export interface LogSeriesSample {                      // :129
  t: number; d: number; p: number; spm: number; hr?: number; r?: true; // :138
}
export interface LogSeries { samples: LogSeriesSample[]; truncated?: true; } // :141
```
All fields MUTABLE here; A's are `readonly`. INFERENCE: that is what lets the
validator build `{t,d,p,spm}` then assign `.hr`/`.r` (`data.ts:893-895`).

### D. `server/routes/data.ts:819-933` — the VALIDATOR (PRIMARY)

| field | accepted by `validateSeriesSample` |
| --- | --- |
| `t` | required integer `0..SERIES_T_MAX` (`604_800*10`) |
| `d` | required integer `0..SERIES_D_MAX` (`1_000_000*10`) |
| `p` | required integer `0..SERIES_P_MAX` (`PM5_MAX_SPLIT_SECONDS*10`) |
| `spm` | required integer `0..SERIES_SPM_MAX` (255) |
| `hr` | `undefined`, or integer `HR_MIN..HR_MAX` = 20..254 |
| `r` | `undefined` or the literal `true` — `:885` `"r must be true or absent"` |

Unknown keys are **silently dropped, never rejected** (`:888-891`: *"any extra
keys the client sent … are silently dropped, not persisted"*), because the
result is rebuilt from an explicit field list (`:892-895`):
```ts
const sample: LogSeriesSample = { t, d, p, spm };
if (hr !== undefined) sample.hr = hr;
if (r === true) sample.r = true;
```
`validateSeries` (`:906-933`): `undefined`/`null` → `series: null`; `samples`
an array of ≤ `SERIES_SAMPLE_CAP` (14_400, re-declared server-side at `:795`,
not imported); `truncated` must be `true` or omitted.
**Consequence:** `"r":null` is a 400 today, so any design writing it must
change this validator in the same PR.

### E. `server/concept2/mapping.ts:63-65` — inline, on `SessionLogRow` (PRIMARY)

```ts
  series?: { samples?: readonly { t: number; hr?: number; r?: true }[] } | null;
```
Its comment: *"Structurally the store's `LogSeries`, typed loosely here … 
`routes/data.ts` owns its bands."* Consumed once, `:673`:
`const derived = deriveAverageHeartRate(row.series?.samples ?? []);`

### F. `server/routes/concept2.ts:252-255` — the SIXTH (PRIMARY, not in the brief)

```ts
    series: typeof row.series === "object" && row.series !== null
        ? (row.series as { samples?: readonly { t: number; hr?: number; r?: true }[] })
        : null,
```

### Field-by-field across all six

`req`/`opt` = required/optional key · `—` = absent · `val` = validator-enforced.

| field | A `Sample` | B `HeartRateSample` | C `LogSeriesSample` | D validator | E mapping | F c2 route |
| --- | --- | --- | --- | --- | --- | --- |
| `t` | `readonly number` req | `readonly number` req | `number` req | req int | req | req |
| `d` | `readonly number` req | — | `number` req | req int | — | — |
| `p` | `readonly number` req | — | `number` req | req int | — | — |
| `spm` | `readonly number` req | — | `number` req | req int | — | — |
| `hr` | `readonly number` opt | `readonly number` opt | `number` opt | opt int | opt | opt |
| `r` | `readonly true` opt | `readonly true` opt | `true` opt | opt `true` | opt | opt |
| `samples` | on `SeriesData`, req | n/a | req | val req array | **opt** | **opt** |
| `truncated` | opt | n/a | opt | opt `true` | **—** | **—** |

Findings: `d`/`p`/`spm` are absent from B/E/F, so a rename of those three is
caught by nothing at those seams — only `t`/`hr`/`r` cross them. `truncated` is
DROPPED at E/F, so the Concept2 path cannot tell a truncated trace from a whole
one (INFERENCE: harmless today; the HR derivation never reads it). `samples` is
optional at E/F and required at C; `?? []` at `mapping.ts:673` absorbs it.
Mutability diverges: A/B readonly, C/D mutable, E/F readonly array of mutable
members.

---

## 2. Where the shape crosses a boundary

**(i) Client → `localStorage`.** `MONITOR_RUN_KEY = "ergomatic.monitorRun"`
(`monitorRun.ts:28`). Sole production writer `performDurableWrite`
(`handoffStore.ts:544-570`): `safeSetItem(MONITOR_RUN_KEY, JSON.stringify(run))`
(`:549`); on a throw, `if (run.series === undefined) return "failed"` (`:557`),
else retry once with `{ ...withoutSeries, seriesDropped: true }` (`:561`).
Validates nothing outbound — the whole `MonitorRun`, `series` inside it,
stringified verbatim. Drops the ENTIRE series on a quota throw (the
"sacrifice"). Trusts the frozen recorder instances; the read side strips a
malformed `series` (`monitorRun.ts:491`). This is why the byte cost is
load-bearing: the sacrifice exists because this record already hits quota.

**(ii) Client → server.** `POST /api/logs`, body field `series`, typed
`series?: SeriesData` (`LogSession.tsx:596`, importing `SeriesData` at `:46`,
filled at `:2251` from `monitorRun.series`). A non-ok response retries ONCE
without `series` (`:846-848`) with a diagnostic (`:490`, `:522`). Validated by
`validateSeries` (§1.D). Unknown sample keys dropped silently. Cross-sample
invariants explicitly NOT checked — `data.ts:803`: *"cross-sample consistency …
is Task 1's own domain-level contract, not this route's."*

**(iii) Server → Postgres.** `server/db/schema.ts:282` — `series: jsonb("series")`,
nullable, no default, no `.$type<>()`. Created by
`app/drizzle/0011_futuristic_roxanne_simpson.sql:7`
(`ALTER TABLE "session_logs" ADD COLUMN "series" jsonb;`). **Note for the
brief:** migrations live at `app/drizzle/`, so `git log -- app/server/db/migrations`
returns nothing. Excluded from `LOG_LIST_COLUMNS`; the drift pin in
`server/stores/contracts/storeContracts.ts` reads `list = get - steps - series
- machineSummary + …`. Nothing validates at the DB layer.

**(iv) Server → Concept2.** `concept2.ts:252-255` casts jsonb → F → `SessionLogRow.series`
(E) → `deriveAverageHeartRate` (`mapping.ts:673`) → `sendableInt(…, HR_MIN, HR_MAX)`
→ `post.heart_rate.average`, only when the machine's own average is undefined.
The cast checks only `typeof === "object" && !== null`. Drops `d`, `p`, `spm`,
`truncated`. **Trusts the field NAMES `t`/`hr`/`r` with no compiler link to the
producer at all**, because server code never imports from `src/`.

---

## 3. The `r` flag's full path

**Producer — exactly one:** `seriesRecorder.ts:425`, on `MonitorFrame.state === "resting"`.

**Production consumers — two** (`grep -rnE '\.r === true|\.r !== true|r\?: true|\{ r:|, r:'`):
`domain/monitor/derivedHeartRate.ts:103` (excludes rest from the HR mean) and
`src/log/traceModel.ts:182` (`const rest = s.r === true;` → `Reading.rest` →
the chart; its comment `:164-168`: *"carried straight from `Sample.r`, never
re-derived"*). (Hits at `logs.ts:138`, `mapping.ts:64`, `concept2.ts:253` are type-level;
`data.ts:885/895` is the validator.)

**Tests building a sample with `r` BY HAND** (the RF33-vulnerable population):
`derivedHeartRate.replay.test.ts:61,162,163` · `traceModel.test.ts:268,288-290,300-301,460,477`
· `TraceChart.test.tsx:587` · `storedSummary.test.ts:299` · `mapping.test.ts:1119`
· `data.test.ts:3511,3539`.

**Files reaching `createSeriesRecorder`** (`grep -rln`, 6 test files):
`seriesRecorder.test.ts`, `derivedHeartRate.replay.test.ts`,
`useMonitorSession.test.ts`, `sessionTotals.test.ts`, `traceModel.test.ts`,
`TraceChart.test.tsx`. Those asserting on `r` from recorder output:
`seriesRecorder.test.ts:1075`, `derivedHeartRate.replay.test.ts:85,246`,
`sessionTotals.test.ts:2040`, `traceModel.test.ts:385,513`.

**RF24 reading:** the CLIENT has an upstream-of-producer gate
(`derivedHeartRate.replay.test.ts:230-251`). The SERVER has none — no test
drives the recorder, POSTs its output, and reads the Concept2 payload back.
Every server test of `r` starts from a hand-typed literal, and that is exactly
the seam where declarations C, E and F live.

---

## 4. "Required on the INPUT interface, optional on the persisted shape"

`deriveAverageHeartRate(samples: readonly HeartRateSample[])`
(`derivedHeartRate.ts:93-95`), three call sites (§0.2).

**Two compiler facts, measured this session (PRIMARY):**
- `strict: true` in all three tsconfigs (`tsconfig.app.json:14`,
  `tsconfig.node.json:12`, `tsconfig.server.json:19`); **`exactOptionalPropertyTypes`
  is set NOWHERE** (grep returns no hit). So `r?: true` accepts an explicit
  `r: undefined`, and a required `r: true | undefined` is satisfied by passing
  `undefined` explicitly but NOT by omitting the key.
- `JSON.stringify({t:1,d:2,p:3,spm:4,r:undefined})` is 27 bytes and
  **byte-equal** to the same object without `r` (`node -e`, measured).
  **A required KEY with an optional VALUE costs ZERO persisted bytes** — which
  is not the same thing as `r: null`, and is the hinge of this whole row.

**Options the existing types allow** (enumerated, not designed):

1. **`Pick<Sample, "t"|"hr"|"r">` as B's type.** One spelling, so a rename
   cannot diverge. Cost: `domain/` would import from `src/`, reversing the
   current direction (`seriesRecorder.ts` imports `MonitorFrame` FROM
   `domain/`). INFERENCE: needs `Sample` moved into `domain/` first; creates
   no other compile error.
2. **`Required<Pick<Sample, …>>`, or a mapped type with `-?`.** Key required,
   value `true | undefined`. Compile errors it creates: every construction site
   that OMITS `r` — `seriesRecorder.ts:425`'s conditional spread plus the ~13
   hand-built test literals in §3. Zero persisted bytes. This is the mechanical
   reading of the row's own prescription.
3. **Keep B hand-written, add a compile-time pin.** The repo already runs this
   idiom for the sibling problem: `logs.ts:332`
   (`] as const satisfies readonly (typeof endedByEnum.enumValues)[number][];`)
   and `schema.test.ts:26` (`const EXHAUSTIVE: Record<EndedBy, true>`). Makes a
   rename a compile error with no file moved. Catches a renamed field; does NOT
   catch a same-named field whose MEANING changed.
4. **Leave B; derive E and F from C.** Both server files already import
   `stores/logs.js`, so `Pick<LogSeriesSample, "t"|"hr"|"r">` at both sites
   closes two of the six seams with no cross-tree import. The ROADMAP row does
   not name E/F as seams at all.

**What none of these fix:** C is a hand-copy across a boundary the repo
deliberately does not cross (`logs.ts:120-128`). No compiler link exists there
without a shared package. The only mechanical gate available is a test that
imports both trees — the precedent `logs.ts:316-318` already names
(`partial.integration.test.ts`'s `expect([...PARTIAL_ENDED_BY]).toStrictEqual([...PARTIAL_CLOSE_REASONS])`).

---

## 5. The byte-size claim, re-derived

`SERIES_SAMPLE_CAP = 14_400` (`seriesRecorder.ts:216`, *"4 hours of 1 Hz
samples"*), re-declared at `data.ts:795`. Measured via `node -e` (PRIMARY):

| measurement | value |
| --- | --- |
| `{"t":12345,"d":23456,"p":1204,"spm":26,"hr":142}` | 48 B |
| the same `+ "r":null` | 57 B |
| **per-sample delta** | **+9 B** ✓ matches the row |
| `14400 × 9` | 129,600 B = **126.6 KiB** ✓ the row's "+127 KiB" |
| 14,400 hr-bearing work samples, whole `series` | 703.6 KiB → 830.2 KiB, **+18.0 %** |
| 14,400 hr-LESS work samples, whole `series` | 577.1 KiB → 703.7 KiB, **+21.9 %** |

**Verdict:** `+9 B` and `+127 KiB` reproduce exactly. **`+19.1 %` does not
reproduce as a single number** — the percentage depends on the fraction of
samples carrying `hr`, and the two bracketing measurements give 18.0 % (all
belted) and 21.9 % (no belt). 19.1 % sits inside the bracket, so the row's
figure is consistent but its precision is not reproducible without the
hr-fraction assumption it never states. The spec should carry the range or the
assumption (RF16).

**The number the row does not carry:** `r: undefined` costs **0 bytes**
(measured, §4). The zero-byte reading and the compiler link are not in tension;
only `r: null` is.

---

## 6. The `EndedBy` mirror (James: rides PR 3)

**Three mirrors, each PRIMARY:**
- `server/db/schema.ts:75-83` — `endedByEnum = pgEnum("ended_by", [6 values])`.
  Its comment `:70-74`: *"three independent mirrors of the same value set with
  no shared source … All three move together in the same commit."*
- `server/stores/logs.ts:47-53` — `export type EndedBy = "finished" | "rower" |
  "link-lost" | "program-failed" | "program-dropped" | "interrupted";`
  Comment `:41-46`: *"a HAND-COPIED literal union, not derived from `CloseReason`."*
- `server/routes/data.ts:66-73` — `const ENDED_BY_VALUES: EndedBy[] = [...]`.

**Consumers.** `EndedBy`: `logs.ts:228` (`LogInput.endedBy?: EndedBy | null`),
`data.ts:22` (import), `:173` (`!ENDED_BY_VALUES.includes(value as EndedBy)`),
`:2008` (`(body.endedBy as EndedBy | null | undefined) ?? null`),
`schema.test.ts:3,26`. `endedByEnum`: `schema.ts:294` (the column),
`logs.ts:332` (`PARTIAL_ENDED_BY`'s satisfies clause), `schema.test.ts:2,37`.

**Gates that exist.** `schema.test.ts:35-40` —
`expect(new Set(endedByEnum.enumValues)).toStrictEqual(new Set(Object.keys(EXHAUSTIVE)))`
with `EXHAUSTIVE: Record<EndedBy, true>`: this is the real gate.
`data.test.ts:1309-1325` — a POST loop over a hand-typed six-value literal
asserting 201 each: gates `ENDED_BY_VALUES` against a fourth list, not against
either other mirror. `server/routes/endedBy.integration.test.ts` — real
Postgres round-trip.

**What `export type EndedBy = (typeof endedByEnum.enumValues)[number]` changes:**
- `logs.ts:47`: derived. `logs.ts:4` already imports `endedByEnum`, so no new
  import edge.
- `logs.ts:332` `PARTIAL_ENDED_BY`: unchanged — already derives from
  `endedByEnum.enumValues`. It is the in-file precedent that this compiles.
- `data.ts:66`: still a hand-typed array. `as const satisfies readonly EndedBy[]`
  cannot catch a MISSING member; deriving it as `endedByEnum.enumValues` would
  collapse the third mirror, but `data.ts` does not currently import
  `../db/schema.js` — a new import edge for the route layer (INFERENCE).
- `schema.test.ts:26` `EXHAUSTIVE`: **becomes tautological.** With `EndedBy`
  derived, `Record<EndedBy, true>` can no longer go red, because there is no
  drift left to have. **RF21:** the test must be deleted or re-pointed, never
  left green-forever. The ROADMAP row does not mention this.

**Is `enumValues` a readonly tuple in the installed version?** drizzle-orm
**0.45.2** (`app/node_modules/drizzle-orm/package.json`). PRIMARY, from
`drizzle-orm/pg-core/columns/enum.d.ts`:
```ts
export interface PgEnum<TValues extends [string, ...string[]]> {   // :52
    readonly enumValues: TValues;                                  // :57
}
export declare function pgEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
    enumName: string, values: T | Writable<T>): PgEnum<Writable<T>>;
```
The PROPERTY is `readonly`; its TYPE is the literal tuple inferred at the call
site (`Writable<T>` — a mutable tuple of the literal members, NOT `string[]`).
So `(typeof endedByEnum.enumValues)[number]` resolves to the exact six-member
union. The `string[]` hits elsewhere in that `.d.ts` are erased builder
configs, not `pgEnum`'s return. Already proven in-repo: `logs.ts:332` compiles
that exact expression today.

---

## 7. Orders against PR 1 — what PR 3 may and may not change

PR 1's fixtures: seven files at
`.claude/worktrees/md-pr1/app/src/monitor/fixtures/monitorRun-bytes/*.json`,
captured by `app/scripts/capture-monitor-run-fixtures.ts` driving the REAL
writer against main at `4aa3d132`. Gate: `app/src/monitor/handoffStoreBytes.test.ts`,
three legs per its own header — (a) byte identity of the writer's output,
(b) each fixture's parsed KEY SET against an independent literal list,
(c) old bytes still load. Header instruction, verbatim: *"Never regenerate them
to make this green."*

The `ordinary` series, `monitorRunShapes.ts:78-83` (PRIMARY):
```ts
const SERIES = { samples: [
  { t: 0, d: 0, p: 120,   spm: 24 },
  { t: 1, d: 4, p: 121.5, spm: 25, hr: 140 },
  { t: 2, d: 8, p: 122,   spm: 25, r: true as const },
]};
```
It is HAND-AUTHORED, not recorder-produced — `p: 121.5` is a non-integer the
recorder can never emit (`seriesRecorder.ts:419` `Math.round`) and which
`validateSeriesSample` would 400. `EXPECTED_KEYS.ordinary` is
`[...BASE_KEYS, "series"]`: leg (b) pins TOP-LEVEL record keys only, never
sample keys.

**MAY, without invalidating the bytes:**
- rename or re-derive any TYPE (B, C's declaration, E, F), add `satisfies` pins,
  `Pick`/mapped types — none change emitted bytes;
- make `r` a REQUIRED KEY valued `true | undefined` anywhere, including on
  `Sample`: `undefined` stringifies to nothing (measured §4), so `ordinary`'s
  three samples serialize byte-identically whether `seriesRecorder.ts:425` keeps
  the conditional spread or writes `r: undefined` explicitly;
- change the validator's `r`/unknown-key handling — these fixtures are
  localStorage bytes and never pass through `validateSeries`.

**MAY NOT, without recapturing:**
- emit `"r":false` or `"r":null` on any sample — leg (a) reds on `ordinary` AND
  `sacrifice-thrown-with-series` (both carry `SERIES`);
- rename `t`/`d`/`p`/`spm`/`hr`/`r` in the SERIALIZED output;
- reorder keys within a sample (`JSON.stringify` preserves insertion order; the
  fixture's order is `seriesRecorder.ts:415-426`'s construction order);
- add any field to `Sample` or `SeriesData`;
- touch `monitorRunShapes.ts`'s `SERIES` literal — that is the fixture INPUT,
  so changing it invalidates leg (a) by construction.

**Ordering.** INFERENCE: if PR 3 lands after PR 1 and stays inside the MAY list,
no recapture is needed and PR 3 inherits the gate for free.

---

## 8. Existing gates, and whether each starts upstream of the producer (RF24)

| gate | what it holds | upstream? |
| --- | --- | --- |
| `derivedHeartRate.replay.test.ts:113-131` — the `MAX_GAP_DECISECONDS` pin (shipped #345) | 59 → 100, 60 → `null`, independent literals | **No** — hand-built, deliberately: it is a unit-boundary pin and must not depend on a capture |
| `derivedHeartRate.replay.test.ts:230-251` "over the RECORDER's own samples" | capture → parsers → `createSeriesRecorder` → domain fn; strips the flag by rebuilding `{t,hr}` | **Yes** — the only one in the repo. Weakness: `:246` names `"r"` for a sanity count |
| `derivedHeartRate.replay.test.ts:85` | per-capture rest count | Yes, but names the field |
| `seriesRecorder.test.ts:1057-1075` | 21 rest-marked samples off a real capture | **Yes** (producer side only; no consumer in the chain); names `r` at `:1075` |
| `traceModel.test.ts:385,513` | rest count and `Reading.rest` off recorder output | Yes, client chart path |
| `data.test.ts:3351-3490` — validator suite | every band, `"r must be true or absent"` (`:3511`, `:3539`), unknown-key drop, GET round-trip | **No** — `validSample()` is a hand-typed literal (`:3352-3359`) |
| `seriesCapture.integration.test.ts:77-153` (S5) | 14,400 samples POSTed through real middleware into real Postgres, read back `toStrictEqual`, list omits `series` | **No** — built by a loop with literal field names (`:94`) |
| `mapping.test.ts:1119` | `{ t: 10, hr: 140, r: true as const }` reaching the C2 payload | **No** — and this is the seam where E and F live |
| `handoffStoreBytes.test.ts` (PR 1, in flight) | byte identity / key set / old-bytes-load | **No** for the sample shape — `SERIES` is hand-authored (§7) |
| `schema.test.ts:35-40` | `endedByEnum` ≡ `EndedBy` | n/a (type-level) |

**The RF24 hole, stated plainly:** every gate on the SERVER half of the shape —
validator, Postgres integration write, Concept2 mapping — begins with a
hand-typed literal. No test anywhere drives `createSeriesRecorder` and carries
its output across the POST. That is where three of the six declarations sit,
and it is the same seam RF33 bit on the client.
