# `rowingActive` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** pin the byte's one unpinned consumer with an explicit model-layer
test, and give the diagnostics ring a raw-byte entry so the next occurrence
is readable — with no behaviour change anywhere.

**Architecture:** two independent edits plus a record sweep. The test goes in
`surfaceModel.test.ts` beside its mirror image; the ring entry goes in
`driver.ts` beside `lastLoggedFrameState`, which is its direct precedent for
both lifetime and eviction posture.

**Tech Stack:** React 19 + Vite client, vitest (`unit`/`client` projects).

**Spec:** `docs/superpowers/specs/2026-09-03-rowing-active-design.md` (rev 2,
lens 1 folded). Read it — the invariants I-1, I-2, I-3 and the RF27 lifetime
table are binding, and this plan argues from them.

## Global Constraints

- **No behaviour change.** No screen, number, stored row or decision may read
  differently. `surfaceModel.ts` is NOT modified.
- **The suite command is** `NODE_OPTIONS=--no-experimental-webstorage pnpm
  exec vitest run --project unit --project client`, run from `app/`. The
  `NODE_OPTIONS` prefix is mandatory (CLAUDE.md's footgun).
- **This suite has an observed intermittent failure.** Twice in one session,
  an unrelated test failed once and passed on an identical re-run
  (`ConnectedSurface.screens.test.tsx`'s RC-24 snapshot, and
  `server/routes/data.test.ts`'s RC-1 field test). If a test you did not
  touch fails, re-run before investigating — and SAY SO IN YOUR REPORT with
  both outputs. Do not "fix" it.
- **Green baseline on this branch's base (`c2182ef5`), measured:**
  `Test Files 231 passed (231)` / `Tests 6597 passed | 1 skipped (6598)`.
- **Every claim in your report names the command and the output that
  established it.** Every new assertion gets a mutation that makes it fail,
  and the report quotes what the failure said (RF21).

---

### Task 1: pin the byte half of `midSessionMirror`

**Files:**
- Test: `app/src/workout/connected/surfaceModel.test.ts` (modify)
- **Do NOT modify** `app/src/workout/connected/surfaceModel.ts`.

**Interfaces:** consumes the file's existing `model()`, `frame()`,
`firstWorkPhase()` and `fmtSplit()` helpers. Produces nothing other tasks use.

**Why this test and not another.** `midSessionMirror` is three terms ANDed.
The file already has a test isolating the DISTANCE half (*"the guard: once
distance advances past the reset window…"*, which keeps `rowingActive: false`
on purpose and says so in its own comment). No test isolates the BYTE half —
so deleting `frame.rowingActive === false &&` is caught today only by an
`ConnectedSurface.screens.test.tsx` snapshot, as an HTML diff, which `-u`
re-baselines silently. This test is the guard test's mirror image and sits
directly before `"grid agreement: …"`, after it.

- [ ] **Step 1: write the failing test**

Insert immediately BEFORE the `it("grid agreement: buildGridModel's active
row shares the SAME mirrored JudgedValue objects pane B renders", …)` block:

```ts
  it("the byte half: a frame inside the reset window does NOT mirror when the byte reads true", () => {
    const target = firstWorkPhase();
    const m = model({
      status: "live",
      linkLost: false,
      frame: frame({
        state: "rowing",
        intervalIndex: 1,
        // The mirror image of the guard test above. Distance stays INSIDE
        // the reset window (the walk's own 0.8, the same frame the mirror
        // test uses), isolating the BYTE half of the discriminator: a
        // mutant that dropped only `frame.rowingActive === false` would
        // still pass if this test also advanced the distance out of the
        // window.
        rowingActive: true,
        distanceMeters: 0.8,
        spm: target.spm! + 10,
        currentSplit: target.targetSplit! - 10,
      }),
    });
    // Positive values, not `not.toBe("0:00.0")`: the mirror substitutes a
    // specific pair, so asserting the judged pair is present says more
    // than asserting the mirrored one is absent.
    expect(m.pace.display).toBe(fmtSplit(target.targetSplit! - 10));
    expect(m.pace.judgement).toBe("faster");
    expect(m.pace.absent).toBe(false);
    expect(m.rate.display).toBe(String(target.spm! + 10));
    expect(m.rate.judgement).toBe("faster");
    expect(m.rate.absent).toBe(false);
  });
```

- [ ] **Step 2: prove it can go red (RF21) — mutate, run, revert**

The test passes against unmodified production code, so its proof is the
mutation. In `surfaceModel.ts`, delete the line
`    frame.rowingActive === false &&` from the `midSessionMirror` expression,
then run:

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run \
  --project client src/workout/connected/surfaceModel.test.ts
```

**Expected (measured by the plan's author on this branch):**

```
 × the byte half: a frame inside the reset window does NOT mirror when the byte reads true
AssertionError: expected '0:00.0' to be '1:56.0' // Object.is equality
 Tests  1 failed | 153 passed (154)
```

Then RESTORE the line. Per RF22, commit Step 1 BEFORE running this mutation
so the revert is a no-op against a clean file, and confirm with
`git status` that `surfaceModel.ts` carries no other uncommitted work.

- [ ] **Step 3: full suite, then commit**

---

### Task 2: the raw byte in the ring

**Files:**
- Modify: `app/src/monitor/driver.ts`
- Test: `app/src/monitor/driver.test.ts`

**Interfaces:** consumes `MonitorFrame.rawRowingState` (optional `number`,
already populated by `pm5/parse.ts`) and the driver's existing `log.record`.
Produces a new ring entry kind, `"raw-rowing-state"`. Nothing reads it in
code — it is an operator surface.

**The invariants (spec §2), restated so you do not have to hold the spec
open:**
- **I-2:** a session that produced any frame records the byte AT LEAST ONCE —
  on its first frame — and again on every change after. So no entry means the
  instrument did not run; exactly one means the byte never moved; N+1 means N
  changes.
- **I-3:** after the first, on CHANGE only. Never per frame.
- **Lifetime:** per-driver, minted with the driver, never cleared, never
  survives teardown. Two fields, not one — "never seen" and "seen, and it was
  0" are different facts.
- **`rawRowingState` is optional:** an unreported byte renders `unknown` and
  is never claimed as a change against a number.

- [ ] **Step 1: write the failing tests**

Three legs in `driver.test.ts`, in the idiom the file already uses for ring
assertions. Read a neighbouring `log.record` test first and match it.

1. **First frame records unconditionally.** Feed ONE 0x0031 frame; assert
   exactly one `raw-rowing-state` entry exists and its detail contains
   `previous=none` and the frame's own byte value.
2. **A stuck byte records exactly once.** Feed FIVE frames all carrying the
   same byte; assert still exactly ONE `raw-rowing-state` entry. This is the
   walk-2026-08-26 shape and it is I-3's whole point.
3. **A change records a second entry naming both sides.** Feed frames whose
   byte goes 1 → 0; assert two entries, the second containing `previous=1`
   and `value=0`, plus its `state`, `elapsed` and `distance`.

- [ ] **Step 2: run them, confirm they fail** (no `raw-rowing-state` entry
      exists yet — the failure should be "expected 1 to be 0" or an empty
      find, not a crash)

- [ ] **Step 3: implement**

Beside `let lastLoggedFrameState: MonitorFrame["state"] | null = null;`, add:

```ts
  /** §2 (rowingActive design spec, 2026-09-03). The last RAW rowing-state
   *  byte this driver logged, and whether it has logged one at all. Two
   *  fields, not one, because "never seen" and "seen, and it was 0" are
   *  different facts and a single `number | null` conflates them.
   *  Per-driver by construction, exactly like `lastLoggedFrameState` above:
   *  a new driver is a new detector, so an old byte can never pair with a
   *  new trace. */
  let lastRawRowingState: number | null = null;
  let rawRowingStateLogged = false;
```

Immediately BEFORE `emit({ kind: "frame", frame });`, add:

```ts
    // §2 (rowingActive design spec, 2026-09-03). The raw byte, on this
    // driver's FIRST frame and on every change after. Deliberately NOT
    // folded into the `frame` entry above: that one fires on a state-WORD
    // change, which is exactly the trigger a mid-work stop does not pull —
    // the 2026-09-03 resume-edge walk's committed ring carries 6 `frame`
    // entries across a real stop and says nothing about the byte. The
    // first-frame entry is what makes an ABSENCE mean something: no entry
    // means this build carries no instrument, exactly one means the byte
    // never moved (walk 2026-08-26's entire session), N+1 means N changes.
    // `rawRowingState` is optional on the type, so an unreported byte
    // renders `unknown` and is never claimed as a change against a number —
    // same defensive posture, and same reason, as the `?? "unknown"` on
    // `useMonitorSession.ts`'s `resume-first-frame` entry.
    const rawRowingState = frame.rawRowingState ?? null;
    if (!rawRowingStateLogged || rawRowingState !== lastRawRowingState) {
      const previous = rawRowingStateLogged
        ? (lastRawRowingState ?? "unknown")
        : "none";
      rawRowingStateLogged = true;
      lastRawRowingState = rawRowingState;
      log.record(
        "raw-rowing-state",
        `previous=${previous} value=${rawRowingState ?? "unknown"} state=${frame.state} elapsed=${frame.elapsedSeconds} distance=${frame.distanceMeters}`,
      );
    }
```

**Both blocks were typechecked and run by this plan's author on this branch**
(`pnpm exec tsc -b` clean; full suite `6598 passed | 1 skipped (6599)`), so a
compile error means you transcribed them wrong, not that they are wrong.

- [ ] **Step 4: run the three legs, confirm they pass; then mutate each**

Three mutations, each must make a DIFFERENT leg fail, and your report quotes
each failure message:
- drop `!rawRowingStateLogged ||` → leg 1 fails (no first-frame entry when
  the byte's initial value happens to equal `null`… and more importantly the
  first frame no longer records unconditionally)
- change `!==` to `===` → leg 2 or 3 fails
- set `previous` to a constant → leg 3 fails on `previous=1`

- [ ] **Step 5: full suite, then commit**

---

### Task 3: the record sweep (spec §4)

**Files:**
- Modify: `app/src/session/summaryModel.ts`,
  `app/src/workout/connected/surfaceModel.ts` (COMMENT ONLY — no code),
  `app/src/workout/connected/surfaceModel.test.ts` (comment only),
  `ROADMAP.md`

**This task changes no code.** Comments and record only. If you find yourself
editing an expression, stop — you have the wrong line.

- [ ] **Step 1: narrow the three live sites carrying the withdrawn claim**

#280's walk narrowed *"`elapsedSeconds` FREEZES whenever `rowingActive` goes
false"* at `domain/monitor/types.ts`'s own site; the withdrawn PHRASING
survives elsewhere. Find them with:

```bash
grep -rn "FREEZES whenever\|freezes whenever\|freezes to the centisecond" app docs ROADMAP.md
```

- **`app/src/session/summaryModel.ts`** — calls the elapsed-vs-rowing-time
  question *"NOT settled"* and quotes `types.ts:134` by LINE NUMBER for a
  sentence that no longer exists there. Rewrite: the 09-03 walk settled it
  (the clock RUNS through a mid-WORK stop; it freezes through a REST), cite
  the walk directory and the SYMBOL rather than a line number.
- **`app/src/workout/connected/surfaceModel.ts`** — *"freezes to the
  centisecond the instant `rowingActive` goes false"*, contradicted by its
  own next paragraph. Narrow to the REST case.
- **`app/src/workout/connected/surfaceModel.test.ts`** — same phrasing,
  already scoped by its next clause. Narrow it too.

**Leave unchanged** (they are historical records of what was believed when
written, and the spec says so): `docs/superpowers/specs/2026-08-20-est-left-design.md`,
`docs/superpowers/specs/2026-09-02-door-partial-design.md`, and `ROADMAP.md`'s
two hits inside the `rowingActive` item's own quoted text.

- [ ] **Step 2: correct the `rowingActive` ROADMAP entry**

Four edits to the item beginning `- [ ] **`rowingActive` is falsified but not
dangerous.**`:
1. **The falsified measurement.** *"deleting it leaves 5,357 tests / 191
   files green, so nothing gates it today"* is false. Replace with the
   re-measured result: on `c2182ef5`, deleting the term gives
   `Test Files 1 failed | 230 passed (231)` — caught, but only by
   `ConnectedSurface.screens.test.tsx`'s RC-24 snapshot as an HTML diff,
   which is why an explicit model-layer pin was still owed.
2. **The stale citation** `surfaceModel.ts:915` — `midSessionMirror` is not
   there. Cite the symbol.
3. **Sub-item (b) is already DONE** — the reconciled comment is
   `types.ts`'s `restSeconds` block, narrowed by #280's walk. Say so.
4. **Tick the box**, naming this PR, once (a) through (d) are all done.

- [ ] **Step 3: tick the `programDropped` box**

The item beginning `- [ ] **Handle `programDropped` while a run is live**`
says in its own prose that it shipped as **PR #248**; `gh pr view 248
--json state,mergedAt` reports `MERGED 2026-09-01T03:32:52Z`. Tick it, naming
#248.

- [ ] **Step 4: full suite + `pnpm lint` + `pnpm typecheck`, then commit**

---

## Full-branch gates (after Task 3)

From `app/`, and the report records each output:

- `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit --project client`
- `pnpm lint` · `pnpm typecheck` · `pnpm format:check`
- `pnpm test:coverage` — check the PER-FILE numbers for `driver.ts` and
  `surfaceModel.test.ts` (RF2: the 90×4 gate is repo-wide and hides a new
  file's uncovered branches)
- **`pnpm e2e`** — RF1: the diff touches `app/src/`, so this is not optional.
  No `pnpm screenshots` is owed: no screen's layout changes.
