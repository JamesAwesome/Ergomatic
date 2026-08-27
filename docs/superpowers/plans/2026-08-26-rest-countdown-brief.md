# RC-24 — task brief: the grid says a rest is running

**Spec (read it, it is the authority):**
`docs/superpowers/specs/2026-08-26-rest-countdown-design.md`

**Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/rest-countdown`, branch `rest-countdown`.
Run everything from there. **Never `cd` to the main checkout.**

---

## What you are building, in one paragraph

On the connected surface's grid (pane C), a rower mid-rest sees their active
row's time and metres still moving — because the flywheel coasts — and nothing
says a rest is running, so it reads like their work interval being
mis-measured. During a rest, the active row's `/500M` cell becomes
`REST m:ss`, counting down from the machine's own `restSeconds`, in gold
`--marker`, on a row filled `--surface-sunken`. The gold countdown mark MOVES
there off `time`/`meters` for the duration. When the rest ends, all three
revert. James approved this shape (option B) at a design gate on 2026-08-26.

---

## Global constraints (binding)

- **No files under `app/domain/` or `app/server/`.** This is a client display
  change. If you find yourself needing a domain change, STOP and report it.
- **No stored shape, no persisted type, no migration.** Nothing this change
  produces is saved.
- **44px hit targets and WCAG AA are hard requirements.** This adds no
  control, so targets should be untouched — say so in your report rather than
  assuming it.
- **House copy style:** no em-dashes in user-facing strings.
- **`--accent` is a CONTROL colour and must not appear in a pane.**
  `PaneGrid.test.tsx` has a whole-file "ACCENT CENSUS" that reads every
  `var(--accent)` consumer out of `index.css` and pins the set at exactly
  three. Your new rules use `--marker` and `--surface-sunken`, so the census
  should stay at three. **Re-run it and confirm.**
- TDD: failing test first, every time.

---

## The wire facts. These are measured, not assumed, and each one breaks a plausible implementation.

Decoded frame-by-frame from `docs/monitor/sessions/walk-2026-08-25/rests-finished-recording.jsonl.gz`
(program `w 1' r1 / w 500m r1 / w 1'`, 1615 status frames). The spec carries
the full tables; these are the four consequences.

1. **`state === "resting"` LEADS the countdown by ~1 s.** The state flips while
   `restSeconds` still reads a flat `60.00`; it starts ticking 2-3 frames
   later. So a `REST 1:00` that sits still for about a second at the top of
   every rest is CORRECT and expected. Do not try to suppress it, and do not
   write a test that forbids it. Write a test that BOUNDS it (see tests).
2. **Outside a rest, `restSeconds` is the current interval's PROGRAMMED rest,
   not a sentinel.** It reads `60.00` through the whole of work interval 1 and
   `0.00` through the whole of work interval 3 (which has no programmed rest).
   **`restSeconds` alone can never say a rest is running.** Only
   `state === "resting"` says it.
3. **The countdown never reaches `0:00`.** Both rests end with the state
   flipping at `1.91`. No test may wait for a zero.
4. **It ticks at `x.91`** (60.00, 59.91, 58.91 … 2.91, 1.91). **Floor.**
   Rounding re-renders `1:00` on the first counted frame and lengthens fact 1's
   dwell.

---

## Files and exact changes

### 1. `app/src/workout/connected/surfaceModel.ts`

**a) Widen `GridRow.countdown` and add `restCountdown`** (currently at `:397-401`):

```ts
  /** Which cell is the ACTIVE row's countdown — the programmed dimension
   *  for a work interval, and `"rest"` while the machine is resting. This
   *  field names THE ONE marked cell on the pane, which is what makes
   *  "the marker moves, it does not multiply" structural rather than a
   *  convention each cell has to remember. `null` on every non-active row,
   *  and while armed. */
  countdown: "time" | "meters" | "rest" | null;
  /** The rest countdown's rendered value (`0:42`), floored to whole
   *  seconds. NON-NULL EXACTLY WHEN `countdown === "rest"` — pinned by a
   *  test, because two fields that must agree are two fields that can
   *  disagree. */
  restCountdown: string | null;
```

**b) `buildGridModel` gains two arguments.** Add to the args object, with doc
comments in the file's existing style:

```ts
  /** RC-24: `frame.state === "resting"`, straight through from
   *  `buildSurfaceModel`'s own `resting` (`:837`). The ONLY field that can
   *  say a rest is running — see this task's wire fact 2. */
  resting: boolean;
  /** RC-24: `frame.restSeconds`, the machine's own countdown (0x0032 bytes
   *  13-15, 0.01 s/lsb). Meaningless outside a rest, which is why it is
   *  read only under `resting`. */
  restSeconds: number;
```

**c) The active-row branch** (currently `:1442-1456`). Replace the `countdown`
line and add `restCountdown`:

```ts
    if (index === activeIndex) {
      const countdown = countdownDisplayFor(interval, remaining);
      const accrual = accruedDisplayFor(interval, accrued);
      // RC-24: a rest that is actually running takes the mark. `armed`
      // still wins over everything (nothing counts before the first pull),
      // and `restSeconds > 0` excludes the zero-rest artifact — a machine
      // can briefly report `resting` on an interval with no programmed
      // rest, where this field reads 0.00 and there is nothing to count.
      // Flashing a rest mark for that frame IS the false "something is
      // counting" claim this whole change exists to prevent.
      const restingNow = !armed && args.resting && args.restSeconds > 0;
      return {
        index,
        ordinal,
        state: "active",
        time: interval.kind === "time" ? countdown : accrual,
        meters: interval.kind === "distance" ? countdown : accrual,
        countdown: armed
          ? null
          : restingNow
            ? "rest"
            : interval.kind === "time"
              ? "time"
              : "meters",
        // FLOOR, not round: the wire ticks at x.91 (59.91, 58.91 ...), so
        // rounding would re-render 1:00 on the first counted frame.
        restCountdown: restingNow
          ? fmtDuration(Math.floor(args.restSeconds) / 60)
          : null,
        pace: { display: args.livePace.display, judged: args.livePace },
        spm: { display: args.liveRate.display, judged: args.liveRate },
        hr: args.liveHr.display,
        rest,
      };
    }
```

**d) `restCountdown: null` on the completed and upcoming branches** (`:1504`,
`:1525` currently set `countdown: null` — add the sibling).

**e) The call site** (`:1310`, `buildGridModel({...})`): pass `resting` (the
local already computed at `:837`) and `restSeconds: frame.restSeconds`.

**f) Reconcile the two comments that state the narrower rule.** `:398-400`
(the `countdown` doc comment — you are replacing it) and `:1411-1419` (the
`armed` argument's comment, which explains why `armed` suppresses the mark).
The `armed` comment stays true and should gain one sentence noting that a
running rest now also claims the mark. **Do not leave a comment describing a
two-member union.**

### 2. `app/src/workout/connected/PaneGrid.tsx`

**a) Widen `countdownClass`** — its parameter type is `"time" | "meters"`.

**b) The row class gains a resting modifier:**

```tsx
    className={`connected-grid-row connected-grid-${row.state}${
      row.countdown === "rest" ? " connected-grid-resting" : ""
    }`}
```

**c) The `/500M` cell branches:**

```tsx
      {row.countdown === "rest" ? (
        /* RC-24: during a rest this cell holds `livePace`, which is
           `frame.currentSplit` — the split of a COASTING flywheel, judged
           against the work interval's target. That number is worse than
           absent: a coast can paint a red or blue verdict on a rest. The
           rest countdown replaces it, unjudged (no `cellClass` here, on
           purpose), and takes the gold mark off time/meters for the
           duration. */
        <span className="connected-grid-pace connected-grid-rest-countdown">
          <span className="connected-grid-rest-word">REST</span>{" "}
          {row.restCountdown}
        </span>
      ) : (
        <span className={cellClass("connected-grid-pace", row.pace)}>
          {row.pace.display}
        </span>
      )}
```

**d) Reconcile this file's own header comment.** It currently states that the
only orientation difference is which columns are visible, and describes the
row markup as flat. Both still hold; but the header should record that the
`/500M` cell has a second, rest-state form. Keep it to a few lines in the
file's existing voice.

### 3. `app/src/index.css`

Add near `.connected-grid-countdown` (`:6933`), in the file's commented style.
**State the computed contrast ratios in the comment** — they are in the spec's
table; re-derive rather than copy, and put the numbers in.

```css
/* RC-24: the active row while the machine is RESTING. The `/500M` cell
   becomes the machine's own rest countdown and takes the gold mark; the row
   sinks. THREE CHANNELS, only one of them colour — the word REST, the
   sunken fill, and the gold — because this grid's own rule (see the
   dashed-rule comment above) is that meaning never rides colour alone.
   --marker on --surface-sunken: 5.50:1 (4.5:1 text floor, 3:1 graphic
   floor — passes both). --ink on --surface-sunken: 14.50:1, so the row's
   other values stay legible on the new fill. The fill shift itself is only
   1.18:1, which is exactly why it is never the sole signal. */
.connected-grid-active.connected-grid-resting {
  background: var(--surface-sunken);
}

.connected-grid-rest-countdown {
  color: var(--marker);
  /* `/500M` is flex 1.1 and `REST 0:42` is longer than any split it
     replaces. Nothing may wrap mid-value. */
  white-space: nowrap;
}

/* The word rides at the column-head size so the pair fits the cell; the
   number stays at row size, because the number is what is read. */
.connected-grid-rest-word {
  font-size: var(--c-size-thead);
}
```

**Check the landscape query too** (`:8196` region) — if `.connected-grid-active`
gets a different background there, the `.connected-grid-resting` override must
still win. Verify, do not assume.

---

## Tests — failing first, every one of them

### `surfaceModel.test.ts`

Build fixtures from the REAL decoded values above, not round numbers.

1. **Resting mid-rest**: `state: "resting"`, `restSeconds: 59.91`, active
   interval has `restSeconds: 60` programmed →
   `countdown === "rest"`, `restCountdown === "0:59"` (FLOOR — assert the
   string; `Math.round` would give `"1:00"` and this test is the only thing
   standing between the wire and that bug).
2. **Rest entry dwell, BOUNDED not forbidden** (wire fact 1): `restSeconds:
   60` while `resting` → `restCountdown === "1:00"`. Assert it renders, and
   in the same test assert that the same `restSeconds: 60` with
   `state: "rowing"` renders **no** countdown. That pair is the whole point:
   the dwell is legitimate during a rest and a bug during work.
3. **Wire fact 2, the one that matters most**: `state: "rowing"`,
   `restSeconds: 60` → `countdown` is `"time"` or `"meters"` per the
   interval kind, `restCountdown === null`. Then `state: "rowing"`,
   `restSeconds: 0` → same. A rest countdown must never appear during work.
4. **The zero-rest artifact**: `state: "resting"`, `restSeconds: 0` →
   `countdown` falls back to the interval's own dimension and
   `restCountdown === null`.
5. **Armed beats resting**: `armed: true`, `state: "resting"`,
   `restSeconds: 59.91` → `countdown === null`, `restCountdown === null`.
6. **The two fields agree**: across every case above, assert
   `(row.countdown === "rest") === (row.restCountdown !== null)`.
7. **Exactly one marked cell**: over a full multi-row model in each of the
   three states (armed / working / resting), assert exactly one row has a
   non-null `countdown` and that no row has two marks.

### `PaneGrid.test.tsx`

8. **Renders the countdown in the pace cell**, with the word and the number,
   and the row carries `connected-grid-resting`.
9. **NOT judged during a rest**: give `livePace` a judged value that would
   normally tint the cell (`timer-card-actual-*`), put the model in a rest,
   and assert the rendered cell carries **no** `timer-card-actual-` class.
   This is the coast-verdict defect — assert the consequence, not that a
   branch exists.
10. **During work the pace cell is unchanged** — same judged tint it has
    today, no `connected-grid-resting`, no rest word.
11. **Re-run the ACCENT CENSUS** and confirm it still pins three.

### e2e / structural

12. `app/e2e/` already carries structural design assertions for this grid.
    Add one that the rest cell **does not overflow its column** at the
    narrowest supported portrait width. Measure it (`boundingBox` /
    `scrollWidth` vs `clientWidth`), do not eyeball it. **If it clips,
    that is a finding — report it, do not silently shrink the type.**

---

## Gates — all of them, and report the numbers

From `app/`:

- `pnpm lint` · `pnpm typecheck` · `pnpm test`
- **`pnpm e2e`** — MANDATORY, your diff touches `app/src/`. (Recurring
  failure #1: three phases running, this exact step was skipped and left CI
  red.)
- **`pnpm screenshots`** — MANDATORY, this changes a screen's layout, in BOTH
  orientations.
- **Per-file coverage for the files you touched.** The 90% gate is repo-wide
  and a new branch can ship uncovered while it passes (recurring failure #2).
  Put the per-file numbers in your report.
- **Then OPEN the captures and look at them** (recurring failure #7). The
  portrait grid capture must actually show a row mid-rest with the countdown
  — a capture of a working interval proves nothing here. If the seeded
  scenario does not produce a rest, say so rather than shipping a capture
  that does not show the feature.

---

## Deliberate omissions — do not "fix" these, and challenge them in your report if you disagree

- **No spoken accessible name on the rest countdown.** The REST column beside
  it has never had one, and a live-updating `aria-label` on a non-live region
  does not announce anyway. The row already carries `aria-current="step"`.
- **Landscape behaves identically** — the `/500M` cell counts down in both
  orientations, and landscape's REST column keeps showing the PROGRAMMED rest
  on every row. That is a deliberate ruling in the spec (one code path, no
  orientation-conditional meaning), not an oversight.
- **The time and metres cells keep moving during a rest.** RC-23 ruled that
  and it stays ruled. This change makes the movement legible; it does not
  freeze it.

---

## Report contract

Write your full report to
`docs/superpowers/plans/2026-08-26-rest-countdown-report.md` and return only:
status (`DONE` / `DONE_WITH_CONCERNS` / `BLOCKED` / `NEEDS_CONTEXT`), the
commit SHAs, a one-line test summary, and any concerns.

The report itself must carry: the gate outputs, the per-file coverage numbers,
what the captures actually show (you looked — say what you saw), the contrast
ratios you re-derived, and anything in this brief you found to be wrong.
**If the brief contradicts what you observe in the code, say so in the report
rather than working around it silently** (recurring failure #10 — plans in
this repo have contained factual errors).

**Before every commit, run `git rev-parse --show-toplevel` and confirm it
prints the worktree path above.** Do not dispatch subagents of your own.
