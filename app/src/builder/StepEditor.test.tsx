import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import type { BuilderRow } from "./builderState";
import StepEditor from "./StepEditor";

// Local row-shape helpers — same convention as StepCard.test.tsx's own
// workRow/wuRow (that file can't import them either; they're not exported).
function workRow(overrides: Partial<BuilderRow> = {}): BuilderRow {
  return {
    id: "row-1",
    kind: "w",
    durValue: "20:00",
    durUnit: "min",
    refBase: "6k",
    refOff: 0,
    refEffort: null,
    spm: "20",
    rest: "1:30",
    ...overrides,
  };
}

function wuRow(overrides: Partial<BuilderRow> = {}): BuilderRow {
  return {
    id: "wu-1",
    kind: "wu",
    durValue: "10:00",
    durUnit: "min",
    refBase: "6k",
    refOff: 0,
    refEffort: null,
    spm: "",
    rest: "",
    ...overrides,
  };
}

// Standalone `r` (rest) row — same minutes-only shape as wuRow, distinct
// `kind` and id/durValue so a test can tell which fixture actually rendered.
// Only `wu` was ever exercised against the real StepEditor before this task
// (StepCard.test.tsx already covers both kinds; this file didn't) — the
// final review's ledger carried this as a deferred minor.
function restStandaloneRow(overrides: Partial<BuilderRow> = {}): BuilderRow {
  return {
    id: "r-1",
    kind: "r",
    durValue: "5:00",
    durUnit: "min",
    refBase: "6k",
    refOff: 0,
    refEffort: null,
    spm: "",
    rest: "",
    ...overrides,
  };
}

type Handlers = {
  row: BuilderRow;
  index: number;
  splitLabel: string | null;
  onChange: (patch: Partial<BuilderRow>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDone: () => void;
};

function setup(overrides: Partial<Handlers> = {}) {
  const props = {
    row: workRow(),
    index: 0,
    splitLabel: null as string | null,
    onChange: vi.fn<(patch: Partial<BuilderRow>) => void>(),
    onDuplicate: vi.fn<() => void>(),
    onDelete: vi.fn<() => void>(),
    onDone: vi.fn<() => void>(),
    ...overrides,
  };
  const view = render(
    <MemoryRouter>
      <StepEditor {...props} />
    </MemoryRouter>,
  );
  return { ...props, container: view.container };
}

// A stateful wrapper for the tests that need a stepper's value to actually
// change across repeated presses/keystrokes (REST's "three presses reach
// 1:30", and typing a multi-digit clock value — ClockInput/the plain
// numeric input both need their `value` prop to actually advance between
// keystrokes, same reason ClockInput.test.tsx's own Harness exists), as
// opposed to the single-press call-argument assertions everywhere else.
// `onChange` is optional and, when given, is called with every raw patch
// IN ADDITION to updating `row` — lets a test assert on the exact final
// call while still getting real accumulation leading up to it.
function Harness({
  initialRow,
  onChange,
}: {
  initialRow: BuilderRow;
  onChange?: (patch: Partial<BuilderRow>) => void;
}) {
  const [row, setRow] = useState(initialRow);
  return (
    <MemoryRouter>
      <StepEditor
        row={row}
        index={0}
        splitLabel={null}
        onChange={(patch) => {
          onChange?.(patch);
          setRow((r) => ({ ...r, ...patch }));
        }}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onDone={vi.fn()}
      />
    </MemoryRouter>
  );
}

describe("StepEditor", () => {
  // 1. The seven rows render in order for a work step.
  it("renders the seven rows in order: header, DUR, PACE, SPM, REST, TARGET, DONE", () => {
    const { container } = setup({ splitLabel: "2:11.0–2:13.0" });

    expect(screen.getByText("STEP 1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Duplicate Step 1/i }),
    ).toHaveTextContent("DUPLICATE");
    expect(
      screen.getByRole("button", { name: /Delete Step 1/i }),
    ).toBeInTheDocument();

    const labels = Array.from(
      container.querySelectorAll(
        ".step-editor-header-label, .step-editor-row-label, .step-editor-target-label",
      ),
    ).map((el) => el.textContent);
    expect(labels).toStrictEqual([
      "STEP 1",
      "DUR",
      "PACE",
      "SPM",
      "REST",
      "TARGET",
    ]);

    const target = screen.getByText("2:11.0–2:13.0");
    const done = screen.getByRole("button", { name: "DONE" });
    expect(
      target.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // 2. TARGET shows splitLabel, rendered ink — not accent, since it's
  // output, not a selected state.
  it("shows splitLabel in the TARGET strip, rendered as ink output rather than an accent selection", () => {
    setup({ splitLabel: "2:11.0–2:13.0" });
    const value = screen.getByText("2:11.0–2:13.0");
    expect(value).toHaveClass("step-editor-target-value");
    expect(value.className).not.toMatch(/accent/i);
    expect(value).not.toHaveAttribute("style");
  });

  // 3. SPM shows FREE when empty; + from empty wakes at exactly 20 — the
  // recorded departure from the handoff's 18.
  it("shows FREE for an empty spm, and pressing + from empty wakes at exactly 20 (not 18)", async () => {
    const { onChange } = setup({ row: workRow({ spm: "" }) });
    expect(screen.getByLabelText("Row 1 stroke rate value")).toHaveValue("");

    await userEvent.click(
      screen.getByRole("button", { name: "Row 1 stroke rate up" }),
    );
    expect(onChange).toHaveBeenCalledWith({ spm: "20" });
  });

  // Coverage: an unparseable spm (only reachable via corrupted/legacy stored
  // data, since the stepper can never type free text) wakes at 20 the same
  // as empty — same defensive convention as the deleted SpmInput.tsx's own
  // parseSpm.
  it("treats an unparseable spm the same as empty — wakes at 20", async () => {
    const { onChange } = setup({ row: workRow({ spm: "abc" }) });
    await userEvent.click(
      screen.getByRole("button", { name: "Row 1 stroke rate up" }),
    );
    expect(onChange).toHaveBeenCalledWith({ spm: "20" });
  });

  // 4. SPM − from 10 clears to FREE (empty), rather than sticking at 10 —
  // the fix for this review's IMPORTANT 1: the old `clampSpm` floored at
  // SPM_MIN instead of clearing, so a step with any spm could never become
  // free-rate again (one accidental `+` on a new step was unrecoverable,
  // and all 35 starter workouts carry spm on every work step, so no
  // starter-shaped or bulk-imported workout could ever be made free-rate).
  // The spec's own "SPM stays optional — empty round-trips as absent" line
  // and the handoff's "`−` below 17 goes to 0 = FREE" both require this.
  it("clears spm to FREE (empty) when − is pressed at the domain's 10 floor", async () => {
    const { onChange } = setup({ row: workRow({ spm: "10" }) });
    await userEvent.click(
      screen.getByRole("button", { name: "Row 1 stroke rate down" }),
    );
    expect(onChange).toHaveBeenCalledWith({ spm: "" });
  });

  // Coverage: the stepper still clamps at the ceiling (60), only the floor
  // clears instead of sticking — proves the fix didn't just delete the
  // upper bound along with the floor's old behaviour.
  it("still clamps spm at the domain's 60 ceiling", async () => {
    const { onChange } = setup({ row: workRow({ spm: "60" }) });
    await userEvent.click(
      screen.getByRole("button", { name: "Row 1 stroke rate up" }),
    );
    expect(onChange).toHaveBeenCalledWith({ spm: "60" });
  });

  // Task 5: the field itself is typable now, not just steppable — this is
  // the affordance that lets a step return to FREE directly (5E's steppers
  // only cleared via a `-` press at the floor) and lets a specific SPM/rest
  // be reached without walking the grid one tap at a time.
  it("returns SPM to FREE when the field is cleared", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    setup({ row: workRow({ spm: "27" }), onChange });

    await user.clear(screen.getByLabelText("Row 1 stroke rate value"));
    expect(onChange).toHaveBeenLastCalledWith({ spm: "" });
  });

  // Uses the stateful Harness, not the static `setup()` every single-press
  // test above uses: ClockInput's masked field needs `value` to actually
  // advance between keystrokes to accumulate "3", "30", "300" into "3:00" —
  // a static mock leaves `value` at "" for every keystroke (the same
  // controlled-input revert Stepper.test.tsx's own typing test hits), which
  // would land each digit alone rather than accumulating.
  it("takes a typed rest of 3:00", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initialRow={workRow({ rest: "" })} onChange={onChange} />);

    await user.type(screen.getByLabelText("Row 1 rest value"), "300");
    expect(onChange).toHaveBeenLastCalledWith({ rest: "3:00" });
  });

  it("still steps rest by 30 seconds after a typed value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    setup({ row: workRow({ rest: "3:00" }), onChange });

    await user.click(screen.getByLabelText("Row 1 rest up"));
    expect(onChange).toHaveBeenLastCalledWith({ rest: "3:30" });
  });

  it("wakes SPM at 20 from empty, as before", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    setup({ row: workRow({ spm: "" }), onChange });

    await user.click(screen.getByLabelText("Row 1 stroke rate up"));
    expect(onChange).toHaveBeenLastCalledWith({ spm: "20" });
  });

  // Full round trip proving the fix survives Save, not just the stepper's
  // own onChange call: clear an already-set spm all the way to FREE via
  // repeated − presses, then Save, and confirm the POST body carries no
  // `spm` key at all for that step — an absent key, not `spm: ""` or
  // `spm: undefined` serialised in, is what "empty round-trips as absent"
  // requires (`toSteps` in builderState.ts only ever sets `step.spm` inside
  // its own `if (spm !== undefined)` guard).
  it("round-trips a cleared spm through Save as an absent key, not a present empty one", async () => {
    const onChange = vi.fn<(patch: Partial<BuilderRow>) => void>();
    const { rerender } = render(
      <MemoryRouter>
        <StepEditor
          row={workRow({ spm: "10" })}
          index={0}
          splitLabel={null}
          onChange={onChange}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onDone={vi.fn()}
        />
      </MemoryRouter>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Row 1 stroke rate down" }),
    );
    expect(onChange).toHaveBeenCalledWith({ spm: "" });

    // Apply the patch the way Builder.tsx's own updateRow does, then re-run
    // this cleared row through the actual toSteps used at Save time.
    const clearedRow = { ...workRow({ spm: "10" }), spm: "" };
    rerender(
      <MemoryRouter>
        <StepEditor
          row={clearedRow}
          index={0}
          splitLabel={null}
          onChange={onChange}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onDone={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Row 1 stroke rate value")).toHaveValue("");

    const { toSteps, newForm } = await import("./builderState");
    const form = { ...newForm(), title: "t", pain: 3, rows: [clearedRow] };
    const result = toSteps(form);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected toSteps to succeed");
    const body = JSON.parse(JSON.stringify({ steps: result.steps })) as {
      steps: Array<Record<string, unknown>>;
    };
    expect(Object.keys(body.steps[0]!)).not.toContain("spm");
  });

  // 5. REST shows NONE at zero and 1:30 after three + presses (30s steps).
  it("shows NONE at zero rest and reaches 1:30 after three + presses", async () => {
    render(<Harness initialRow={workRow({ rest: "" })} />);
    expect(screen.getByLabelText("Row 1 rest value")).toHaveValue("");

    const up = () => screen.getByRole("button", { name: "Row 1 rest up" });
    await userEvent.click(up());
    await userEvent.click(up());
    await userEvent.click(up());

    expect(screen.getByLabelText("Row 1 rest value")).toHaveValue("1:30");
  });

  it("steps rest back down by 30s, clamped at 0 (NONE)", async () => {
    const { onChange } = setup({ row: workRow({ rest: "0:30" }) }); // 30s
    await userEvent.click(
      screen.getByRole("button", { name: "Row 1 rest down" }),
    );
    expect(onChange).toHaveBeenCalledWith({ rest: "" });
  });

  // 6. PACE offset clamps at +60/−60, not the handoff's −15..+30.
  it("clamps the pace offset at +60, not the handoff's +30", async () => {
    const { onChange } = setup({ row: workRow({ refOff: 60 }) });
    await userEvent.click(
      screen.getByRole("button", { name: "Row 1 pace slower" }),
    );
    expect(onChange).toHaveBeenCalledWith({ refBase: "6k", refOff: 60 });
  });

  it("clamps the pace offset at −60, not the handoff's −15", async () => {
    const { onChange } = setup({ row: workRow({ refOff: -60 }) });
    await userEvent.click(
      screen.getByRole("button", { name: "Row 1 pace faster" }),
    );
    expect(onChange).toHaveBeenCalledWith({ refBase: "6k", refOff: -60 });
  });

  // 7. DONE / DUPLICATE / × call their own handlers.
  it("DONE calls onDone; DUPLICATE calls onDuplicate; × calls onDelete", async () => {
    const { onDone, onDuplicate, onDelete } = setup();

    await userEvent.click(screen.getByRole("button", { name: "DONE" }));
    await userEvent.click(
      screen.getByRole("button", { name: /Duplicate Step 1/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Delete Step 1/i }),
    );

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  // 8. A wu row renders the minutes-only editor — no PACE, SPM, REST or
  // TARGET rows — since bulk-imported and starter workouts contain them and
  // must stay editable, even though the handoff models only work steps.
  it("renders a wu row as a minutes-only editor: header, DUR, DONE — no PACE, SPM, REST or TARGET", () => {
    setup({ row: wuRow() });

    expect(screen.getByText("STEP 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Row 1 duration")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DONE" })).toBeInTheDocument();

    expect(screen.queryByText("PACE")).not.toBeInTheDocument();
    expect(screen.queryByText("SPM")).not.toBeInTheDocument();
    expect(screen.queryByText("REST")).not.toBeInTheDocument();
    expect(screen.queryByText("TARGET")).not.toBeInTheDocument();
  });

  // Coverage: a standalone `r` (rest) row gets the same minutes-only editor
  // as `wu` — only `wu` was exercised against the real StepEditor before
  // this task; this is the review's other named blind spot, same shape as
  // test 8 above but for the sibling kind (`StepEditor.tsx`'s `isWork`
  // branch treats `wu` and `r` identically, but nothing proved that for
  // `r` specifically until now).
  it("renders a standalone r row as a minutes-only editor: header, DUR, DONE — no PACE, SPM, REST or TARGET", () => {
    setup({ row: restStandaloneRow() });

    expect(screen.getByText("STEP 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Row 1 duration")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DONE" })).toBeInTheDocument();

    expect(screen.queryByText("PACE")).not.toBeInTheDocument();
    expect(screen.queryByText("SPM")).not.toBeInTheDocument();
    expect(screen.queryByText("REST")).not.toBeInTheDocument();
    expect(screen.queryByText("TARGET")).not.toBeInTheDocument();
  });

  // Coverage: the "no target / Set baselines" fallback (splitLabel null on
  // a work row) — the same honesty treatment StepRowEditor's resolvedSplit
  // used to give, ported here since baselines can still be unset.
  it("shows a no-target fallback with a link to /you when splitLabel is null on a work row", () => {
    setup({ splitLabel: null });
    expect(screen.getByText("no target")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /set baselines/i }),
    ).toHaveAttribute("href", "/you");
  });

  // Coverage: the optional typeColorVar left-marker prop (Task 2's StepCard
  // carries the same prop for forward-compatibility with whichever of
  // StepCard/StepEditor a future assembly renders for a given row).
  it("colours its left marker from typeColorVar when given", () => {
    const { container } = setup({ row: workRow() });
    render(
      <MemoryRouter>
        <StepEditor
          row={workRow()}
          index={0}
          splitLabel={null}
          typeColorVar="--type-o2"
          onChange={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onDone={vi.fn()}
        />
      </MemoryRouter>,
    );
    // Rendered twice in this test (default + explicit typeColorVar); assert
    // the second instance carries the inline colour the first doesn't.
    const editors = document.querySelectorAll(".step-editor");
    expect(editors[0]).not.toHaveAttribute("style");
    expect(editors[1]).toHaveAttribute(
      "style",
      expect.stringContaining("--type-o2"),
    );
    void container;
  });

  // Coverage: fieldError/registerRef optional wiring — the same idiom
  // StepRowEditor used, preserved here so Builder's failed-Save
  // focus-first-invalid-field behaviour survives the swap.
  it("wires fieldError/registerRef through to the DUR field, same idiom as StepRowEditor", () => {
    const registerRef = vi.fn();
    render(
      <MemoryRouter>
        <StepEditor
          row={workRow({ durValue: "" })}
          index={0}
          splitLabel={null}
          onChange={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onDone={vi.fn()}
          fieldError={(field) =>
            field === "dur" ? "duration is required, e.g. 5" : undefined
          }
          registerRef={registerRef}
        />
      </MemoryRouter>,
    );
    const input = screen.getByLabelText("Row 1 duration");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(registerRef).toHaveBeenCalledWith("dur", input);
    expect(
      screen.getByText("duration is required, e.g. 5"),
    ).toBeInTheDocument();
  });
});
