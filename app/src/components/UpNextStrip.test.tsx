import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import UpNextStrip from "./UpNextStrip";

describe("UpNextStrip", () => {
  // BYTE-IDENTICAL REGRESSION PIN (Phase 7B Task 3). Lifted from
  // `session/Timer.tsx`'s own inline `.timer-upnext` JSX at the
  // pre-extraction commit (HEAD at the start of this task, before this
  // component existed) by rendering the real `Timer` component against a
  // 4-phase run seeded at index 1 (whose UP NEXT is a distance work phase,
  // whose "then" is an effort phase) and reading
  // `document.querySelector(".timer-upnext")!.outerHTML` — the exact string
  // below, unedited. If this string ever needs editing to pass, the
  // extraction changed the phone timer's rendered DOM, which the brief
  // forbids.
  it("renders byte-identical to the pre-extraction inline .timer-upnext markup, with a then-line", () => {
    const { container } = render(
      <UpNextStrip upNext="WORK · 1:40.0" thenNext="WORK · ALL OUT" />,
    );
    expect(container.innerHTML).toBe(
      '<div class="timer-upnext"><div class="timer-upnext-main"><span class="timer-upnext-label">UP NEXT</span><span class="timer-upnext-value">WORK · 1:40.0</span></div><span class="timer-upnext-then">then WORK · ALL OUT</span></div>',
    );
  });

  // Second pin: past the last phase, `thenNextText` returns null (mirrors
  // `upNextText`'s own "FINISH past the last phase" contract one phase
  // further out) — no `.timer-upnext-then` element at all, not an empty one.
  it("renders byte-identical to the pre-extraction inline markup with no then-line (thenNext null)", () => {
    const { container } = render(
      <UpNextStrip upNext="FINISH" thenNext={null} />,
    );
    expect(container.innerHTML).toBe(
      '<div class="timer-upnext"><div class="timer-upnext-main"><span class="timer-upnext-label">UP NEXT</span><span class="timer-upnext-value">FINISH</span></div></div>',
    );
  });

  // The phone timer never actually passes upNext=null (upNextText always
  // returns a string), but the prop type allows it for a future connected
  // caller — must render an empty value slot, never the literal "null".
  it("upNext null renders an empty value slot, never the literal string 'null'", () => {
    const { container } = render(<UpNextStrip upNext={null} thenNext={null} />);
    expect(container.querySelector(".timer-upnext-value")?.textContent).toBe(
      "",
    );
    expect(container.innerHTML).not.toContain("null");
  });
});
