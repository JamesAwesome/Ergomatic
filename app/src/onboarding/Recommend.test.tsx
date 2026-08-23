import { cleanup, render, screen } from "@testing-library/react";
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

  it("the top-left back link on the first question returns to Today", async () => {
    mockReady();
    await renderRecommend();
    await userEvent.click(screen.getByRole("link", { name: "← BACK" }));
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

    await userEvent.click(screen.getByRole("button", { name: "← BACK" }));
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
    it("shows the rower's own 6k (not the table's) marked YOURS, and the missing 2k as a derivation from it", async () => {
      mockReady({ k2Seconds: null, k6Seconds: 130 });
      await renderRecommend();
      await answerBoth();
      // The SERVER's 130 (2:10.0), never the cell's 152 (2:32.0).
      expect(screen.getByText("2:10.0")).toBeInTheDocument();
      expect(screen.queryByText("2:32.0")).not.toBeInTheDocument();
      expect(screen.getByText("6K BASELINE · YOURS")).toBeInTheDocument();
      // F1: the missing 2k shows 130 - 7 = 123 (2:03.0), labeled as the
      // derivation it is — never the table's cell.
      expect(screen.getByText("2:03.0")).toBeInTheDocument();
      expect(
        screen.getByText("2K BASELINE · FROM YOUR 6K (−7s)"),
      ).toBeInTheDocument();
    });

    // F1, James's ruling (triad review, 2026-08-23): beside an EXISTING
    // number, the missing side fills FROM THAT NUMBER via the shipped
    // derivation (±K2_K6_OFFSET_SECONDS), written `derived` — the
    // rower's own number is better evidence than two survey answers,
    // and the pair is consistent by construction. The table only fills
    // the both-missing case.
    it("F1 RULING: stored k6=130, questionnaire answered -> the accept writes k2=123 `derived` (from the rower's own 6k), never the table's cell", async () => {
      const save = mockReady({ k2Seconds: null, k6Seconds: 130 });
      await renderRecommend();
      await answerBoth();
      // The offer screen shows the DERIVED value for the missing side
      // (130 - 7 = 123 = 2:03.0), labeled in the DeriveSlot vocabulary
      // so the rower sees what they are consenting to.
      expect(screen.getByText("2:03.0")).toBeInTheDocument();
      expect(
        screen.getByText("2K BASELINE · FROM YOUR 6K (−7s)"),
      ).toBeInTheDocument();
      // The table's cell for this answer pair (145 = 2:25.0) is NOT shown.
      expect(screen.queryByText("2:25.0")).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Use this baseline" }),
      );
      expect(save).toHaveBeenCalledExactlyOnceWith({
        k2Seconds: 123,
        k2Source: "derived",
      });
    });

    it("the accept's body carries NO key for the existing side at all (M8's wire shape)", async () => {
      const save = mockReady({ k2Seconds: null, k6Seconds: 130 });
      await renderRecommend();
      await answerBoth();
      await userEvent.click(
        screen.getByRole("button", { name: "Use this baseline" }),
      );
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).not.toHaveBeenCalledWith(
        expect.objectContaining({ k6Seconds: expect.anything() }),
      );
      expect(save).not.toHaveBeenCalledWith(
        expect.objectContaining({ k6Source: expect.anything() }),
      );
    });

    it("mirrored: an already-set 2k stays out of the body; the 6k fills as 2k + 7 = 127, `derived` (F1)", async () => {
      const save = mockReady({ k2Seconds: 120, k6Seconds: null });
      await renderRecommend();
      await answerBoth();
      expect(screen.getByText("2K BASELINE · YOURS")).toBeInTheDocument();
      expect(
        screen.getByText("6K BASELINE · FROM YOUR 2K (+7s)"),
      ).toBeInTheDocument();
      // 120 + 7 = 127 = 2:07.0.
      expect(screen.getByText("2:07.0")).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Use this baseline" }),
      );
      expect(save).toHaveBeenCalledExactlyOnceWith({
        k6Seconds: 127,
        k6Source: "derived",
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

    it("an already-set side prefils with the SERVER value and, untouched, stays out of the body; the missing side saves its derived fill (M8 + F1)", async () => {
      const save = mockReady({ k2Seconds: null, k6Seconds: 130 });
      await renderRecommend();
      await answerBoth();
      await userEvent.click(
        screen.getByRole("button", { name: "Adjust the numbers first" }),
      );
      // Prefilled with the rower's own 130 (2:10.0) and the derived 123
      // (2:03.0) — never the cell's numbers.
      expect(screen.getByText("2:10.0")).toBeInTheDocument();
      expect(screen.getByText("2:03.0")).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Save baseline" }),
      );
      expect(save).toHaveBeenCalledExactlyOnceWith({
        k2Seconds: 123,
        k2Source: "derived",
      });
    });

    it("adjust: a derived fill nudged away and back saves `derived` still — the fill's own value-identity predicate", async () => {
      const save = mockReady({ k2Seconds: null, k6Seconds: 130 });
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
        k2Seconds: 123,
        k2Source: "derived",
      });
    });

    it("adjust: a derived fill the rower MOVES saves manual — the number is theirs now", async () => {
      const save = mockReady({ k2Seconds: null, k6Seconds: 130 });
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
        k2Seconds: 122.5,
        k2Source: "manual",
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
      // The moved 6k saves manual; the untouched 2k still saves its
      // derived fill (derived from the STORED 130, the number the fill
      // was offered from).
      expect(save).toHaveBeenCalledExactlyOnceWith({
        k2Seconds: 123,
        k2Source: "derived",
        k6Seconds: 130.5,
        k6Source: "manual",
      });
    });

    it("falls back to the table cell (`estimated`) when the derivation would leave the storable band", async () => {
      // A stored 6k of 62s/500m derives k2 = 55 < MIN_SPLIT — the You
      // editor accepts the full band, so this state is storable even
      // though this flow never writes it. The fill degrades to the
      // table's cell, honestly re-tagged.
      const save = mockReady({ k2Seconds: null, k6Seconds: 62 });
      await renderRecommend();
      await answerBoth();
      expect(screen.getByText("2:25.0")).toBeInTheDocument();
      expect(screen.queryByText(/FROM YOUR 6K/)).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Use this baseline" }),
      );
      expect(save).toHaveBeenCalledExactlyOnceWith({
        k2Seconds: 145,
        k2Source: "estimated",
      });
    });

    it("the top-left back returns to the recommendation screen", async () => {
      mockReady();
      await renderRecommend();
      await answerBoth();
      await userEvent.click(
        screen.getByRole("button", { name: "Adjust the numbers first" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "← BACK" }));
      expect(
        screen.getByRole("heading", { name: "Your starting baseline" }),
      ).toBeInTheDocument();
    });

    // New with the back-at-top convention round (2026-08-23): the offer
    // screen used to have NO Back at all — its only exits were accept or
    // adjust. The top-left back returns to the cardio question with both
    // answers kept (the same transient-STATE round trip Q2 -> Q1 pins).
    it("the offer screen's top-left back returns to the cardio question with the answer kept", async () => {
      mockReady();
      await renderRecommend();
      await answerBoth();
      await userEvent.click(screen.getByRole("button", { name: "← BACK" }));
      expect(
        screen.getByRole("heading", { name: "How is your cardio right now?" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "Active once or twice a week" }),
      ).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    });
  });

  // Review F2 (split-entry round): the removed bottom Backs carried
  // `disabled={saving}`; the top back controls keep that parity. A mid-PUT
  // escape would strand the save's error on a step that can't render it.
  it("the offer screen's BACK is disabled while the save is in flight — no mid-PUT escape", async () => {
    let resolveSave!: () => void;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    mockReady({ k2Seconds: null, k6Seconds: null }, save);
    await renderRecommend();
    await answerBoth();
    await userEvent.click(
      screen.getByRole("button", { name: "Use this baseline" }),
    );
    expect(save).toHaveBeenCalledTimes(1);

    const back = screen.getByRole("button", { name: "← BACK" });
    expect(back).toBeDisabled();
    await userEvent.click(back);
    // Still the offer screen — the click went nowhere.
    expect(
      screen.getByRole("heading", { name: "Your starting baseline" }),
    ).toBeInTheDocument();

    resolveSave();
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("the adjust step's BACK is disabled while the save is in flight", async () => {
    let resolveSave!: () => void;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    mockReady({ k2Seconds: null, k6Seconds: null }, save);
    await renderRecommend();
    await answerBoth();
    await userEvent.click(
      screen.getByRole("button", { name: "Adjust the numbers first" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    expect(save).toHaveBeenCalledTimes(1);

    const back = screen.getByRole("button", { name: "← BACK" });
    expect(back).toBeDisabled();
    await userEvent.click(back);
    expect(
      screen.getByRole("heading", { name: "Adjust your starting baseline" }),
    ).toBeInTheDocument();

    resolveSave();
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("both numbers already set (a raced device / stale deep link): accept writes NOTHING and simply leaves", async () => {
    const save = mockReady({ k2Seconds: 120, k6Seconds: 130 });
    await renderRecommend();
    await answerBoth();
    // Both shown as the rower's own.
    expect(screen.getByText("2K BASELINE · YOURS")).toBeInTheDocument();
    expect(screen.getByText("6K BASELINE · YOURS")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Use this baseline" }),
    );
    expect(save).not.toHaveBeenCalled();
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("adjust: a server-set 2k the rower moves saves manual too (the per-field predicate is symmetric)", async () => {
    const save = mockReady({ k2Seconds: 120, k6Seconds: null });
    await renderRecommend();
    await answerBoth();
    await userEvent.click(
      screen.getByRole("button", { name: "Adjust the numbers first" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "2k slower" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    // The untouched missing 6k saves its F1 fill: derived from the
    // STORED 120 (the offer the rower saw), even though the 2k moved
    // afterward.
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k2Seconds: 120.5,
      k2Source: "manual",
      k6Seconds: 127,
      k6Source: "derived",
    });
  });

  it("adjust: a save failure surfaces on the adjust screen and stays put", async () => {
    const save = vi.fn(async () => {
      throw new Error("failed to save baselines");
    });
    mockReady({ k2Seconds: null, k6Seconds: null }, save);
    await renderRecommend();
    await answerBoth();
    await userEvent.click(
      screen.getByRole("button", { name: "Adjust the numbers first" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save baseline" }),
    );
    expect(
      await screen.findByText(/Couldn't save your baselines/),
    ).toBeInTheDocument();
    expect(screen.queryByText("TODAY SCREEN")).not.toBeInTheDocument();
  });

  it("shows a loading state and an error state with retry, like every baselines consumer", async () => {
    mockState({ state: "loading" });
    await renderRecommend();
    expect(screen.getByText("LOADING…")).toBeInTheDocument();
    cleanup();
    vi.resetModules();

    const retry = vi.fn();
    mockState({ state: "error", retry });
    await renderRecommend();
    expect(
      screen.getByText(/Couldn't load your baselines/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retry).toHaveBeenCalled();
  });

  it("the adjust step's 6k steppers both work (faster then slower nets back to the estimate — still estimated)", async () => {
    const save = mockReady();
    await renderRecommend();
    await answerBoth();
    await userEvent.click(
      screen.getByRole("button", { name: "Adjust the numbers first" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "6k faster" }));
    await userEvent.click(screen.getByRole("button", { name: "6k slower" }));
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
});
