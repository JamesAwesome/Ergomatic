import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

function mockBaselines(baselines: {
  k2Seconds: number | null;
  k6Seconds: number | null;
}) {
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines }),
  }));
}

function mockApi(handler: () => Response) {
  const fn = vi.fn(async () => handler());
  vi.doMock("../api", () => ({ api: fn }));
  return fn;
}

async function renderBuilder() {
  const { default: Builder } = await import("./Builder");
  render(
    <MemoryRouter>
      <Builder />
    </MemoryRouter>,
  );
}

// Fills in every field required for `toSteps` to succeed: num, title, pain,
// and one work row's duration + pace ref. Shared by the save-success and
// 409-conflict tests so both start from an identically valid form.
async function fillValidForm() {
  await userEvent.type(screen.getByLabelText("Workout number"), "12");
  await userEvent.type(screen.getByLabelText("Title"), "Ladder Sets");
  await userEvent.click(screen.getByRole("radio", { name: "Pain 3" }));
  await userEvent.type(screen.getByPlaceholderText("5' or 2500m"), "5'");
  await userEvent.type(screen.getByPlaceholderText("2k / 6k-2"), "6k-2");
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
    await userEvent.type(screen.getByPlaceholderText("2k / 6k-2"), "6k-2");

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
        num: 12,
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

  it("maps a 409 to 'that number's taken' and leaves the entered values on screen", async () => {
    const api = mockApi(
      () =>
        new Response(JSON.stringify({ error: "num taken" }), { status: 409 }),
    );
    mockBaselines(BASELINES);
    await renderBuilder();

    await fillValidForm();
    await userEvent.click(
      screen.getByRole("button", { name: "Save to library" }),
    );

    expect(await screen.findByText(/that number's taken/)).toBeInTheDocument();
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
});
