import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import ClockInput from "./ClockInput";

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <ClockInput value={value} onChange={setValue} ariaLabel="Step 1 duration" />
  );
}

const field = () => screen.getByLabelText("Step 1 duration");

describe("ClockInput", () => {
  it("opens a digit-only keypad — a colon is unreachable on a phone", () => {
    render(<Harness />);
    expect(field()).toHaveAttribute("inputmode", "numeric");
  });

  it("fills digits right to left, supplying the separator", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "3");
    expect(field()).toHaveValue("0:03");
    await user.type(field(), "0");
    expect(field()).toHaveValue("0:30");
    await user.type(field(), "0");
    expect(field()).toHaveValue("3:00");
  });

  it("reaches minutes and hours as digits accumulate", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "2000");
    expect(field()).toHaveValue("20:00");

    await user.clear(field());
    await user.type(field(), "10500");
    expect(field()).toHaveValue("1:05:00");

    await user.clear(field());
    await user.type(field(), "30000");
    expect(field()).toHaveValue("3:00:00");
  });

  it("ignores digits past the domain's ceiling", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "3000099");
    expect(field()).toHaveValue("3:00:00");
  });

  it("shifts back out on backspace", async () => {
    const user = userEvent.setup();
    render(<Harness initial="1:30" />);
    await user.type(field(), "{Backspace}");
    expect(field()).toHaveValue("0:13");
    await user.type(field(), "{Backspace}");
    expect(field()).toHaveValue("0:01");
    await user.type(field(), "{Backspace}");
    expect(field()).toHaveValue("");
  });

  it("normalises an overflowing group on blur instead of rejecting it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "170");
    expect(field()).toHaveValue("1:70");
    await user.tab();
    expect(field()).toHaveValue("2:10");
  });

  it("leaves an empty field empty on blur", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());
    await user.tab();
    expect(field()).toHaveValue("");
  });

  it("wires its error state for assistive tech", () => {
    render(
      <ClockInput
        value="0:45"
        onChange={() => {}}
        ariaLabel="Step 1 duration"
        invalid
        errorId="err-1"
      />,
    );
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field()).toHaveAttribute("aria-describedby", "err-1");
  });

  it("appends a caller class alongside its own", () => {
    render(
      <ClockInput
        value="0:45"
        onChange={() => {}}
        ariaLabel="Step 1 duration"
        className="dur-row-field"
      />,
    );
    expect(field()).toHaveClass("clock-input", "dur-row-field");
  });

  it("leaves a malformed value alone on blur instead of throwing", async () => {
    const user = userEvent.setup();
    render(<Harness initial="not-a-clock" />);
    await user.click(field());
    await user.tab();
    expect(field()).toHaveValue("not-a-clock");
  });
});
