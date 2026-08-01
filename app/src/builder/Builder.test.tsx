import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { api } from "../api";
import type { BuilderEditMode } from "./Builder";
import { fromWorkout, newRow, type BuilderForm } from "./builderState";
import type { Step } from "../../domain/types.js";
import { STARTER_WORKOUTS } from "../../server/seed/starter";

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

// Backing store for the `useWorkouts` mock registered once in `beforeEach`
// below. `mockWorkouts`/`mockWorkoutsLoading` just mutate this plain
// variable rather than calling `vi.doMock` a second time for the same
// module id — a single registration per test avoids a since-fixed CI flake
// (two `vi.doMock` calls for one module id racing).
let workoutsMock:
  | { state: "ready"; workouts: { id: string; title: string }[] }
  | { state: "loading" } = { state: "ready", workouts: [] };

function mockWorkouts(titles: readonly string[] = []) {
  workoutsMock = {
    state: "ready",
    workouts: titles.map((title, i) => ({ id: `w${i}`, title })),
  };
}

function mockWorkoutsLoading() {
  workoutsMock = { state: "loading" };
}

// Same mutable-box idiom as `workoutsMock` above, for the same reason.
// Defaults to a ready 10' warm-up so every test not concerned with
// preferences still renders exactly as before.
let preferencesMock:
  | { state: "ready"; preferences: { warmupMinutes: number } }
  | { state: "loading" }
  | { state: "error"; retry: () => void } = {
  state: "ready",
  preferences: { warmupMinutes: 10 },
};

function mockPreferences(warmupMinutes: number) {
  preferencesMock = { state: "ready", preferences: { warmupMinutes } };
}

function mockPreferencesLoading() {
  preferencesMock = { state: "loading" };
}

function mockPreferencesError(retry: () => void = vi.fn()) {
  preferencesMock = { state: "error", retry };
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
// Row 1's duration + pace ref. A fresh create-mode builder opens Row 1's
// editor by default (there's nothing to scan yet, only something to fill
// in), so this never has to click EDIT first.
async function fillValidForm() {
  await userEvent.type(screen.getByLabelText("Title"), "Ladder Sets");
  await userEvent.click(screen.getByRole("button", { name: "Pain 3" }));
  // "500" digits into the masked clock field renders as "5:00" (5 minutes) —
  // typing the bare digit "5" would mask to "0:05" (5 seconds) instead.
  await userEvent.type(screen.getByLabelText("Row 1 duration"), "500");
  const faster = screen.getByRole("button", { name: "Row 1 pace faster" });
  await userEvent.click(faster);
  await userEvent.click(faster);
}

beforeEach(() => {
  vi.resetModules();
  mockWorkouts();
  preferencesMock = { state: "ready", preferences: { warmupMinutes: 10 } };
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => workoutsMock,
  }));
  vi.doMock("../api/usePreferences", () => ({
    usePreferences: () => preferencesMock,
  }));
});

describe("Builder", () => {
  // ---- The accordion (task brief tests 1, 2, 5) -------------------------

  it("expands at most one card at a time — opening a second collapses the first", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    // A fresh builder's one default row starts open.
    expect(screen.getByLabelText("Row 1 duration")).toBeInTheDocument();

    // Adding a second step opens it, collapsing Row 1.
    await userEvent.click(screen.getByRole("button", { name: "+ ADD STEP" }));
    expect(screen.getByLabelText("Row 2 duration")).toBeInTheDocument();
    expect(screen.queryByLabelText("Row 1 duration")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EDIT" })).toBeInTheDocument();

    // Expanding the collapsed Row 1 now collapses Row 2 in turn.
    await userEvent.click(screen.getByRole("button", { name: "EDIT" }));
    expect(screen.getByLabelText("Row 1 duration")).toBeInTheDocument();
    expect(screen.queryByLabelText("Row 2 duration")).not.toBeInTheDocument();
  });

  it("DONE collapses everything — no editor rendered", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(screen.getByLabelText("Row 1 duration")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "DONE" }));

    expect(screen.queryByLabelText("Row 1 duration")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EDIT" })).toBeInTheDocument();
  });

  it("deleting the expanded step closes the editor", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    // + ADD STEP opens Row 2; delete it while it's the open row.
    await userEvent.click(screen.getByRole("button", { name: "+ ADD STEP" }));
    await userEvent.click(
      screen.getByRole("button", { name: /Delete Step 2/i }),
    );

    expect(screen.queryByLabelText(/Row \d+ duration/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EDIT" })).toBeInTheDocument();
  });

  it("deleting a collapsed row leaves a different, still-expanded row open", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    // Row 2 is added and open; Row 1 is collapsed.
    await userEvent.click(screen.getByRole("button", { name: "+ ADD STEP" }));
    // Delete the collapsed Row 1 via its own card, not the open Row 2.
    await userEvent.click(
      screen.getByRole("button", { name: /Delete Step 1/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Yes, confirm delete Step 1/i }),
    );

    // Row 2 (now the only, and still-open, row) stays open — its own
    // duration field, now reindexed to Row 1, is still visible.
    expect(screen.getByLabelText("Row 1 duration")).toBeInTheDocument();
  });

  // ---- + ADD STEP (task brief test 3) ------------------------------------

  it("+ ADD STEP appends an empty work step and opens it, leaving the filled row untouched", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    await userEvent.type(screen.getByLabelText("Row 1 duration"), "700");
    await userEvent.click(screen.getByRole("button", { name: "+ ADD STEP" }));

    expect(screen.getByLabelText("Row 2 duration")).toHaveValue("");
    expect(screen.queryByLabelText("Row 1 duration")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^Delete Step \d+$/ }),
    ).toHaveLength(2);
  });

  it("opens a blank editor when a step is added after a filled one", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    await userEvent.type(screen.getByLabelText("Row 1 duration"), "2000");
    await userEvent.click(screen.getByRole("button", { name: /done/i }));
    await userEvent.click(screen.getByRole("button", { name: "+ ADD STEP" }));

    expect(screen.getByLabelText("Row 2 duration")).toHaveValue("");
  });

  // ---- Duplicate: two entry points, different intent (task brief test 4) -

  it("a collapsed card's ⧉ leaves everything collapsed; the expanded card's DUPLICATE opens the copy", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    // Collapse the only row, then duplicate it via the collapsed ⧉.
    await userEvent.click(screen.getByRole("button", { name: "DONE" }));
    await userEvent.click(
      screen.getByRole("button", { name: /Duplicate Step 1/i }),
    );
    // Two rows now, both collapsed — nothing opened.
    expect(screen.getAllByRole("button", { name: "EDIT" })).toHaveLength(2);
    expect(screen.queryByLabelText(/Row \d+ duration/)).not.toBeInTheDocument();

    // Expand Row 1 and use its own DUPLICATE — the copy (new Row 2) opens,
    // pushing the earlier ⧉ copy down to Row 3.
    await userEvent.click(screen.getAllByRole("button", { name: "EDIT" })[0]!);
    await userEvent.click(
      screen.getByRole("button", { name: /Duplicate Step 1/i }),
    );
    expect(screen.getByLabelText("Row 2 duration")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "EDIT" })).toHaveLength(2);
  });

  // ---- Header (task brief test 6) ----------------------------------------

  it("renders the header — ← BACK, New workout, the title field and ↻ AUTO NAME, not the dice", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(screen.getByRole("link", { name: "← BACK" })).toHaveAttribute(
      "href",
      "/library",
    );
    expect(
      screen.getByRole("heading", { name: "New workout" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /AUTO NAME/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("🎲")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Suggest a name" }),
    ).not.toBeInTheDocument();
  });

  it("fills Title with a non-empty name not already in the library when AUTO NAME is pressed", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    // generateName([], 0)'s first pick — the same name a fresh press would
    // offer if the library were empty. Seeding the library with it forces
    // the real press (nameSeed starts at 0 too) to skip past it.
    mockWorkouts(["Zephyr"]);
    await renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /AUTO NAME/i }));

    const title = screen.getByLabelText("Title") as HTMLInputElement;
    expect(title.value).not.toBe("");
    expect(title.value).not.toBe("Zephyr");
  });

  it("still generates a name from AUTO NAME while the library is loading (empty existing-titles list)", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    mockWorkoutsLoading();
    await renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /AUTO NAME/i }));

    const title = screen.getByLabelText("Title") as HTMLInputElement;
    expect(title.value).not.toBe("");
  });

  // ---- Repeat card (task brief test 7) -----------------------------------

  it("renders REPEAT ALL STEPS with its stepper, and the sub-line reads N steps · M:SS per set", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    await userEvent.type(screen.getByLabelText("Row 1 duration"), "500");

    expect(screen.getByText("REPEAT ALL STEPS")).toBeInTheDocument();
    expect(screen.getByText("×1")).toBeInTheDocument();
    expect(screen.getByText("1 step · 5:00 per set")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Repeat up" }));
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("reads the repeat sub-line with singular step and no per-set clause when the total can't resolve", async () => {
    // No baselines, and this row is metres (needs a resolved split to
    // convert to minutes), so `totals` returns null — the sub-line still
    // names the step count, just without a "· M:SS per set" clause.
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    // Switching units first: the field clears on a unit switch (a clock
    // string is meaningless as meters), so meters must be typed AFTER
    // selecting the M chip, not before.
    await userEvent.click(
      screen.getByRole("radio", { name: "Row 1 duration unit meters" }),
    );
    await userEvent.type(screen.getByLabelText("Row 1 duration"), "2000");

    expect(screen.getByText("1 step")).toBeInTheDocument();
  });

  // ---- TOTAL / warm-up / Save to library (task brief test 8) -------------

  it("renders TOTAL and the primary button reads Save to library", async () => {
    mockBaselines(BASELINES);
    mockPreferences(10);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    await userEvent.type(screen.getByLabelText("Row 1 duration"), "500");

    expect(screen.getByText("TOTAL")).toBeInTheDocument();
    expect(screen.getByText("5 MIN")).toBeInTheDocument();
    expect(
      screen.getByText("+ 10′ warm-up from your preferences"),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Save to library" }),
    ).toBeInTheDocument();
  });

  // ---- Warm-up placement (Phase 5F task 7) --------------------------------
  // The warm-up is prepended at session start, not authored last — it reads
  // as an implicit step 0, so it must sit above the step list rather than
  // down by the totals where it used to live.

  it("shows the warm-up above the step list, not below the totals", async () => {
    mockBaselines(BASELINES);
    mockPreferences(10);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder(); // preferences default to "ready" (see beforeEach)

    const warmup = await screen.findByText(/warm-up from your preferences/);
    const steps = screen.getByText("STEPS");

    // FOLLOWING means `steps` comes after `warmup` in document order.
    expect(
      warmup.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders — MIN and no warm-up line while preferences are loading", async () => {
    // TOTAL only ever renders the "— MIN" placeholder when `totals()`
    // itself returns null (builderState.ts's own "totals" suite: the one
    // documented null case is a distance-unit row with no baselines to
    // resolve its pace against) — a blank/default minutes-unit row totals
    // 0, not null, so a plain fresh builder can't exercise this branch.
    // Baselines are unset here for exactly that reason.
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    mockPreferencesLoading();
    mockApi(() => new Response(null, { status: 201 }));

    const distanceRow = newRow("w");
    distanceRow.durValue = "2000";
    distanceRow.durUnit = "m";
    const initial: BuilderForm = {
      title: "Ladder Sets",
      type: "O2",
      difficulty: "easy",
      pain: 3,
      rows: [distanceRow],
      reps: 1,
    };
    await renderBuilder({ kind: "edit", id: "w1", initial });

    expect(screen.getByText("— MIN")).toBeInTheDocument();
    expect(screen.queryByText(/warm-up/i)).not.toBeInTheDocument();
  });

  it("renders no warm-up line — no placeholder number either — when preferences fail to load", async () => {
    mockBaselines(BASELINES);
    mockPreferencesError();
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(screen.queryByText(/warm-up/i)).not.toBeInTheDocument();
  });

  it("does not include a wu step in the saved request body even though preferences supply a warm-up", async () => {
    const api = mockApi(
      () => new Response(JSON.stringify({ id: "new-id" }), { status: 201 }),
    );
    mockBaselines(BASELINES);
    mockPreferences(10);
    await renderBuilder();

    await fillValidForm();
    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    const [, options] = api.mock.calls[0]!;
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.steps.some((s: { k: string }) => s.k === "wu")).toBe(false);
  });

  // ---- Save POST body strictness (task brief test 9) ---------------------

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

  it("with ×3 and one work row, POSTs steps whose first element is the reps marker", async () => {
    const api = mockApi(
      () => new Response(JSON.stringify({ id: "new-id" }), { status: 201 }),
    );
    mockBaselines(BASELINES);
    await renderBuilder();

    await fillValidForm();
    const repeatUp = screen.getByRole("button", { name: "Repeat up" });
    await userEvent.click(repeatUp);
    await userEvent.click(repeatUp);
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
          { k: "reps", count: 3 },
          {
            k: "w",
            duration: { kind: "time", minutes: 5 },
            ref: { base: "6k", off: -2 },
          },
        ],
      }),
    });
  });

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

  it("saves a non-default TYPE and DIFFICULTY chosen from the classification card", async () => {
    const api = mockApi(
      () => new Response(JSON.stringify({ id: "new-id" }), { status: 201 }),
    );
    mockBaselines(BASELINES);
    await renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: "AN" }));
    await userEvent.click(screen.getByRole("button", { name: "HARD" }));

    const anChip = screen.getByRole("button", { name: "AN" });
    expect(anChip).toHaveAttribute(
      "style",
      expect.stringContaining("--type-an"),
    );

    await fillValidForm();
    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    const [, options] = api.mock.calls[0]!;
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.type).toBe("AN");
    expect(body.difficulty).toBe("hard");
  });

  it("steps SPM and REST and both reach the saved step", async () => {
    const api = mockApi(
      () => new Response(JSON.stringify({ id: "new-id" }), { status: 201 }),
    );
    mockBaselines(BASELINES);
    await renderBuilder();

    await fillValidForm();
    // spm starts empty: the first + wakes at 20, four more presses reach 24.
    const spmUp = screen.getByRole("button", { name: "Row 1 stroke rate up" });
    for (let i = 0; i < 5; i++) {
      await userEvent.click(spmUp);
    }
    // rest starts at 0 ("NONE"); four 30s presses reach 2:00 (2 minutes).
    const restUp = screen.getByRole("button", { name: "Row 1 rest up" });
    for (let i = 0; i < 4; i++) {
      await userEvent.click(restUp);
    }
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

  // ---- Steps section header pluralisation (task brief test 10) ----------

  it("shows the steps section header as singular then plural: 1 STEP, then 2 STEPS", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(screen.getByText("STEPS")).toBeInTheDocument();
    expect(screen.getByText("1 STEP")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "+ ADD STEP" }));
    expect(screen.getByText("2 STEPS")).toBeInTheDocument();
    expect(screen.queryByText("1 STEP")).not.toBeInTheDocument();
  });

  // ---- The trap: expand the owning collapsed card before focusing --------

  it("expands the owning card before focusing a collapsed row's first invalid field on a failed Save", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));

    const badRow = newRow("w");
    badRow.durValue = "";
    const initial: BuilderForm = {
      title: "Ladder Sets",
      type: "O2",
      difficulty: "easy",
      pain: 3,
      rows: [badRow],
      reps: 1,
    };
    // Edit mode starts fully collapsed — nothing to focus yet.
    await renderBuilder({ kind: "edit", id: "w1", initial });
    expect(screen.queryByLabelText("Row 1 duration")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    expect(screen.getByText(/needs? attention/i)).toBeInTheDocument();
    const durInput = await screen.findByLabelText("Row 1 duration");
    expect(document.activeElement).toBe(durInput);
  });

  // The other half of the same trap: it's not enough to expand *a*
  // collapsed row, it has to be the *right* one, and any row that was open
  // instead must give way. Row 2 starts open (valid); Row 1 is the
  // collapsed row actually holding the first invalid field.
  it("collapses the wrong open row and expands the different collapsed row holding the first invalid field", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));

    const badRow = newRow("w"); // Row 1 — invalid (blank duration).
    badRow.durValue = "";
    const goodRow = newRow("w"); // Row 2 — valid, and left open below.
    goodRow.durValue = "5:00";
    const initial: BuilderForm = {
      title: "Ladder Sets",
      type: "O2",
      difficulty: "easy",
      pain: 3,
      rows: [badRow, goodRow],
      reps: 1,
    };
    // Edit mode starts fully collapsed; open Row 2 specifically, not the
    // invalid Row 1.
    await renderBuilder({ kind: "edit", id: "w1", initial });
    const editButtons = screen.getAllByRole("button", { name: "EDIT" });
    await userEvent.click(editButtons[1]!);
    expect(screen.getByLabelText("Row 2 duration")).toBeInTheDocument();
    expect(screen.queryByLabelText("Row 1 duration")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    expect(screen.getByText(/needs? attention/i)).toBeInTheDocument();
    const durInput = await screen.findByLabelText("Row 1 duration");
    expect(document.activeElement).toBe(durInput);
    // The accordion invariant (at most one row open) still holds — Row 2
    // collapsed back when Row 1 took its place, it didn't stay open too.
    expect(screen.queryByLabelText("Row 2 duration")).not.toBeInTheDocument();
  });

  it("shows a needs-attention count and focuses the first invalid control when Save fails validation", async () => {
    // jsdom doesn't implement scrollIntoView at all — Builder.tsx guards the
    // call with a `typeof` check for exactly this reason. Stubbing it here
    // exercises that guard's true branch too, not just jsdom's default
    // (unimplemented) one.
    const scrollIntoView = vi.fn();
    const elementProto = Element.prototype as unknown as {
      scrollIntoView?: () => void;
    };
    elementProto.scrollIntoView = scrollIntoView;

    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));

    // DUR is left blank (the first field `toSteps` checks on a work row);
    // SPM and REST are also out of range (loaded via edit-mode data — both
    // are steppers now, so neither can be typed out of range from the UI).
    const badRow = newRow("w");
    badRow.durValue = "";
    badRow.spm = "99";
    badRow.rest = "61";
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

    expect(screen.getByText(/needs? attention/i)).toBeInTheDocument();
    const durInput = await screen.findByLabelText("Row 1 duration");
    expect(document.activeElement).toBe(durInput);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });

    delete elementProto.scrollIntoView;
  });

  it("wires aria-invalid/aria-describedby on dur (input) and spm/rest (Stepper's own role=group)", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));

    const badRow = newRow("w");
    badRow.durValue = "";
    badRow.spm = "99";
    badRow.rest = "61";
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

    const durInput = await screen.findByLabelText("Row 1 duration");
    expect(durInput).toHaveAttribute("aria-invalid", "true");
    const durDescribedBy = durInput.getAttribute("aria-describedby");
    expect(document.getElementById(durDescribedBy!)).toHaveTextContent(
      "duration is required, e.g. 5",
    );

    const spmGroup = screen.getByRole("group", {
      name: "Row 1 stroke rate",
    });
    expect(spmGroup).toHaveAttribute("aria-invalid", "true");
    const spmDescribedBy = spmGroup.getAttribute("aria-describedby");
    expect(document.getElementById(spmDescribedBy!)).toHaveTextContent(
      "spm must be 10..60",
    );

    const restGroup = screen.getByRole("group", { name: "Row 1 rest" });
    expect(restGroup).toHaveAttribute("aria-invalid", "true");
    const restDescribedBy = restGroup.getAttribute("aria-describedby");
    expect(document.getElementById(restDescribedBy!)).toHaveTextContent(
      "rest must be 0:01..60:00",
    );
  });

  it("still rejects a row's out-of-range pace-ref offset arriving via edit-mode data, wired to PaceRefInput's radiogroup", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));

    const badRow = newRow("w");
    badRow.durValue = "5:00";
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

    expect(
      await screen.findByText("invalid pace reference"),
    ).toBeInTheDocument();

    const group = screen.getByRole("radiogroup", { name: "Row 1 pace base" });
    expect(group).toHaveAttribute("aria-invalid", "true");
    const describedBy = group.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "invalid pace reference",
    );
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

  // Regression: `pain` used to have no entry in Builder's `fieldRefs` map,
  // so when it was the first invalid key `handleSave` silently no-opped on
  // focus. Now it's ClassificationCard's own wrapper that gets focused.
  it("focuses the classification wrapper and still shows the count when pain is the first invalid field", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    // Valid title, pain deliberately left unset. Row 1's own fields are also
    // still blank/invalid, but pain comes first in `toSteps`'s errors.
    await userEvent.type(screen.getByLabelText("Title"), "Ladder Sets");

    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    expect(screen.getByText(/needs? attention/i)).toBeInTheDocument();
    const wrap = document.querySelector(".builder-classification-wrap");
    expect(wrap).not.toBeNull();
    expect(document.activeElement).toBe(wrap);
    expect(wrap).toHaveAttribute("tabIndex", "-1");
  });

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

  it("treats a successful save as success even when the response body isn't valid JSON", async () => {
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

  it("shows the no-target treatment with a link to /you when baselines are unset", async () => {
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(screen.getByText("no target")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /set baselines/i }),
    ).toHaveAttribute("href", "/you");
  });

  it("live-resolves a work row's typed duration and pace ref into the tolerance range", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    await userEvent.type(screen.getByLabelText("Row 1 duration"), "500");
    const faster = screen.getByRole("button", { name: "Row 1 pace faster" });
    await userEvent.click(faster);
    await userEvent.click(faster);

    // Hardcoded expectation (EN DASH, U+2013) — never recomputed by calling
    // resolveSplit/toleranceRange, which would make this assertion tautological.
    expect(screen.getByText("1:59.0–2:01.0")).toBeInTheDocument();
  });

  it("renders a work row's pace as a structured control (four radios: 2K/6K/MAX/MIN), not a free-text field", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    const paceGroup = screen.getByRole("radiogroup", {
      name: "Row 1 pace base",
    });
    expect(within(paceGroup).getAllByRole("radio")).toHaveLength(4);
    expect(
      within(paceGroup).getByRole("radio", { name: "Row 1 pace 2K" }),
    ).toBeInTheDocument();
    expect(
      within(paceGroup).getByRole("radio", { name: "Row 1 pace 6K" }),
    ).toBeInTheDocument();
    expect(
      within(paceGroup).getByRole("radio", { name: "Row 1 pace MAX" }),
    ).toBeInTheDocument();
    expect(
      within(paceGroup).getByRole("radio", { name: "Row 1 pace MIN" }),
    ).toBeInTheDocument();
  });

  // Task 4: an effort row's TARGET reads the effort word — and, unlike a
  // split row, doesn't need baselines to do it (a word needs no resolution).
  // Real starter workout (Zephyr: [wu 5', w 20' @ 6k+18]), not a hand-built
  // fixture — its one work step's ref is patched to MAX before going through
  // the real edit-mode load path (fromWorkout), matching the ledger's
  // "test against a realistic fixture" rule.
  it("shows ALL OUT and no offset stepper for a MAX row opened via the edit path, even with no baselines set", async () => {
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    mockApi(() => new Response(null, { status: 201 }));

    const zephyr = STARTER_WORKOUTS.find((w) => w.title === "Zephyr");
    if (!zephyr) throw new Error("fixture not found: Zephyr");
    const steps: Step[] = zephyr.steps.map((s) =>
      s.k === "w" ? { ...s, ref: { effort: "max" as const } } : s,
    );
    const initial = fromWorkout({
      title: zephyr.title,
      type: zephyr.type,
      difficulty: zephyr.difficulty,
      pain: zephyr.pain,
      steps,
    });
    const maxRowIndex = initial.rows.findIndex((r) => r.refEffort === "max");
    expect(maxRowIndex).toBeGreaterThanOrEqual(0);

    await renderBuilder({ kind: "edit", id: "w1", initial });
    await userEvent.click(
      screen.getAllByRole("button", { name: "EDIT" })[maxRowIndex]!,
    );

    const rowLabel = `Row ${maxRowIndex + 1}`;
    expect(
      screen.getByRole("radio", { name: `${rowLabel} pace MAX` }),
    ).toBeChecked();
    expect(screen.getByText("ALL OUT")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: `${rowLabel} pace faster` }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: `${rowLabel} pace slower` }),
    ).not.toBeInTheDocument();
  });

  it("renders REST as a stepper reading NONE by default, without stealing focus, and steps in 30s increments", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    const restUp = screen.getByRole("button", { name: "Row 1 rest up" });
    expect(screen.getByLabelText("Row 1 rest value")).toHaveValue("");
    expect(document.activeElement).not.toBe(restUp);

    await userEvent.click(restUp);
    await userEvent.click(restUp);
    await userEvent.click(restUp);

    expect(screen.getByLabelText("Row 1 rest value")).toHaveValue("1:30");
  });

  it("no longer mounts the bulk-import toggle — it moved to its own /library/import screen", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(
      screen.queryByRole("button", { name: /BULK IMPORT/i }),
    ).not.toBeInTheDocument();
  });

  it("has no ClassificationCard leftovers from PainPicker — no radiogroup named Expected pain", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(
      screen.queryByRole("radiogroup", { name: "Expected pain" }),
    ).not.toBeInTheDocument();
    // ClassificationCard's own numeral chips are plain buttons instead.
    expect(screen.getByRole("button", { name: "Pain 3" })).toBeInTheDocument();
  });

  // A stored workout's wu row survives being opened for edit — not
  // authorable from a create-mode button any more, but still editable once
  // its card is expanded.
  it("a stored workout's wu row survives being opened for edit", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));

    const wu = newRow("wu");
    wu.durValue = "10:00";
    const work = newRow("w");
    work.durValue = "5:00";

    const initial: BuilderForm = {
      title: "Ladder Sets",
      type: "O2",
      difficulty: "easy",
      pain: 3,
      rows: [wu, work],
      reps: 1,
    };
    await renderBuilder({ kind: "edit", id: "w1", initial });

    // Edit mode starts collapsed; expand the wu row (Row 1).
    const editButtons = screen.getAllByRole("button", { name: "EDIT" });
    await userEvent.click(editButtons[0]!);
    expect(screen.getByLabelText("Row 1 duration")).toHaveValue("10:00");
  });

  it("derives the repeat span from bookend rows: a leading warm-up stays loose, the rest repeats", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));

    const wu = newRow("wu");
    wu.durValue = "10:00";
    const work = newRow("w");
    work.durValue = "5:00";

    const initial: BuilderForm = {
      title: "Ladder Sets",
      type: "O2",
      difficulty: "easy",
      pain: 3,
      rows: [wu, work],
      reps: 3,
    };
    await renderBuilder({ kind: "edit", id: "w1", initial });

    // total = loose(10, the warm-up) + perSet(5) * reps(3) = 25. Exact
    // singular-plural grammar — a looser regex here would mask a regression.
    expect(screen.getByText("1 step · 5:00 per set")).toBeInTheDocument();
    expect(screen.getByText("25 MIN")).toBeInTheDocument();
  });
});
