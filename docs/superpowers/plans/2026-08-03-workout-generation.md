# Workout Generation Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 35-workout starter library with ~300 original workouts derived structurally (never verbatim) from James's Erg Book photos, plus a private originals CSV for James.

**Architecture:** A five-stage offline pipeline — vision extraction (double-read + reconcile) → private originals.json/CSV → repo-safe aggregate pattern digest → grid-constrained authoring of 300 workouts gated by a permanent validation test → boot-time seed reconcile that swaps the old global library for the new one. No schema changes; no new runtime features.

**Tech Stack:** Existing app stack (React 19/Vite client untouched except tests, Express 5 server, Drizzle/Postgres, Vitest, Playwright). Node scripts in the session scratchpad for the private pipeline stages.

**Spec:** `docs/superpowers/specs/2026-08-03-workout-generation-design.md` — read it first.

## Global Constraints

- **Content policy (binding):** only aggregate statistics (`patterns.json`) and the 300 ORIGINAL workouts enter the repo. Book titles, prose, per-workout rows, `originals.json`, and the CSV never enter the repo or any commit. Repo-side no-clone enforcement is impossible (it would need the originals), so the no-clone gate runs offline in the scratchpad (Task 8).
- **SDLC:** all work in the existing worktree `.claude/worktrees/workout-generation` (branch `workout-generation`, hooks verified firing 2026-08-03). `git rev-parse --show-toplevel` before EVERY commit. Every subagent reads `.claude/agent-briefing.md` before its task brief. No PR merge without James's explicit approval. Subagents never merge/approve/remove worktrees.
- **Session artifacts:** scratchpad root is the session scratchpad dir (see system prompt); referred to below as `$SCRATCH`. Photos already extracted at `$SCRATCH/ergbook/ergbook - photos/` (66 JPEGs).
- pnpm only, ESM only, server imports use `.js` extensions. TDD: failing test first. TypeScript stays `~6.0.x`.
- Run all repo commands in `<worktree>/app/`.
- If the diff touches `app/src/` (it will — test files), run `pnpm e2e` before reporting done; `pnpm screenshots` because library content changes every screen that lists workouts.
- Check per-file coverage for every file touched (aggregate gate lies — recurring failure #2).
- Reference baselines for banding/estimation everywhere: `{ k2Seconds: 112, k6Seconds: 122 }` (splits, s/500m — same values `starter.test.ts` uses).
- Quota grid (exact, also encoded in Task 6's test):

  | | O2 | AT | TR | AN | Total |
  |---|---|---|---|---|---|
  | <20 min | 2 | 5 | 9 | 14 | **30** |
  | 20–30 | 14 | 19 | 22 | 20 | **75** |
  | 30–45 | 36 | 34 | 32 | 18 | **120** |
  | 45–60 | 18 | 13 | 9 | 5 | **45** |
  | 60+ | 20 | 4 | 3 | 3 | **30** |
  | **Total** | **90** | **75** | **75** | **60** | **300** |

  Band = `estimateMinutes(steps, BASELINES).minutes` (total incl. warm-up and rests): `<20`, `[20,30)`, `[30,45)`, `[45,60)`, `>=60`.

---

### Task 1: Extraction pass 1 (vision, fan-out)

**Files:**
- Create: `$SCRATCH/extract/pass1/<IMG>.json` (one per photo, NOT in repo)

**Interfaces:**
- Produces: JSON files, each an array of card records in the schema below. Tasks 2–3 consume them.

Card record schema (exact):

```json
{
  "photo": "IMG_0000.jpeg",
  "bookNum": 999,
  "title": "Example Card",
  "section": "Introductory",
  "typeChip": "AN",
  "painChip": 2,
  "totalChipMinutes": 22,
  "steps": [
    { "k": "wu", "minutes": 10 },
    { "k": "reps", "count": 6 },
    { "k": "w", "duration": { "kind": "time", "minutes": 1 },
      "ref": { "effort": "max" }, "spm": 30, "restMinutes": 1 }
  ],
  "rawText": null
}
```

Non-workout pages produce `{ "photo": "...", "nonWorkout": true, "note": "section intro page: SHORT WORKOUTS" }`.

- [ ] **Step 1: List the photos and split into batches**

Run: `ls "$SCRATCH/ergbook/ergbook - photos/" | sort` — expect 66 files. Split into 11 batches of 6.

- [ ] **Step 2: Dispatch 11 parallel extraction agents (general-purpose)**

Each agent gets this prompt verbatim (with its batch of absolute photo paths substituted):

```
Read /Users/james/projects/github/jamesawesome/Ergomatic/.claude/agent-briefing.md first.

You are transcribing workout cards from photos of a printed rowing training
book, for structural-reference use by the book's owner. The photos are
sideways (rotate mentally 90°); each shows a two-page spread of "cards".
Each card has: a number+title heading (e.g. "999. Example Card"), a warm-up line,
one or more work/rest lines, and chips along its edge: total minutes
(e.g. "20.5 min."), a section chip (Intro/Short/Medium/Long/Advanced...),
a pain number (1–5), and a type chip (O2/AT/TR/AN).

For EACH photo below: use the Read tool on the file, transcribe EVERY card
fully visible on the spread, and Write ONE file
$SCRATCH/extract/pass1/<photo-basename>.json
containing a JSON array of records with this exact schema:
{ "photo", "bookNum", "title", "section", "typeChip", "painChip",
  "totalChipMinutes", "steps", "rawText" }

"steps" uses the app's step grammar:
  { "k":"wu", "minutes": N }                     — warm-up line
  { "k":"reps", "count": N }                     — an "Nx ..." repeat marker;
      place it BEFORE the steps it repeats; at most one per workout
  { "k":"w", "duration": {"kind":"time","minutes":N} |
             {"kind":"distance","meters":N},
    "ref": {"base":"2k"|"6k","off":N} | {"effort":"max"|"min"},
    "spm": N?, "restMinutes": N? }               — a work prescription
  { "k":"r", "minutes": N }                      — a standalone one-time rest

Mapping conventions:
- "10' easy warm up" → {"k":"wu","minutes":10}
- "6x 0.5' at max power @ 30 SPM, 1.5' rest" →
  {"k":"reps","count":6}, then the work step with "restMinutes": 1.5
- per-rep rest ("1' rest in between") goes on the work step's restMinutes;
  a single mid-workout break is a standalone "r" step
- "at 2k pace -1" → {"base":"2k","off":-1}; "at 6k pace +18" →
  {"base":"6k","off":18}; "at max pressure/power" → {"effort":"max"}
- "@ 24 SPM" → "spm": 24
- minutes may be fractional (0.5 = 30 s)
- anything the grammar cannot express (variable-rate bursts, "max rating
  every 5'", pace changes mid-piece): extract what does map and put the
  leftover prescription VERBATIM into "rawText" (else null)
- a page with no cards (section intro, table of contents, tests chapter
  prose): one record {"photo":..., "nonWorkout": true, "note": "..."}

Transcribe faithfully — do not correct, improve, or invent. If a card is
partially cut off or illegible, include it with "rawText" describing what
is unreadable and set unknown fields to null.

Photos: <list of 6 absolute paths>

Return exactly: "done: <total card count> cards across <N> photos".
```

- [ ] **Step 3: Verify output files exist and parse**

Run: `node -e 'const fs=require("fs");const d=process.argv[1];let n=0;for(const f of fs.readdirSync(d)){JSON.parse(fs.readFileSync(d+"/"+f));n++};console.log(n,"files ok")' "$SCRATCH/extract/pass1"`
Expected: `66 files ok` (dispatch a follow-up agent for any missing/broken file before proceeding).

### Task 2: Extraction pass 2 + reconcile → originals.json

**Files:**
- Create: `$SCRATCH/extract/pass2/<IMG>.json` (independent second read)
- Create: `$SCRATCH/scripts/reconcile.mjs`
- Create: `$SCRATCH/extract/originals.json`, `$SCRATCH/extract/conflicts.json`, `$SCRATCH/extract/reshoot.md`

**Interfaces:**
- Consumes: Task 1's pass1 files and schema.
- Produces: `originals.json` — a single JSON array of reconciled card records (same schema, no `nonWorkout` records) sorted by `bookNum`. Tasks 3, 4, 8 consume it.

- [ ] **Step 1: Dispatch pass 2** — same 11-batch dispatch as Task 1 Step 2, output dir `pass2`, with this line appended to the prompt: `This is an independent verification read: do NOT read any files under extract/pass1.`

- [ ] **Step 2: Write the reconcile script**

`$SCRATCH/scripts/reconcile.mjs`:

```js
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const SCRATCH = process.argv[2];
const load = (dir) => {
  const byNum = new Map();
  for (const f of readdirSync(`${SCRATCH}/extract/${dir}`)) {
    for (const r of JSON.parse(readFileSync(`${SCRATCH}/extract/${dir}/${f}`, "utf8"))) {
      if (r.nonWorkout) continue;
      if (byNum.has(r.bookNum)) console.warn(`${dir}: duplicate bookNum ${r.bookNum} (${f})`);
      byNum.set(r.bookNum, r);
    }
  }
  return byNum;
};

// Sum steps in minutes, expanding a reps marker over everything after it
// (mirrors domain/expand.ts liveIndices). Distance steps make the sum an
// estimate — skip the strict chip check for those cards.
const totalMinutes = (steps) => {
  const idx = steps.findIndex((s) => s.k === "reps");
  const expand = idx === -1 ? steps
    : [...steps.slice(0, idx),
       ...Array.from({ length: steps[idx].count }, () => steps.slice(idx + 1)).flat()];
  let min = 0, estimated = false;
  for (const s of expand) {
    if (s.k === "wu" || s.k === "r") min += s.minutes;
    if (s.k === "w") {
      if (s.duration.kind === "time") min += s.duration.minutes;
      else estimated = true;
      min += s.restMinutes ?? 0;
    }
  }
  return { min, estimated };
};

const key = (r) => JSON.stringify([r.title, r.section, r.typeChip, r.painChip, r.totalChipMinutes, r.steps, r.rawText]);
const p1 = load("pass1"), p2 = load("pass2");
const nums = [...new Set([...p1.keys(), ...p2.keys()])].sort((a, b) => a - b);
const originals = [], conflicts = [];
for (const n of nums) {
  const a = p1.get(n), b = p2.get(n);
  if (!a || !b) { conflicts.push({ bookNum: n, reason: !a ? "missing in pass1" : "missing in pass2" }); continue; }
  if (key(a) !== key(b)) { conflicts.push({ bookNum: n, reason: "passes disagree", pass1: a, pass2: b }); continue; }
  originals.push(a);
}
// Integrity: continuity + chip arithmetic (±1 min tolerance for rounding).
for (let i = 1; i < nums.length; i++)
  if (nums[i] !== nums[i - 1] + 1) console.warn(`gap: ${nums[i - 1]} -> ${nums[i]}`);
for (const r of originals) {
  const { min, estimated } = totalMinutes(r.steps);
  if (!estimated && r.totalChipMinutes != null && Math.abs(min - r.totalChipMinutes) > 1)
    conflicts.push({ bookNum: r.bookNum, reason: `chip ${r.totalChipMinutes} vs computed ${min}`, record: r });
}
const clean = new Set(conflicts.map((c) => c.bookNum));
writeFileSync(`${SCRATCH}/extract/originals.json`,
  JSON.stringify(originals.filter((r) => !clean.has(r.bookNum)), null, 1));
writeFileSync(`${SCRATCH}/extract/conflicts.json`, JSON.stringify(conflicts, null, 1));
console.log(`reconciled ${originals.length - conflicts.filter((c) => c.record).length} clean, ${conflicts.length} conflicts`);
```

- [ ] **Step 3: Run it** — `node $SCRATCH/scripts/reconcile.mjs $SCRATCH`. Expected: a few hundred clean records, a small conflict list.

- [ ] **Step 4: Third reads** — for each entry in `conflicts.json`, dispatch one agent per affected photo with the Task 1 prompt scoped to the named card(s) plus: `Two prior reads disagreed on this card. Read extra carefully; output only this card's record.` Adjudicate: if the third read matches one pass, take it; if it matches neither, the card goes to `$SCRATCH/extract/reshoot.md` (photo name, card number, what's ambiguous). Merge adjudicated records into `originals.json` (rerun reconcile with corrected pass files, or patch the array directly and re-verify it parses).

- [ ] **Step 5: Sanity-check scale** — the book's catalog is ~375 workouts; expect `originals.json` length in that region. If it's wildly short, photos are missing — tell James rather than proceeding thin.

### Task 3: Originals CSV → Desktop (personal use)

**Files:**
- Create: `$SCRATCH/scripts/csv.mjs`
- Create: `~/Desktop/ergbook_originals.csv` (NEVER committed)

**Interfaces:**
- Consumes: `originals.json`.

- [ ] **Step 1: Write the CSV script**

Columns: `bookNum,title,section,type,pain,bookTotalMin,steps_text,steps_json,rawText`.
`steps_text` rendering (house notation, app-deviation-adapted): `wu 10:00` · reps wrap the remainder as `6x[ ... ]` · work `4:00 2k-1 @24 r4:00` / `500m 6k+2 @28 r2:00` / `0:30 max @30 r1:30` · standalone rest `rest 5:00`. Times in the elastic positional format (`0:30`, `4:00`, `1:05:00`).

```js
import { readFileSync, writeFileSync } from "node:fs";
const recs = JSON.parse(readFileSync(process.argv[2], "utf8"));
const clock = (m) => {
  const t = Math.round(m * 60), h = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), s = t % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
};
const ref = (r) => "effort" in r ? r.effort : `${r.base}${r.off >= 0 ? "+" : ""}${r.off}`;
const stepText = (s) =>
  s.k === "wu" ? `wu ${clock(s.minutes)}` :
  s.k === "r" ? `rest ${clock(s.minutes)}` :
  [s.duration.kind === "time" ? clock(s.duration.minutes) : `${s.duration.meters}m`,
   ref(s.ref), s.spm ? `@${s.spm}` : null, s.restMinutes ? `r${clock(s.restMinutes)}` : null]
    .filter(Boolean).join(" ");
const stepsText = (steps) => {
  const i = steps.findIndex((s) => s.k === "reps");
  if (i === -1) return steps.map(stepText).join("; ");
  return [...steps.slice(0, i).map(stepText),
    `${steps[i].count}x[ ${steps.slice(i + 1).map(stepText).join("; ")} ]`].join("; ");
};
const q = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
const rows = [["bookNum","title","section","type","pain","bookTotalMin","steps_text","steps_json","rawText"].join(",")];
for (const r of recs)
  rows.push([r.bookNum, q(r.title), q(r.section), r.typeChip, r.painChip, r.totalChipMinutes,
    q(stepsText(r.steps)), q(JSON.stringify(r.steps)), q(r.rawText)].join(","));
writeFileSync(process.argv[3], rows.join("\n"));
console.log(`${recs.length} rows`);
```

- [ ] **Step 2: Run** — `node $SCRATCH/scripts/csv.mjs $SCRATCH/extract/originals.json ~/Desktop/ergbook_originals.csv`. Open the file, eyeball 5 rows against their photos.
- [ ] **Step 3: Deliver** — SendUserFile the CSV to James (display: attach) with `reshoot.md` contents (if any) in the caption. **No commit — this file never enters git.**

### Task 4: Pattern digest → `patterns.json` (repo)

**Files:**
- Create: `$SCRATCH/scripts/digest.mjs`
- Create: `app/domain/generation/patterns.json`
- Test: `app/domain/generation/patterns.test.ts`

**Interfaces:**
- Consumes: `originals.json` (private).
- Produces: committed `patterns.json`: `{ _meta, cells: Record<"O2|<20"|..., Cell> }` where `Cell = { n, shapes: Record<string, number>, workRestRatio: {min,max} | null, paceOff: { "2k": [lo,hi] | null, "6k": [lo,hi] | null }, spm: [lo,hi] | null, warmupMinutes: [lo,hi] | null, repsCount: [lo,hi] | null, effortShare: number }`. Task 7's authors and the future runtime generator consume it.

- [ ] **Step 1: Write the failing shape test** (`app/domain/generation/patterns.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import patterns from "./patterns.json";

// The digest is the content-policy boundary: aggregate statistics only.
// These tests pin the boundary, not the statistics.
describe("generation patterns digest", () => {
  it("carries the policy note and only aggregate cell fields", () => {
    expect(patterns._meta.policy).toMatch(/aggregate statistics only/i);
    const allowed = new Set(["n", "shapes", "workRestRatio", "paceOff", "spm",
      "warmupMinutes", "repsCount", "effortShare"]);
    for (const [key, cell] of Object.entries(patterns.cells)) {
      expect(key).toMatch(/^(O2|AT|TR|AN)\|(<20|20-30|30-45|45-60|60\+)$/);
      for (const field of Object.keys(cell)) expect(allowed).toContain(field);
      expect(cell.n).toBeGreaterThan(0);
    }
  });
  it("never contains titles or prose", () => {
    const raw = JSON.stringify(patterns);
    expect(raw).not.toMatch(/"title"|"name"|"rawText"/);
  });
});
```

- [ ] **Step 2: Run it** — `pnpm vitest run domain/generation/patterns.test.ts` → FAIL (no patterns.json).
- [ ] **Step 3: Write digest.mjs** — group originals by `typeChip` × band (band from Task 2's `totalMinutes`, using chip when steps are distance-estimated); per cell emit: `n`; `shapes` (classify each card: `continuous` 1 work step no reps · `nxtime` / `nxdistance` reps of uniform work · `pyramid`/`ladder` monotonic or up-down duration sequence · `mixed` otherwise); `workRestRatio` min/max of work:rest per rep (time cards only); `paceOff` per base min/max; `spm` min/max; `warmupMinutes` min/max; `repsCount` min/max; `effortShare` fraction of cards using effort refs. Write `_meta`: `{ policy: "aggregate statistics only — no titles, no prose, no per-workout rows", source: "owner's reference photos, extracted 2026-08-03", cards: <total n> }`. Emit to `app/domain/generation/patterns.json` (2-space indent).
- [ ] **Step 4: Run test** → PASS. Read the JSON top to bottom once: confirm nothing but numbers/ranges/labels (policy check by eyes, not just regex).
- [ ] **Step 5: Commit** — `git rev-parse --show-toplevel` (must print the worktree), then `git add app/domain/generation/ && git commit -m "feat: pattern digest — the book reduced to its statistics"`.

### Task 5: Name pool (~320 weather names)

**Files:**
- Create: `$SCRATCH/names.json` — `{ "O2": [...90+10 spares], "AT": [...], "TR": [...], "AN": [...] }`

**Interfaces:**
- Produces: per-type name lists; Task 7 authors draw from exactly their type's list. Task 6's gate enforces global uniqueness.

- [ ] **Step 1: Generate the pool.** One agent (or inline): ~320 unique weather/atmospheric names — winds of the world, storm systems, cloud forms, optical/atmospheric phenomena, sea states. Conventions: intensity maps to violence (calm phenomena → O2, organized fronts/pressure → AT, driving winds/race weather → TR, violent convective events → AN). 1–2 words, ≤80 chars, no book titles (check against `originals.json` titles — any collision with a book title is discarded and replaced; coincidental overlap with common weather words is otherwise fine, but titles OF the book's workouts are never reused). Existing 35 starter titles MAY be reused (they're ours) but the pool must be internally unique.
- [ ] **Step 2: Validate** — `node` one-liner: flatten, assert `new Set(all).size === all.length`, assert counts ≥ [100, 85, 85, 70] per type (quota + spares). Write `names.json`.

### Task 6: Library scaffold + permanent gate test (failing first)

**Files:**
- Create: `app/server/seed/library/o2.ts`, `at.ts`, `tr.ts`, `an.ts` (empty arrays for now)
- Create: `app/server/seed/library/index.ts`
- Test: `app/server/seed/library/library.test.ts`

**Interfaces:**
- Produces: `LIBRARY_WORKOUTS: Array<WorkoutInput & { sortOrder: number }>` from `app/server/seed/library/index.js`; per-type exports `O2_WORKOUTS` etc. (`WorkoutInput[]`, easy→hard order). `PLANS` re-export preserved. Tasks 7, 9, 10, 11 consume these names.

- [ ] **Step 1: Scaffold type files** — each e.g. `o2.ts`:

```ts
import type { WorkoutInput } from "../../../domain/types.js";

// O2 (aerobic base) block of the generated library — 90 workouts,
// easy→hard. Authored in Task 7 against the pattern digest
// (app/domain/generation/patterns.json); ordering here IS the library
// browsing order within the type block.
export const O2_WORKOUTS: WorkoutInput[] = [];
```

- [ ] **Step 2: Scaffold index.ts**:

```ts
import type { WorkoutInput } from "../../../domain/types.js";
import { AN_WORKOUTS } from "./an.js";
import { AT_WORKOUTS } from "./at.js";
import { O2_WORKOUTS } from "./o2.js";
import { TR_WORKOUTS } from "./tr.js";

// Library order: type blocks (O2, AT, TR, AN), easy→hard within each —
// the same browsing order the 35-starter library used. sortOrder is
// assigned here, 1..N in array order; authors never write it.
export const LIBRARY_WORKOUTS: Array<WorkoutInput & { sortOrder: number }> = [
  ...O2_WORKOUTS,
  ...AT_WORKOUTS,
  ...TR_WORKOUTS,
  ...AN_WORKOUTS,
].map((w, i) => ({ ...w, sortOrder: i + 1 }));

// Starter-content review convention (see the retired starter.ts): the plan
// presets ship alongside the library they schedule.
export { PLANS } from "../../../domain/plans.js";
```

- [ ] **Step 3: Write the gate test** (`library.test.ts`) — the permanent mechanical gate:

```ts
import { describe, it, expect } from "vitest";
import { estimateMinutes } from "../../../domain/expand.js";
import type { Difficulty, WorkoutType } from "../../../domain/types.js";
import { validateWorkoutInput } from "../../../domain/validate.js";
import { LIBRARY_WORKOUTS } from "./index.js";

// Reference baselines for banding (splits, s/500m) — the values the retired
// starter.test.ts used. Nominal: they only band, they never ship.
const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

type Band = "<20" | "20-30" | "30-45" | "45-60" | "60+";
const band = (m: number): Band =>
  m < 20 ? "<20" : m < 30 ? "20-30" : m < 45 ? "30-45" : m < 60 ? "45-60" : "60+";

// The spec's quota grid, verbatim (docs/superpowers/specs/
// 2026-08-03-workout-generation-design.md §4). Rows sum 90/75/75/60 = 300.
const QUOTA: Record<WorkoutType, Record<Band, number>> = {
  O2: { "<20": 2, "20-30": 14, "30-45": 36, "45-60": 18, "60+": 20 },
  AT: { "<20": 5, "20-30": 19, "30-45": 34, "45-60": 13, "60+": 4 },
  TR: { "<20": 9, "20-30": 22, "30-45": 32, "45-60": 9, "60+": 3 },
  AN: { "<20": 14, "20-30": 20, "30-45": 18, "45-60": 5, "60+": 3 },
};

// Authoring bands from the starter library's conventions (starter.ts header).
const SPM: Record<WorkoutType, [number, number]> = {
  O2: [18, 22], AT: [22, 26], TR: [24, 28], AN: [26, 32],
};
const PAIN_BY_DIFF: Record<Difficulty, [number, number]> = {
  easy: [1, 2], medium: [2, 4], hard: [4, 5],
};
const PAIN_BY_TYPE: Record<WorkoutType, [number, number]> = {
  O2: [1, 3], AT: [2, 4], TR: [2, 5], AN: [3, 5],
};

describe("LIBRARY_WORKOUTS", () => {
  it("has exactly 300 workouts with contiguous sortOrder", () => {
    expect(LIBRARY_WORKOUTS).toHaveLength(300);
    LIBRARY_WORKOUTS.forEach((w, i) => expect(w.sortOrder).toBe(i + 1));
  });

  it("every entry passes validateWorkoutInput", () => {
    for (const w of LIBRARY_WORKOUTS) {
      const r = validateWorkoutInput(w);
      expect(r.ok, `${w.title}: ${r.ok ? "" : r.errors.join("; ")}`).toBe(true);
    }
  });

  it("titles are unique", () => {
    expect(new Set(LIBRARY_WORKOUTS.map((w) => w.title)).size).toBe(300);
  });

  it("fills the quota grid exactly", () => {
    const got: Record<string, number> = {};
    for (const w of LIBRARY_WORKOUTS) {
      const { minutes } = estimateMinutes(w.steps, BASELINES);
      const key = `${w.type}|${band(minutes)}`;
      got[key] = (got[key] ?? 0) + 1;
    }
    for (const [type, bands] of Object.entries(QUOTA))
      for (const [b, n] of Object.entries(bands))
        expect(got[`${type}|${b}`] ?? 0, `${type} ${b}`).toBe(n);
  });

  it("keeps every work step's spm inside its type's band", () => {
    for (const w of LIBRARY_WORKOUTS) {
      const [lo, hi] = SPM[w.type];
      for (const s of w.steps)
        if (s.k === "w" && s.spm !== undefined)
          expect(s.spm >= lo && s.spm <= hi, `${w.title}: spm ${s.spm}`).toBe(true);
    }
  });

  it("prescribes spm on every work step", () => {
    for (const w of LIBRARY_WORKOUTS)
      for (const s of w.steps)
        if (s.k === "w") expect(s.spm, `${w.title}`).toBeDefined();
  });

  it("pairs difficulty and pain plausibly", () => {
    for (const w of LIBRARY_WORKOUTS) {
      const [dLo, dHi] = PAIN_BY_DIFF[w.difficulty];
      const [tLo, tHi] = PAIN_BY_TYPE[w.type];
      expect(w.pain >= dLo && w.pain <= dHi, `${w.title}: ${w.difficulty}/${w.pain}`).toBe(true);
      expect(w.pain >= tLo && w.pain <= tHi, `${w.title}: ${w.type}/${w.pain}`).toBe(true);
    }
  });

  it("has no two structurally identical workouts", () => {
    // Signature = everything but the title. Same structure + same numbers
    // under a different name is a duplicate, not variety.
    const sigs = LIBRARY_WORKOUTS.map((w) =>
      JSON.stringify({ t: w.type, s: w.steps }));
    expect(new Set(sigs).size).toBe(sigs.length);
  });

  it("orders each type block easy→hard (difficulty never decreases)", () => {
    const rank: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };
    for (const type of ["O2", "AT", "TR", "AN"] as const) {
      const block = LIBRARY_WORKOUTS.filter((w) => w.type === type);
      for (let i = 1; i < block.length; i++)
        expect(rank[block[i]!.difficulty] >= rank[block[i - 1]!.difficulty],
          `${type}: ${block[i - 1]!.title} -> ${block[i]!.title}`).toBe(true);
    }
  });
});
```

- [ ] **Step 4: Run** — `pnpm vitest run server/seed/library/` → FAIL (`toHaveLength(300)` gets 0). That failing gate is the authoring contract.
- [ ] **Step 5: Commit** — scaffold + gate: `git commit -m "test: the library gate — 300 slots, none filled"`. (pre-commit is lint+typecheck only, so a red unit test commits fine; do NOT push yet.)

### Task 7: Author the 300 (4 parallel agents, gate loop)

**Files:**
- Modify: `app/server/seed/library/o2.ts` (90), `at.ts` (75), `tr.ts` (75), `an.ts` (60)

**Interfaces:**
- Consumes: `patterns.json`, `$SCRATCH/names.json`, the gate test, `starter.ts` (still present) as style reference.
- Produces: filled `*_WORKOUTS` arrays satisfying the gate.

- [ ] **Step 1: Dispatch 4 authoring agents** (one per type file, parallel, worktree paths). Prompt template (substitute TYPE, counts, file, names, digest cells):

```
Read /Users/james/projects/github/jamesawesome/Ergomatic/.claude/agent-briefing.md first.

You are authoring the <TYPE> block of Ergomatic's generated workout library:
<N> ORIGINAL erg workouts in
<worktree>/app/server/seed/library/<type>.ts, filling the exported
<TYPE>_WORKOUTS array (currently empty). Work ONLY in that file.

These are original compositions grounded in aggregate statistics from
training literature — NEVER copy a specific workout you may know from any
book. Structural commons (8x500m, 4x1000m, standard pyramids) are fine.

Per-duration-band quotas for your type (band = estimateMinutes total with
baselines {k2Seconds: 112, k6Seconds: 122} — warm-up and all rests count):
<band: count lines from the QUOTA grid>

Ground structures in your type's digest cells (aggregate stats from the
reference material): <the type's cells from patterns.json, inline JSON>.
Cover the shape vocabulary (continuous / n×time / n×distance / pyramids /
ladders / mixed) roughly in proportion; don't invent shapes the digest
never saw, don't let one shape exceed ~40% of a band.

Conventions (from starter.ts, which stays your style reference — read it):
- Steps grammar: domain/types.ts. Every work step prescribes spm in
  <TYPE>'s band <lo>–<hi>. At most one reps marker per workout.
- Pace refs: use the digest's paceOff ranges per base; effort refs
  ({effort:"max"}) only where the digest's effortShare supports them.
- Warm-ups within the digest's warmupMinutes range; longer/harder pieces
  get the longer warm-ups.
- difficulty/pain: easy→1–2, medium→2–4, hard→4–5, AND type range
  <TYPE>: <tLo>–<tHi>. Assign honestly by suffering.
- Titles: use ONLY names from this list (your allocation, first <N> in
  order preferred, spares for taste): <names.json[TYPE]>.
- One //-comment line above each workout: type, structure, intent — match
  starter.ts's comment voice exactly.
- Array order = easy→hard (the gate enforces non-decreasing difficulty).
- Variety beats symmetry: vary interval counts, offsets, rests within a
  shape; no two of your workouts may share identical {steps} (the gate
  dedups structurally across all 300).

Verify before reporting: cd <worktree>/app && pnpm vitest run
server/seed/library/ — your file must contribute zero validation, spm,
pain, dedup, or ordering failures (quota failures for OTHER types are
expected until all four agents land). Also run pnpm typecheck.
Commit your file yourself: run git rev-parse --show-toplevel first — it
MUST print <worktree> — then git add app/server/seed/library/<type>.ts &&
git commit -m "feat: <type> block — <N> workouts". Do not push. Do not
touch any other file. Report: counts per band, shapes used, names consumed.
```

- [ ] **Step 2: Run the full gate** — `pnpm vitest run server/seed/library/` in the worktree. Expected: PASS all assertions. Bounce any failure back to the owning agent (SendMessage, same agent, with the exact test output); repeat until green.
- [ ] **Step 3: Taste pass** — read 10 random workouts per type file yourself; check comments read like starter.ts, structures make physiological sense (e.g. no 60' AN with 2:1 work:rest). Bounce anything that smells generated.
- [ ] **Step 4: Commit any bounce fixes** and confirm `git log` shows the four block commits.

### Task 8: Offline no-clone gate

**Files:**
- Create: `$SCRATCH/scripts/noclone.mjs`

**Interfaces:**
- Consumes: `originals.json` + the built library (via `tsx`/compiled import of `index.ts`).

- [ ] **Step 1: Write the script** — normalize both sets to signatures `{type, steps}` with spm stripped (book cards don't always carry spm; a structure+numbers match without spm is still a clone). Whitelist of rowing commons (exempt): any single-distance repeat of {500, 1000, 2000}m with count ≤ 10, the 500-1000-1500-1000-500 and 250-500-750-1000-750-500-250 pyramids, single continuous time pieces (a 30' steady piece can't be "cloned" — it's a duration). Flag any generated workout whose signature deep-equals an original's outside the whitelist.

```js
import { readFileSync } from "node:fs";
const originals = JSON.parse(readFileSync(process.argv[2], "utf8"));
const { LIBRARY_WORKOUTS } = await import(process.argv[3]); // dist path or tsx
const strip = (steps) => steps.map((s) => { const { spm, ...rest } = s; return rest; });
const sig = (type, steps) => JSON.stringify({ type, steps: strip(steps) });
const isCommons = (steps) => {
  const work = steps.filter((s) => s.k === "w");
  if (work.length === 1 && steps.some((s) => s.k !== "w" && s.k !== "wu") === false) return true; // continuous piece
  const dists = work.map((s) => s.duration).filter((d) => d.kind === "distance").map((d) => d.meters);
  if (dists.length === work.length && new Set(dists).size === 1 && [500, 1000, 2000].includes(dists[0])) return true;
  const seq = dists.join(",");
  return seq === "500,1000,1500,1000,500" || seq === "250,500,750,1000,750,500,250";
};
const bookSigs = new Map(originals.map((r) => [sig(r.typeChip, r.steps), r.bookNum]));
let clones = 0;
for (const w of LIBRARY_WORKOUTS) {
  if (isCommons(w.steps)) continue;
  const hit = bookSigs.get(sig(w.type, w.steps));
  if (hit !== undefined) { console.log(`CLONE: "${w.title}" == book #${hit}`); clones++; }
}
console.log(clones === 0 ? "no clones" : `${clones} clones — bounce to authors`);
process.exit(clones === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it** (`pnpm exec tsx` from `app/` so the TS import resolves; adjust the import path accordingly). Expected: `no clones`. Any hit bounces to the owning author agent for a structural rework, then re-run Task 7 Step 2's gate AND this script.
- [ ] **Step 3: Record the result** (count checked, zero clones) in the task report — the PR's risk note cites it, since this gate can't live in CI.

### Task 9: `deleteGlobals()` store method (contract-tested)

**Files:**
- Modify: `app/server/stores/workouts.ts`
- Test: `app/server/stores/contracts/` (both fake and real contract files — same case list, per the contract-test rule in docs/TESTING.md)

**Interfaces:**
- Produces: `deleteGlobals(): Promise<void>` on the workouts store. Task 10 consumes it.

- [ ] **Step 1: Write the failing contract case** (in the shared case list both contract files run): seed globals via `createMany(null, …)` + one personal workout via `create(userId, …)`; call `deleteGlobals()`; expect `countGlobals() === 0` AND the personal workout still present. (Read `contracts.fake.test.ts` first and add the case exactly the way existing cases are structured.)
- [ ] **Step 2: Run** — `pnpm vitest run server/stores/contracts/contracts.fake.test.ts` → FAIL (method missing).
- [ ] **Step 3: Implement** in `workouts.ts` (and mirror in the fake store the contracts use):

```ts
    // Seed-reconcile only (see seed.ts): removes every global row. Session
    // logs referencing them keep their rows — session_logs.workout_id is
    // ON DELETE SET NULL. Personal rows are untouched by construction.
    async deleteGlobals(): Promise<void> {
      await db.delete(workouts).where(isNull(workouts.userId));
    },
```

- [ ] **Step 4: Run fake contracts** → PASS. Run real: `pnpm test --project integration` (needs Docker DB) → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: deleteGlobals — the seed can now take back what it gave"`.

### Task 10: Seed reconcile (swap-on-mismatch)

**Files:**
- Modify: `app/server/seed/seed.ts`
- Test: `app/server/seed/seed.integration.test.ts`

**Interfaces:**
- Consumes: `LIBRARY_WORKOUTS`, `deleteGlobals()`.
- Produces: `seedGlobalLibrary(db)` with reconcile semantics (same export, same call site in `index.ts` — no route/boot changes).

- [ ] **Step 1: Write failing integration tests** (extend `seed.integration.test.ts`, matching its existing setup helpers):
  - *swap*: insert 3 fake "old" globals via `createMany(null, …)`, a user session log referencing one of them, and one personal workout; run `seedGlobalLibrary`; expect 300 globals, none of the old titles present, the log row still exists with `workoutId` null, the personal workout untouched.
  - *idempotent*: run `seedGlobalLibrary` twice from empty; capture global ids after each; expect identical id sets (match ⇒ no-op, no churn).
  - Update the existing "seeds when empty" case's expected count to 300.
- [ ] **Step 2: Run** — `pnpm test --project integration -- seed` → FAIL (old seed inserts only when count is 0 and still imports `STARTER_WORKOUTS`).
- [ ] **Step 3: Implement** — replace the body of `seedGlobalLibrary`:

```ts
import { LIBRARY_WORKOUTS } from "./library/index.js";

/**
 * Reconciles the shared global library (user_id NULL rows) to the code's
 * LIBRARY_WORKOUTS: no globals → insert; title-set matches → no-op;
 * anything else → swap (delete all globals, insert the current set) inside
 * the same advisory-locked transaction. The swap nulls session_logs'
 * workout_id references (ON DELETE SET NULL) — logs keep their rows and
 * lose the link; accepted for the 35→300 regeneration at TestFlight scale
 * (see the workout-generation spec §6). Personal rows are structurally
 * untouched. Advisory lock unchanged: two booting replicas cannot both
 * observe a mismatch and both swap.
 */
export async function seedGlobalLibrary(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SEED_LOCK_KEY})`);
    const workouts = createWorkoutsStore(tx as unknown as Db);

    const globals = await workouts.listGlobals();
    const expected = LIBRARY_WORKOUTS.map((w) => w.title).sort().join(" ");
    const actual = globals.map((g) => g.title).sort().join(" ");
    if (actual === expected) return;

    if (globals.length > 0) await workouts.deleteGlobals();
    await workouts.createMany(
      null,
      LIBRARY_WORKOUTS.map((workout) => ({
        ...workout,
        source: "starter" as const,
      })),
    );
  });
}
```

  Keep `SEED_LOCK_KEY` and the header comment's lock rationale; update the doc comment as above (the old "if any global row exists, no-op" text is now wrong — reconcile the comment, recurring failure #9 applies to code comments too).
- [ ] **Step 4: Run** integration seed tests → PASS. Also `pnpm vitest run server/seed/` (unit) → the gate still PASSes.
- [ ] **Step 5: Check per-file coverage** — `pnpm test:coverage`, open the per-file numbers for `seed.ts` and `workouts.ts`; every new branch (match/mismatch/empty) must be exercised.
- [ ] **Step 6: Commit** — `git commit -m "feat: seed reconcile — the library converges to the code, logs keep their rows"`.

### Task 11: Re-anchor fixtures, retire starter.ts

**Files:**
- Delete: `app/server/seed/starter.ts`, `app/server/seed/starter.test.ts`
- Modify: every `STARTER_WORKOUTS` importer (grep list below) — currently ~17 `src/` test files
- Modify: `app/domain/fixtures.ts` only if grep shows starter coupling (it shouldn't — it's original math fixtures)

**Interfaces:**
- Consumes: `LIBRARY_WORKOUTS` (same shape as `STARTER_WORKOUTS`: `WorkoutInput & { sortOrder: number }`).

- [ ] **Step 1: Enumerate** — `grep -rln "STARTER_WORKOUTS\|seed/starter" src/ server/ e2e/`. Expected: the test files seen in planning (Today, Builder, StepCard, engine, run, draft, logDraft, LogSession, SessionComplete, ConfirmTargets, Countdown, Timer, backNavigationChain, nameGenerator, builderState, seed.integration) plus `seed.ts` (already migrated in Task 10).
- [ ] **Step 2: Mechanical rename** — in each file: `import { STARTER_WORKOUTS } from "../../server/seed/starter"` → `import { LIBRARY_WORKOUTS } from "../../server/seed/library/index"` (keep each file's relative depth; `.js` suffix in server files, none in `src/` — match what the file had), and rename usages.
- [ ] **Step 3: Re-anchor title lookups** — `grep -n 'find((\?:s\|w) => \|title === "' <each file>` to list hardcoded titles ("Cold Front", "Microburst", …). For each, read the surrounding test to learn what the fixture must BE (an easy time-based O2? a distance workout with reps? the effort-ref workout?), then pick a workout from the NEW library satisfying that structure and swap the title. Where the test only needs "any workout", prefer a structural pick over a title: `LIBRARY_WORKOUTS.find((w) => w.type === "O2" && w.steps.every((s) => s.k !== "reps"))!`. Keep a mapping table (old title → new anchor → why) in the task report.
- [ ] **Step 4: Delete** `starter.ts` and `starter.test.ts` (the library gate supersedes it; the per-workout `EXPECTED_MINUTES` pin dies with the content it pinned — the gate's quota assertion pins the new content's arithmetic).
- [ ] **Step 5: Full unit+client run** — `pnpm test --project unit --project client` → PASS. Fix fallout (a test whose new anchor has different arithmetic must have its expected values recomputed — show the arithmetic in a comment like starter.test.ts did).
- [ ] **Step 6: Grep for corpses** — `grep -rn "starter" src/ server/ e2e/ --include="*.ts*"` — remaining hits must be prose/comments that are still true (e.g. seed.ts's "starter" source enum value stays). Reconcile any comment describing the 35-workout world.
- [ ] **Step 7: Commit** — `git commit -m "refactor: the library is the fixture — starter.ts retires at 300"`.

### Task 12: Docs reconcile (DEVIATIONS, ROADMAP)

**Files:**
- Modify: `docs/design/DEVIATIONS.md` line 13 (the sample-data row)
- Modify: `ROADMAP.md` (the queue entry above Phase 7)

- [ ] **Step 1: DEVIATIONS row** — replace the current-state text: `| Sample data: 11 book-derived workouts ("Lucky Penny", …) | Original ~300-workout generated library (original names/structures), seeded globally at boot, reconciled on mismatch | Content policy |`. Scan the rest of the file for any other row describing the 35-workout library and reconcile it.
- [ ] **Step 2: ROADMAP** — convert the prose queue entry (~line 636) into a checked phase entry recording: 300 workouts, quota grid, digest at `app/domain/generation/patterns.json`, seed reconcile semantics, log-link nulling accepted. Update the "Parametric workout generator" bullet (line 724): its structural-reference load is now DONE (patterns.json exists) — reword so it no longer promises future extraction.
- [ ] **Step 3: Commit** — `git commit -m "docs: deviations and roadmap catch up to the 300"`.

### Task 13: Full gates + visual record

- [ ] **Step 1:** `pnpm lint && pnpm format:check && pnpm typecheck` → clean.
- [ ] **Step 2:** `pnpm test` (all projects; integration needs the dev Postgres per CLAUDE.md) → green. `pnpm test:coverage` → per-file check on every touched file.
- [ ] **Step 3:** `pnpm e2e` → green. Watch `library.spec.ts` (count header vs rows at 300) and `today.spec.ts` (suggestions now draw from 60–90 per type) — failures here are real product regressions, not test debt.
- [ ] **Step 4:** `pnpm screenshots` → open EVERY changed PNG in `docs/screenshots/` and look: library list shows real new names (not dashes, not an empty state), Today shows a plausible suggestion, no clipped/scrolled-past content (recurring failure #7).
- [ ] **Step 5:** Library-at-300 product check: in the screenshot/e2e run, confirm initial render is not visibly janky and the type filters keep the list navigable. If scrolling 300 rows is bad on the web build, note it in the PR as an iOS-verification item — do NOT build virtualization in this phase (out of scope per spec).
- [ ] **Step 6: Commit** screenshots — `git commit -m "chore: screenshots — the library at three hundred"`.

### Task 14: James's review gate → PR

- [ ] **Step 1: Build the review artifact** — script (scratchpad) renders `LIBRARY_WORKOUTS` to markdown grouped by type × band: `| # | title | difficulty/pain | structure (steps_text from Task 3's renderer) | est. min |`. Also surface: names used, shape mix per band, the no-clone result, and `reshoot.md` leftovers.
- [ ] **Step 2: Deliver to James** — SendUserFile (or Artifact, private) + the quota grid as shipped. Ask for approval or rejections (individual workouts or whole cells). **STOP and wait.**
- [ ] **Step 3: Process rejections** — bounce to the owning author agent with James's reason; re-run Task 7 Step 2's gate, Task 8's no-clone, and affected fixtures/tests; redeliver. Loop until approved.
- [ ] **Step 4: PR** — push branch, `gh pr create`. Body: feature/content tables inline (quota grid, type totals, digest description), screenshots, the migration note (log links null on swap — with the integration test proving rows survive), the no-clone gate result, and a risk note. PR body ends with the standard generated-with footer.
- [ ] **Step 5: Present the PR + review verdict to James and STOP.** No merge without his explicit approval. After HIS merge: teardown checklist — `git status` on the MAIN checkout first (stray-write check), then remove the worktree; post the TestFlight release recommendation (docs/RELEASING.md); update memory (workout-generation-queued → shipped; builder-device-feedback queue untouched).

---

## Execution notes

- Tasks 1–3 are session-orchestrated (vision + scratchpad scripts) — the "implementer" is this session driving agents, not a code subagent. Tasks 4, 6, 9–13 are classic code tasks; Task 7 is parallel authoring with the gate as arbiter.
- Task order: 2 needs 1; 3–4 need 2; 7 needs 4+5+6; 8 needs 7; 10 needs 6+9; 11 needs 7 (real titles to anchor); 12–14 close out. Tasks 5, 6, and 9 are independent of the extraction chain and can run early or in parallel with it.
- The worktree exists and hooks are verified. Do not create another.
- If extraction yields far fewer usable cards than expected (Task 2 Step 5), STOP and tell James — a thin digest makes cell quotas unfillable, and the spec's fallback (shrink cell, grow neighbor) needs his eyes if it moves more than a handful of slots.
