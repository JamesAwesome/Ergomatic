import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// Phase BL PR C — door 1 (canvas Question1/Question2/Recommendation):
// two transient single-select questions, then the table's recommended
// pair. Answers never persist and never ride the wire (the minimal-PII
// ruling) — the ONLY network write this flow can make is the baseline
// save itself, asserted on the mocked save below.

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

async function renderRecommend() {
  const { default: Recommend } = await import("./Recommend");
  return render(
    <MemoryRouter initialEntries={["/onboarding/recommend"]}>
      <Routes>
        <Route path="/onboarding/recommend" element={<Recommend />} />
        <Route path="/today" element={<p>TODAY SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../api/useBaselines");
});

/** Drives the two questions to the recommendation screen. */
async function answerBoth(
  experience = "A little. I know the stroke",
  cardio = "Active once or twice a week",
) {
  await userEvent.click(screen.getByRole("radio", { name: experience }));
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await userEvent.click(screen.getByRole("radio", { name: cardio }));
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
}

describe("Recommend (door 1)", () => {
  it("asks the experience question first, with Next disabled until an answer is chosen", async () => {
    mockReady();
    await renderRecommend();
    expect(
      screen.getByRole("heading", { name: "How much have you rowed?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await userEvent.click(
      screen.getByRole("radio", { name: "Never, or once or twice" }),
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("Back on the first question returns to Today", async () => {
    mockReady();
    await renderRecommend();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("asks the cardio question second; Back returns to the first with the answer kept", async () => {
    mockReady();
    await renderRecommend();
    await userEvent.click(
      screen.getByRole("radio", { name: "Regularly, on and off" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("heading", { name: "How is your cardio right now?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { name: "How much have you rowed?" }),
    ).toBeInTheDocument();
    // The earlier answer survives the round trip (transient STATE, not
    // transient WIDGET) — and Next is therefore immediately enabled.
    expect(
      screen.getByRole("radio", { name: "Regularly, on and off" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("recommends the table's own cell for the answered pair, both splits mono-formatted", async () => {
    mockReady();
    await renderRecommend();
    // a-little x 1-2-week = 145/152 (domain/estimateBaseline.ts, the
    // modal cell) -> 2:25.0 and 2:32.0.
    await answerBoth();
    expect(
      screen.getByRole("heading", { name: "Your starting baseline" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2:25.0")).toBeInTheDocument();
    expect(screen.getByText("2:32.0")).toBeInTheDocument();
    // The honesty chip (canvas Recommendation, verbatim).
    expect(
      screen.getByText(/A COMFORTABLE STARTING POINT/),
    ).toBeInTheDocument();
  });

  it("a different answer pair recommends that pair's own cell", async () => {
    mockReady();
    await renderRecommend();
    await answerBoth(
      "A lot. I have raced or trained",
      "Training hard and often",
    );
    // a-lot x training-hard = 130/137 -> 2:10.0 / 2:17.0.
    expect(screen.getByText("2:10.0")).toBeInTheDocument();
    expect(screen.getByText("2:17.0")).toBeInTheDocument();
  });

  it("Use this baseline writes BOTH numbers with `estimated` sources — and nothing else — then lands on Today", async () => {
    const save = mockReady();
    await renderRecommend();
    await answerBoth();
    await userEvent.click(
      screen.getByRole("button", { name: "Use this baseline" }),
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k2Seconds: 145,
      k2Source: "estimated",
      k6Seconds: 152,
      k6Source: "estimated",
    });
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("surfaces a save failure and stays on the recommendation", async () => {
    const save = vi.fn(async () => {
      throw new Error("failed to save baselines");
    });
    mockReady({ k2Seconds: null, k6Seconds: null }, save);
    await renderRecommend();
    await answerBoth();
    await userEvent.click(
      screen.getByRole("button", { name: "Use this baseline" }),
    );
    expect(
      await screen.findByText(/Couldn't save your baselines/),
    ).toBeInTheDocument();
    expect(screen.queryByText("TODAY SCREEN")).not.toBeInTheDocument();
  });

  // M8, binding: door 1 never overwrites silently. A number that already
  // exists server-side is shown AS the rower's own, and the accept writes
  // exactly the fields the rower saw offered — the missing side only.
  describe("an already-set number is never overwritten (M8)", () => {
    it("shows the rower's own 6k (not the table's) marked YOURS, and offers the estimate only for the missing 2k", async () => {
      mockReady({ k2Seconds: null, k6Seconds: 130 });
      await renderRecommend();
      await answerBoth();
      // The SERVER's 130 (2:10.0), never the cell's 152 (2:32.0).
      expect(screen.getByText("2:10.0")).toBeInTheDocument();
      expect(screen.queryByText("2:32.0")).not.toBeInTheDocument();
      expect(screen.getByText("6K BASELINE · YOURS")).toBeInTheDocument();
      // The missing 2k side still shows the cell's estimate.
      expect(screen.getByText("2:25.0")).toBeInTheDocument();
    });

    it("the accept writes ONLY the missing side, stamped estimated", async () => {
      const save = mockReady({ k2Seconds: null, k6Seconds: 130 });
      await renderRecommend();
      await answerBoth();
      await userEvent.click(
        screen.getByRole("button", { name: "Use this baseline" }),
      );
      expect(save).toHaveBeenCalledExactlyOnceWith({
        k2Seconds: 145,
        k2Source: "estimated",
      });
    });

    it("mirrored: an already-set 2k stays out of the body; only the 6k estimate is written", async () => {
      const save = mockReady({ k2Seconds: 120, k6Seconds: null });
      await renderRecommend();
      await answerBoth();
      expect(screen.getByText("2K BASELINE · YOURS")).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Use this baseline" }),
      );
      expect(save).toHaveBeenCalledExactlyOnceWith({
        k6Seconds: 152,
        k6Source: "estimated",
      });
    });
  });

  // "Adjust the numbers first" opens the editor prefilled with the
  // recommendation. THE PREFILL-PROVENANCE ANSWER (walked against the
  // ORIGIN ruling — provenance describes where the NUMBER came from):
  // an untouched-but-prefilled field still Applied writes `estimated`
  // (the number IS the table's; tapping Save is consent to write, not
  // authorship), while a field the rower moved writes `manual` — the
  // exact analogue of the editor's own DeriveSlot predicate
  // (offer-value -> derived, adjusted -> manual).
  describe("Adjust the numbers first", () => {
    it("opens the editor prefilled with both recommended values", async () => {
      mockReady();
      await renderRecommend();
      await answerBoth();
      await userEvent.click(
        screen.getByRole("button", { name: "Adjust the numbers first" }),
      );
      expect(
        screen.getByRole("heading", { name: "Adjust your starting baseline" }),
      ).toBeInTheDocument();
      expect(screen.getByText("2:25.0")).toBeInTheDocument();
      expect(screen.getByText("2:32.0")).toBeInTheDocument();
    });

    it("a nudged field saves manual; the untouched prefilled field saves estimated (ORIGIN rule)", async () => {
      const save = mockReady();
      await renderRecommend();
      await answerBoth();
      await userEvent.click(
        screen.getByRole("button", { name: "Adjust the numbers first" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Save baseline" }),
      );
      expect(save).toHaveBeenCalledExactlyOnceWith({
        k2Seconds: 144.5,
        k2Source: "manual",
        k6Seconds: 152,
        k6Source: "estimated",
      });
      expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    });

    it("nudged away and back to the estimate saves estimated — origin is the value's, not the act's", async () => {
      const save = mockReady();
      await renderRecommend();
      await answerBoth();
      await userEvent.click(
        screen.getByRole("button", { name: "Adjust the numbers first" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
      await userEvent.click(screen.getByRole("button", { name: "2k slower" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Save baseline" }),
      );
      expect(save).toHaveBeenCalledExactlyOnceWith({
        k2Seconds: 145,
        k2Source: "estimated",
        k6Seconds: 152,
        k6Source: "estimated",
      });
    });

    it("an already-set side prefils with the SERVER value and, untouched, stays out of the body (M8 holds here too)", async () => {
      const save = mockReady({ k2Seconds: null, k6Seconds: 130 });
      await renderRecommend();
      await answerBoth();
      await userEvent.click(
        screen.getByRole("button", { name: "Adjust the numbers first" }),
      );
      // Prefilled with the rower's own 130 (2:10.0), not the cell's 152.
      expect(screen.getByText("2:10.0")).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Save baseline" }),
      );
      expect(save).toHaveBeenCalledExactlyOnceWith({
        k2Seconds: 145,
        k2Source: "estimated",
      });
    });

    it("an already-set side the rower MOVES saves manual — a deliberate replacement, not an overwrite-by-default", async () => {
      const save = mockReady({ k2Seconds: null, k6Seconds: 130 });
      await renderRecommend();
      await answerBoth();
      await userEvent.click(
        screen.getByRole("button", { name: "Adjust the numbers first" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "6k slower" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Save baseline" }),
      );
      expect(save).toHaveBeenCalledExactlyOnceWith({
        k2Seconds: 145,
        k2Source: "estimated",
        k6Seconds: 130.5,
        k6Source: "manual",
      });
    });

    it("Back returns to the recommendation screen", async () => {
      mockReady();
      await renderRecommend();
      await answerBoth();
      await userEvent.click(
        screen.getByRole("button", { name: "Adjust the numbers first" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(
        screen.getByRole("heading", { name: "Your starting baseline" }),
      ).toBeInTheDocument();
    });
  });

  it("shows a loading state and an error state with retry, like every baselines consumer", async () => {
    const retry = vi.fn();
    mockState({ state: "error", retry });
    await renderRecommend();
    expect(
      screen.getByText(/Couldn't load your baselines/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retry).toHaveBeenCalled();
  });
});
