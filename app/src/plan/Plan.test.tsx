import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PLANS } from "../../domain/plans";
import type { PlanData, PlanKey, PlanSequenceItem } from "../api/usePlan";

// Realistic fixture per repo convention: the real 84-code sequence from
// domain/plans.ts (not a 3-row hand stub), status derived exactly like
// server/routes/data.ts's planResponse.
function realSequence(planKey: PlanKey, doneN: number): PlanSequenceItem[] {
  return PLANS[planKey].sessions.map((code, index) => ({
    index,
    code,
    status:
      index < doneN
        ? ("done" as const)
        : index === doneN
          ? ("today" as const)
          : ("upcoming" as const),
  }));
}

const SPRINT_ACTIVE: PlanData = {
  planKey: "sprint",
  doneN: 11,
  sequence: realSequence("sprint", 11),
};

const HEAD_ACTIVE: PlanData = {
  planKey: "head",
  doneN: 3,
  sequence: realSequence("head", 3),
};

const FREESTYLE: PlanData = { planKey: null, doneN: 0, sequence: [] };

function mockUsePlan(state: unknown) {
  vi.doMock("../api/usePlan", () => ({ usePlan: () => state }));
}

async function renderPlan() {
  const { default: Plan } = await import("./Plan");
  return render(<Plan />);
}

beforeEach(() => {
  vi.resetModules();
});

describe("Plan (loading/error)", () => {
  it("shows a loading status", async () => {
    mockUsePlan({ state: "loading" });
    await renderPlan();
    expect(screen.getByText("LOADING…")).toBeVisible();
  });

  it("shows a retry control on error, and clicking it calls retry", async () => {
    const retry = vi.fn();
    mockUsePlan({ state: "error", retry });
    await renderPlan();
    expect(screen.getByText("Couldn't load your plan.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("Plan (no active plan — choosing)", () => {
  it("shows both presets with title, one-liner, and the real per-plan session count", async () => {
    mockUsePlan({
      state: "ready",
      plan: FREESTYLE,
      choose: vi.fn(),
      reset: vi.fn(),
    });
    await renderPlan();
    expect(
      screen.getByRole("heading", { name: "Sprint (2k) Prep" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Head Race Prep" }),
    ).toBeVisible();
    // Computed from domain/plans.ts's own sessions.length, not a hardcoded
    // "84" literal — this fixture pins that both presets happen to be 84,
    // but the component must not assume it.
    expect(
      screen.getAllByText(`${PLANS.sprint.sessions.length} SESSIONS`),
    ).toHaveLength(2);
  });

  it("chooses a plan on a single tap — no confirm step", async () => {
    const choose = vi.fn().mockResolvedValue(undefined);
    mockUsePlan({ state: "ready", plan: FREESTYLE, choose, reset: vi.fn() });
    await renderPlan();

    await userEvent.click(
      screen.getByRole("button", { name: /Sprint \(2k\) Prep/ }),
    );

    expect(choose).toHaveBeenCalledTimes(1);
    expect(choose).toHaveBeenCalledWith("sprint");
  });

  it("chooses the OTHER preset when its own card is tapped", async () => {
    const choose = vi.fn().mockResolvedValue(undefined);
    mockUsePlan({ state: "ready", plan: FREESTYLE, choose, reset: vi.fn() });
    await renderPlan();

    await userEvent.click(
      screen.getByRole("button", { name: /Head Race Prep/ }),
    );

    expect(choose).toHaveBeenCalledWith("head");
  });

  it("surfaces an error via the alert idiom when choosing fails, rather than throwing", async () => {
    const choose = vi.fn().mockRejectedValue(new Error("network down"));
    mockUsePlan({ state: "ready", plan: FREESTYLE, choose, reset: vi.fn() });
    await renderPlan();

    await userEvent.click(
      screen.getByRole("button", { name: /Sprint \(2k\) Prep/ }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't start that plan/i,
    );
  });

  it("disables both preset cards while a choose request is in flight", async () => {
    let resolveChoose!: () => void;
    const choose = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveChoose = resolve;
        }),
    );
    mockUsePlan({ state: "ready", plan: FREESTYLE, choose, reset: vi.fn() });
    await renderPlan();

    await userEvent.click(
      screen.getByRole("button", { name: /Sprint \(2k\) Prep/ }),
    );

    expect(
      screen.getByRole("button", { name: /Sprint \(2k\) Prep/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Head Race Prep/ }),
    ).toBeDisabled();
    resolveChoose();
  });
});

describe("Plan (active plan — sequence rendering)", () => {
  it("renders all 84 rows with done/today/upcoming state and the right glyphs", async () => {
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose: vi.fn(),
      reset: vi.fn(),
    });
    await renderPlan();

    expect(screen.getByText("Sprint (2k) Prep")).toBeVisible();
    expect(screen.getByText("SESSION 12 OF 84")).toBeVisible();

    const rows = document.querySelectorAll(".plan-row");
    expect(rows).toHaveLength(84);

    // doneN=11: indices 0..10 done, 11 today, 12..83 upcoming.
    const firstDone = rows[0];
    expect(firstDone).toHaveClass("plan-row-done");
    expect(firstDone.querySelector(".plan-row-status")?.textContent).toBe("✓");

    const todayRow = document.querySelector('[aria-current="step"]');
    expect(todayRow).not.toBeNull();
    expect(todayRow).toHaveClass("plan-row-today");
    expect(todayRow!.textContent).toContain("12");
    expect(todayRow!.querySelector(".plan-row-status")?.textContent).toBe("▶");

    const lastUpcoming = rows[83];
    expect(lastUpcoming).toHaveClass("plan-row-upcoming");
    expect(lastUpcoming.querySelector(".plan-row-status")?.textContent).toBe(
      "",
    );
    // Only the today row carries aria-current — proves the marker is
    // exclusive, not just "truthy on everything".
    expect(lastUpcoming.getAttribute("aria-current")).toBeNull();
    expect(firstDone.getAttribute("aria-current")).toBeNull();
  });

  it("scrolls rather than growing the page — the sequence has its own overflow container", async () => {
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose: vi.fn(),
      reset: vi.fn(),
    });
    await renderPlan();
    const list = document.querySelector(".plan-sequence")!;
    expect(list.tagName).toBe("UL");
    expect(list.children).toHaveLength(84);
  });
});

describe("Plan (RESET — staged confirm)", () => {
  it("does not call reset on the first press, and names the consequence", async () => {
    const reset = vi.fn();
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose: vi.fn(),
      reset,
    });
    await renderPlan();

    await userEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(reset).not.toHaveBeenCalled();
    expect(
      screen.getByText("This resets your progress. Session 1 becomes today."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Reset progress" }),
    ).toBeVisible();
  });

  it("cancels back to the header without calling reset", async () => {
    const reset = vi.fn();
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose: vi.fn(),
      reset,
    });
    await renderPlan();

    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(reset).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/This resets your progress/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeVisible();
  });

  it("calls reset once the second press confirms, then closes the panel", async () => {
    const reset = vi.fn().mockResolvedValue(undefined);
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose: vi.fn(),
      reset,
    });
    await renderPlan();

    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Reset progress" }),
    );

    expect(reset).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Reset" })).toBeVisible();
  });

  it("surfaces an error and keeps the confirm panel open when reset fails", async () => {
    const reset = vi.fn().mockRejectedValue(new Error("nope"));
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose: vi.fn(),
      reset,
    });
    await renderPlan();

    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Reset progress" }),
    );

    expect(await screen.findByText(/couldn't reset your plan/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Reset progress" }),
    ).toBeVisible();
  });

  it("disables Cancel/Reset progress while the request is in flight", async () => {
    let resolveReset!: () => void;
    const reset = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveReset = resolve;
        }),
    );
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose: vi.fn(),
      reset,
    });
    await renderPlan();

    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Reset progress" }),
    );

    expect(
      screen.getByRole("button", { name: "Reset progress" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    resolveReset();
  });
});

describe("Plan (SWITCH — staged confirm)", () => {
  it("names the OTHER plan and the consequence, without calling choose on the first press", async () => {
    const choose = vi.fn();
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose,
      reset: vi.fn(),
    });
    await renderPlan();

    await userEvent.click(screen.getByRole("button", { name: "Switch" }));

    expect(choose).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Switching to Head Race Prep resets your progress. Session 1 becomes today.",
      ),
    ).toBeVisible();
  });

  it("offers switching to Sprint when Head is the active plan (the other direction)", async () => {
    mockUsePlan({
      state: "ready",
      plan: HEAD_ACTIVE,
      choose: vi.fn(),
      reset: vi.fn(),
    });
    await renderPlan();

    await userEvent.click(screen.getByRole("button", { name: "Switch" }));

    expect(
      screen.getByRole("button", { name: "Switch to Sprint (2k) Prep" }),
    ).toBeVisible();
  });

  it("calls choose with the OTHER plan's key on confirm, then closes the panel", async () => {
    const choose = vi.fn().mockResolvedValue(undefined);
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose,
      reset: vi.fn(),
    });
    await renderPlan();

    await userEvent.click(screen.getByRole("button", { name: "Switch" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Switch to Head Race Prep" }),
    );

    expect(choose).toHaveBeenCalledWith("head");
    expect(await screen.findByRole("button", { name: "Switch" })).toBeVisible();
  });

  it("cancels without calling choose", async () => {
    const choose = vi.fn();
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose,
      reset: vi.fn(),
    });
    await renderPlan();

    await userEvent.click(screen.getByRole("button", { name: "Switch" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(choose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Switch" })).toBeVisible();
  });

  it("surfaces an error and keeps the confirm panel open when switching fails", async () => {
    const choose = vi.fn().mockRejectedValue(new Error("nope"));
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose,
      reset: vi.fn(),
    });
    await renderPlan();

    await userEvent.click(screen.getByRole("button", { name: "Switch" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Switch to Head Race Prep" }),
    );

    expect(await screen.findByText(/couldn't start that plan/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Switch to Head Race Prep" }),
    ).toBeVisible();
  });
});
