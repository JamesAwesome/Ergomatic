import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import BaselineField from "./BaselineField";
import {
  MAX_SPLIT,
  MIN_SPLIT,
  initDraft,
  nudge,
  setDraft,
  type DraftState,
} from "./baselineDraft";

// The unified baseline control (the honest-empty / one-control round,
// 2026-08-24). The harness wires it to the REAL draft machinery — the same
// `setDraft`/`nudge` all three surfaces use, with their own clamp — so a
// disagreement between what this control announces and what the draft
// actually holds shows up here rather than on a phone.

function Harness({ initial }: { initial: number | null }) {
  const [state, setState] = useState<DraftState>(() => initDraft(initial, 152));
  return (
    <BaselineField
      label="2k"
      seconds={state.draft.k2}
      seed={145}
      onType={(v) => setState((s) => setDraft(s, "k2", v))}
      onNudge={(d) => setState((s) => nudge(s, "k2", d))}
    />
  );
}

const field = () => screen.getByRole("textbox", { name: "2k split" });
const faster = () => screen.getByRole("button", { name: "2k faster" });
const slower = () => screen.getByRole("button", { name: "2k slower" });

describe("BaselineField: one control, typed AND nudged", () => {
  it("is a labelled group holding the typed field and both steppers — the entry affordances a rower had to find on different screens before", () => {
    render(<Harness initial={112} />);
    const group = screen.getByRole("group", { name: "2k baseline split" });
    expect(group).toContainElement(field());
    expect(group).toContainElement(faster());
    expect(group).toContainElement(slower());
  });

  it("types: digits fill right to left and settle on blur, exactly as the typed-only surfaces did", async () => {
    render(<Harness initial={112} />);
    await userEvent.type(field(), "158");
    await userEvent.tab();
    expect(field()).toHaveValue("1:58.0");
  });

  it("nudges: − is faster by half a second, + is slower by half a second", async () => {
    render(<Harness initial={112} />);
    await userEvent.click(faster());
    expect(field()).toHaveValue("1:51.5");
    await userEvent.click(slower());
    await userEvent.click(slower());
    expect(field()).toHaveValue("1:52.5");
  });

  // The ordering decision, and the one a rower can actually trip: a tap
  // lands while the field still holds a live digit buffer. The tap must
  // SETTLE the field first (buffer drops, resting display shows the parsed
  // draft) and only then apply the nudge — steppers never read the buffer.
  it("a stepper tap with a live digit buffer settles the typed value first, then nudges from it", async () => {
    render(<Harness initial={145} />);
    await userEvent.type(field(), "158");
    // Still mid-entry: the buffer is showing, un-settled.
    expect(field()).toHaveValue("1:58");

    await userEvent.click(slower());

    // 118 settled, then +0.5. A control that kept the buffer would still be
    // rendering the stale "1:58" here, nudge or no nudge.
    expect(field()).toHaveValue("1:58.5");
  });

  // The test above does NOT prove the control settles the field itself:
  // `userEvent.click` focuses the button, so jsdom's own default blurs the
  // input for us and a control with no `blur()` of its own stays green
  // (measured — the mutation survived until this test existed). WebKit is
  // the case that matters: tapping a `<button>` there does NOT move focus,
  // so the input keeps its live buffer and nothing settles unless the
  // control does it. `fireEvent.click` models exactly that — a click
  // arrives, focus does not move.
  it("settles the field itself when the tap does not move focus — the iOS case, where a button tap never blurs anything", async () => {
    render(<Harness initial={145} />);
    await userEvent.type(field(), "158");
    expect(field()).toHaveFocus();

    fireEvent.click(slower());

    expect(field()).toHaveValue("1:58.5");
  });

  it("keeps working after the settle — the field is still typable once a stepper has touched it", async () => {
    render(<Harness initial={145} />);
    await userEvent.click(faster());
    await userEvent.type(field(), "203");
    await userEvent.tab();
    expect(field()).toHaveValue("2:03.0");
  });
});

describe("BaselineField on an UNSET side", () => {
  it("shows an empty field with the seed as its placeholder — a suggestion, not a value", () => {
    render(<Harness initial={null} />);
    expect(field()).toHaveValue("");
    expect(field()).toHaveAttribute("placeholder", "2:25.0");
  });

  it("the first − tap materialises the seed EXACTLY, with no offset applied", async () => {
    render(<Harness initial={null} />);
    await userEvent.click(faster());
    // 2:25.0, not 2:24.5: the rower asked to start from the suggestion.
    expect(field()).toHaveValue("2:25.0");
  });

  it("the first + tap does the same thing — both buttons materialise before either nudges", async () => {
    render(<Harness initial={null} />);
    await userEvent.click(slower());
    expect(field()).toHaveValue("2:25.0");
  });

  it("the SECOND tap nudges normally from the materialised seed", async () => {
    render(<Harness initial={null} />);
    await userEvent.click(faster());
    await userEvent.click(faster());
    expect(field()).toHaveValue("2:24.5");
  });

  it("neither stepper is a dead end while the side is unset — an empty field is not at a bound", () => {
    render(<Harness initial={null} />);
    expect(faster()).toHaveAttribute("aria-disabled", "false");
    expect(slower()).toHaveAttribute("aria-disabled", "false");
  });
});

describe("BaselineField at the split bounds", () => {
  it("marks − as a dead end at MIN_SPLIT and refuses to move past it", async () => {
    render(<Harness initial={MIN_SPLIT} />);
    expect(faster()).toHaveAttribute("aria-disabled", "true");
    // aria-disabled, never `disabled`: the button keeps focus and its place
    // in the tab order, so a rower mid-keyboard is not dropped to the
    // document. That makes the click REAL, so the handler must refuse it.
    expect(faster()).not.toBeDisabled();
    await userEvent.click(faster());
    expect(field()).toHaveValue("1:00.0");
  });

  it("leaves + live at MIN_SPLIT — only the dead-end direction dims", async () => {
    render(<Harness initial={MIN_SPLIT} />);
    expect(slower()).toHaveAttribute("aria-disabled", "false");
    await userEvent.click(slower());
    expect(field()).toHaveValue("1:00.5");
  });

  it("marks + as a dead end at MAX_SPLIT and refuses to move past it", async () => {
    render(<Harness initial={MAX_SPLIT} />);
    expect(slower()).toHaveAttribute("aria-disabled", "true");
    expect(slower()).not.toBeDisabled();
    await userEvent.click(slower());
    expect(field()).toHaveValue("4:00.0");
  });

  it("leaves − live at MAX_SPLIT", async () => {
    render(<Harness initial={MAX_SPLIT} />);
    expect(faster()).toHaveAttribute("aria-disabled", "false");
    await userEvent.click(faster());
    expect(field()).toHaveValue("3:59.5");
  });

  it("the dead end appears the moment a nudge ARRIVES at the bound, not a step later", async () => {
    render(<Harness initial={MIN_SPLIT + 0.5} />);
    expect(faster()).toHaveAttribute("aria-disabled", "false");
    await userEvent.click(faster());
    expect(field()).toHaveValue("1:00.0");
    expect(faster()).toHaveAttribute("aria-disabled", "true");
  });
});

// A stepper tap moves no focus and rewrites no text the rower is reading,
// so without this the change is silent to a screen reader — the field's own
// value is not announced on a programmatic change.
describe("BaselineField announces what a stepper tap settled on", () => {
  it("announces the new value politely after a nudge", async () => {
    render(<Harness initial={112} />);
    await userEvent.click(faster());
    const live = screen.getByText("2k 1:51.5");
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  it("announces the materialised seed on the first tap of an unset side", async () => {
    render(<Harness initial={null} />);
    await userEvent.click(slower());
    expect(screen.getByText("2k 2:25.0")).toBeInTheDocument();
  });

  it("announces nothing before any stepper tap — a fresh screen must not read out a number nobody asked for", () => {
    const { container } = render(<Harness initial={112} />);
    const live = container.querySelector("[aria-live]");
    expect(live).not.toBeNull();
    expect(live).toHaveTextContent("");
  });

  it("says nothing new when a dead-end tap changes nothing", async () => {
    render(<Harness initial={MIN_SPLIT} />);
    await userEvent.click(faster());
    const live = screen.getByText("", { selector: "[aria-live]" });
    expect(live).toHaveTextContent("");
  });
});
