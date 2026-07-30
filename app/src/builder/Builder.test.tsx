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

// Backing store for the `useWorkouts` mock registered once in `beforeEach`
// below. `mockWorkouts`/`mockWorkoutsLoading` just mutate this plain
// variable rather than calling `vi.doMock` a second time for the same
// module id — PRE-EXISTING FLAKE FIX (~1-in-8 CI runs, reproduced on
// multiple commits before this phase, see docs/superpowers/sdd/
// progress.md's "CARRY TO TASK 4" note): `vi.doMock` registers a mock by
// sending it to the runner, and that registration isn't guaranteed to be
// synchronous under real parallel load — calling it twice in one test (the
// default in `beforeEach`, then an override in a test body, as this used to
// do) risked the two registrations landing out of order, so a render
// occasionally saw the STALE (empty) mock instead of the test's own data.
// A single `vi.doMock` call per test, reading a mutable box at call time
// instead of being re-registered, has no second registration to race.
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

// Same mutable-box idiom as `workoutsMock` above, and for the same reason:
// a single `vi.doMock` registration per test (the `beforeEach` below),
// tests just mutate this box rather than re-registering the mock. Defaults
// to a ready 10' warm-up so every pre-existing test in this file — none of
// which know about preferences — keeps rendering exactly as before.
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
// one work row's duration + pace ref. Shared by the save-success and
// save-failure tests so both start from an identically valid form.
async function fillValidForm() {
  await userEvent.type(screen.getByLabelText("Title"), "Ladder Sets");
  await userEvent.click(screen.getByRole("radio", { name: "Pain 3" }));
  // Bare number, no apostrophe: DurationInput's value field is the row's
  // plain `durValue` (Phase 5D Task 2) — no grammar is parsed from it, and
  // its unit chip defaults to MIN (Phase 5D Task 4), so typing a bare "5"
  // here means 5 minutes without touching the M chip at all.
  await userEvent.type(screen.getByLabelText("Row 1 duration"), "5");
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
  preferencesMock = { state: "ready", preferences: { warmupMinutes: 10 } };
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => workoutsMock,
  }));
  vi.doMock("../api/usePreferences", () => ({
    usePreferences: () => preferencesMock,
  }));
});

describe("Builder", () => {
  // Phase 5D fix wave 1 removed the old single-line column header strip
  // (DUR / REST (OPT) / SPLIT) once the row grew to three lines (main line,
  // SPM, pace) — a strip sitting above the rows couldn't span fields that no
  // longer lived on one line beneath it. That pass removed the header
  // without replacing it, which left the SET-replacement clone button, the
  // SPM stepper and the DUR/REST distinction with no visible name at all
  // (aria-labels covered screen readers, not the screen). Fix wave 2 adds a
  // static, visible affix beside each field instead of a header strip: this
  // test now asserts both halves — the strip stays gone, and its job is
  // covered per-field.
  it("has no column-header strip; DUR, REST and SPM each carry their own visible affix", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    // The header strip itself, and every label it named that has no other
    // on-screen source, are gone — SET, PACE REF and SPLIT never had (and
    // still don't have) a visible label anywhere on the row, so their
    // absence alone proves there's no strip sitting above the rows any more.
    for (const label of ["SET", "PACE REF", "SPLIT", "REST (OPT)"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }

    // DUR and REST distinguish themselves on screen now, not just by chip
    // weight — each carries its own short static affix, the same treatment
    // REST's "MIN" unit marking already used.
    expect(
      screen.getByLabelText("Row 1 duration").closest(".field-dur-group"),
    ).toHaveTextContent("DUR");
    const restGroup = screen
      .getByLabelText("Row 1 rest")
      .closest(".field-rest-group");
    expect(restGroup).toHaveTextContent("REST");
    expect(restGroup).toHaveTextContent("MIN");

    // The SPM stepper is no longer a bare "− 20 +" — "SPM" sits beside it.
    expect(
      screen
        .getByLabelText("Row 1 stroke rate")
        .closest(".step-row-editor-spm"),
    ).toHaveTextContent("SPM");
  });

  // Requirement 1 of the Task 4 brief: no SET cell, and no readout naming
  // any row as "marked" — the repeat span is derived (Phase 5D Task 2), not
  // clicked, so there's nothing left for either to describe.
  it("has no SET cell and no readout naming a row as marked", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(
      screen.queryByRole("button", { name: /^SET$/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/marked/i)).not.toBeInTheDocument();
  });

  it("live-resolves a work row's typed duration and pace ref into the tolerance range", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    await userEvent.type(screen.getByLabelText("Row 1 duration"), "5");
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

  it("POSTs a valid form to /api/workouts with the resolved steps and picked pain", async () => {
    const api = mockApi(
      () => new Response(JSON.stringify({ id: "new-id" }), { status: 201 }),
    );
    mockBaselines(BASELINES);
    await renderBuilder();

    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

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

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

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
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

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

  // Phase 5D Task 2 replaced per-row marking with a derived repeat span: a
  // leading `wu` row is a bookend (stays outside the span, paid once) and
  // every row from the first non-bookend row onward repeats — nothing left
  // to click, so this constructs the form directly (like the out-of-range
  // pace-ref test below) rather than driving a SET toggle that no longer
  // exists.
  it("derives the repeat span from bookend rows: a leading warm-up stays loose, the rest repeats (M2)", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));

    const wu = newRow("wu");
    wu.durValue = "10";
    const work = newRow("w");
    work.durValue = "5";

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
    // singular-verb spelling ("1 row repeats", not "1 row repeat") — a
    // looser `repeats?` regex here would mask a grammar regression.
    expect(
      screen.getByText("1 row repeats · 5:00 per set"),
    ).toBeInTheDocument();
    expect(screen.getByText(/^TOTAL 25 MIN$/)).toBeInTheDocument();
  });

  // Phase 5D Task 4: "+ WARM-UP" is gone (warm-up moves to a preference
  // read at session time, next task) — replaces the old M3 test, which
  // drove that now-deleted button. `addRow(f, "wu")` and StepRowEditor's
  // `kind === "wu"` render branch both stay, though, since a stored
  // workout can still arrive with a `wu` row (bulk import, or opening an
  // existing starter/personal workout for edit) and it has to stay
  // editable — see the round-trip test right below.
  it("no longer renders + WARM-UP", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(
      screen.queryByRole("button", { name: "+ WARM-UP" }),
    ).not.toBeInTheDocument();
  });

  it("a stored workout's wu row survives being opened for edit — not authorable any more, but still editable", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));

    const wu = newRow("wu");
    wu.durValue = "10";
    const work = newRow("w");
    work.durValue = "5";

    const initial: BuilderForm = {
      title: "Ladder Sets",
      type: "O2",
      difficulty: "easy",
      pain: 3,
      rows: [wu, work],
      reps: 1,
    };
    await renderBuilder({ kind: "edit", id: "w1", initial });

    // Row 1 is the bookend `wu` row (Row 2 is the `work` row that follows)
    // — its duration field renders and carries the stored value even
    // though there's no "+ WARM-UP" button in this screen any more to have
    // authored it from scratch.
    expect(screen.getByLabelText("Row 1 duration")).toHaveValue("10");
    expect(screen.getAllByRole("button", { name: "Remove row" })).toHaveLength(
      2,
    );
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
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

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
    await userEvent.type(screen.getByLabelText("Row 1 stroke rate"), "24");
    await userEvent.type(screen.getByPlaceholderText("opt"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

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
    await userEvent.type(screen.getByLabelText("Row 1 stroke rate"), "99");
    await userEvent.type(screen.getByPlaceholderText("opt"), "0.3");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const expectations: [string, string][] = [
      ["Row 1 duration", "duration is required, e.g. 5"],
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
    badRow.durValue = "5";
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

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

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
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

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
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    const [, options] = api.mock.calls[0]!;
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).not.toHaveProperty("num");
  });

  it("has no + REST and no + WARM-UP button; + ADD ROW remains", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(
      screen.queryByRole("button", { name: /\+ REST/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "+ WARM-UP" }),
    ).not.toBeInTheDocument();
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

    await userEvent.type(screen.getByLabelText("Row 1 duration"), "5");
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
    mockWorkoutsLoading();
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
    await userEvent.type(screen.getByLabelText("Row 1 stroke rate"), "99");
    await userEvent.type(screen.getByPlaceholderText("opt"), "0.3");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText(/needs? attention/i)).toBeInTheDocument();
    const durInput = screen.getByLabelText("Row 1 duration");
    expect(document.activeElement).toBe(durInput);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });

    // Restores jsdom's own (missing) implementation so the stub doesn't
    // leak into other tests in this file.
    delete elementProto.scrollIntoView;
  });

  // Regression test: `pain` used to have no entry in Builder's `fieldRefs`
  // map, so when it was the first invalid key (as it is here — title valid,
  // pain untouched, so `toSteps`'s insertion order title -> pain -> steps
  // makes `pain` first) `handleSave` silently no-opped on focus. The count
  // still rendered, but the rower was never taken to the problem.
  it("focuses the pain field's container and still shows the count when pain is the first invalid field", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    // Valid title, pain deliberately left unset — the row fields are also
    // still blank/invalid, but pain comes first in `toSteps`'s errors.
    await userEvent.type(screen.getByLabelText("Title"), "Ladder Sets");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText(/needs? attention/i)).toBeInTheDocument();
    const painGroup = screen.getByRole("radiogroup", {
      name: "Expected pain",
    });
    // The focus target is the `tabIndex={-1}` wrapper div registered around
    // the radiogroup (PainPicker has no single focusable root of its own),
    // not the radiogroup element itself.
    expect(document.activeElement).toBe(painGroup.parentElement);
    // That wrapper must not add a stop to the page's tab order — only the
    // (roving-tabindex) radio cells inside it should be tabbable.
    expect(painGroup.parentElement).toHaveAttribute("tabIndex", "-1");
  });

  it("no longer mounts the bulk-import toggle — it moved to its own /library/import screen", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(
      screen.queryByRole("button", { name: /BULK IMPORT/i }),
    ).not.toBeInTheDocument();
  });

  // Fix wave, Task 1: the clone button used to be a bare "↻" glyph in the
  // exact cell position James couldn't name on sight — the aria-label
  // ("Duplicate Row N") was always correct, but that's not what he was
  // looking at. It must now carry real visible text too, not just an icon.
  it("labels the clone button with visible text, not a bare glyph", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(
      screen.getByRole("button", { name: "Duplicate Row 1" }),
    ).toHaveTextContent("COPY");
  });

  // Requirement 2 of the Task 4 brief: the clone button is the SET cell's
  // replacement — it duplicates its row directly beneath itself and moves
  // focus to the new row's duration field, the same way a failed Save
  // focuses the first invalid field (both go through Builder's `fieldRefs`
  // map).
  it("clicking a row's clone button duplicates it directly beneath and focuses the new row's duration field", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    await userEvent.type(screen.getByLabelText("Row 1 duration"), "5");
    await userEvent.click(screen.getByRole("button", { name: "+ ADD ROW" }));
    // A second row exists now (id "r2") — cloning Row 1 must insert directly
    // beneath it (ahead of the pre-existing second row), not appended at the
    // end, so the clone becomes the new Row 2 and the original second row
    // becomes Row 3.
    await userEvent.type(screen.getByLabelText("Row 2 duration"), "8");

    await userEvent.click(
      screen.getByRole("button", { name: "Duplicate Row 1" }),
    );

    expect(screen.getAllByRole("button", { name: "Remove row" })).toHaveLength(
      3,
    );
    // The clone copies Row 1's fields (durValue "5"), and lands directly
    // beneath it as the new Row 2 — the old Row 2 ("8") is pushed to Row 3.
    await waitFor(() =>
      expect(screen.getByLabelText("Row 2 duration")).toHaveValue("5"),
    );
    expect(screen.getByLabelText("Row 3 duration")).toHaveValue("8");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByLabelText("Row 2 duration"),
      ),
    );
  });

  // Requirement 3: REST is marked as minutes with static text, not a
  // placeholder that vanishes once the rower types into the field —
  // exactly James's complaint about the old SET cell, applied to REST's
  // unit. Asserts the field still holds its typed value AND the "MIN" text
  // is present at the same time, which a placeholder could never do.
  it("marks REST as minutes with visible static MIN text, not a placeholder, and never focuses it", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    const restInput = screen.getByLabelText("Row 1 rest");
    // The MIN marking renders on mount, before any interaction — it must
    // not itself steal focus onto the rest field the way clicking clone
    // deliberately does onto a new row's duration field (the test above).
    expect(document.activeElement).not.toBe(restInput);

    await userEvent.type(restInput, "2");

    // Scoped by class (DurationInput's own MIN/M unit chip also renders the
    // text "MIN" elsewhere on the row) — this is REST's static marking
    // specifically, `.field-rest-unit`, not a DurationInput radio. Still
    // present and still readable alongside the typed value — a placeholder
    // would have vanished the moment "2" was typed.
    expect(
      screen.getByText("MIN", { selector: ".field-rest-unit" }),
    ).toBeInTheDocument();
    expect(restInput).toHaveValue("2");
  });

  // Requirement 4: the primary button reads exactly "Save" — the old
  // "Save to library" wording is gone, not just relabeled with extra text
  // around it.
  it("the primary button reads exactly Save, not Save to library", async () => {
    mockBaselines(BASELINES);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Save to library/i }),
    ).not.toBeInTheDocument();
  });

  // Requirement 7: with a repeat count above 1 and a single work row, the
  // reps marker is spliced in ahead of that row — exact request-body
  // equality (not just "contains a reps step"), preserving the strictness
  // the existing POST test above already holds the rest of the payload to.
  it("with ×3 and one work row, POSTs steps whose first element is the reps marker", async () => {
    const api = mockApi(
      () => new Response(JSON.stringify({ id: "new-id" }), { status: 201 }),
    );
    mockBaselines(BASELINES);
    await renderBuilder();

    await fillValidForm();
    const moreReps = screen.getByRole("button", { name: "More reps" });
    await userEvent.click(moreReps);
    await userEvent.click(moreReps);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

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

  // Task 5: the warm-up is a preference read at session time, never
  // authored per workout (see Builder.tsx's removed "+ WARM-UP" button,
  // Task 4). This proves the preference is surfaced as context text below
  // TOTAL, not baked into the steps the builder saves.
  it("shows the warm-up from preferences as a line beneath TOTAL", async () => {
    mockBaselines(BASELINES);
    mockPreferences(10);
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    const total = screen.getByText(/^TOTAL/);
    const warmup = screen.getByText(/warm-up/i);
    expect(warmup).toHaveTextContent("+ 10′ warm-up (from your preferences)");
    // "beneath" is a DOM-order claim, not just "present somewhere" — a
    // regression that moved the line above TOTAL would still pass a bare
    // toBeInTheDocument() check.
    expect(
      total.compareDocumentPosition(warmup) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders no warm-up line while preferences are loading", async () => {
    mockBaselines(BASELINES);
    mockPreferencesLoading();
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(screen.queryByText(/warm-up/i)).not.toBeInTheDocument();
  });

  it("renders no warm-up line — no placeholder number either — when preferences fail to load", async () => {
    mockBaselines(BASELINES);
    mockPreferencesError();
    mockApi(() => new Response(null, { status: 201 }));
    await renderBuilder();

    expect(screen.queryByText(/warm-up/i)).not.toBeInTheDocument();
  });

  // The critical rule from the task brief: baking the warm-up into a
  // workout's steps would leave every existing workout stale the moment
  // the rower changes their preference. Asserts the exact POST body (not
  // just "no wu step somewhere in it") so a stray extra key can't slip
  // through.
  it("does not include a wu step in the saved request body even though preferences supply a warm-up", async () => {
    const api = mockApi(
      () => new Response(JSON.stringify({ id: "new-id" }), { status: 201 }),
    );
    mockBaselines(BASELINES);
    mockPreferences(10);
    await renderBuilder();

    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

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
});
