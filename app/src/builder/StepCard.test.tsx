import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BuilderRow } from "./builderState";
import StepCard from "./StepCard";

// Local row-shape helpers, same convention as builderState.test.ts's own
// workRow/wuRow/restRow — this file can't import those (not exported), and
// duplicating three tiny object literals is cheaper than exporting test
// fixtures across module boundaries.
function workRow(overrides: Partial<BuilderRow> = {}): BuilderRow {
  return {
    id: "row-1",
    kind: "w",
    durValue: "20",
    durUnit: "min",
    refBase: "6k",
    refOff: 10,
    spm: "20",
    rest: "1.5",
    ...overrides,
  };
}

function wuRow(): BuilderRow {
  return {
    id: "wu-1",
    kind: "wu",
    durValue: "10",
    durUnit: "min",
    refBase: "6k",
    refOff: 0,
    spm: "",
    rest: "",
  };
}

function restRow(): BuilderRow {
  return {
    id: "r-1",
    kind: "r",
    durValue: "5",
    durUnit: "min",
    // Non-default ref, same trick as builderState.test.ts's guard test:
    // proves the card's honesty is keyed off row.kind, not off whether the
    // ref happens to still look blank.
    refBase: "2k",
    refOff: 10,
    spm: "",
    rest: "",
  };
}

function setup(overrides: Partial<Parameters<typeof StepCard>[0]> = {}) {
  const onExpand = vi.fn();
  const onDuplicate = vi.fn();
  const onDelete = vi.fn();
  render(
    <StepCard
      index={0}
      row={workRow()}
      splitLabel="2:11.0–2:13.0"
      typeColorVar="--type-o2"
      onExpand={onExpand}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      {...overrides}
    />,
  );
  return { onExpand, onDuplicate, onDelete };
}

describe("StepCard", () => {
  it("renders the 1-based index, the summary, the split, and the sub-summary", () => {
    setup({ index: 2 });
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("20′ @ 6k +10")).toBeInTheDocument();
    expect(screen.getByText("2:11.0–2:13.0")).toBeInTheDocument();
    expect(screen.getByText("20 spm · rest 1:30")).toBeInTheDocument();
  });

  it("calls onExpand when the summary line is tapped", async () => {
    const { onExpand } = setup();
    await userEvent.click(screen.getByText("20′ @ 6k +10"));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("calls onExpand when the sub-summary line is tapped", async () => {
    const { onExpand } = setup();
    await userEvent.click(screen.getByText("20 spm · rest 1:30"));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("calls onExpand when the EDIT cell is tapped", async () => {
    const { onExpand } = setup();
    await userEvent.click(screen.getByRole("button", { name: "EDIT" }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("calls onDuplicate (and not onExpand) when the duplicate cell is tapped — the fast 5×1′ path", async () => {
    const { onExpand, onDuplicate } = setup();
    await userEvent.click(
      screen.getByRole("button", { name: /Duplicate Step 1/i }),
    );
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onExpand).not.toHaveBeenCalled();
  });

  it("does not call onDelete on the first press of the delete cell — a confirm appears, and confirming calls onDelete", async () => {
    const { onDelete } = setup();
    await userEvent.click(
      screen.getByRole("button", { name: /Delete Step 1/i }),
    );
    expect(onDelete).not.toHaveBeenCalled();

    const confirmButton = screen.getByRole("button", {
      name: /Confirm delete Step 1/i,
    });
    await userEvent.click(confirmButton);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("leaves onDelete uncalled and restores the normal actions when the confirm is cancelled", async () => {
    const { onDelete } = setup();
    await userEvent.click(
      screen.getByRole("button", { name: /Delete Step 1/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Cancel delete Step 1/i }),
    );
    expect(onDelete).not.toHaveBeenCalled();

    // Normal actions are back: EDIT/duplicate/delete cells all present again.
    expect(screen.getByRole("button", { name: "EDIT" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Duplicate Step 1/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Delete Step 1/i }),
    ).toBeInTheDocument();
  });

  it("renders nothing in the split area — not a stray dash — when splitLabel is null", () => {
    setup({ splitLabel: null });
    expect(screen.queryByText("2:11.0–2:13.0")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByText("-")).not.toBeInTheDocument();
  });

  // The Task 1 landmine, exercised through the actual card rather than just
  // the bare helper: a wu/standalone-rest row must never show a fabricated
  // pace reference (see builderState.ts's stepSummary/stepSubSummary).
  it("summarises a warm-up row honestly, with no fabricated pace reference", () => {
    setup({ row: wuRow() });
    expect(screen.getByText("10′ warm-up")).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it("summarises a standalone rest row honestly, with no fabricated pace reference", () => {
    setup({ row: restRow() });
    expect(screen.getByText("5′ rest")).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });
});
