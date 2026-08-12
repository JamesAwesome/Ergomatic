import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import UpNextStrip from "./UpNextStrip";

describe("UpNextStrip", () => {
  // BYTE-IDENTICAL REGRESSION PIN (Phase 7B Task 3; markup rewritten
  // connected-revamp Task 6). The word "then" moved INSIDE
  // `.timer-upnext-value`'s own text run (design spec §6/revision §3: the
  // mockup renders `REST 2:00 · then WORK 2:09.0` as one span, not a value
  // plus a second stacked line) — `UpNextStrip.tsx`'s own comment has the
  // full reasoning. The string below was read straight off THIS
  // component's real render, not typed by hand: if it ever needs editing
  // to pass, the markup changed again and this pin's whole job is to make
  // that a deliberate, reviewed edit rather than a silent one.
  it("renders byte-identical to the current .timer-upnext markup, with a then-line", () => {
    const { container } = render(
      <UpNextStrip upNext="WORK · 1:40.0" thenNext="WORK · ALL OUT" />,
    );
    expect(container.innerHTML).toBe(
      '<div class="timer-upnext"><div class="timer-upnext-main"><span class="timer-upnext-label">UP NEXT</span><span class="timer-upnext-value">WORK · 1:40.0 · <span class="timer-upnext-then">then </span>WORK · ALL OUT</span></div></div>',
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

  // Connected-revamp Task 6 (design spec §6, revision §3): "Landscape UP
  // NEXT string: `REST 2:00 · then WORK 2:09.0`. Portrait shortens to
  // `REST 2:00 · WORK 2:09.0`" — from ONE builder, not a second string.
  // This component has no JS notion of orientation (`UpNextStrip.tsx`'s
  // own comment), so the portrait form isn't a separate render path here;
  // it's whatever text remains once `.timer-upnext-then` — the one word
  // "then", isolated in its own span for exactly this reason — is removed.
  // `index.css`'s landscape media query is the only thing that ever shows
  // it; jsdom applies no stylesheet, so this proves the STRING is built
  // correctly (both orientations, from one value), which is this
  // component's own job — the CSS visibility toggle itself is proved in
  // the browser (`e2e/design.spec.ts`).
  it("landscape's full string and portrait's short form are the SAME builder, not two", () => {
    const { container } = render(
      <UpNextStrip upNext="REST 2:00" thenNext="WORK 2:09.0" />,
    );
    const value = container.querySelector(".timer-upnext-value")!;
    // Landscape: the word "then" renders (CSS shows it there).
    expect(value.textContent).toBe("REST 2:00 · then WORK 2:09.0");
    const then = value.querySelector(".timer-upnext-then")!;
    expect(then.textContent).toBe("then ");
    // Portrait: subtract exactly the "then" span's own text (what CSS
    // hides there by default) and what's left is the short form, verbatim
    // — no independently-typed second string anywhere in this file.
    expect(value.textContent!.replace(then.textContent!, "")).toBe(
      "REST 2:00 · WORK 2:09.0",
    );
  });
});
