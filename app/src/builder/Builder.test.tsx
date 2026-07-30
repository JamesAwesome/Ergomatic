import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { api } from "../api";
import type { BuilderEditMode } from "./Builder";
import { newRow, type BuilderForm } from "./builderState";

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

function mockBaselines(baselines: {
  k2Seconds: number | null;
  k6Seconds: number | null;
}) {
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines }),
  }));
}

// Typed against the real `api` signature (rather than left to infer from
// the zero-arg handler below) so `.mock.calls[0]` carries the actual
// `[path, RequestInit]` shape callers below destructure to inspect the
// posted body.
function mockApi(handler: () => Response) {
  const fn = vi.fn<typeof api>(async () => handler());
  vi.doMock("../api", () => ({ api: fn }));
  return fn;
}

async function renderBuilder(mode?: BuilderEditMode) {
  const { default: Builder } = await import("./Builder");
  render(
    <MemoryRouter>
      <Builder mode={mode} />
    </MemoryRouter>,
  );
}

// Fills in every field required for `toSteps` to succeed: title, pain, and
// one work row's duration + pace ref. Shared by the save-success and
// save-failure tests so both start from an identically valid form.
async function fillValidForm() {
  await userEvent.type(screen.getByLabelText("Title"), "Ladder Sets");
  await userEvent.click(screen.getByRole("radio", { name: "Pain 3" }));
  await userEvent.type(screen.getByPlaceholderText("5' or 2500m"), "5'");
  // The row's pace ref starts at the default 6k/+0 (PaceRefInput.tsx) —
  // two clicks on the faster stepper reaches the 6k-2 ref every test here
  // expects.
  const faster = screen.getByRole("button", { name: "Row 1 pace faster" });
  await userEvent.click(faster);
  await userEvent.click(faster);
}

beforeEach(() => {
  vi.resetModules();
});

describe("Builder", () => {
  it("renders the step table's column header labels", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    for (const label of ["SET", "DUR", "PACE REF", "SPM", "REST", "SPLIT"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("live-resolves a work row's typed duration and pace ref into the tolerance range", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    await userEvent.type(screen.getByPlaceholderText("5' or 2500m"), "5'");
    const faster = screen.getByRole("button", { name: "Row 1 pace faster" });
    await userEvent.click(faster);
    await userEvent.click(faster);

    // Hardcoded expectation (EN DASH, U+2013) — never recomputed by calling
    // resolveSplit/toleranceRange, which would make this assertion tautological.
    expect(screen.getByText("1:59.0–2:01.0")).toBeInTheDocument();
  });

  it("adds a row with + ADD ROW and removes it with that row's delete ×", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(screen.getAllByRole("button", { name: "Remove row" })).toHaveLength(
      1,
    );

    await userEvent.click(screen.getByRole("button", { name: "+ ADD ROW" }));
    expect(screen.getAllByRole("button", { name: "Remove row" })).toHaveLength(
      2,
    );

    await userEvent.click(
      screen.getAllByRole("button", { name: "Remove row" })[0]!,
    );
    expect(screen.getAllByRole("button", { name: "Remove row" })).toHaveLength(
      1,
    );
  });

  it("starting the block on a row puts that row AND every row after it into the set", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    // Two rows so there's a "following row" to prove comes along with the
    // clicked one — a single-row form can't distinguish "this row" from
    // "this row and everything after it".
    await userEvent.click(screen.getByRole("button", { name: "+ ADD ROW" }));
    expect(screen.queryByText(/rows? marked/)).not.toBeInTheDocument();

    const startButtons = screen.getAllByRole("button", {
      name: "Start the repeat set here",
    });
    expect(startButtons).toHaveLength(2);

    await userEvent.click(startButtons[0]!);

    expect(screen.getByText(/2 rows marked/)).toBeInTheDocument();
  });

  it("POSTs a valid form to /api/workouts with the resolved steps and picked pain", async () => {
    const api = mockApi(
      () => new Response(JSON.stringify({ id: "new-id" }), { status: 201 }),
    );
    mockBaselines(BASELINES);
    await renderBuilder();

    await fillValidForm();
    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    expect(api).toHaveBeenCalledWith("/api/workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Ladder Sets",
        type: "O2",
        difficulty: "easy",
        pain: 3,
        steps: [
          {
            k: "w",
            duration: { kind: "time", minutes: 5 },
            ref: { base: "6k", off: -2 },
          },
        ],
      }),
    });
  });

  it("does not call the API and shows an inline title error for a blank title", async () => {
    const api = mockApi(() => new Response(null, { status: 201 }));
    mockBaselines(BASELINES);
    await renderBuilder();

    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    expect(api).not.toHaveBeenCalled();
    expect(
      screen.getByText("title must be 1..80 characters"),
    ).toBeInTheDocument();
  });

  // The server can no longer 409 a workout create/update (no `num` field
  // left to clash on — see server/routes/data.ts's POST/PUT /api/workouts,
  // which only ever return 400/201/200/403/404). Any non-2xx response is
  // therefore a genuine, otherwise-uncategorized failure, so this covers
  // the honest generic message rather than a status code the product can't
  // produce anymore.
  it("shows the generic save error, announced via role=alert, and leaves the entered values on screen", async () => {
    const api = mockApi(() => new Response(null, { status: 500 }));
    mockBaselines(BASELINES);
    await renderBuilder();

    await fillValidForm();
    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't save this workout. Try again.",
    );
    expect(screen.getByLabelText("Title")).toHaveValue("Ladder Sets");
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("shows the no-target treatment with a link to /you when baselines are unset", async () => {
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(screen.getByText("no target")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /set baselines/i }),
    ).toHaveAttribute("href", "/you");
  });

  it("agrees end to end on the totals chain: readout, TOTAL, and both rows' aria-pressed match which row starts the block (M2)", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    // Row 1 (the form's initial row): 5 loose minutes, outside the block.
    await userEvent.type(screen.getByPlaceholderText("5' or 2500m"), "5'");
    const row1Faster = screen.getByRole("button", {
      name: "Row 1 pace faster",
    });
    await userEvent.click(row1Faster);
    await userEvent.click(row1Faster);

    // Row 2: 10 minutes, marked as the block start.
    await userEvent.click(screen.getByRole("button", { name: "+ ADD ROW" }));
    const durInputs = screen.getAllByPlaceholderText("5' or 2500m");
    await userEvent.type(durInputs[1]!, "10'");
    await userEvent.click(screen.getByRole("radio", { name: "Row 2 pace 2K" }));

    const toggles = screen.getAllByRole("button", { name: /repeat set/i });
    expect(toggles).toHaveLength(2);
    await userEvent.click(toggles[1]!);

    // reps: 1 -> 3.
    const moreReps = screen.getByRole("button", { name: "More reps" });
    await userEvent.click(moreReps);
    await userEvent.click(moreReps);

    // total = loose(5) + perSet(10) * reps(3) = 35.
    expect(
      screen.getByText(/^1 row marked · 10:00 per set$/),
    ).toBeInTheDocument();
    expect(screen.getByText(/^TOTAL 35 MIN$/)).toBeInTheDocument();

    const toggledAfter = screen.getAllByRole("button", {
      name: /repeat set/i,
    });
    expect(toggledAfter[0]).toHaveAttribute("aria-pressed", "false");
    expect(toggledAfter[1]).toHaveAttribute("aria-pressed", "true");
  });

  it("adds a warm-up row via + WARM-UP and includes it as a wu step in the saved payload (M3)", async () => {
    const api = mockApi(
      () => new Response(JSON.stringify({ id: "new-id" }), { status: 201 }),
    );
    mockBaselines(BASELINES);
    await renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: "+ WARM-UP" }));
    // The warm-up row uses StepRowEditor's minutes-only branch (placeholder
    // "10'") — otherwise unreachable in create mode before this fix.
    await userEvent.type(screen.getByPlaceholderText("10'"), "10'");

    await fillValidForm();
    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    expect(api).toHaveBeenCalledTimes(1);
    const [, options] = api.mock.calls[0]!;
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.steps).toContainEqual({ k: "wu", minutes: 10 });
  });

  it("saves a non-default TYPE and DIFFICULTY, and renders the active TYPE chip in its own type color (L1)", async () => {
    const api = mockApi(
      () => new Response(JSON.stringify({ id: "new-id" }), { status: 201 }),
    );
    mockBaselines(BASELINES);
    await renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: "AN" }));
    await userEvent.click(screen.getByRole("button", { name: "HARD" }));

    const anChip = screen.getByRole("button", { name: "AN" });
    expect(anChip.getAttribute("style")).toContain("var(--type-an)");

    await fillValidForm();
    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    const [, options] = api.mock.calls[0]!;
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.type).toBe("AN");
    expect(body.difficulty).toBe("hard");
  });

  it("types SPM and REST and both reach the saved step (L2)", async () => {
    const api = mockApi(
      () => new Response(JSON.stringify({ id: "new-id" }), { status: 201 }),
    );
    mockBaselines(BASELINES);
    await renderBuilder();

    await fillValidForm();
    await userEvent.type(screen.getByPlaceholderText("spm"), "24");
    await userEvent.type(screen.getByPlaceholderText("rest"), "2");
    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    const [, options] = api.mock.calls[0]!;
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.steps[0]).toStrictEqual({
      k: "w",
      duration: { kind: "time", minutes: 5 },
      ref: { base: "6k", off: -2 },
      spm: 24,
      restMinutes: 2,
    });
  });

  it("wires aria-invalid/aria-describedby on each of a row's dur/spm/rest fields to its own error message", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    await userEvent.type(screen.getByLabelText("Title"), "Ladder Sets");
    await userEvent.click(screen.getByRole("radio", { name: "Pain 3" }));
    // dur is left blank (triggers "required"); the pace ref can no longer be
    // driven out of range from here at all — PaceRefInput.tsx's stepper
    // clamps to ±60 (see the out-of-range case below, which loads it a
    // different way) — so only spm and rest get out-of-range values.
    await userEvent.type(screen.getByPlaceholderText("spm"), "99");
    await userEvent.type(screen.getByPlaceholderText("rest"), "0.3");

    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    const expectations: [string, string][] = [
      ["Row 1 duration", "duration is required, e.g. 5' or 2500m"],
      ["Row 1 stroke rate", "spm must be 10..60"],
      ["Row 1 rest", "rest must be 0.5..60 in 0.5 steps"],
    ];
    for (const [label, message] of expectations) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute("aria-invalid", "true");
      const describedBy = input.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy!)).toHaveTextContent(message);
    }
  });

  // PaceRefInput.tsx clamps its stepper to ±60, so an out-of-range offset can
  // no longer be typed through the UI — but builderState.ts's `toSteps`
  // keeps its own ±60 check anyway, because edit mode loads a row's
  // refBase/refOff straight from stored step data (`fromWorkout`/
  // `stepToRow`) without clamping. This constructs exactly that: a form
  // whose row already has an out-of-range offset before the screen ever
  // renders, the same shape a corrupted or pre-limit-change stored workout
  // would produce.
  it("still rejects a row's out-of-range pace-ref offset if it arrives via edit-mode data rather than the stepper", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));

    const badRow = newRow("w");
    badRow.dur = "5'";
    badRow.refOff = 999;
    const initial: BuilderForm = {
      title: "Ladder Sets",
      type: "O2",
      difficulty: "easy",
      pain: 3,
      rows: [badRow],
      reps: 1,
    };
    await renderBuilder({ kind: "edit", id: "w1", initial });

    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    expect(screen.getByText("invalid pace reference")).toBeInTheDocument();
  });

  it("treats a successful save as success even when the response body isn't valid JSON (L3)", async () => {
    const api = mockApi(() => new Response(null, { status: 201 }));
    mockBaselines(BASELINES);
    await renderBuilder();

    await fillValidForm();
    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText("Couldn't save this workout. Try again."),
    ).not.toBeInTheDocument();
  });
});
