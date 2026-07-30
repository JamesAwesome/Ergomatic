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
    durValue: "20",
    durUnit: "min",
    refBase: "6k",
    refOff: 0,
    spm: "20",
    rest: "1.5",
    ...overrides,
  };
}

function wuRow(overrides: Partial<BuilderRow> = {}): BuilderRow {
  return {
    id: "wu-1",
    kind: "wu",
    durValue: "10",
    durUnit: "min",
    refBase: "6k",
    refOff: 0,
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
// change across repeated presses (REST's "three presses reach 1:30"), as
// opposed to the single-press call-argument assertions everywhere else.
function Harness({ initialRow }: { initialRow: BuilderRow }) {
  const [row, setRow] = useState(initialRow);
  return (
    <MemoryRouter>
      <StepEditor
        row={row}
        index={0}
        splitLabel={null}
        onChange={(patch) => setRow((r) => ({ ...r, ...patch }))}
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
    expect(screen.getByText("FREE")).toBeInTheDocument();

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

  // 4. SPM − from 10 does not go below the domain's minimum.
  it("does not step spm below the domain's 10 floor", async () => {
    const { onChange } = setup({ row: workRow({ spm: "10" }) });
    await userEvent.click(
      screen.getByRole("button", { name: "Row 1 stroke rate down" }),
    );
    expect(onChange).toHaveBeenCalledWith({ spm: "10" });
  });

  // 5. REST shows NONE at zero and 1:30 after three + presses (30s steps).
  it("shows NONE at zero rest and reaches 1:30 after three + presses", async () => {
    render(<Harness initialRow={workRow({ rest: "" })} />);
    expect(screen.getByText("NONE")).toBeInTheDocument();

    const up = () => screen.getByRole("button", { name: "Row 1 rest up" });
    await userEvent.click(up());
    await userEvent.click(up());
    await userEvent.click(up());

    expect(screen.getByText("1:30")).toBeInTheDocument();
  });

  it("steps rest back down by 30s, clamped at 0 (NONE)", async () => {
    const { onChange } = setup({ row: workRow({ rest: "0.5" }) }); // 30s
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
