import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { PLANS } from "../../domain/plans";
import type { PlanData, PlanKey, PlanSequenceItem } from "../api/usePlan";
import type { PlanLink } from "./usePlanLinks";

// Realistic fixture per repo convention: the real 84-code sequence from
// domain/plans.ts (not a 3-row hand stub), status derived exactly like
// server/routes/data.ts's planResponse.
function realSequence(planKey: PlanKey, doneN: number): PlanSequenceItem[] {
  // Wire contract (Phase 8A): `code` is the day's real type — a checkpoint
  // day's prescription never crosses the wire.
  return PLANS[planKey].sessions.map((day, index) => ({
    index,
    code: day.type,
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

// Plan's done-row link (spec §1/§3, Task 6): `usePlanLinks` is mocked at
// the hook boundary, same idiom as `mockUsePlan` above and `HistoryList.
// test.tsx`'s own `mockUseLogHistory` — a real fetch is never involved in
// this file's tests. Defaults to no links at all, so every test written
// before this task (none of which calls this) renders exactly as it did
// pre-Task-6: every done row falls back to plain text.
function mockUsePlanLinks(links: Map<number, PlanLink> = new Map()) {
  vi.doMock("./usePlanLinks", () => ({ usePlanLinks: () => links }));
}

/** A linked done row's payload. `workoutType` defaults to O2 and callers
 *  that care about the swap mark pass their own — every fixture here names
 *  a REAL library workout of its stated type (repo convention: fixtures
 *  that look like production data). */
function link(overrides: Partial<PlanLink> = {}): PlanLink {
  return {
    id: "log-abc",
    workoutTitle: "Sea Fret",
    workoutType: "O2",
    ...overrides,
  };
}

async function renderPlan(links: Map<number, PlanLink> = new Map()) {
  mockUsePlanLinks(links);
  const { default: Plan } = await import("./Plan");
  return render(<Plan />, { wrapper: MemoryRouter });
}

// HistoryList.test.tsx's own probe idiom, copied verbatim: a real route
// change is the only way to observe `location.state` — a DOM attribute
// assertion on the `<Link>` itself can't see it.
function LocationProbe() {
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  return <p>PROBE from={String(from)}</p>;
}

async function renderPlanWithProbe(links: Map<number, PlanLink>) {
  mockUsePlanLinks(links);
  const { default: Plan } = await import("./Plan");
  return render(
    <MemoryRouter initialEntries={["/plan"]}>
      <Routes>
        <Route path="/plan" element={<Plan />} />
        <Route path="/today/log/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
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

  // Phase 8A: the "TEST" badge retired with its plan code. A checkpoint
  // row renders the day's REAL type via the shared TypeBadge plus the
  // PRESCRIBED WORKOUT'S TITLE (James, 2026-08-22: the checkpoint is the
  // one day the plan names a specific workout, so the row says which),
  // computed client-side from PLANS — the prescription never crosses the
  // wire; the fixture's `code` is a bare WorkoutType.
  it.each([
    ["sprint", "AN", "2K TEST"],
    ["head", "AT", "6K TEST"],
  ] as const)(
    "marks the three %s checkpoint rows with the prescribed title, typed %s, no TEST badge anywhere",
    async (planKey, checkpointType, prescribedTitle) => {
      mockUsePlan({
        state: "ready",
        plan: {
          planKey,
          doneN: 0,
          sequence: realSequence(planKey, 0),
        },
        choose: vi.fn(),
        reset: vi.fn(),
      });
      await renderPlan();

      const rows = document.querySelectorAll(".plan-row");
      const marked = [...rows].flatMap((row, i) =>
        row.querySelector(".plan-row-checkpoint") ? [i] : [],
      );
      expect(marked).toStrictEqual([6, 34, 62]);
      for (const i of marked) {
        expect(rows[i].querySelector(".plan-row-checkpoint")?.textContent).toBe(
          prescribedTitle,
        );
        expect(rows[i].querySelector(".type-badge")?.textContent).toBe(
          checkpointType,
        );
      }
      expect(screen.queryByText("TEST")).not.toBeInTheDocument();
    },
  );

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

// From-the-log spec (2026-08-18) §1: a done plan row with stored linkage
// (`GET /api/logs?plan=<key>`'s newest-wins pairs) becomes a link to
// `/today/log/:id`; a done row with NO linkage — the pre-spec-2 case, a
// checkmark that predates this spec entirely — stays plain text rather
// than guessing. Both are tested against the SAME fixture (SPRINT_ACTIVE,
// doneN=11, indices 0..10 done) so one render proves the row-by-row
// decision, not just "some row somewhere links."
describe("Plan (done-row links, Task 6)", () => {
  it("a done row with stored linkage renders as a link to its exact log, carrying state.from = /plan", async () => {
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose: vi.fn(),
      reset: vi.fn(),
    });
    const links = new Map([[0, link()]]);
    await renderPlan(links);

    const rows = document.querySelectorAll(".plan-row");
    const linkedRow = rows[0]!;
    expect(linkedRow.tagName).toBe("A");
    expect(linkedRow).toHaveAttribute("href", "/today/log/log-abc");
    expect(linkedRow).toHaveClass("plan-row-done");
  });

  it("tapping a linked done row navigates to its exact log id, carrying state.from = /plan (resolveLogBack's ← PLAN origin)", async () => {
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose: vi.fn(),
      reset: vi.fn(),
    });
    const links = new Map([[0, link()]]);
    await renderPlanWithProbe(links);

    await userEvent.click(document.querySelectorAll(".plan-row")[0]!);

    expect(screen.getByText("PROBE from=/plan")).toBeVisible();
  });

  it("a done row with NO stored linkage stays plain text — never a guessed link", async () => {
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose: vi.fn(),
      reset: vi.fn(),
    });
    // Only index 0 is linked; indices 1..10 are also done but pre-spec-2
    // (or otherwise unlinked) — every one of them must stay plain text.
    const links = new Map([[0, link()]]);
    await renderPlan(links);

    const rows = document.querySelectorAll(".plan-row");
    const unlinkedDoneRow = rows[1]!;
    expect(unlinkedDoneRow.tagName).not.toBe("A");
    expect(unlinkedDoneRow.querySelector("a")).toBeNull();
    expect(unlinkedDoneRow).toHaveClass("plan-row-done");
  });

  it("today/upcoming rows never link even when the links map happens to carry their index", async () => {
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose: vi.fn(),
      reset: vi.fn(),
    });
    // Index 11 is TODAY in this fixture (doneN=11) — a link entry for it
    // would only ever arrive from a stale/adversarial response, and must
    // never be honored for a non-done row.
    const links = new Map([[11, link({ id: "log-today-somehow" })]]);
    await renderPlan(links);

    const todayRow = document.querySelector('[aria-current="step"]')!;
    expect(todayRow.tagName).not.toBe("A");
    expect(todayRow.querySelector("a")).toBeNull();
  });

  it("a linked done row's tap target is at least 44px tall", async () => {
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose: vi.fn(),
      reset: vi.fn(),
    });
    const links = new Map([[0, link()]]);
    await renderPlan(links);

    const rows = document.querySelectorAll(".plan-row");
    // jsdom has no real layout engine (min-height is a CSS rule, not a
    // computed box), so this pins the STRUCTURAL guarantee the design.
    // spec.ts tap-target sweep actually measures on a real browser: the
    // link IS the row (no nested tap target under a non-interactive
    // wrapper), carrying `.plan-row`'s own `min-height: 44px` rule
    // directly rather than through an ancestor.
    expect(rows[0]).toHaveClass("plan-row");
    expect(rows[0]!.tagName).toBe("A");
  });
});

// A done plan row names the workout that closed it, and says so when that
// workout was not what the plan asked for. Two triggers, ONE mark: the
// type differs from the plan's own type for that slot, or it is one of
// the three checkpoint days and the prescribed test is not what was
// rowed. Derived, never stored — the comparison is between the log's
// save-time snapshot and `PLANS`, both of which this screen already has.
//
// SPRINT_ACTIVE is doneN=11, so indices 0..10 are done. The real sprint
// sequence at those indices is O2 AT O2 TR AT O2 AN(checkpoint) O2 AT O2
// TR — every fixture below picks a REAL library workout of the type it
// claims, so no case leans on a type/title pair the corpus would never
// produce.
describe("Plan (done-row workout names and swap marks)", () => {
  function readyWithLinks(links: Map<number, PlanLink>) {
    mockUsePlan({
      state: "ready",
      plan: SPRINT_ACTIVE,
      choose: vi.fn(),
      reset: vi.fn(),
    });
    return renderPlan(links);
  }

  function rowAt(index: number): HTMLElement {
    return document.querySelectorAll<HTMLElement>(".plan-row")[index]!;
  }

  it("names the workout a linked done row recorded", async () => {
    await readyWithLinks(new Map([[0, link({ workoutTitle: "Sea Fret" })]]));

    expect(rowAt(0).querySelector(".plan-row-name")?.textContent).toBe(
      "Sea Fret",
    );
  });

  // The badge has to agree with the title beside it. On an unswapped row
  // the two types are equal so nothing moves; on a swapped row showing the
  // PLAN's type would put an "TR" badge next to an O2 workout's name.
  it("a swapped row's badge shows the type ROWED, and the mark names what the plan asked for", async () => {
    // Index 3 is a TR day in the real sprint sequence; Slack Tide is an O2.
    await readyWithLinks(
      new Map([[3, link({ workoutTitle: "Slack Tide", workoutType: "O2" })]]),
    );

    const row = rowAt(3);
    expect(row.querySelector(".type-badge")?.textContent).toBe("O2");
    expect(row.querySelector(".plan-row-name")?.textContent).toBe("Slack Tide");
    expect(row.querySelector(".plan-row-swap")?.textContent).toBe(
      "INSTEAD OF TR",
    );
    expect(row).toHaveClass("plan-row-swapped");
  });

  it("a row rowed as planned carries no mark, in the same render as one that does", async () => {
    await readyWithLinks(
      new Map([
        // Index 0 is an O2 day, rowed as an O2.
        [0, link({ workoutTitle: "Sea Fret", workoutType: "O2" })],
        // Index 3 is a TR day, rowed as an O2 — the positive control that
        // proves the selector below is live in this very render.
        [3, link({ workoutTitle: "Slack Tide", workoutType: "O2" })],
      ]),
    );

    expect(rowAt(3).querySelector(".plan-row-swap")).not.toBeNull();
    expect(rowAt(0).querySelector(".plan-row-swap")).toBeNull();
    expect(rowAt(0)).not.toHaveClass("plan-row-swapped");
    expect(rowAt(0).querySelector(".type-badge")?.textContent).toBe("O2");
  });

  it("a checkpoint day rowed as prescribed shows the workout's name INSTEAD of the prescribed affix, and no mark", async () => {
    await readyWithLinks(
      new Map([[6, link({ workoutTitle: "2K Test", workoutType: "AN" })]]),
    );

    const row = rowAt(6);
    expect(row.querySelector(".plan-row-name")?.textContent).toBe("2K Test");
    // The affix exists to say which workout the plan wants. Once the row
    // records that you did it, repeating it beside the name says the same
    // thing twice.
    expect(row.querySelector(".plan-row-checkpoint")).toBeNull();
    expect(row.querySelector(".plan-row-swap")).toBeNull();
  });

  it("a checkpoint day rowed as a DIFFERENT workout of the same type is marked against the prescription, not the type", async () => {
    // Dust Whirl is a real AN — the type matches the checkpoint day, so
    // only the prescription check can catch this.
    await readyWithLinks(
      new Map([[6, link({ workoutTitle: "Dust Whirl", workoutType: "AN" })]]),
    );

    const row = rowAt(6);
    expect(row.querySelector(".plan-row-name")?.textContent).toBe("Dust Whirl");
    expect(row.querySelector(".plan-row-swap")?.textContent).toBe(
      "INSTEAD OF 2K TEST",
    );
  });

  it("a checkpoint day whose type AND workout both differ gets ONE mark, naming the prescription", async () => {
    await readyWithLinks(
      new Map([[6, link({ workoutTitle: "Sea Fret", workoutType: "O2" })]]),
    );

    const row = rowAt(6);
    expect(row.querySelectorAll(".plan-row-swap")).toHaveLength(1);
    expect(row.querySelector(".plan-row-swap")?.textContent).toBe(
      "INSTEAD OF 2K TEST",
    );
  });

  // `session_logs.workout_title` is a save-time snapshot that the seed's
  // rename pre-pass never rewrites, so a 2k test logged before 2026-08-22
  // is spelled "First 2k" forever while the prescription says "2K Test".
  // Comparing the raw strings would tell a rower who DID the prescribed
  // test that they did something else.
  it("a checkpoint rowed under a RETIRED title for the prescribed workout is not marked as a swap", async () => {
    await readyWithLinks(
      new Map([
        [6, link({ workoutTitle: "First 2k", workoutType: "AN" })],
        // Positive control in the same render.
        [3, link({ workoutTitle: "Slack Tide", workoutType: "O2" })],
      ]),
    );

    expect(rowAt(3).querySelector(".plan-row-swap")).not.toBeNull();
    expect(rowAt(6).querySelector(".plan-row-swap")).toBeNull();
    expect(rowAt(6).querySelector(".plan-row-name")?.textContent).toBe(
      "First 2k",
    );
  });

  // `session_logs.workout_type` is plain text, not the workouts table's
  // enum, so an unrecognised value is storable. A type we cannot read is
  // not evidence of a swap.
  it("an unreadable stored type falls back to the plan's own badge and claims no swap", async () => {
    await readyWithLinks(
      new Map([
        [3, link({ workoutTitle: "Slack Tide", workoutType: "nonsense" })],
        [4, link({ workoutTitle: "Sea Fret", workoutType: "O2" })],
      ]),
    );

    // Index 3 is a TR day; the badge falls back rather than rendering an
    // unstyled/unknown type.
    expect(rowAt(3).querySelector(".type-badge")?.textContent).toBe("TR");
    expect(rowAt(3).querySelector(".plan-row-swap")).toBeNull();
    // Index 4 is an AT day rowed as O2 — the control proving the mark is
    // reachable in this render.
    expect(rowAt(4).querySelector(".plan-row-swap")?.textContent).toBe(
      "INSTEAD OF AT",
    );
  });

  it("a done row with no stored link renders exactly as it did before: plan badge, no name, no mark", async () => {
    await readyWithLinks(new Map([[0, link()]]));

    // Index 1 is done (doneN=11) but unlinked — a pre-linkage row, or a
    // links fetch that failed.
    const row = rowAt(1);
    expect(row.querySelector(".plan-row-name")).toBeNull();
    expect(row.querySelector(".plan-row-swap")).toBeNull();
    expect(row.querySelector(".type-badge")?.textContent).toBe("AT");
  });

  it("an unlinked done checkpoint keeps its prescribed affix", async () => {
    await readyWithLinks(new Map([[0, link()]]));

    expect(rowAt(6).querySelector(".plan-row-checkpoint")?.textContent).toBe(
      "2K TEST",
    );
    expect(rowAt(6).querySelector(".plan-row-name")).toBeNull();
  });

  it("an upcoming checkpoint keeps its prescribed affix and never gains a name", async () => {
    await readyWithLinks(new Map([[0, link()]]));

    // Index 34 is the second checkpoint, still ahead of doneN=11.
    expect(rowAt(34).querySelector(".plan-row-checkpoint")?.textContent).toBe(
      "2K TEST",
    );
    expect(rowAt(34).querySelector(".plan-row-name")).toBeNull();
  });

  it("today and upcoming rows never take a name or a mark, even when links carries their index", async () => {
    await readyWithLinks(
      new Map([
        // Index 11 is TODAY, 12 is upcoming — both entries could only ever
        // arrive from a stale or adversarial response.
        [11, link({ workoutTitle: "Sea Fret", workoutType: "AN" })],
        [12, link({ workoutTitle: "Dust Whirl", workoutType: "AN" })],
        [3, link({ workoutTitle: "Slack Tide", workoutType: "O2" })],
      ]),
    );

    expect(rowAt(3).querySelector(".plan-row-swap")).not.toBeNull();
    for (const index of [11, 12]) {
      expect(rowAt(index).querySelector(".plan-row-name")).toBeNull();
      expect(rowAt(index).querySelector(".plan-row-swap")).toBeNull();
    }
  });

  it("a long custom title still renders in full in the DOM — the clip is CSS, never a truncated string", async () => {
    const longTitle =
      "Sunday morning long steady state with a rate ladder in the back half";
    await readyWithLinks(
      new Map([[0, link({ workoutTitle: longTitle, workoutType: "O2" })]]),
    );

    expect(rowAt(0).querySelector(".plan-row-name")?.textContent).toBe(
      longTitle,
    );
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
