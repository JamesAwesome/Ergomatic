import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { api } from "../api";
import type { WarmupSetting } from "../api/usePreferences";
import type { BuilderEditMode } from "./Builder";
import { fromWorkout, newForm, newRow, type BuilderForm } from "./builderState";
import type { Step } from "../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import {
  BUILDER_DRAFT_KEY,
  formFingerprint,
  saveBuilderDraft,
  type BuilderDraft,
} from "./builderDraft";

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
// Defaults to READY and OFF (`warmup: null`) — the setting's own production
// default (server/stores/preferences.ts) — so every test not concerned
// with the hint renders exactly as it would for a rower who never touched
// the You screen's warm-up row.
let preferencesMock:
  | { state: "ready"; preferences: { warmup: WarmupSetting | null } }
  | { state: "loading" }
  | { state: "error"; retry: () => void } = {
  state: "ready",
  preferences: { warmup: null },
};

function mockPreferences(warmup: WarmupSetting | null) {
  preferencesMock = { state: "ready", preferences: { warmup } };
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

// Renders `location.state.from` as plain text — the "prove the navigation,
// not the prop" idiom this task round's other probe-route tests all use.
function LocationProbe() {
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  return <p>PROBE from={String(from)}</p>;
}

// Renders Builder at a real `/library/w1/edit`-shaped history entry
// (carrying `state`, the shape a real `<Link state={...}>` produces),
// alongside a `/library/:id` PROBE route — edit mode's own ← BACK targets
// a SPECIFIC workout's detail page (`mode.id`), not the general BackLink
// mechanism, so this is the only way to prove both its href and what it
// forwards through `state`.
async function renderBuilderWithProbe(
  mode: BuilderEditMode | undefined,
  state?: unknown,
) {
  const { default: Builder } = await import("./Builder");
  render(
    <MemoryRouter initialEntries={[{ pathname: "/library/w1/edit", state }]}>
      <Routes>
        <Route path="/library/w1/edit" element={<Builder mode={mode} />} />
        <Route path="/library/:id" element={<LocationProbe />} />
      </Routes>
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
  preferencesMock = { state: "ready", preferences: { warmup: null } };
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => workoutsMock,
  }));
  vi.doMock("../api/usePreferences", () => ({
    usePreferences: () => preferencesMock,
  }));
  // The draft-persistence suite below reads/writes the real
  // BUILDER_DRAFT_KEY slot — a clean slate for every test, including the
  // ones above this line that never touch it (harmless either way).
  localStorage.clear();
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

  // Edit mode's own ← BACK is a recorded departure from the general
  // BackLink mechanism (docs/superpowers/specs/2026-08-02-bugfix-back-nav-
  // scroll-design.md): cancelling an edit always returns to the SPECIFIC
  // workout you were editing — the same fixed-target precedent
  // EditWorkout.tsx's own guard-clause screens already use — rather than
  // chaining through `from`, which would skip the detail screen entirely
  // (it holds the origin BEFORE detail, e.g. "/today", not detail itself).
  it("in edit mode, ← BACK targets this workout's own detail page, not /library", async () => {
    mockBaselines(BASELINES);
    await renderBuilderWithProbe({
      kind: "edit",
      id: "w1",
      initial: newForm(),
    });

    expect(screen.getByRole("link", { name: "← BACK" })).toHaveAttribute(
      "href",
      "/library/w1",
    );
  });

  // The chain's second hop: whatever origin Builder ITSELF received (via
  // detail's own Edit link) must ride along onto this fixed-target back
  // link, unchanged, so detail's OWN BackLink — once you're back there —
  // still has "/today" to return to on the NEXT ← BACK press, instead of
  // losing it and falling back to /library.
  it("in edit mode, ← BACK forwards the origin Builder itself received", async () => {
    mockBaselines(BASELINES);
    await renderBuilderWithProbe(
      { kind: "edit", id: "w1", initial: newForm() },
      { from: "/today" },
    );

    await userEvent.click(screen.getByRole("link", { name: "← BACK" }));

    expect(await screen.findByText("PROBE from=/today")).toBeVisible();
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

  // ---- TOTAL / warm-up hint / Save to library (task brief test 8) --------
  // 2026-08-09's warmup setting: the hint is conditional on the setting
  // being ON (spec §5), reading the house-format duration (time or
  // meters), plus the rest when set — not a bare "N′" number any more.

  it("renders TOTAL and the primary button reads Save to library", async () => {
    mockBaselines(BASELINES);
    mockPreferences({ kind: "time", minutes: 10 });
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    await userEvent.type(screen.getByLabelText("Row 1 duration"), "500");

    expect(screen.getByText("TOTAL")).toBeInTheDocument();
    expect(screen.getByText("5 MIN")).toBeInTheDocument();
    expect(
      screen.getByText("+ 10:00 warm-up from your preferences"),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Save to library" }),
    ).toBeInTheDocument();
  });

  it("renders the hint with its rest appended when the setting has one", async () => {
    mockBaselines(BASELINES);
    mockPreferences({ kind: "time", minutes: 10, restSeconds: 120 });
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(
      screen.getByText("+ 10:00 warm-up + 2:00 rest from your preferences"),
    ).toBeInTheDocument();
  });

  it("renders a distance warm-up's hint in meters, house-format", async () => {
    mockBaselines(BASELINES);
    mockPreferences({ kind: "distance", meters: 2000 });
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(
      screen.getByText("+ 2000 m warm-up from your preferences"),
    ).toBeInTheDocument();
  });

  it("renders no hint at all when the setting is OFF (null)", async () => {
    mockBaselines(BASELINES);
    mockPreferences(null);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(screen.queryByText(/warm-up/i)).not.toBeInTheDocument();
  });

  // ---- Warm-up placement (Phase 5F task 7) --------------------------------
  // The warm-up is prepended at session start, not authored last — it reads
  // as an implicit step 0, so it must sit above the step list rather than
  // down by the totals where it used to live.

  it("shows the warm-up above the step list, not below the totals", async () => {
    mockBaselines(BASELINES);
    mockPreferences({ kind: "time", minutes: 10 });
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

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
    mockPreferences({ kind: "time", minutes: 10 });
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

  it("live-resolves a work row's typed duration and pace ref into the exact split", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    await userEvent.type(screen.getByLabelText("Row 1 duration"), "500");
    const faster = screen.getByRole("button", { name: "Row 1 pace faster" });
    await userEvent.click(faster);
    await userEvent.click(faster);

    // Hardcoded expectation — never recomputed by calling
    // resolveSplit/fmtSplit, which would make this assertion tautological.
    // Ui-fix round, Item 1: the exact split, never a "lo–hi" tolerance band.
    expect(screen.getByText("2:00.0")).toBeInTheDocument();
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
  // Real library workout (Sea Fret: [wu 5', 2×4' @ 6k+12]), not a
  // hand-built fixture — its one work step's ref is patched to MAX before
  // going through the real edit-mode load path (fromWorkout), matching the
  // ledger's "test against a realistic fixture" rule.
  it("shows ALL OUT and no offset stepper for a MAX row opened via the edit path, even with no baselines set", async () => {
    mockBaselines({ k2Seconds: null, k6Seconds: null });
    mockApi(() => new Response(null, { status: 201 }));

    const seaFret = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret");
    if (!seaFret) throw new Error("fixture not found: Sea Fret");
    const steps: Step[] = seaFret.steps.map((s) =>
      s.k === "w" ? { ...s, ref: { effort: "max" as const } } : s,
    );
    const initial = fromWorkout({
      title: seaFret.title,
      type: seaFret.type,
      difficulty: seaFret.difficulty,
      pain: seaFret.pain,
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

  // Two tests used to live here: "a stored workout's wu row survives being
  // opened for edit" and "derives the repeat span from bookend rows: a
  // leading warm-up stays loose, the rest repeats" — both built a
  // `BuilderForm` containing a `newRow("wu")` row. 2026-08-09's warmup
  // setting removed "wu" from `RowKind` entirely (builderState.ts's own
  // comment): warm-ups are a per-user preference now, never an authored
  // row, so a stored workout can no longer arrive with one (Task 2's
  // migration strips it at the DB before any client ever fetches it) and
  // there is no longer a legal `BuilderRow` to construct either. Coverage
  // for "a leading bookend row stays loose" itself is now moot too —
  // `BOOKEND_ROW_KINDS` is empty (builderState.test.ts's own
  // `spanStartIndex`/`BOOKEND_ROW_KINDS` suite), so every row is in the
  // repeated span unconditionally; that reality is what
  // `builderState.test.ts`'s "totals" suite now pins directly.

  // ---- Draft persistence (CL remainder Task 2) ---------------------------
  // Autosave, restore-with-notice, and the two-tap START OVER — wired
  // against the real BUILDER_DRAFT_KEY slot (localStorage.clear() in the
  // outer beforeEach above keeps every test in this suite starting clean).
  describe("draft persistence", () => {
    function draftOf(overrides: Partial<BuilderDraft> = {}): BuilderDraft {
      return {
        v: 1,
        mode: { kind: "new" },
        form: newForm(),
        baseline: newForm(),
        savedAt: "2026-08-10T00:00:00.000Z",
        ...overrides,
      };
    }

    function readStoredDraft(): BuilderDraft {
      const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
      expect(raw).not.toBeNull();
      return JSON.parse(raw!) as BuilderDraft;
    }

    // Contract item 1.
    it("typing into a pristine new-mode builder writes a draft containing the current form and the pristine baseline", async () => {
      mockBaselines(BASELINES);
      mockApi(() => new Response(null, { status: 201 }));
      await renderBuilder();

      expect(localStorage.getItem(BUILDER_DRAFT_KEY)).toBeNull();
      await userEvent.type(screen.getByLabelText("Title"), "Interrupted");

      const stored = readStoredDraft();
      expect(stored.form.title).toBe("Interrupted");
      expect(stored.mode).toStrictEqual({ kind: "new" });
      expect(formFingerprint(stored.baseline)).toBe(formFingerprint(newForm()));
    });

    // Contract item 2, first half: reverting content THIS mount wrote.
    it("hand-reverting a typed title back to pristine clears the draft this mount owns", async () => {
      mockBaselines(BASELINES);
      mockApi(() => new Response(null, { status: 201 }));
      await renderBuilder();

      const title = screen.getByLabelText("Title");
      await userEvent.type(title, "x");
      expect(localStorage.getItem(BUILDER_DRAFT_KEY)).not.toBeNull();

      await userEvent.clear(title);
      expect(localStorage.getItem(BUILDER_DRAFT_KEY)).toBeNull();
    });

    // Contract item 2, same guarantee for a RESTORED (not typed) draft —
    // `ownsSlot` starts true on restore, not just on first write.
    it("hand-reverting a restored draft back to pristine clears the slot this mount restored", async () => {
      mockBaselines(BASELINES);
      mockApi(() => new Response(null, { status: 201 }));
      saveBuilderDraft(draftOf({ form: { ...newForm(), title: "Restored" } }));
      await renderBuilder();

      expect(screen.getByLabelText("Title")).toHaveValue("Restored");
      expect(localStorage.getItem(BUILDER_DRAFT_KEY)).not.toBeNull();

      await userEvent.clear(screen.getByLabelText("Title"));
      expect(localStorage.getItem(BUILDER_DRAFT_KEY)).toBeNull();
    });

    // Contract item 2, second half — the subtle one: a mount that never
    // restored or wrote anything must not destroy a draft some OTHER
    // screen owns. Opening a DIFFERENT workout for edit while a new-mode
    // draft sits typed in the slot must leave it alone.
    it("a pristine mount does not clear a foreign draft it never wrote or restored", async () => {
      mockBaselines(BASELINES);
      mockApi(() => new Response(null, { status: 201 }));
      saveBuilderDraft(
        draftOf({ form: { ...newForm(), title: "Someone else's draft" } }),
      );

      // Edit mode for a workout whose own mode never matches the stored
      // "new"-kind draft, so nothing restores here — this mount arrives,
      // and stays, pristine.
      await renderBuilder({ kind: "edit", id: "w9", initial: newForm() });

      const stored = readStoredDraft();
      expect(stored.form.title).toBe("Someone else's draft");
    });

    // Contract item 3.
    it("mounting /library/new with a stored matching new-mode draft restores it, shows the notice, and leaves every card collapsed", async () => {
      mockBaselines(BASELINES);
      mockApi(() => new Response(null, { status: 201 }));
      const row = newRow("w");
      row.durValue = "5:00";
      saveBuilderDraft(
        draftOf({
          form: { ...newForm(), title: "Restored Draft", rows: [row] },
        }),
      );

      await renderBuilder();

      expect(screen.getByText("Draft restored.")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "START OVER" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Title")).toHaveValue("Restored Draft");
      // Collapsed: no row editor mounted — contrast with a FRESH new-mode
      // mount, which always opens Row 1 (this file's very first test).
      expect(
        screen.queryByLabelText(/Row \d+ duration/),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "EDIT" })).toBeInTheDocument();
    });

    // Contract item 4 — realistic fixture (briefing's own rule): built from
    // a real LIBRARY_WORKOUTS entry via fromWorkout, not a hand-rolled form.
    it("mounting edit mode with a stale-baseline draft drops it silently and deletes it", async () => {
      mockBaselines(BASELINES);
      mockApi(() => new Response(null, { status: 201 }));

      const seaFret = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret");
      if (!seaFret) throw new Error("fixture not found: Sea Fret");
      const currentInitial = fromWorkout({
        title: seaFret.title,
        type: seaFret.type,
        difficulty: seaFret.difficulty,
        pain: seaFret.pain,
        steps: seaFret.steps,
      });

      // Baselined against a DIFFERENT version of this same workout (its
      // title changed since the draft was written) — the stored baseline
      // no longer fingerprints equal to the CURRENT `fromWorkout` result.
      saveBuilderDraft({
        v: 1,
        mode: { kind: "edit", workoutId: "sea-fret-id" },
        form: { ...currentInitial, title: "Half-typed edit" },
        baseline: { ...currentInitial, title: "An older title" },
        savedAt: "2026-08-10T00:00:00.000Z",
      });

      await renderBuilder({
        kind: "edit",
        id: "sea-fret-id",
        initial: currentInitial,
      });

      expect(screen.queryByText("Draft restored.")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Title")).toHaveValue(seaFret.title);
      expect(localStorage.getItem(BUILDER_DRAFT_KEY)).toBeNull();
    });

    // Contract item 5, first tap + auto-disarm — fireEvent + fake timers,
    // same idiom as WorkoutDetail.test.tsx's own "disarms after 4 seconds"
    // case: userEvent's real-time delays would stall against fake timers.
    it("START OVER's first tap arms with swapped copy and auto-disarms after 4s with no second press", async () => {
      vi.useFakeTimers();
      try {
        mockBaselines(BASELINES);
        mockApi(() => new Response(null, { status: 201 }));
        saveBuilderDraft(draftOf({ form: { ...newForm(), title: "Doomed" } }));
        await renderBuilder();

        fireEvent.click(screen.getByRole("button", { name: "START OVER" }));
        expect(
          screen.getByRole("button", { name: "Tap again to start over" }),
        ).toBeInTheDocument();

        await act(() => vi.advanceTimersByTimeAsync(4000));

        expect(
          screen.getByRole("button", { name: "START OVER" }),
        ).toBeInTheDocument();
        // Auto-disarm alone never resets anything — still the restored
        // content, still owning the slot.
        expect(screen.getByLabelText("Title")).toHaveValue("Doomed");
        expect(localStorage.getItem(BUILDER_DRAFT_KEY)).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    // Contract item 5, second tap.
    it("START OVER's second tap clears the draft, resets the form to pristine, and hides the notice", async () => {
      mockBaselines(BASELINES);
      mockApi(() => new Response(null, { status: 201 }));
      saveBuilderDraft(draftOf({ form: { ...newForm(), title: "Doomed" } }));
      await renderBuilder();

      await userEvent.click(screen.getByRole("button", { name: "START OVER" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Tap again to start over" }),
      );

      expect(screen.queryByText("Draft restored.")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Title")).toHaveValue("");
      expect(localStorage.getItem(BUILDER_DRAFT_KEY)).toBeNull();
    });

    // Contract item 6.
    it("a successful save clears the draft before navigating away", async () => {
      const api = mockApi(
        () => new Response(JSON.stringify({ id: "new-id" }), { status: 201 }),
      );
      mockBaselines(BASELINES);
      await renderBuilder();

      await fillValidForm();
      expect(localStorage.getItem(BUILDER_DRAFT_KEY)).not.toBeNull();

      await userEvent.click(
        screen.getByRole("button", { name: "Save to library" }),
      );

      await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
      expect(localStorage.getItem(BUILDER_DRAFT_KEY)).toBeNull();
    });

    // Contract item 7.
    it("a draft for the wrong mode neither restores nor blocks typing — new content overwrites the single slot", async () => {
      mockBaselines(BASELINES);
      mockApi(() => new Response(null, { status: 201 }));
      saveBuilderDraft({
        v: 1,
        mode: { kind: "edit", workoutId: "other-workout" },
        form: { ...newForm(), title: "Somebody else's edit" },
        baseline: newForm(),
        savedAt: "2026-08-10T00:00:00.000Z",
      });

      // New mode — mismatched mode kind, so nothing restores here.
      await renderBuilder();
      expect(screen.queryByText("Draft restored.")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Title")).toHaveValue("");

      await userEvent.type(screen.getByLabelText("Title"), "Fresh content");

      const stored = readStoredDraft();
      expect(stored.mode).toStrictEqual({ kind: "new" });
      expect(stored.form.title).toBe("Fresh content");
    });

    // The sketch's own self-mutation target (b): restoring through
    // `adoptForm` re-identifies every row with a fresh id, so a row added
    // afterward can never collide with one a previous session assigned.
    // Rigged so the collision is DETERMINISTIC if adoptForm is skipped: a
    // fresh Builder module instance's own row-id counter hands out "r1" to
    // `builderState.ts`'s own module-level `EMPTY_FORM` (consumed at import
    // time, before anything renders), "r2" to `pristine`'s own default row
    // (consumed before restore resolves, never rendered), and would hand
    // out "r3" to the next row created — exactly `rowB`'s raw stored id
    // below. If restore used `d.form` unadopted, "+ ADD STEP"'s new row
    // would share `rowB`'s id, and deleting that new row would delete BOTH
    // (`removeRow`'s `r.id !== id` filter drops every row sharing an id).
    it("restoring through adoptForm means a row added afterward never collides with a restored row's id", async () => {
      mockBaselines(BASELINES);
      mockApi(() => new Response(null, { status: 201 }));

      const rowA = newRow("w");
      rowA.id = "rX";
      const rowB = newRow("w");
      rowB.id = "r3";
      saveBuilderDraft(
        draftOf({
          form: { ...newForm(), title: "Two Rows", rows: [rowA, rowB] },
        }),
      );

      await renderBuilder();
      expect(screen.getAllByRole("button", { name: "EDIT" })).toHaveLength(2);

      await userEvent.click(screen.getByRole("button", { name: "+ ADD STEP" }));
      expect(
        screen.getAllByRole("button", { name: /^Delete Step \d+$/ }),
      ).toHaveLength(3);

      await userEvent.click(
        screen.getByRole("button", { name: "Delete Step 3" }),
      );

      // Exactly the one row deleted — a collision would silently take
      // `rowB` down with it, leaving 1 instead of 2.
      expect(
        screen.getAllByRole("button", { name: /^Delete Step \d+$/ }),
      ).toHaveLength(2);
    });
  });
});
