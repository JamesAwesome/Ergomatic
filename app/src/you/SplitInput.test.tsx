import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import SplitInput, {
  digitsToSplitDisplay,
  digitsToSplitSeconds,
} from "./SplitInput";
import { initDraft, setDraft, type DraftState } from "./baselineDraft";

// Option T (canvas OptionTypeIt): typed split entry, the ClockInput
// digits-right-to-left pattern adapted to the 60..240s split band. The
// harness wires the field to the REAL draft machinery (baselineDraft's
// setDraft, with its own clamp) exactly as both consuming surfaces do —
// not a hand-rolled setState that could mask a clamp disagreement.

function Harness({
  initial = 145,
  onType,
}: {
  initial?: number;
  onType?: (v: number) => void;
}) {
  const [state, setState] = useState<DraftState>(() => initDraft(initial, 152));
  return (
    <SplitInput
      label="2k"
      seconds={state.draft.k2}
      onType={(v) => {
        onType?.(v);
        setState((s) => setDraft(s, "k2", v));
      }}
    />
  );
}

describe("digitsToSplitDisplay / digitsToSplitSeconds (the Option T mapping)", () => {
  it("fills digits right to left: 1 -> 0:01, 15 -> 0:15, 152 -> 1:52", () => {
    expect(digitsToSplitDisplay("1")).toBe("0:01");
    expect(digitsToSplitDisplay("15")).toBe("0:15");
    expect(digitsToSplitDisplay("152")).toBe("1:52");
  });

  it("parses the same reading as whole seconds: 152 -> 112, 225 -> 145", () => {
    expect(digitsToSplitSeconds("152")).toBe(112);
    expect(digitsToSplitSeconds("225")).toBe(145);
    expect(digitsToSplitSeconds("1")).toBe(1);
  });

  it("an un-normalised seconds group still reads as arithmetic, not rejection: 95 -> 95s (renders 0:95, settles at blur)", () => {
    expect(digitsToSplitDisplay("95")).toBe("0:95");
    expect(digitsToSplitSeconds("95")).toBe(95);
  });

  it("empty digits are no value at all — never a fabricated 0:00", () => {
    expect(digitsToSplitDisplay("")).toBe("");
    expect(digitsToSplitSeconds("")).toBeNull();
  });
});

describe("SplitInput (typed split entry)", () => {
  it("rests on the draft's own m:ss.t display, tenths intact", () => {
    render(<Harness initial={144.5} />);
    expect(screen.getByRole("textbox", { name: "2k split" })).toHaveValue(
      "2:24.5",
    );
  });

  it("focusing clears to an empty buffer with the prior value as placeholder — a tap never reads as data loss", async () => {
    render(<Harness initial={145} />);
    const field = screen.getByRole("textbox", { name: "2k split" });
    await userEvent.click(field);
    expect(field).toHaveValue("");
    expect(field).toHaveAttribute("placeholder", "2:25.0");
  });

  it("typing 152 fills right to left and commits 112 whole seconds to the draft", async () => {
    const onType = vi.fn();
    render(<Harness initial={145} onType={onType} />);
    const field = screen.getByRole("textbox", { name: "2k split" });
    await userEvent.type(field, "152");
    expect(field).toHaveValue("1:52");
    expect(onType).toHaveBeenLastCalledWith(112);
  });

  it("blur settles the typed value into the resting m:ss.0 display", async () => {
    render(<Harness initial={145} />);
    const field = screen.getByRole("textbox", { name: "2k split" });
    await userEvent.type(field, "158");
    await userEvent.tab();
    expect(field).toHaveValue("1:58.0");
  });

  it("leaving without typing commits nothing and restores the resting display", async () => {
    const onType = vi.fn();
    render(<Harness initial={144.5} onType={onType} />);
    const field = screen.getByRole("textbox", { name: "2k split" });
    await userEvent.click(field);
    await userEvent.tab();
    expect(onType).not.toHaveBeenCalled();
    expect(field).toHaveValue("2:24.5");
  });

  it("strips non-digits — a numeric keypad has no colon, and a pasted one must not break the fill", async () => {
    render(<Harness initial={145} />);
    const field = screen.getByRole("textbox", { name: "2k split" });
    await userEvent.type(field, "1:52");
    expect(field).toHaveValue("1:52");
  });

  it("ignores a 4th digit — three digits are the whole legal band", async () => {
    const onType = vi.fn();
    render(<Harness initial={145} onType={onType} />);
    const field = screen.getByRole("textbox", { name: "2k split" });
    await userEvent.type(field, "1529");
    expect(field).toHaveValue("1:52");
    expect(onType).toHaveBeenLastCalledWith(112);
  });

  it("an out-of-band entry shows what was typed, then settles at the draft's own clamp on blur (500 -> 4:00.0)", async () => {
    render(<Harness initial={145} />);
    const field = screen.getByRole("textbox", { name: "2k split" });
    await userEvent.type(field, "500");
    expect(field).toHaveValue("5:00");
    await userEvent.tab();
    expect(field).toHaveValue("4:00.0");
  });

  it("backspacing to empty commits nothing further — the draft keeps the last parsed keystroke, clamped and visible, never a fabricated zero", async () => {
    render(<Harness initial={145} />);
    const field = screen.getByRole("textbox", { name: "2k split" });
    await userEvent.type(field, "152");
    await userEvent.keyboard("{Backspace}{Backspace}{Backspace}{Backspace}");
    expect(field).toHaveValue("");
    await userEvent.tab();
    // Backspace refills right-to-left like ClockInput: 1:52 -> 0:15 -> 0:01
    // -> empty, each surviving partial committing as it goes (15s, then 1s,
    // clamped to the 60s floor). The empty buffer itself commits NOTHING,
    // so the rest display is the clamp of the last real keystroke — an
    // abandoned clear stays visible (and discardable at the editor's
    // confirm card), never a silent revert pretending nothing happened.
    expect(field).toHaveValue("1:00.0");
  });
});
