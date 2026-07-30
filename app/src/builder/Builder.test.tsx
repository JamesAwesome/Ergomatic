import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

// Defaults to an empty library — most tests don't care what 🎲 would
// generate, they just need `useWorkouts` mocked so Builder's own call to it
// doesn't fall through to the (also-mocked-but-generically-so) `api` module
// and race a background state update against the test. Tests that DO care
// (the 🎲 test) call this again, after the default from `beforeEach`, with
// real titles — vi.doMock's last call before the dynamic import wins.
function mockWorkouts(titles: readonly string[] = []) {
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({
      state: "ready",
      workouts: titles.map((title, i) => ({ id: `w${i}`, title })),
    }),
  }));
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
  mockWorkouts();
});

describe("Builder", () => {
  it("renders the step table's column header labels", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    for (const label of ["SET", "DUR", "SPM", "REST (OPT)", "SPLIT"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // PACE REF no longer has a column of its own (PaceRefInput.tsx renders
    // on its own full-width line beneath the row) — a header slot for it
    // would just be dead space pushing every other label out of alignment.
    expect(screen.queryByText("PACE REF")).not.toBeInTheDocument();
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
    await userEvent.type(screen.getByPlaceholderText("opt"), "2");
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
    await userEvent.type(screen.getByPlaceholderText("opt"), "0.3");

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

    // L1: the error is wired to PaceRefInput's radiogroup (the only
    // anchor the control has, since it replaced a free-text input that
    // used to carry aria-invalid/aria-describedby itself), not orphaned.
    const group = screen.getByRole("radiogroup", { name: "Row 1 pace base" });
    expect(group).toHaveAttribute("aria-invalid", "true");
    const describedBy = group.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "invalid pace reference",
    );
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

  // Pins the removal of the row-number field (dropped in an earlier task,
  // once the type reshape made it unrepresentable) so it can't quietly come
  // back — and proves the server-facing contract agrees: no `num` key at
  // all, not even `num: undefined`, since JSON.stringify would still emit
  // the latter as an absent key but a stray `num: null` or similar would
  // slip through a looser check.
  it("has no No. field, and a successful save posts a body with no num key", async () => {
    const api = mockApi(
      () => new Response(JSON.stringify({ id: "new-id" }), { status: 201 }),
    );
    mockBaselines(BASELINES);
    await renderBuilder();

    expect(screen.queryByLabelText(/^No\.?$/i)).not.toBeInTheDocument();

    await fillValidForm();
    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    const [, options] = api.mock.calls[0]!;
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).not.toHaveProperty("num");
  });

  it("has no + REST button; + WARM-UP and + ADD ROW remain", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(
      screen.queryByRole("button", { name: /\+ REST/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "+ WARM-UP" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "+ ADD ROW" }),
    ).toBeInTheDocument();
  });

  it("renders a work row's pace as a structured control (two radios), not a free-text field", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    const paceGroup = screen.getByRole("radiogroup", {
      name: "Row 1 pace base",
    });
    expect(within(paceGroup).getAllByRole("radio")).toHaveLength(2);
    expect(
      within(paceGroup).getByRole("radio", { name: "Row 1 pace 2K" }),
    ).toBeInTheDocument();
    expect(
      within(paceGroup).getByRole("radio", { name: "Row 1 pace 6K" }),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/pace/i)).not.toBeInTheDocument();
  });

  it("resolves a DUR typed without an apostrophe (bare '5') into the tolerance range", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    await userEvent.type(screen.getByPlaceholderText("5' or 2500m"), "5");
    const faster = screen.getByRole("button", { name: "Row 1 pace faster" });
    await userEvent.click(faster);
    await userEvent.click(faster);

    // Hardcoded (EN DASH, U+2013) — never recomputed via resolveSplit.
    expect(screen.getByText("1:59.0–2:01.0")).toBeInTheDocument();
  });

  it("fills Title with a non-empty name not already in the library when 🎲 is pressed", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    // generateName([], 0)'s first pick — the same name a fresh 🎲 press
    // would offer if the library were empty. Seeding the library with it
    // forces the real press (nameSeed starts at 0 too) to skip past it.
    mockWorkouts(["Zephyr"]);
    await renderBuilder();

    await userEvent.click(
      screen.getByRole("button", { name: "Suggest a name" }),
    );

    const title = screen.getByLabelText("Title") as HTMLInputElement;
    expect(title.value).not.toBe("");
    expect(title.value).not.toBe("Zephyr");
  });

  it("still generates a name from 🎲 while the library is loading (empty existing-titles list)", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "loading" }),
    }));
    await renderBuilder();

    await userEvent.click(
      screen.getByRole("button", { name: "Suggest a name" }),
    );

    const title = screen.getByLabelText("Title") as HTMLInputElement;
    expect(title.value).not.toBe("");
  });

  it("shows a needs-attention count and focuses the first invalid control when Save fails validation", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    // jsdom doesn't implement scrollIntoView at all (confirmed separately:
    // `typeof el.scrollIntoView` is "undefined" there, not a stubbed
    // no-op) — Builder.tsx guards the call with a `typeof` check for
    // exactly this reason. Stubbing it here, rather than leaving it
    // unimplemented, exercises that guard's true branch too, not just the
    // jsdom-default false one.
    const scrollIntoView = vi.fn();
    const elementProto = Element.prototype as unknown as {
      scrollIntoView?: () => void;
    };
    elementProto.scrollIntoView = scrollIntoView;

    await renderBuilder();

    await userEvent.type(screen.getByLabelText("Title"), "Ladder Sets");
    await userEvent.click(screen.getByRole("radio", { name: "Pain 3" }));
    // DUR is left blank (the first field `toSteps` checks on a work row);
    // SPM and REST are also out of range, so there are three row errors —
    // proving the count reflects however many there actually are, not just
    // whether there are any.
    await userEvent.type(screen.getByPlaceholderText("spm"), "99");
    await userEvent.type(screen.getByPlaceholderText("opt"), "0.3");

    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    expect(screen.getByText(/needs? attention/i)).toBeInTheDocument();
    const durInput = screen.getByLabelText("Row 1 duration");
    expect(document.activeElement).toBe(durInput);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });

    // Restores jsdom's own (missing) implementation so the stub doesn't
    // leak into other tests in this file.
    delete elementProto.scrollIntoView;
  });
});
