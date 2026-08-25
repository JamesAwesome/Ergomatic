import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// Phase BL PR C — door 2 (canvas Experienced, Option T since James's
// 2026-08-23 feedback: typed entry replaced the 27-taps-per-field
// steppers). Every write is `manual` (this door means "the rower knows the
// number"), and the editor's own untouched-field discipline holds: seeds
// are display scaffolding, never a saved claim. All interactions here are
// REAL typing (user-event), never prop injection — the provenance pins are
// re-derived through the typed path.

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

const field = (name: "2k split" | "6k split") =>
  screen.getByRole("textbox", { name });

describe("KnowBaseline (door 2)", () => {
  // Honest-empty round: a rower arriving here has no baselines, so both
  // fields are EMPTY with the seed pair (the table's modal cell) as their
  // dim placeholders — the seed used to sit in the field as a value.
  it("renders the canvas heading and leaves both fields empty, the seed pair showing only as placeholders", async () => {
    mockReady();
    await renderKnow();
    expect(
      screen.getByRole("heading", { name: "Enter your splits" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tap a field and type the digits/),
    ).toBeInTheDocument();
    expect(field("2k split")).toHaveValue("");
    expect(field("2k split")).toHaveAttribute("placeholder", "2:25.0");
    expect(field("6k split")).toHaveValue("");
    expect(field("6k split")).toHaveAttribute("placeholder", "2:32.0");
  });

  // The one-control round: this door was typed-only, door 1's adjust step
  // was nudge-only. Both work on both now.
  it("the steppers reached this door: the first tap materialises the seed exactly and Save writes that number", async () => {
    const save = mockReady();
    await renderKnow();
    expect(
      screen.getByRole("button", { name: "Save baseline" }),
    ).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "2k slower" }));

    // 2:25.0 exactly — the placeholder's own number, not 2:25.5.
    expect(field("2k split")).toHaveValue("2:25.0");
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k2Seconds: 145,
      k2Source: "manual",
    });
  });

  it("a second stepper tap nudges from the materialised seed instead of re-materialising it", async () => {
    const save = mockReady();
    await renderKnow();
    await userEvent.click(screen.getByRole("button", { name: "6k faster" }));
    await userEvent.click(screen.getByRole("button", { name: "6k faster" }));
    expect(field("6k split")).toHaveValue("2:31.5");
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k6Seconds: 151.5,
      k6Source: "manual",
    });
  });

  // Settle-then-nudge, on the surface where a rower is most likely to do
  // it: type most of the number, then fine-tune with the stepper.
  it("a stepper tap mid-typing settles the typed digits first, then nudges from them", async () => {
    const save = mockReady();
    await renderKnow();
    await userEvent.type(field("2k split"), "158");
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));

    expect(field("2k split")).toHaveValue("1:57.5");
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k2Seconds: 117.5,
      k2Source: "manual",
    });
  });

  it("Save is disabled until a field is actually typed in — tapping Save must never write the untouched seeds", async () => {
    mockReady();
    await renderKnow();
    expect(
      screen.getByRole("button", { name: "Save baseline" }),
    ).toBeDisabled();
    await userEvent.type(field("2k split"), "158");
    expect(screen.getByRole("button", { name: "Save baseline" })).toBeEnabled();
  });

  it("saves ONLY the typed side, stamped manual, and lands on Today — the untouched side is never fabricated", async () => {
    const save = mockReady();
    await renderKnow();
    await userEvent.type(field("2k split"), "158");
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    // 158 typed digits-right-to-left = 1:58 = 118s whole seconds.
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k2Seconds: 118,
      k2Source: "manual",
    });
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("both sides typed saves both, each manual", async () => {
    const save = mockReady();
    await renderKnow();
    await userEvent.type(field("2k split"), "158");
    await userEvent.type(field("6k split"), "207");
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k2Seconds: 118,
      k2Source: "manual",
      k6Seconds: 127,
      k6Source: "manual",
    });
  });

  it("a partial pair prefills the known side with the SERVER value, and untouched it stays out of the body", async () => {
    const save = mockReady({ k2Seconds: null, k6Seconds: 130 });
    await renderKnow();
    // The rower's own 130 (2:10.0), not the seed 152 (2:32.0).
    expect(field("6k split")).toHaveValue("2:10.0");
    await userEvent.type(field("2k split"), "158");
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k2Seconds: 118,
      k2Source: "manual",
    });
  });

  it("a typed value that lands exactly on the server's sends nothing for it (ORIGIN rule) and still exits", async () => {
    const save = mockReady({ k2Seconds: 120, k6Seconds: 130 });
    await renderKnow();
    // Retyping the server's own 2:00 — touched, but the VALUE never
    // changed, so the body must stay empty (a resend would stamp `manual`
    // over whatever source the stored number honestly carries).
    await userEvent.type(field("2k split"), "200");
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
    await userEvent.type(field("2k split"), "158");
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    expect(
      await screen.findByText(/Couldn't save your baselines/),
    ).toBeInTheDocument();
    expect(screen.queryByText("TODAY SCREEN")).not.toBeInTheDocument();
  });

  it("the top-left back link returns to Today without writing", async () => {
    const save = mockReady();
    await renderKnow();
    await userEvent.click(screen.getByRole("link", { name: "← BACK" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText("TODAY SCREEN")).toBeInTheDocument();
  });

  // Review F2 (split-entry round): the removed bottom Back carried
  // `disabled={saving}`; the top back link keeps that parity as an inert
  // (aria-disabled) link — a mid-PUT escape would strand the save's error.
  it("the back link is inert while the save is in flight — no mid-PUT escape to Today", async () => {
    let resolveSave!: () => void;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    mockReady({ k2Seconds: null, k6Seconds: null }, save);
    await renderKnow();
    await userEvent.type(field("2k split"), "158");
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    expect(save).toHaveBeenCalledTimes(1);

    const back = screen.getByRole("link", { name: "← BACK" });
    expect(back).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(back);
    // The click navigated nowhere — still door 2, mid-save.
    expect(screen.queryByText("TODAY SCREEN")).not.toBeInTheDocument();

    resolveSave();
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
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

  it("the 6k field alone is a real input too (each side commits independently)", async () => {
    const save = mockReady();
    await renderKnow();
    await userEvent.type(field("6k split"), "215");
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k6Seconds: 135,
      k6Source: "manual",
    });
  });
});
