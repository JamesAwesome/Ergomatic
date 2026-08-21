import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import IntervalSegments from "./IntervalSegments";

describe("IntervalSegments", () => {
  // Phase WU: every `"wu"` in these `kinds` arrays became `"work"` — the
  // prop's union lost that member with the concept. `kinds` is not read by
  // this component at all (its own doc comment: threaded for a future
  // consumer that paints dots by kind), so every rendered string below is
  // byte-identical to what it was; only the input vocabulary shrank.
  //
  // BYTE-IDENTICAL REGRESSION PIN (Phase 7B Task 3). Lifted from
  // `session/Timer.tsx`'s own inline `.timer-dots` JSX at the pre-extraction
  // commit (HEAD at the start of this task, before this component existed)
  // by rendering the real `Timer` component against a 4-phase run seeded at
  // index 1 and reading `document.querySelector(".timer-dots")!.outerHTML`
  // — the exact string below, unedited. If this string ever needs editing to
  // pass, the extraction changed the phone timer's rendered DOM, which the
  // brief forbids.
  it("renders byte-identical to the pre-extraction inline .timer-dots markup (4 phases, current=1)", () => {
    const { container } = render(
      <IntervalSegments
        total={4}
        current={1}
        kinds={["work", "work", "rest", "work"]}
      />,
    );
    expect(container.innerHTML).toBe(
      '<div class="timer-dots"><span class="timer-dot timer-dot-past"></span><span class="timer-dot timer-dot-current"></span><span class="timer-dot timer-dot-future"></span><span class="timer-dot timer-dot-future"></span></div>',
    );
  });

  // Second pin, a different shape (2 phases) — proves the past/current/
  // future split isn't an artifact of the first fixture's particular count.
  it("renders byte-identical to the pre-extraction inline markup (2 phases, current=1 — last phase)", () => {
    const { container } = render(
      <IntervalSegments total={2} current={1} kinds={["work", "work"]} />,
    );
    expect(container.innerHTML).toBe(
      '<div class="timer-dots"><span class="timer-dot timer-dot-past"></span><span class="timer-dot timer-dot-current"></span></div>',
    );
  });

  it("current=0: the first dot is current, never past, every dot after it is future", () => {
    const { container } = render(
      <IntervalSegments
        total={3}
        current={0}
        kinds={["work", "work", "rest"]}
      />,
    );
    const spans = container.querySelectorAll(".timer-dot");
    expect(spans[0]?.className).toBe("timer-dot timer-dot-current");
    expect(spans[1]?.className).toBe("timer-dot timer-dot-future");
    expect(spans[2]?.className).toBe("timer-dot timer-dot-future");
  });

  it("total=1: a single dot, current", () => {
    const { container } = render(
      <IntervalSegments total={1} current={0} kinds={["work"]} />,
    );
    expect(container.innerHTML).toBe(
      '<div class="timer-dots"><span class="timer-dot timer-dot-current"></span></div>',
    );
  });
});
