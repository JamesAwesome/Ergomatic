import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsScreen from "./SettingsScreen";
import {
  JUDGE_COLORS_KEY,
  applyJudgeColors,
  saveJudgeColors,
  type JudgeColors,
} from "./judgeColors";

// A PARTIAL mock: `saveJudgeColors` and `applyJudgeColors` keep their real
// bodies (so the root properties this file asserts on are the ones the
// product actually writes) and are merely observable. I-6 needs the save to
// fail on demand, and it needs the apply to be REAL while it does — the
// whole point of that invariant is that the two steps are independent.
vi.mock("./judgeColors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./judgeColors")>();
  return {
    ...actual,
    saveJudgeColors: vi.fn(actual.saveJudgeColors),
    applyJudgeColors: vi.fn(actual.applyJudgeColors),
  };
});

// `src/test/setup.ts` is one line and clears nothing, so both of this
// screen's outputs — the stored key and the four inline root properties —
// leak into every later test in the file unless they are reset by hand.
beforeEach(() => {
  localStorage.removeItem(JUDGE_COLORS_KEY);
  document.documentElement.removeAttribute("style");
  vi.mocked(saveJudgeColors).mockClear();
  vi.mocked(applyJudgeColors).mockClear();
});

afterEach(() => {
  localStorage.removeItem(JUDGE_COLORS_KEY);
  document.documentElement.removeAttribute("style");
  vi.mocked(saveJudgeColors).mockRestore();
});

/** A stored value non-default in all four slots, so no assertion below can
 *  pass by accident against `JUDGE_COLOR_DEFAULTS`. */
const STORED: JudgeColors = {
  paceFaster: "red",
  paceSlower: "off",
  spmFaster: "off",
  spmSlower: "blue",
};

function seed(colors: JudgeColors) {
  localStorage.setItem(JUDGE_COLORS_KEY, JSON.stringify(colors));
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/you/settings"]}>
      <Routes>
        <Route path="/you" element={<p>You screen</p>} />
        <Route path="/you/settings" element={<SettingsScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

const groupNames = [
  "Pace faster color",
  "Pace slower color",
  "SPM faster color",
  "SPM slower color",
] as const;

function checkedIn(groupName: string): string | undefined {
  const group = screen.getByRole("radiogroup", { name: groupName });
  return within(group)
    .getAllByRole("radio")
    .find((radio) => radio.getAttribute("aria-checked") === "true")
    ?.textContent?.trim();
}

function rootProperty(name: string): string {
  return document.documentElement.style.getPropertyValue(name);
}

describe("SettingsScreen — the four judged-colour slots", () => {
  it("carries the approved copy: a back link to You, the title, and one group per metric", () => {
    renderScreen();
    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute(
      "href",
      "/you",
    );
    expect(
      screen.getByRole("heading", { name: "Settings", level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "COLORS · PACE", level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "COLORS · SPM", level: 2 }),
    ).toBeVisible();
    // The parentheticals: FASTER and SLOWER mean opposite arithmetic on the
    // two metrics, and the screen never relies on the reader knowing that.
    expect(screen.getByText("(a lower split)")).toBeVisible();
    expect(screen.getByText("(a higher split)")).toBeVisible();
    expect(screen.getByText("(a higher rate)")).toBeVisible();
    expect(screen.getByText("(a lower rate)")).toBeVisible();
  });

  it("offers RED, BLUE and OFF in every one of the four slots, each word beside a swatch that is NOT part of its name", () => {
    renderScreen();
    const groups = screen.getAllByRole("radiogroup");
    expect(groups).toHaveLength(4);
    for (const name of groupNames) {
      const group = screen.getByRole("radiogroup", { name });
      const radios = within(group).getAllByRole("radio");
      expect(radios.map((r) => r.textContent)).toStrictEqual([
        "RED",
        "BLUE",
        "OFF",
      ]);
      // WCAG 1.4.1: the swatch is decoration and the word carries the
      // meaning, so the swatch must stay out of the accessible name.
      for (const [index, color] of ["red", "blue", "off"].entries()) {
        const swatch = radios[index]!.querySelector(".judge-swatch");
        expect(swatch).toHaveAttribute("data-color", color);
        expect(swatch).toHaveAttribute("aria-hidden", "true");
      }
    }
  });

  it("reflects the STORED choice in every slot, not the defaults", () => {
    seed(STORED);
    renderScreen();
    expect(checkedIn("Pace faster color")).toBe("RED");
    expect(checkedIn("Pace slower color")).toBe("OFF");
    expect(checkedIn("SPM faster color")).toBe("OFF");
    expect(checkedIn("SPM slower color")).toBe("BLUE");
  });

  it("falls back to today's colours when nothing is stored", () => {
    renderScreen();
    expect(checkedIn("Pace faster color")).toBe("BLUE");
    expect(checkedIn("Pace slower color")).toBe("RED");
    expect(checkedIn("SPM faster color")).toBe("BLUE");
    expect(checkedIn("SPM slower color")).toBe("RED");
  });

  it("repaints the app the moment a slot changes, and stores the whole set", async () => {
    seed(STORED);
    renderScreen();
    await userEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "Pace slower color" }),
      ).getByRole("radio", { name: "BLUE" }),
    );

    // The consequence, not the call: the four resolved properties the
    // cascade reads. Values this module wrote — never a computed colour,
    // which jsdom cannot resolve through `var()` anyway.
    expect(rootProperty("--judge-pace-slower")).toBe("var(--judge-blue)");
    expect(rootProperty("--judge-pace-faster")).toBe("var(--judge-red)");
    expect(rootProperty("--judge-spm-faster")).toBe("var(--ink)");
    expect(rootProperty("--judge-spm-slower")).toBe("var(--judge-blue)");

    expect(
      JSON.parse(localStorage.getItem(JUDGE_COLORS_KEY) ?? "null"),
    ).toStrictEqual({ ...STORED, paceSlower: "blue" });
    expect(checkedIn("Pace slower color")).toBe("BLUE");
  });

  it("keeps the other three slots exactly where they were (one tap changes one slot)", async () => {
    seed(STORED);
    renderScreen();
    await userEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "SPM faster color" }),
      ).getByRole("radio", { name: "RED" }),
    );
    expect(checkedIn("Pace faster color")).toBe("RED");
    expect(checkedIn("Pace slower color")).toBe("OFF");
    expect(checkedIn("SPM faster color")).toBe("RED");
    expect(checkedIn("SPM slower color")).toBe("BLUE");
  });

  it("previews each group's two specimens in that group's own live classes", () => {
    const { container } = renderScreen();
    const previews = container.querySelectorAll(".judge-preview-value");
    expect(
      [...previews].map((el) => [el.className, el.textContent]),
    ).toStrictEqual([
      ["judge-preview-value judge-pace-faster", "1:52.3"],
      ["judge-preview-value judge-pace-slower", "1:58.0"],
      ["judge-preview-value judge-spm-faster", "26"],
      ["judge-preview-value judge-spm-slower", "22"],
    ]);
  });
});

// I-6 IS TWO CLAIMS AND THEY ARE ASSERTED IN TWO TESTS ON PURPOSE. The
// invariant is that a refused write costs the rower persistence and NOTHING
// ELSE — so one test owns "the rower is told" and another owns "the colours
// are live anyway". Together in one `it`, the first failing expectation
// would abort the second, and the named mutation (make the failure branch a
// no-op: drop the message, keep the apply) could not be shown to redden one
// half while leaving the other green — which is the whole content of RF25
// here.
describe("SettingsScreen — I-6, a refused write", () => {
  async function pickBlueWithAFailingWrite() {
    seed(STORED);
    vi.mocked(saveJudgeColors).mockReturnValue(false);
    renderScreen();
    await userEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "Pace slower color" }),
      ).getByRole("radio", { name: "BLUE" }),
    );
  }

  it("HALF ONE: tells the rower the choice will not survive a reload", async () => {
    await pickBlueWithAFailingWrite();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/won't stick/i);
    expect(alert).toHaveTextContent(/reload/i);
  });

  it("HALF TWO: applies the colours ANYWAY, so a dead store never makes the screen look inert", async () => {
    await pickBlueWithAFailingWrite();
    // The root property itself, not the call: this is what the cascade
    // reads. A value this module wrote, never a computed colour.
    expect(rootProperty("--judge-pace-slower")).toBe("var(--judge-blue)");
    expect(checkedIn("Pace slower color")).toBe("BLUE");
  });

  it("takes the warning back down once a write lands", async () => {
    seed(STORED);
    vi.mocked(saveJudgeColors).mockReturnValueOnce(false);
    renderScreen();
    const group = screen.getByRole("radiogroup", { name: "Pace slower color" });
    await userEvent.click(within(group).getByRole("radio", { name: "BLUE" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await userEvent.click(within(group).getByRole("radio", { name: "RED" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(rootProperty("--judge-pace-slower")).toBe("var(--judge-red)");
  });
});
