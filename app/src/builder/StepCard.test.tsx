import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fromWorkout, type BuilderRow } from "./builderState";
import StepCard from "./StepCard";
import { STARTER_WORKOUTS } from "../../server/seed/starter";

// Local row-shape helpers, same convention as builderState.test.ts's own
// workRow/wuRow/restRow — this file can't import those (not exported), and
// duplicating three tiny object literals is cheaper than exporting test
// fixtures across module boundaries.
function workRow(overrides: Partial<BuilderRow> = {}): BuilderRow {
  return {
    id: "row-1",
    kind: "w",
    durValue: "20:00",
    durUnit: "min",
    refBase: "6k",
    refOff: 10,
    refEffort: null,
    spm: "20",
    rest: "1:30",
    ...overrides,
  };
}

function wuRow(): BuilderRow {
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
  };
}

function restRow(): BuilderRow {
  return {
    id: "r-1",
    kind: "r",
    durValue: "5:00",
    durUnit: "min",
    // Non-default ref, same trick as builderState.test.ts's guard test:
    // proves the card's honesty is keyed off row.kind, not off whether the
    // ref happens to still look blank.
    refBase: "2k",
    refOff: 10,
    refEffort: null,
    spm: "",
    rest: "",
  };
}

function setup(overrides: Partial<Parameters<typeof StepCard>[0]> = {}) {
  const onExpand = vi.fn();
  const onDuplicate = vi.fn();
  const onDelete = vi.fn();
  const view = render(
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
  return { onExpand, onDuplicate, onDelete, container: view.container };
}

describe("StepCard", () => {
  it("renders the 1-based index, the summary, the split, and the sub-summary", () => {
    setup({ index: 2 });
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("20:00 @ 6k +10")).toBeInTheDocument();
    expect(screen.getByText("2:11.0–2:13.0")).toBeInTheDocument();
    expect(screen.getByText("20 spm · rest 1:30")).toBeInTheDocument();
  });

  it("calls onExpand when the summary line is tapped", async () => {
    const { onExpand } = setup();
    await userEvent.click(screen.getByText("20:00 @ 6k +10"));
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
    expect(screen.getByText("10:00 warm-up")).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it("summarises a standalone rest row honestly, with no fabricated pace reference", () => {
    setup({ row: restRow() });
    expect(screen.getByText("5:00 rest")).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  // This review's IMPORTANT 2: stepSubSummary returns "" for a wu/standalone
  // r row (no spm/rest fields of their own), but `.step-card-sub` used to
  // render unconditionally regardless — a focusable button with no text
  // content and no aria-label, which axe's button-name rule (WCAG 4.1.2)
  // flags. Every starter workout opens with a `wu`, so this fired on the
  // edit screen for essentially every workout a rower didn't hand-author.
  // Assert the button is entirely absent, not just visually empty — an
  // empty-but-present button would still fail the same audit.
  it("renders no sub-summary button at all for a warm-up row (no accessible name to give it)", () => {
    const { container } = setup({ row: wuRow() });
    expect(container.querySelector(".step-card-sub")).not.toBeInTheDocument();
  });

  it("renders no sub-summary button at all for a standalone rest row (no accessible name to give it)", () => {
    const { container } = setup({ row: restRow() });
    expect(container.querySelector(".step-card-sub")).not.toBeInTheDocument();
  });

  // The action group (EDIT/⧉/×) must still be present and clickable when
  // the sub-summary button is gone — proves the fix didn't just delete the
  // button and leave the rest of line 2 broken.
  it("still renders the EDIT/duplicate/delete action group when the sub-summary button is absent", async () => {
    const { onExpand } = setup({ row: wuRow() });
    expect(screen.getByRole("button", { name: "EDIT" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "EDIT" }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  // Review fix wave: `stepToRow` writes `row.rest` in the clock form, but
  // `restSecondsFromRow` used to still parse it with a bare `Number(...)` —
  // `Number("3:00")` is NaN, so a real stored workout's rest sub-summary
  // rendered "18 spm · rest NaN:NaN". A fixture built by hand (bare-decimal
  // "1.5") never exercised this path; a real starter workout does. Doldrums
  // (server/seed/starter.ts) is the exact shape the reviewer rendered to
  // find the bug: a `w` step with `restMinutes: 3`.
  it("renders a real stored workout's rest sub-summary as a real value, not NaN:NaN (Doldrums)", () => {
    const doldrums = STARTER_WORKOUTS.find((w) => w.title === "Doldrums");
    if (!doldrums) throw new Error("fixture workout 'Doldrums' not found");
    const form = fromWorkout(doldrums);
    const workRowFromStore = form.rows.find((r) => r.kind === "w");
    if (!workRowFromStore) throw new Error("expected a work row");

    setup({ row: workRowFromStore });
    expect(screen.getByText("18 spm · rest 3:00")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
