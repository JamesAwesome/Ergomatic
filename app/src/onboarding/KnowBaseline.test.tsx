import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// Phase BL PR C — door 2 (canvas Experienced): the editor's fields as an
// onboarding screen. Every write is `manual` (this door means "the rower
// knows the number"), and the editor's own untouched-field discipline
// holds: seeds are display scaffolding, never a saved claim.

function mockState(state: unknown) {
  vi.doMock("../api/useBaselines", () => ({ useBaselines: () => state }));
}

function mockReady(
  baselines: { k2Seconds: number | null; k6Seconds: number | null } = {
    k2Seconds: null,
    k6Seconds: null,
  },
  save = vi.fn(async () => {}),
) {
  mockState({ state: "ready", baselines, save });
  return save;
}

async function renderKnow() {
  const { default: KnowBaseline } = await import("./KnowBaseline");
  return render(
    <MemoryRouter initialEntries={["/onboarding/know"]}>
      <Routes>
        <Route path="/onboarding/know" element={<KnowBaseline />} />
        <Route path="/today" element={<p>TODAY SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../api/useBaselines");
});

describe("KnowBaseline (door 2)", () => {
  it("renders the canvas heading and both fields prefilled with the seed pair (the table's modal cell)", async () => {
    mockReady();
    await renderKnow();
    expect(
      screen.getByRole("heading", { name: "Enter your splits" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Average 500m splits from a recent 2k and 6k/),
    ).toBeInTheDocument();
    expect(screen.getByText("2:25.0")).toBeInTheDocument();
    expect(screen.getByText("2:32.0")).toBeInTheDocument();
  });

  it("Save is disabled until a field is actually entered — tapping Save must never write the untouched seeds", async () => {
    mockReady();
    await renderKnow();
    expect(
      screen.getByRole("button", { name: "Save baseline" }),
    ).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
    expect(screen.getByRole("button", { name: "Save baseline" })).toBeEnabled();
  });

  it("saves ONLY the entered side, stamped manual, and lands on Today — the untouched side is never fabricated", async () => {
    const save = mockReady();
    await renderKnow();
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k2Seconds: 144.5,
      k2Source: "manual",
    });
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("both sides entered saves both, each manual", async () => {
    const save = mockReady();
    await renderKnow();
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
    await userEvent.click(screen.getByRole("button", { name: "6k slower" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k2Seconds: 144.5,
      k2Source: "manual",
      k6Seconds: 152.5,
      k6Source: "manual",
    });
  });

  it("a partial pair prefills the known side with the SERVER value, and untouched it stays out of the body", async () => {
    const save = mockReady({ k2Seconds: null, k6Seconds: 130 });
    await renderKnow();
    // The rower's own 130 (2:10.0), not the seed 152 (2:32.0).
    expect(screen.getByText("2:10.0")).toBeInTheDocument();
    expect(screen.queryByText("2:32.0")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k2Seconds: 144.5,
      k2Source: "manual",
    });
  });

  it("a touched side whose value ends exactly at the server's sends nothing for it (ORIGIN rule) and still exits", async () => {
    const save = mockReady({ k2Seconds: 120, k6Seconds: 130 });
    await renderKnow();
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
    await userEvent.click(screen.getByRole("button", { name: "2k slower" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    expect(save).not.toHaveBeenCalled();
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("surfaces a save failure and stays put", async () => {
    const save = vi.fn(async () => {
      throw new Error("failed to save baselines");
    });
    mockReady({ k2Seconds: null, k6Seconds: null }, save);
    await renderKnow();
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    expect(
      await screen.findByText(/Couldn't save your baselines/),
    ).toBeInTheDocument();
    expect(screen.queryByText("TODAY SCREEN")).not.toBeInTheDocument();
  });

  it("Back returns to Today without writing", async () => {
    const save = mockReady();
    await renderKnow();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("shows loading and error states like every baselines consumer", async () => {
    mockState({ state: "loading" });
    await renderKnow();
    expect(screen.getByText("LOADING…")).toBeInTheDocument();
    cleanup();
    vi.resetModules();

    const retry = vi.fn();
    mockState({ state: "error", retry });
    await renderKnow();
    expect(
      screen.getByText(/Couldn't load your baselines/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retry).toHaveBeenCalled();
  });

  it("the 6k faster stepper works too (both directions per field are real inputs)", async () => {
    const save = mockReady();
    await renderKnow();
    await userEvent.click(screen.getByRole("button", { name: "6k faster" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k6Seconds: 151.5,
      k6Source: "manual",
    });
  });
});
