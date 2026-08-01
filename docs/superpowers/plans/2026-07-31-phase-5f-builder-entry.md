# Phase 5F — Builder entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the builder's entry affordances match a thumb on a phone — any
whole-second duration typable under a number pad, SPM and rest typable as well
as steppable, the warm-up where it actually happens, and `+ ADD STEP` producing
an empty step.

**Architecture:** One new dependency-free domain module (`domain/duration.ts`)
owns every duration string the app parses or prints, replacing two hand-copied
regex pairs. One new client component (`ClockInput`) owns the mask. Everything
else is rewiring existing components onto those two.

**Tech Stack:** TypeScript strict ESM, React 19, Vitest 4 (unit/client
projects), Playwright 1.62, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-31-phase-5f-builder-entry-design.md`
— read it before Task 1. **Design authority:** `docs/design/builder-redesign/`.

## Global Constraints

- **SDLC (binding):** all work happens in the existing worktree
  `.claude/worktrees/phase-5f` on branch `phase-5f-builder-entry`. **Run
  `git rev-parse --show-toplevel` before every commit and confirm it prints
  that worktree path** — agents have committed to the main checkout despite
  being told not to. Never merge, close or approve a PR. Never remove a
  worktree.
- **The house time format is elastic positional:** seconds always shown, hour
  group only when nonzero, leading group unpadded. `0:45`, `20:00`, `1:05:00`,
  `3:00:00`. The rightmost pair is *always* seconds.
- **Totals stay labelled:** `TOTAL 302 MIN`, library row `302′`. Totals round to
  the nearest minute for display; duration filter buckets keep bucketing on the
  unrounded number.
- **Domain bounds after this phase:** `w` time / `wu` / `r` minutes
  `1/60..180`, whole seconds; `restMinutes` `1/60..60`, whole seconds; `w`
  distance meters int `100..42195` (unchanged); `spm` int `10..60`, optional
  (unchanged); `reps.count` 1..12 (unchanged); pace `|off| ≤ 60` (unchanged).
- **`app/domain/` is dependency-zero and pinned at 100% coverage.** No framework
  imports. Server-side imports use `.js` extensions.
- **The repo coverage gate (90×4) is an aggregate and will not catch an
  uncovered branch in a new file.** Read the per-file numbers for every file you
  touch.
- **44×44 px minimum hit targets and WCAG AA (4.5:1 text) are hard
  requirements**, enforced by `app/e2e/design.spec.ts`. Use CSS custom
  properties, never raw hex. Compute contrast ratios; never judge by eye.
- **If your diff touches anything under `app/src/`, run `pnpm e2e` before
  reporting done** — and `pnpm screenshots` if you changed a screen's layout.
  The e2e job gates CI and has been left red three times by tasks that ran only
  `--project unit --project client`.
- **Test against realistic fixtures** — a stored workout, the seeded library, a
  populated form. Two shipped defects came from fixtures that were emptier or
  more uniform than production data.
- **TDD:** failing test first, and run it to watch it fail before implementing.
- `pnpm` only, ESM only. All commands run from `app/`.
- **If this plan contradicts what you observe in the code, say so in your
  report** rather than working around it silently.

---

### Task 1: `domain/duration.ts` — one grammar, one formatter

**Files:**
- Create: `app/domain/duration.ts`
- Create: `app/domain/duration.test.ts`

**Interfaces:**
- Consumes: `WorkDuration` from `app/domain/types.js`.
- Produces, for every later task:
  - `parseClock(text: string): number | null` — minutes, lenient about
    overflowing groups (`"1:70"` → `2.1666…` minutes = 130 s)
  - `fmtDuration(minutes: number): string` — the house format
  - `fmtDurationSpoken(minutes: number): string` — `"1 hour 5 minutes"`
  - `parseDurationToken(token: string): WorkDuration | null` — the shared
    bulk/builder grammar

Nothing imports this module yet; Task 2 onward wires it in.

- [ ] **Step 1: Write the failing tests**

Create `app/domain/duration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  fmtDuration,
  fmtDurationSpoken,
  parseClock,
  parseDurationToken,
} from "./duration.js";

describe("fmtDuration", () => {
  it.each([
    [0.75, "0:45"],
    [0.5, "0:30"],
    [1 / 60, "0:01"],
    [1, "1:00"],
    [1.5, "1:30"],
    [20, "20:00"],
    [65, "1:05:00"],
    [180, "3:00:00"],
  ])("renders %s minutes as %s", (minutes, expected) => {
    expect(fmtDuration(minutes)).toBe(expected);
  });

  it("keeps two groups at 59:59 and gains the hour group at 1:00:00", () => {
    expect(fmtDuration(59 + 59 / 60)).toBe("59:59");
    expect(fmtDuration(60)).toBe("1:00:00");
  });

  it("never zero-pads the leading group", () => {
    expect(fmtDuration(0.75)).toBe("0:45");
    expect(fmtDuration(65)).toBe("1:05:00");
  });
});

describe("parseClock", () => {
  it.each([
    ["0:45", 0.75],
    ["0:01", 1 / 60],
    ["1:30", 1.5],
    ["20:00", 20],
    ["1:05:00", 65],
    ["3:00:00", 180],
  ])("parses %s as %s minutes", (text, expected) => {
    expect(parseClock(text)!).toBeCloseTo(expected, 9);
  });

  it("normalises overflowing groups by total seconds", () => {
    // The mask can produce 1:70 transiently; parsing it as 130s is what lets
    // the field normalise on blur instead of rejecting a keystroke.
    expect(fmtDuration(parseClock("1:70")!)).toBe("2:10");
    expect(fmtDuration(parseClock("0:90")!)).toBe("1:30");
  });

  it.each(["", "abc", "5", "1:2:3:4", "1:", ":30", "-1:30", "1:30m"])(
    "rejects %s",
    (text) => {
      expect(parseClock(text)).toBeNull();
    },
  );

  it("round-trips every canonical form it can produce", () => {
    for (const text of [
      "0:01",
      "0:20",
      "0:45",
      "1:00",
      "1:30",
      "59:59",
      "1:00:00",
      "1:05:00",
      "3:00:00",
    ]) {
      expect(fmtDuration(parseClock(text)!)).toBe(text);
    }
  });
});

describe("fmtDurationSpoken", () => {
  it.each([
    [0.75, "45 seconds"],
    [1 / 60, "1 second"],
    [1, "1 minute"],
    [1.5, "1 minute 30 seconds"],
    [20, "20 minutes"],
    [60, "1 hour"],
    [65, "1 hour 5 minutes"],
    [125.5, "2 hours 5 minutes 30 seconds"],
  ])("speaks %s minutes as %s", (minutes, expected) => {
    expect(fmtDurationSpoken(minutes)).toBe(expected);
  });

  it("omits zero groups rather than saying 'zero minutes'", () => {
    expect(fmtDurationSpoken(60)).toBe("1 hour");
  });
});

describe("parseDurationToken", () => {
  it.each([
    ["0:45", { kind: "time", minutes: 0.75 }],
    ["20:00", { kind: "time", minutes: 20 }],
    ["1:05:00", { kind: "time", minutes: 65 }],
    ["5", { kind: "time", minutes: 5 }],
    ["2.5", { kind: "time", minutes: 2.5 }],
    ["10'", { kind: "time", minutes: 10 }],
    ["2500m", { kind: "distance", meters: 2500 }],
  ])("parses %s", (token, expected) => {
    expect(parseDurationToken(token)).toStrictEqual(expected);
  });

  it.each(["", "abc", "2500 m", "m", "1e3", "0x10", "+5"])(
    "rejects %s",
    (token) => {
      expect(parseDurationToken(token)).toBeNull();
    },
  );
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm test --project unit -- duration`
Expected: FAIL — `Cannot find module './duration.js'`.

- [ ] **Step 3: Implement the module**

Create `app/domain/duration.ts`:

```ts
import type { WorkDuration } from "./types.js";

/** The house time format is elastic positional: seconds are always present,
 *  the hour group appears only when nonzero, and the leading group is never
 *  zero-padded — `0:45`, `20:00`, `1:05:00`, `3:00:00`. Because the rightmost
 *  pair is ALWAYS seconds, a bare `1:30` can only mean 90 seconds anywhere in
 *  the app.
 *
 *  Researched, not chosen: ECMA-402's Intl.DurationFormat defines a `digital`
 *  style and documents it as the right one for durations under a day; Android's
 *  DateUtils.formatElapsedTime documents `MM:SS` or `H:MM:SS`, adding the hour
 *  group only when there is one; Apple's Music/Fitness convention drops the
 *  leading zero, and this app is iOS-first. Totals deliberately do NOT use this
 *  format — they keep unit labels ("302 MIN"), which is what keeps a colon
 *  value's meaning unambiguous. See the Phase 5F spec. */

// Lenient by construction: the minutes and seconds groups may overflow
// (`1:70`), because the masked field can produce that transiently and
// normalising by total seconds is friendlier than rejecting a keystroke on a
// phone. The canonical forms `fmtDuration` emits are a strict subset of what
// this accepts.
const CLOCK_RE = /^(?:(\d+):)?(\d{1,3}):(\d{1,2})$/;

/** Minutes for a clock string, or null. `"1:70"` is 130 seconds, not an
 *  error — see CLOCK_RE. */
export function parseClock(text: string): number | null {
  const m = CLOCK_RE.exec(text.trim());
  if (!m) return null;
  const hours = m[1] === undefined ? 0 : Number(m[1]);
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  return hours * 60 + minutes + seconds / 60;
}

function splitParts(minutes: number): { h: number; m: number; s: number } {
  const total = Math.round(minutes * 60);
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

export function fmtDuration(minutes: number): string {
  const { h, m, s } = splitParts(minutes);
  const ss = String(s).padStart(2, "0");
  return h === 0 ? `${m}:${ss}` : `${h}:${String(m).padStart(2, "0")}:${ss}`;
}

/** The spoken form for an accessible name. A positional duration announces as
 *  "one oh five colon zero zero" otherwise — Primer's guidance on compact time
 *  formats makes the same point about assistive tech and translation. Every
 *  place that renders `fmtDuration` renders this as its accessible name. */
export function fmtDurationSpoken(minutes: number): string {
  const { h, m, s } = splitParts(minutes);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m > 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (s > 0) parts.push(`${s} second${s === 1 ? "" : "s"}`);
  return parts.length === 0 ? "0 seconds" : parts.join(" ");
}

/** The one duration grammar: clock form (`0:45`, `1:05:00`), a bare decimal
 *  (minutes), `10'` (minutes), `2500m` (meters).
 *
 *  This used to exist twice — `domain/bulk.ts`'s `parseDuration` and
 *  `src/builder/builderState.ts`'s `parseDurationInput` were byte-identical
 *  regexes kept in lockstep BY HAND, with comments in both files admitting it.
 *  Both now import this. A bulk block reading `0:45 6k+2` and a row typed as
 *  `0:45` provably mean the same thing. */
export function parseDurationToken(token: string): WorkDuration | null {
  const trimmed = token.trim();

  const clock = parseClock(trimmed);
  if (clock !== null) return { kind: "time", minutes: clock };

  // Plain decimals only — no `Number()`-isms like hex ("0x10" -> 16),
  // scientific notation ("1e3" -> 1000) or a leading "+".
  const bare = /^(\d+(?:\.\d+)?)$/.exec(trimmed);
  if (bare) return { kind: "time", minutes: Number(bare[1]) };

  const apostrophe = /^(\d+(?:\.\d+)?)'$/.exec(trimmed);
  if (apostrophe) return { kind: "time", minutes: Number(apostrophe[1]) };

  const distance = /^(\d+)m$/.exec(trimmed);
  if (distance) return { kind: "distance", meters: Number(distance[1]) };

  return null;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm test --project unit -- duration`
Expected: PASS.

- [ ] **Step 5: Confirm 100% coverage on the new file**

Run: `pnpm test:coverage --project unit -- duration`
Expected: `domain/duration.ts` at 100% across statements, branches, functions
and lines — `app/domain/**` is pinned at 100 by a per-glob override. Report the
per-file numbers.

- [ ] **Step 6: Commit**

```bash
git rev-parse --show-toplevel   # must print .../.claude/worktrees/phase-5f
git add app/domain/duration.ts app/domain/duration.test.ts
git commit -m "feat: one duration grammar and the house time format"
```

---

### Task 2: Widen the domain to whole seconds; bulk adopts the shared grammar

**Files:**
- Modify: `app/domain/validate.ts:15-16` (the `halfStep` predicate), `:38`,
  `:63`, `:78`
- Modify: `app/domain/bulk.ts:117-125` (delete the private `parseDuration`),
  `:1` (imports), `:142`
- Modify: `app/domain/validate.test.ts`, `app/domain/bulk.test.ts`

**Interfaces:**
- Consumes: `parseDurationToken` from Task 1.
- Produces: `validateSteps` accepting any whole-second duration; `bulk.ts`
  parsing clock tokens.

- [ ] **Step 1: Write the failing tests**

Append to `app/domain/validate.test.ts`:

```ts
describe("whole-second durations", () => {
  const workout = (steps: unknown[]) => ({
    title: "T",
    type: "O2",
    difficulty: "easy",
    pain: 3,
    steps,
  });

  it("accepts a 45-second work step", () => {
    const res = validateWorkoutInput(
      workout([
        {
          k: "w",
          duration: { kind: "time", minutes: 0.75 },
          ref: { base: "6k", off: 0 },
        },
      ]),
    );
    expect(res.ok).toBe(true);
  });

  it("accepts 31 seconds, which does not survive the round trip exactly", () => {
    // 31 / 60 * 60 === 31.000000000000004, so a naive Number.isInteger(n * 60)
    // rejects it. 407 of the 10,800 whole seconds in range are like this (31,
    // 62, 123, 124, 125, 245…) — a test built on a "clean" value such as 20s
    // passes against the naive predicate and proves nothing.
    const res = validateWorkoutInput(
      workout([
        {
          k: "w",
          duration: { kind: "time", minutes: 31 / 60 },
          ref: { base: "6k", off: 0 },
        },
      ]),
    );
    expect(res.ok).toBe(true);
  });

  it("still accepts the half-step values that already exist in stored data", () => {
    for (const minutes of [0.5, 1, 2.5, 20, 180]) {
      const res = validateWorkoutInput(
        workout([
          {
            k: "w",
            duration: { kind: "time", minutes },
            ref: { base: "6k", off: 0 },
          },
        ]),
      );
      expect(res.ok, `minutes ${minutes}`).toBe(true);
    }
  });

  it("rejects a sub-second duration and one past the ceiling", () => {
    for (const minutes of [0, 0.001, 180.5]) {
      const res = validateWorkoutInput(
        workout([
          {
            k: "w",
            duration: { kind: "time", minutes },
            ref: { base: "6k", off: 0 },
          },
        ]),
      );
      expect(res.ok, `minutes ${minutes}`).toBe(false);
    }
  });

  it("applies the same rule to wu, r and restMinutes", () => {
    const res = validateWorkoutInput(
      workout([
        { k: "wu", minutes: 0.75 },
        {
          k: "w",
          duration: { kind: "time", minutes: 1 },
          ref: { base: "6k", off: 0 },
          restMinutes: 0.75,
        },
        { k: "r", minutes: 0.25 },
      ]),
    );
    expect(res.ok).toBe(true);

    const tooLong = validateWorkoutInput(
      workout([
        {
          k: "w",
          duration: { kind: "time", minutes: 1 },
          ref: { base: "6k", off: 0 },
          restMinutes: 60.25,
        },
      ]),
    );
    expect(tooLong.ok).toBe(false);
  });
});
```

Append to `app/domain/bulk.test.ts` (and add
`import { parseDurationToken } from "./duration.js";` to its imports):

```ts
describe("clock durations in bulk blocks", () => {
  it("parses a 0:45 work line", () => {
    const res = parseBulk("Sprints\nAN easy 3\n0:45 6k+2\n");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const step = res.blocks[0]!.steps.find((s) => s.k === "w");
    expect(step).toMatchObject({ duration: { kind: "time", minutes: 0.75 } });
  });

  it("agrees with the builder on every duration form", () => {
    // The two parsers were byte-identical regexes kept in lockstep by hand.
    // They are now one function; this asserts the claim instead of commenting
    // it.
    for (const [token, expected] of [
      ["0:45", { kind: "time", minutes: 0.75 }],
      ["5", { kind: "time", minutes: 5 }],
      ["10'", { kind: "time", minutes: 10 }],
      ["2500m", { kind: "distance", meters: 2500 }],
    ] as const) {
      expect(parseDurationToken(token)).toStrictEqual(expected);
    }
  });
});
```

Match the existing file's own fixture style for `parseBulk` input if it differs
from the block above — read a neighbouring test first.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm test --project unit -- validate bulk`
Expected: FAIL — the 45-second, 20-second and `0:45` cases are rejected by the
current half-step predicate and grammar.

- [ ] **Step 3: Widen the validator**

In `app/domain/validate.ts`, replace the `halfStep` helper:

```ts
/** Any whole number of seconds, expressed in minutes. The epsilon is
 *  load-bearing, though not for the obvious reason: most whole seconds do
 *  survive the round trip exactly (`20 / 60 * 60 === 20`). 407 of the 10,800
 *  in range do not — 31 (`31 / 60 * 60 === 31.000000000000004`), 62, 123,
 *  124, 125, 245… — so a bare `Number.isInteger(n * 60)` would reject those
 *  at random, and a user would find 30s and 32s save while 31s does not.
 *  Widened from a 0.5-step rule in Phase 5F —
 *  everything that validated before still validates, so there is nothing to
 *  migrate. */
const wholeSecond = (n: unknown, lo: number, hi: number): n is number =>
  typeof n === "number" &&
  n >= lo &&
  n <= hi &&
  Math.abs(n * 60 - Math.round(n * 60)) < 1e-6;

const SECOND = 1 / 60;
```

Then the three call sites:
- `:38` — `wholeSecond(v.minutes, SECOND, 180)`
- `:63` — `wholeSecond(s.minutes, SECOND, 180)`
- `:78` — `wholeSecond(s.restMinutes, SECOND, 60)`, error text
  `step ${i}: rest 0:01..60:00`

Delete the now-unused `halfStep`.

- [ ] **Step 4: Point bulk at the shared grammar**

In `app/domain/bulk.ts`: delete the private `parseDuration` (`:117-125`), add
`import { parseDurationToken } from "./duration.js";`, and change the call at
`:142` to `parseDurationToken(durationTok)`. Leave the error message
(`bad duration unit: …`) unchanged.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm test --project unit`
Expected: PASS, including the pre-existing validate/bulk suites.

- [ ] **Step 6: Check per-file coverage, then commit**

Run: `pnpm test:coverage --project unit` — `domain/validate.ts` and
`domain/bulk.ts` must still be at 100%. Report the numbers.

```bash
git rev-parse --show-toplevel
git add app/domain
git commit -m "feat: durations widen to whole seconds; bulk shares the grammar"
```

---

### Task 3: `ClockInput` — the masked field

**Files:**
- Create: `app/src/builder/ClockInput.tsx`
- Create: `app/src/builder/ClockInput.test.tsx`
- Modify: `app/src/index.css` (add `.clock-input`)

**Interfaces:**
- Consumes: `fmtDuration`, `parseClock` from `app/domain/duration.js`.
- Produces:

```tsx
export default function ClockInput(props: {
  value: string;                       // "" or a clock string ("0:45")
  onChange: (next: string) => void;    // emits a clock string, or ""
  ariaLabel: string;
  invalid?: boolean;
  errorId?: string;
  className?: string;
  registerRef?: (el: HTMLInputElement | null) => void;
}): JSX.Element;
```

Not wired to anything yet — Tasks 4 and 5 consume it.

- [ ] **Step 1: Write the failing tests**

Create `app/src/builder/ClockInput.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import ClockInput from "./ClockInput";

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <ClockInput value={value} onChange={setValue} ariaLabel="Step 1 duration" />
  );
}

const field = () => screen.getByLabelText("Step 1 duration");

describe("ClockInput", () => {
  it("opens a digit-only keypad — a colon is unreachable on a phone", () => {
    render(<Harness />);
    expect(field()).toHaveAttribute("inputmode", "numeric");
  });

  it("fills digits right to left, supplying the separator", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "3");
    expect(field()).toHaveValue("0:03");
    await user.type(field(), "0");
    expect(field()).toHaveValue("0:30");
    await user.type(field(), "0");
    expect(field()).toHaveValue("3:00");
  });

  it("reaches minutes and hours as digits accumulate", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "2000");
    expect(field()).toHaveValue("20:00");

    await user.clear(field());
    await user.type(field(), "10500");
    expect(field()).toHaveValue("1:05:00");

    await user.clear(field());
    await user.type(field(), "30000");
    expect(field()).toHaveValue("3:00:00");
  });

  it("ignores digits past the domain's ceiling", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "3000099");
    expect(field()).toHaveValue("3:00:00");
  });

  it("shifts back out on backspace", async () => {
    const user = userEvent.setup();
    render(<Harness initial="1:30" />);
    await user.type(field(), "{Backspace}");
    expect(field()).toHaveValue("0:13");
    await user.type(field(), "{Backspace}");
    expect(field()).toHaveValue("0:01");
    await user.type(field(), "{Backspace}");
    expect(field()).toHaveValue("");
  });

  it("normalises an overflowing group on blur instead of rejecting it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "170");
    expect(field()).toHaveValue("1:70");
    await user.tab();
    expect(field()).toHaveValue("2:10");
  });

  it("leaves an empty field empty on blur", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());
    await user.tab();
    expect(field()).toHaveValue("");
  });

  it("wires its error state for assistive tech", () => {
    render(
      <ClockInput
        value="0:45"
        onChange={() => {}}
        ariaLabel="Step 1 duration"
        invalid
        errorId="err-1"
      />,
    );
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field()).toHaveAttribute("aria-describedby", "err-1");
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm test --project client -- ClockInput`
Expected: FAIL — `Failed to resolve import "./ClockInput"`.

- [ ] **Step 3: Implement the component**

Create `app/src/builder/ClockInput.tsx`:

```tsx
import type { ChangeEvent } from "react";
import { fmtDuration, parseClock } from "../../domain/duration.js";

// Six digits reaches 3:00:00, the domain's ceiling for a single step.
const MAX_DIGITS = 6;

/** Digits, filled right to left into ss, then mm, then hh — the same order the
 *  format renders in. `""` stays empty (a legal state for REST). */
export function digitsToClock(digits: string): string {
  if (digits === "") return "";
  const padded = digits.padStart(3, "0");
  const seconds = padded.slice(-2);
  const minutes = padded.slice(-4, -2) || "0";
  const hours = padded.slice(0, -4);
  return hours === ""
    ? `${Number(minutes)}:${seconds}`
    : `${Number(hours)}:${minutes.padStart(2, "0")}:${seconds}`;
}

/** The field owns the separator because the user cannot type one: a numeric
 *  keypad has no colon, which is exactly how a real user failed to enter 30
 *  seconds. Stripping to digits and reformatting also gives backspace its
 *  shift-right behaviour for free. */
export default function ClockInput({
  value,
  onChange,
  ariaLabel,
  invalid,
  errorId,
  className,
  registerRef,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  invalid?: boolean;
  errorId?: string;
  className?: string;
  registerRef?: (el: HTMLInputElement | null) => void;
}) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, "").slice(0, MAX_DIGITS);
    onChange(digitsToClock(digits));
  }

  // Normalising beats rejecting: a keystroke that does nothing reads as a
  // broken field on a phone. `1:70` is 130 seconds, so it settles as `2:10`.
  function handleBlur() {
    if (value === "") return;
    const minutes = parseClock(value);
    if (minutes === null) return;
    onChange(fmtDuration(minutes));
  }

  return (
    <input
      ref={registerRef}
      type="text"
      inputMode="numeric"
      className={className ? `clock-input ${className}` : "clock-input"}
      aria-label={ariaLabel}
      aria-invalid={Boolean(invalid)}
      aria-describedby={errorId}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
```

- [ ] **Step 4: Style it**

In `app/src/index.css`, beside the existing `.duration-input-value` rule:

```css
/* Same metrics as .duration-input-value — the mask changes what the field
   accepts, not how it sits in the row. 16px is deliberate: iOS Safari zooms
   the page on focus for anything smaller. */
.clock-input {
  min-height: 44px;
  width: 100%;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 16px;
  text-align: center;
}
```

Confirm `--rule`, `--surface`, `--ink`, `--radius` and `--font-mono` exist in
the token block at the top of the file before using them. Never raw hex.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm test --project client -- ClockInput`
Expected: PASS (8 tests).

- [ ] **Step 6: Check per-file coverage, then commit**

Run: `pnpm test:coverage --project client -- ClockInput` —
`src/builder/ClockInput.tsx` at 100%. The repo gate is an aggregate and will
pass regardless; read this file's own row and report it.

```bash
git rev-parse --show-toplevel
git add app/src/builder/ClockInput.tsx app/src/builder/ClockInput.test.tsx app/src/index.css
git commit -m "feat: masked clock field that supplies its own separator"
```

---

### Task 4: The builder's duration field speaks clock

This task changes what `BuilderRow.durValue` *means* for minute rows, and the
field that produces it, together. They are one contract — splitting them leaves
the suite red in between.

**Files:**
- Modify: `app/src/builder/builderState.ts` — `:289-333` (grammar + predicates),
  `:207-212` (`stepSummary`), `:380`, `:406` (bounds in `toSteps`), `:435-450`
  (rest parsing), `:496-501` (`rowMinutes`'s rest), `:528-535`
  (`formatDurationValue`), `:537-559` (`stepToRow`)
- Modify: `app/src/builder/DurationInput.tsx:74-90` and both unit-selection
  paths (`:51`, `:110`)
- Modify: `app/src/builder/builderState.test.ts`,
  `app/src/builder/DurationInput.test.tsx`, `app/src/builder/StepCard.test.tsx`,
  `app/src/builder/Builder.test.tsx`, `app/src/builder/EditWorkout.test.tsx`
- Modify: `app/e2e/*.spec.ts` — every flow that types a duration

**Interfaces:**
- Consumes: `ClockInput` (Task 3); `parseClock`, `fmtDuration`,
  `parseDurationToken` (Task 1).
- Produces: `BuilderRow.durValue` holds a **clock string** when
  `durUnit === "min"`, and a plain integer meter string when `durUnit === "m"`.

- [ ] **Step 1: Write the failing tests**

Add to `app/src/builder/builderState.test.ts`:

```ts
describe("clock durations in rows", () => {
  it("round-trips a 45-second stored step through the form and back", () => {
    const form = fromWorkout({
      title: "Sprints",
      type: "AN",
      difficulty: "hard",
      pain: 4,
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 0.75 },
          ref: { base: "6k", off: 0 },
        },
      ],
    });
    expect(form.rows[0]!.durValue).toBe("0:45");
    expect(form.rows[0]!.durUnit).toBe("min");

    const res = toSteps(form);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.steps[0]).toMatchObject({
      duration: { kind: "time", minutes: 0.75 },
    });
  });

  it("keeps meters as a plain integer string", () => {
    const form = fromWorkout({
      title: "Distance",
      type: "O2",
      difficulty: "easy",
      pain: 2,
      steps: [
        {
          k: "w",
          duration: { kind: "distance", meters: 2000 },
          ref: { base: "2k", off: 0 },
        },
      ],
    });
    expect(form.rows[0]!.durValue).toBe("2000");
    expect(form.rows[0]!.durUnit).toBe("m");
  });

  it("summarises a clock duration without inventing a prime mark", () => {
    const row = { ...newRow("w"), durValue: "0:45", durUnit: "min" as const };
    expect(stepSummary(row)).toBe("0:45 @ 6k ±0");
    expect(stepSummary({ ...row, kind: "wu" })).toBe("0:45 warm-up");
  });

  it("rejects a duration past the ceiling and one below a second", () => {
    for (const durValue of ["3:00:01", "0:00"]) {
      const form = {
        ...newForm(),
        title: "T",
        pain: 3,
        rows: [{ ...newRow("w"), durValue, durUnit: "min" as const }],
      };
      expect(toSteps(form).ok, durValue).toBe(false);
    }
  });

  it("round-trips every whole second the field can produce", () => {
    for (const seconds of [1, 20, 45, 59, 60, 90, 3599, 3600, 10800]) {
      const minutes = seconds / 60;
      const form = fromWorkout({
        title: "T",
        type: "O2",
        difficulty: "easy",
        pain: 3,
        steps: [
          {
            k: "w",
            duration: { kind: "time", minutes },
            ref: { base: "6k", off: 0 },
          },
        ],
      });
      const res = toSteps(form);
      expect(res.ok, `${seconds}s`).toBe(true);
      if (!res.ok) continue;
      expect(res.steps[0]).toMatchObject({
        duration: { kind: "time", minutes },
      });
    }
  });
});
```

Add to `app/src/builder/DurationInput.test.tsx`:

```tsx
it("masks the value while the unit is MIN", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <DurationInput value="" unit="min" onChange={onChange} rowLabel="Step 1" />,
  );
  await user.type(screen.getByLabelText("Step 1 duration"), "45");
  expect(onChange).toHaveBeenLastCalledWith({ value: "0:45", unit: "min" });
});

it("takes plain integers while the unit is M", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <DurationInput value="" unit="m" onChange={onChange} rowLabel="Step 1" />,
  );
  await user.type(screen.getByLabelText("Step 1 duration"), "2");
  expect(onChange).toHaveBeenLastCalledWith({ value: "2", unit: "m" });
});

it("clears the value when the unit is switched", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <DurationInput
      value="0:45"
      unit="min"
      onChange={onChange}
      rowLabel="Step 1"
    />,
  );
  await user.click(screen.getByLabelText("Step 1 duration unit meters"));
  // A clock string is meaningless as meters — the field clears rather than
  // handing `toSteps` an unparseable value.
  expect(onChange).toHaveBeenLastCalledWith({ value: "", unit: "m" });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm test --project unit --project client -- builderState DurationInput`
Expected: FAIL — `durValue` is still a bare minutes string and the field is
still `inputMode="decimal"`.

- [ ] **Step 3: Move `builderState` onto the shared grammar**

In `app/src/builder/builderState.ts`:

1. Add
   `import { fmtDuration, parseClock, parseDurationToken } from "../../domain/duration.js";`
2. Delete `parseDurationInput` and `DUR_VALUE_PATTERN`, **including the
   lockstep comment above them** — it is no longer true, and a stale comment
   claiming hand-maintenance is worse than none.
3. Replace `isHalfStep`:

```ts
// Bounds and predicate mirrored exactly from app/domain/validate.ts. Kept
// local (rather than calling validateSteps) because that helper's errors are
// keyed by step index, which can't be mapped back to a form row.
const SECOND = 1 / 60;
const isWholeSecond = (n: number, lo: number, hi: number): boolean =>
  n >= lo && n <= hi && Math.abs(n * 60 - Math.round(n * 60)) < 1e-6;
```

4. Replace `rowDurationNumber` with a unit-aware reader:

```ts
/** The row's duration as a number in its own unit — minutes for `min` (parsed
 *  from the clock string the masked field produces), meters for `m` — or null
 *  for blank/unparseable input. */
function rowDurationNumber(row: BuilderRow): number | null {
  const trimmed = row.durValue.trim();
  if (trimmed === "") return null;
  if (row.durUnit === "min") return parseClock(trimmed);
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}
```

5. In `toSteps`, both `isHalfStep(n, 0.5, 180)` checks become
   `isWholeSecond(n, SECOND, 180)` with error text
   `"duration must be 0:01..3:00:00"`. The rest branch uses
   `parseDurationToken(...)` and `isWholeSecond(restDuration.minutes, SECOND, 60)`
   with error text `"rest must be 0:01..60:00"`.
6. In `rowMinutes`, `parseDurationInput(row.rest.trim())` becomes
   `parseDurationToken(row.rest.trim())`.
7. `stepSummary`'s first line becomes:

```ts
const dur =
  row.durUnit === "min"
    ? fmtDuration(parseClock(row.durValue) ?? 0)
    : `${row.durValue} m`;
```

8. `formatDurationValue` writes the clock form:

```ts
return d.kind === "time"
  ? { durValue: fmtDuration(d.minutes), durUnit: "min" }
  : { durValue: String(d.meters), durUnit: "m" };
```

9. `stepToRow`'s `wu`/`r` branch writes `row.durValue = fmtDuration(s.minutes);`
   and its rest line writes
   `row.rest = s.restMinutes !== undefined ? fmtDuration(s.restMinutes) : "";`.
   Replace the round-trip-spelling comment with one naming the clock form.

- [ ] **Step 4: Point `DurationInput` at `ClockInput`**

Replace the bare `<input>` with a unit switch:

```tsx
{unit === "min" ? (
  <ClockInput
    value={value}
    onChange={(next) => onChange({ value: next, unit })}
    ariaLabel={`${rowLabel} duration`}
    invalid={invalid}
    errorId={errorId}
    className="duration-input-value"
    registerRef={registerRef}
  />
) : (
  <input
    ref={registerRef}
    type="text"
    inputMode="numeric"
    className="clock-input duration-input-value"
    aria-label={`${rowLabel} duration`}
    aria-invalid={Boolean(invalid)}
    aria-describedby={errorId}
    value={value}
    onChange={(event) =>
      onChange({ value: event.target.value.replace(/\D/g, ""), unit })
    }
  />
)}
```

Both unit-selection paths (`selectByIndex` and the chip's `onClick`) emit
`{ value: u === unit ? value : "", unit: u }`.

- [ ] **Step 5: Update the existing tests that type or assert durations**

Run `pnpm test --project unit --project client` and fix every failure that is a
*test* carrying the old format — a fixture with `durValue: "20"` meaning 20
minutes becomes `"20:00"`; a `user.type(field, "5")` expecting 5 minutes types
`"500"`. **Do not weaken an assertion to make it pass.** If a test asserts real
behaviour that changed, update the expectation and keep it sharp.

- [ ] **Step 6: Update the e2e flows**

```bash
grep -rn "duration" app/e2e/*.spec.ts
```

Every site that types a duration must type digits under the new mask. At least
one flow must now author a **`0:45`** step and assert it saves and reappears —
a flow of whole minutes passes no matter how badly the mask works.

- [ ] **Step 7: Run everything**

```bash
pnpm test --project unit --project client
pnpm e2e
```
Both green. `pnpm e2e` is not optional — this task changes components under
`app/src/`.

- [ ] **Step 8: Check per-file coverage, then commit**

```bash
pnpm test:coverage
git rev-parse --show-toplevel
git add app/src/builder app/e2e
git commit -m "feat: durations are typed as clock values under a number pad"
```

---

### Task 5: SPM and REST become typable

**Files:**
- Modify: `app/src/builder/Stepper.tsx:14-59` (props), `:87-89` (value cell)
- Modify: `app/src/builder/StepEditor.tsx:115-118`, `:198-242`
- Modify: `app/src/builder/builderState.ts:141-185` (the rest bridges)
- Modify: `app/src/builder/Stepper.test.tsx`,
  `app/src/builder/StepEditor.test.tsx`, `app/src/builder/builderState.test.ts`
- Modify: `app/src/index.css`

**Interfaces:**
- Consumes: `ClockInput` (Task 3); `fmtDuration`, `parseClock` (Task 1).
- Produces: `Stepper` gains two optional props —
  `onValueChange?: (next: string) => void` and
  `valueInput?: "text" | "clock"`. When `onValueChange` is absent the value cell
  stays a `<span>`, so REPEAT and PACE are untouched.

- [ ] **Step 1: Write the failing tests**

Add to `app/src/builder/Stepper.test.tsx`:

```tsx
it("keeps a plain span when no onValueChange is supplied", () => {
  render(
    <Stepper
      label="Repeat"
      value="×4"
      onDecrement={() => {}}
      onIncrement={() => {}}
    />,
  );
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("accepts typing when onValueChange is supplied", async () => {
  const user = userEvent.setup();
  const onValueChange = vi.fn();
  render(
    <Stepper
      label="Step 1 stroke rate"
      value=""
      onValueChange={onValueChange}
      onDecrement={() => {}}
      onIncrement={() => {}}
    />,
  );
  await user.type(screen.getByLabelText("Step 1 stroke rate value"), "27");
  expect(onValueChange).toHaveBeenLastCalledWith("27");
});
```

Add to `app/src/builder/StepEditor.test.tsx` (using that file's existing render
helper and row fixtures — match what is already there):

```tsx
it("returns SPM to FREE when the field is cleared", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  renderEditor({ row: { ...workRow, spm: "27" }, onChange });

  await user.clear(screen.getByLabelText("Step 1 stroke rate value"));
  expect(onChange).toHaveBeenLastCalledWith({ spm: "" });
});

it("takes a typed rest of 3:00", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  renderEditor({ row: workRow, onChange });

  await user.type(screen.getByLabelText("Step 1 rest value"), "300");
  expect(onChange).toHaveBeenLastCalledWith({ rest: "3:00" });
});

it("still steps rest by 30 seconds after a typed value", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  renderEditor({ row: { ...workRow, rest: "3:00" }, onChange });

  await user.click(screen.getByLabelText("Step 1 rest up"));
  expect(onChange).toHaveBeenLastCalledWith({ rest: "3:30" });
});

it("wakes SPM at 20 from empty, as before", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  renderEditor({ row: { ...workRow, spm: "" }, onChange });

  await user.click(screen.getByLabelText("Step 1 stroke rate up"));
  expect(onChange).toHaveBeenLastCalledWith({ spm: "20" });
});
```

Add to `app/src/builder/builderState.test.ts`:

```ts
it("reads and writes rest as a clock string", () => {
  const row = { ...newRow("w"), rest: "1:30" };
  expect(restSecondsFromRow(row)).toBe(90);
  expect(rowWithRestSeconds(row, 210).rest).toBe("3:30");
  expect(rowWithRestSeconds(row, 0).rest).toBe("");
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm test --project unit --project client -- Stepper StepEditor builderState`
Expected: FAIL — the value cell is a `<span>`, so there is nothing to type into.

- [ ] **Step 3: Give `Stepper` an optional input**

Add the two props (documented in the component's existing comment style), then
replace the value `<span>`:

```tsx
{onValueChange === undefined ? (
  <span className={valueClass} style={valueStyle}>
    {value}
  </span>
) : valueInput === "clock" ? (
  <ClockInput
    value={value}
    onChange={onValueChange}
    ariaLabel={`${label} value`}
    className={valueClass}
  />
) : (
  <input
    type="text"
    inputMode="numeric"
    className={`${valueClass} stepper-value-input`}
    style={valueStyle}
    aria-label={`${label} value`}
    value={value}
    onChange={(event) =>
      onValueChange(event.target.value.replace(/\D/g, "").slice(0, 2))
    }
  />
)}
```

Keep the component dumb, as its own doc comment insists: no clamping, no
formatting, no defaults here. `role="group"`, the `${label} down` / `${label} up`
button names and the `invalid`/`errorId`/`registerRef` wiring are unchanged —
the input inherits the group's error association rather than growing a second
one.

- [ ] **Step 4: (MOVED TO TASK 4 — skip)** The rest bridges migrated to clock
      strings in Task 4's fix round. Leaving them here was a sequencing defect
      in this plan: Task 4 changes what `row.rest` *holds*, so a Task 5 that
      migrated the readers left `stepToRow`'s output being parsed with
      `Number("3:00")` in between — every stored workout with rest rendered
      `rest NaN:NaN`, and one tap of REST ± made it unsavable. Verify the
      functions below already read `parseClock` before you start; if they do,
      this step is done.

```ts
/** `row.rest` (a clock string, e.g. "1:30") as whole seconds for the stepper —
 *  `""` reads as 0 ("no rest"), matching how `toSteps` treats a blank rest
 *  field. */
export function restSecondsFromRow(row: BuilderRow): number {
  const trimmed = row.rest.trim();
  if (trimmed === "") return 0;
  const minutes = parseClock(trimmed);
  return minutes === null ? 0 : Math.round(minutes * 60);
}

/** Writes a stepper-produced seconds value back into `row.rest` as a clock
 *  string. Clamps to `0..REST_MAX_SECONDS` and snaps to the nearest
 *  `REST_STEP_SECONDS` multiple first. Zero clears the field to `""` rather
 *  than storing "0:00", matching how a blank rest field already means "no
 *  rest" everywhere else in this module. */
export function rowWithRestSeconds(
  row: BuilderRow,
  seconds: number,
): BuilderRow {
  const clamped = Math.min(REST_MAX_SECONDS, Math.max(0, seconds));
  const snapped = Math.round(clamped / REST_STEP_SECONDS) * REST_STEP_SECONDS;
  return { ...row, rest: snapped === 0 ? "" : fmtDuration(snapped / 60) };
}
```

`fmtRestSeconds` keeps its `"NONE"`-at-zero behaviour but delegates:
`return seconds === 0 ? "NONE" : fmtDuration(seconds / 60);`.

`REST_MAX_SECONDS` (900) is the **stepper's** reach, not the domain's bound (60
minutes) — a typed rest may legally exceed 15 minutes and `toSteps` enforces the
real ceiling. Update the comment above the constants to say so; it currently
claims the grid is what keeps values legal.

- [ ] **Step 5: Wire `StepEditor`**

SPM's `Stepper` gains `onValueChange={(next) => onChange({ spm: next })}`;
REST's gains `valueInput="clock"` and
`onValueChange={(next) => onChange({ rest: next })}`.

Both displayed values become the raw field (`row.spm`, `row.rest`) rather than
`"FREE"`/`fmtRestSeconds(...)` — a field you can type into cannot render a word
while holding `""`. Keep the muted styling via the existing `valueClassName`
conditions; the empty field itself communicates "no rest"/"free rate". Update
the two assertions in the editor's tests that expect the literal `FREE`/`NONE`
strings. The collapsed card's summary (`stepSubSummary`) still says
`rest none` — that behaviour stays.

- [ ] **Step 6: Style the input variant**

```css
/* The value cell is an input when its caller passes onValueChange — same
   metrics, no chrome of its own, since the joined stepper container already
   draws the borders. */
.stepper-value-input {
  min-height: 44px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: center;
}
```

- [ ] **Step 7: Run everything**

```bash
pnpm test --project unit --project client
pnpm e2e
```

- [ ] **Step 8: Check per-file coverage, then commit**

```bash
pnpm test:coverage
git rev-parse --show-toplevel
git add app/src
git commit -m "feat: SPM and rest are typable as well as steppable"
```

---

### Task 6: `+ ADD STEP` comes up blank

**Files:**
- Modify: `app/src/builder/builderState.ts:249-283`
- Modify: `app/src/builder/Builder.tsx:200-204`
- Modify: `app/src/builder/builderState.test.ts`,
  `app/src/builder/Builder.test.tsx`
- Modify: `docs/design/builder-redesign/README.md`, `docs/design/DEVIATIONS.md`

**Interfaces:**
- Produces: `addBlankStep(f: BuilderForm): { form: BuilderForm; id: string }`,
  replacing `addStepLike` (same shape, so the call site changes name only).

- [ ] **Step 1: Write the failing tests**

Replace the `addStepLike` describe block in
`app/src/builder/builderState.test.ts` with:

```ts
describe("addBlankStep", () => {
  it("adds an empty work step rather than a copy of the last one", () => {
    const filled: BuilderForm = {
      ...newForm(),
      rows: [
        {
          ...newRow("w"),
          durValue: "20:00",
          durUnit: "min",
          refBase: "2k",
          refOff: 5,
          spm: "27",
          rest: "3:00",
        },
      ],
    };

    const { form, id } = addBlankStep(filled);
    const added = form.rows.find((r) => r.id === id)!;

    expect(form.rows).toHaveLength(2);
    expect(added).toMatchObject({
      kind: "w",
      durValue: "",
      durUnit: "min",
      refBase: "6k",
      refOff: 0,
      spm: "",
      rest: "",
    });
    // The previous row is untouched — this is an add, not a move.
    expect(form.rows[0]).toMatchObject({ durValue: "20:00", spm: "27" });
  });

  it("still gives the first step of an empty workout its head start", () => {
    const { form, id } = addBlankStep({ ...newForm(), rows: [] });
    expect(form.rows.find((r) => r.id === id)).toMatchObject({
      durValue: "5:00",
      durUnit: "min",
      refBase: "6k",
      refOff: 0,
      spm: "22",
      rest: "1:00",
    });
  });

  it("adds a work step even when the last row is a warm-up", () => {
    const { form, id } = addBlankStep({
      ...newForm(),
      rows: [{ ...newRow("wu"), durValue: "10:00" }],
    });
    expect(form.rows.find((r) => r.id === id)!.kind).toBe("w");
  });
});
```

Add to `app/src/builder/Builder.test.tsx` (matching that file's existing render
helper and its naming for the DONE control):

```tsx
it("opens a blank editor when a step is added after a filled one", async () => {
  const user = userEvent.setup();
  renderBuilder();

  await user.type(screen.getByLabelText("Step 1 duration"), "2000");
  await user.click(screen.getByRole("button", { name: /done/i }));
  await user.click(screen.getByRole("button", { name: "+ ADD STEP" }));

  expect(screen.getByLabelText("Step 2 duration")).toHaveValue("");
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm test --project unit --project client -- builderState Builder`
Expected: FAIL — `addBlankStep is not defined`, and the added step still carries
`20:00`.

- [ ] **Step 3: Implement**

```ts
/** Appends an EMPTY work step and returns its id so the caller can open it for
 *  editing immediately — the accordion always opens a freshly added step.
 *
 *  It used to append a copy of the last row's values (the design doc's original
 *  "+ ADD STEP" behaviour). Device use rejected that: ADD STEP and DUPLICATE
 *  did nearly the same thing, and a user who wanted a fresh step got a
 *  filled-in one. DUPLICATE (`cloneRow`) is now the only control that copies.
 *
 *  The empty-list default (`5:00` / `6k` ±0 / spm `22` / rest `1:00`) stays —
 *  a brand-new workout keeps its head start.
 *
 *  Always produces a `kind: "w"` row, even when the last row is a `wu` or
 *  standalone `r`: "+ ADD STEP" only ever authors a work step, so a workout
 *  ending in a bookend row must not silently hand back another one. */
export function addBlankStep(f: BuilderForm): {
  form: BuilderForm;
  id: string;
} {
  const row: BuilderRow =
    f.rows.length === 0
      ? {
          ...newRow("w"),
          durValue: "5:00",
          durUnit: "min",
          refBase: "6k",
          refOff: 0,
          spm: "22",
          rest: "1:00",
        }
      : newRow("w");
  return { form: { ...f, rows: [...f.rows, row] }, id: row.id };
}
```

In `Builder.tsx:201`, call `addBlankStep(form)` and fix the import.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm test --project unit --project client`

- [ ] **Step 5: Reconcile the design docs**

`docs/design/builder-redesign/README.md` describes ADD STEP as appending a copy.
`docs/design/DEVIATIONS.md` documents **current state, not history** — its rows
have previously described deleted code and contradicted each other. Grep both
files for "ADD STEP", "copy" and "duplicate", then update the README's
description and update-or-retire the DEVIATIONS row so both describe what the
code now does.

- [ ] **Step 6: Run e2e, then commit**

```bash
pnpm e2e
git rev-parse --show-toplevel
git add app/src/builder docs/design
git commit -m "fix: + ADD STEP yields an empty step; DUPLICATE is what copies"
```

---

### Task 7: The warm-up moves above the steps

**Files:**
- Modify: `app/src/builder/Builder.tsx:382` (insert above the steps card) and
  `:457-468` (remove from the totals block)
- Modify: `app/src/index.css` (`.builder-warmup-line`)
- Modify: `app/src/builder/Builder.test.tsx`
- Modify: `docs/design/builder-redesign/README.md`, `docs/design/DEVIATIONS.md`

- [ ] **Step 1: Write the failing test**

```tsx
it("shows the warm-up above the step list, not below the totals", async () => {
  renderBuilder();                       // with preferences ready
  const warmup = await screen.findByText(/warm-up from your preferences/);
  const steps = screen.getByText("STEPS");

  // FOLLOWING means `steps` comes after `warmup` in document order.
  expect(
    warmup.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
```

If the file's render helper does not already supply a ready preferences state,
extend it the way the file's other preference-dependent tests do — do not stub
`usePreferences` in a new way.

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm test --project client -- Builder`
Expected: FAIL — the warm-up currently follows the steps.

- [ ] **Step 3: Move it**

Cut the `preferencesState.state === "ready" && (…)` block out of
`.builder-totals` and place it immediately above
`<div className="builder-steps">`. Keep the copy, the guard and the reasoning
comment — the guard exists because a wrong warm-up figure is worse than none,
and that has not changed. Reword only the placement sentence, e.g. "reads as an
implicit step 0, which is what actually happens at session start".

- [ ] **Step 4: Adjust the styling**

`.builder-warmup-line` was styled as a footnote under the totals. Give it the
spacing it needs above the steps card — margin only, no new colours or type
sizes. If you do change its colour, **compute the contrast ratio against
`--page` and put the number in your report**: a token shipped at 3.29:1 against
a 4.5:1 requirement once and was caught only by a later automated scan.

- [ ] **Step 5: Run tests, e2e and screenshots**

```bash
pnpm test --project unit --project client
pnpm e2e
pnpm screenshots
```
Open `docs/screenshots/builder.png` and look at it.

- [ ] **Step 6: Reconcile the docs, then commit**

```bash
git rev-parse --show-toplevel
git add app/src docs
git commit -m "feat: the warm-up reads as step zero, above the list"
```

---

### Task 8: Durations and owner actions outside the builder

**Files:**
- Modify: `app/src/workout/StepRow.tsx:41`, `:52`, `:71`, `:78`
- Modify: `app/src/library/WorkoutRow.tsx:23`
- Modify: `app/src/index.css:66-73` (`.button-outline`)
- Modify: `app/src/workout/StepRow.test.tsx`,
  `app/src/library/Library.test.tsx`, `app/src/workout/WorkoutDetail.test.tsx`

**Interfaces:**
- Consumes: `fmtDuration`, `fmtDurationSpoken` (Task 1).

- [ ] **Step 1: Write the failing tests**

Add to `app/src/workout/StepRow.test.tsx`:

```tsx
it("renders a 45-second step as 0:45, not 0.75′", () => {
  render(
    <StepRow
      step={{
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "6k", off: 0 },
      }}
      baselines={{ k2Seconds: 112, k6Seconds: 122 }}
      tolerance={1}
      nudge={0}
      onNudge={() => {}}
    />,
  );
  expect(screen.getByText(/0:45/)).toBeInTheDocument();
  expect(screen.queryByText(/0\.75/)).not.toBeInTheDocument();
});

it("renders a 20-second step without sixteen digits of float", () => {
  render(
    <StepRow
      step={{
        k: "w",
        duration: { kind: "time", minutes: 20 / 60 },
        ref: { base: "6k", off: 0 },
      }}
      baselines={{ k2Seconds: 112, k6Seconds: 122 }}
      tolerance={1}
      nudge={0}
      onNudge={() => {}}
    />,
  );
  expect(screen.getByText(/0:20/)).toBeInTheDocument();
});

it("gives a warm-up an accessible name a screen reader can say", () => {
  render(
    <StepRow
      step={{ k: "wu", minutes: 65 }}
      baselines={null}
      tolerance={1}
      nudge={0}
      onNudge={() => {}}
    />,
  );
  expect(screen.getByText("1:05:00")).toHaveAccessibleName("1 hour 5 minutes");
});
```

Add to `app/src/library/Library.test.tsx` (using that file's own fixture and
render helpers):

```tsx
it("rounds a fractional total rather than printing 2.25′", () => {
  // Three 45-second steps: 2.25 minutes.
  renderLibraryWith([
    workoutFixture({
      title: "Shorts",
      steps: [
        { k: "w", duration: { kind: "time", minutes: 0.75 }, ref: { base: "6k", off: 0 } },
        { k: "w", duration: { kind: "time", minutes: 0.75 }, ref: { base: "6k", off: 0 } },
        { k: "w", duration: { kind: "time", minutes: 0.75 }, ref: { base: "6k", off: 0 } },
      ],
    }),
  ]);
  expect(screen.getByText("2′")).toBeInTheDocument();
  expect(screen.queryByText("2.25′")).not.toBeInTheDocument();
});
```

**Do not** try to assert the Edit link's colour in a jsdom test — jsdom does not
apply `index.css`, so `getComputedStyle` returns empty strings and the test
would pass against the broken styling. The styling assertion belongs in
`design.spec.ts`, which runs a real browser; it is written in Task 9 Step 1.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm test --project client -- StepRow Library`
Expected: FAIL — `0.75′` renders and there is no accessible name.

- [ ] **Step 3: Render durations in the house format**

In `StepRow.tsx`, import both helpers and replace each raw print:

```tsx
<span className="step-row-duration" aria-label={fmtDurationSpoken(step.minutes)}>
  {fmtDuration(step.minutes)}
</span>
```

The work row's `durationLabel` becomes
`step.duration.kind === "time" ? fmtDuration(step.duration.minutes) : \`${step.duration.meters} m\``,
and the rest sub-part becomes `` `${fmtDuration(step.restMinutes)} rest` ``. The
left-hand label is a composed string (`20:00 @ 6k +10`) — give the element
carrying it an `aria-label` built from the spoken duration plus the same pace
text, so the announcement doesn't degrade into digits.

In `WorkoutRow.tsx:23`:
`{durationMinutes !== null ? \`${Math.round(durationMinutes)}′\` : "—"}`.
Do **not** round before the duration filter buckets — check
`app/src/library/filters.ts` receives the unrounded value and confirm it in your
report.

- [ ] **Step 4: Fix the owner actions' styling**

`.button-outline` (`index.css:66`) sets a border but no `color` and no
`text-decoration`, so the Edit `<Link>` renders in the browser's default blue
underline — off-palette, and the only untokenised colour on the screen. Add:

```css
.button-outline {
  /* …existing declarations… */
  color: var(--ink);
  text-decoration: none;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

Delete is the destructive action and already has a staged confirm; leave its
first press neutral (`--ink` border) and do not paint it accent — accent is
reserved for Save and the unit/pace toggles
(`docs/design/builder-redesign/README.md` §4b). **Report the computed contrast
ratio of `--ink` on `--surface`.**

- [ ] **Step 5: Run tests, e2e and screenshots**

```bash
pnpm test --project unit --project client
pnpm e2e
pnpm screenshots
```
Open `docs/screenshots/workout-detail.png` and `library.png` and look at them —
every duration on those screens now reads in the house format, and Edit is no
longer blue.

- [ ] **Step 6: Check per-file coverage, then commit**

```bash
pnpm test:coverage
git rev-parse --show-toplevel
git add app/src docs/screenshots
git commit -m "feat: house time format outside the builder; owner actions on-palette"
```

---

### Task 9: Structural coverage, screenshots and the record

**Files:**
- Modify: `app/e2e/design.spec.ts`, `app/e2e/screenshots.spec.ts`
- Modify: `ROADMAP.md`, `docs/design/DEVIATIONS.md`

- [ ] **Step 1: Write the failing structural assertions**

Add inside the existing `builder screen` describe in `app/e2e/design.spec.ts`:

```ts
test("the warm-up line precedes the step list", async ({ page }) => {
  const warmup = page.locator(".builder-warmup-line");
  const steps = page.locator(".builder-steps");
  await expect(warmup).toBeVisible();

  const warmupBox = await warmup.boundingBox();
  const stepsBox = await steps.boundingBox();
  expect(warmupBox!.y).toBeLessThan(stepsBox!.y);
});

test("the masked duration field opens a digit-only keypad", async ({
  page,
}) => {
  await expect(page.getByLabel("Step 1 duration")).toHaveAttribute(
    "inputmode",
    "numeric",
  );
});
```

Add to the existing `workout detail screen` describe — this is the real-browser
home for Task 8's styling fix, since jsdom never applies `index.css`:

```ts
test("Edit and Delete are on-palette, not default browser link blue", async ({
  page,
}) => {
  // Seeded globals are read-only, so the owner actions only render on a
  // workout this user owns — author one first (the builder flow this suite
  // already uses), then open its detail screen.
  const edit = page.getByRole("link", { name: "Edit" });
  await expect(edit).toBeVisible();

  const styles = await edit.evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.color, decoration: s.textDecorationLine };
  });
  expect(styles.color).toBe("rgb(27, 26, 23)"); // --ink
  expect(styles.decoration).toBe("none");
});
```

Reuse whatever helper this file already has for reaching an owned workout; if
there is none, author one through the builder in a `beforeEach` rather than
mutating the seeded library.

And a sub-describe that sweeps the editor **with every field populated** — the
existing sweeps only ever see a blank builder:

```ts
test.describe("expanded editor with typed values", () => {
  test.beforeEach(async ({ page }) => {
    await page.getByLabel("Step 1 duration").pressSequentially("45");
    await page.getByLabel("Step 1 stroke rate value").pressSequentially("27");
    await page.getByLabel("Step 1 rest value").pressSequentially("300");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });
});
```

- [ ] **Step 2: Run e2e**

Run: `pnpm e2e`
Any failure here is a real finding — fix the code, not the assertion. Report the
measured number for any tap target under 44px or any contrast violation.

- [ ] **Step 3: Seed a sub-minute step into the screenshots**

`app/e2e/screenshots.spec.ts`'s builder capture authors a workout; give it a
`0:45` step so the committed screenshot shows the feature this phase built.
Then `pnpm screenshots`, and open every changed image.

- [ ] **Step 4: Update the roadmap**

Add `## Phase 5F — Builder entry` between 5E and Phase 6, in the same shape as
the 5C/5D/5E sections: status line, goal, checked deliverables, Exit line.
Record the house time format as a locked decision and note that MAX/MIN effort
refs are **Phase 5G**.

- [ ] **Step 5: Final DEVIATIONS pass**

Read `docs/design/DEVIATIONS.md` end to end. Every row must describe what the
code does **today**. This phase changed the ADD STEP behaviour, the warm-up
placement, duration/rest entry, SPM/REST editability and the owner-action
styling. Retire rows that no longer describe anything real; update rows that do.

- [ ] **Step 6: Full gate, then commit**

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test:coverage
pnpm e2e
git rev-parse --show-toplevel
git add app/e2e docs ROADMAP.md
git commit -m "test: structural coverage for the new entry controls; record the phase"
```

---

## Notes for the executing agent

- **Task order matters.** Tasks 1–2 are domain-only. Task 3 adds an unused
  component. Task 4 is the one that changes meaning — it must land as a unit,
  and it must run `pnpm e2e`.
- **The float epsilon is not optional.** If a test that should pass fails on a
  value like 20 seconds, look for a `Number.isInteger(n * 60)` that slipped in.
- **`Stepper` has four callers** — PACE offset, SPM, REST and REPEAT. The new
  props are optional precisely so REPEAT and PACE keep rendering a `<span>`.
  Verify both still look and behave as they did.
- **Do not weaken a test to make it pass.** If an existing assertion contradicts
  this plan, that is a finding worth reporting, not a line to edit away.
