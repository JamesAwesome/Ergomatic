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
import { READY_CARD_KEY, loadReadyCard, saveReadyCard } from "./readyCard";

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

// The same partial-mock treatment for the ready-card store, and for the same
// reason: I-6 needs THIS write to fail on demand while the other one still
// works, which is the only way to show the two controls own separate
// warnings.
vi.mock("./readyCard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./readyCard")>();
  return { ...actual, saveReadyCard: vi.fn(actual.saveReadyCard) };
});

// `src/test/setup.ts` is one line and clears nothing, so both of this
// screen's outputs — the stored key and the four inline root properties —
// leak into every later test in the file unless they are reset by hand.
beforeEach(() => {
  localStorage.removeItem(JUDGE_COLORS_KEY);
  localStorage.removeItem(READY_CARD_KEY);
  document.documentElement.removeAttribute("style");
  vi.mocked(saveJudgeColors).mockClear();
  vi.mocked(applyJudgeColors).mockClear();
  vi.mocked(saveReadyCard).mockClear();
});

afterEach(() => {
  localStorage.removeItem(JUDGE_COLORS_KEY);
  localStorage.removeItem(READY_CARD_KEY);
  document.documentElement.removeAttribute("style");
  vi.mocked(saveJudgeColors).mockRestore();
  vi.mocked(saveReadyCard).mockRestore();
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
    // A WHOLE-SCREEN census, not a scoped one, so a group appearing here
    // without a test is a failure rather than a silence. Phase RN made it
    // five: the four colour slots plus READY SCREEN, which has its own
    // describe block below and its own two options.
    const groups = screen.getAllByRole("radiogroup");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toStrictEqual([
      "Pace faster color",
      "Pace slower color",
      "SPM faster color",
      "SPM slower color",
      "Ready screen",
    ]);
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

/**
 * Phase RN: the READY SCREEN section, Gate 0 CLOSED 2026-09-09 with copy
 * candidate A. Its control is the same `OptionGroup` the colour slots use, so
 * the roving-tabindex keyboard contract is already covered above and is not
 * re-tested here (recurring failure 8: reuse the pattern AND its tests).
 * What IS this section's own is the copy, the default, the persistence, and
 * the fact that its save-failure warning belongs to it alone.
 */
describe("SettingsScreen — the ready screen section (Phase RN)", () => {
  const GROUP = "Ready screen";

  it("carries Gate 0's approved copy", () => {
    renderScreen();
    expect(
      screen.getByRole("heading", { name: "READY SCREEN", level: 2 }),
    ).toBeVisible();
    expect(screen.getByText("WHEN THE MONITOR IS READY")).toBeVisible();
    expect(screen.getByText("(before your first pull)")).toBeVisible();
    const group = screen.getByRole("radiogroup", { name: GROUP });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((radio) => radio.textContent?.trim()),
    ).toStrictEqual(["SHOW", "SKIP"]);
  });

  it("says the erg's display is THE MONITOR, never the PM5 (RF32)", () => {
    renderScreen();
    const section = screen
      .getByRole("heading", { name: "READY SCREEN", level: 2 })
      .closest("section");
    expect(section).not.toBeNull();
    expect(section?.textContent).not.toMatch(/PM5/);
  });

  it("shows SHOW on a device that has never touched the setting (I-1)", () => {
    renderScreen();
    expect(checkedIn(GROUP)).toBe("SHOW");
  });

  it("reflects a STORED skip rather than the default", () => {
    localStorage.setItem(READY_CARD_KEY, "skip");
    renderScreen();
    expect(checkedIn(GROUP)).toBe("SKIP");
  });

  it("persists the tap, so the next connect reads what the rower chose", async () => {
    renderScreen();
    await userEvent.click(
      within(screen.getByRole("radiogroup", { name: GROUP })).getByRole(
        "radio",
        { name: "SKIP" },
      ),
    );
    expect(checkedIn(GROUP)).toBe("SKIP");
    // Asserted through the store's own reader, not by peeking at the key:
    // this is the value a consumer will actually get.
    expect(loadReadyCard()).toBe("skip");
  });

  it("leaves every colour slot exactly where it was", async () => {
    seed(STORED);
    renderScreen();
    await userEvent.click(
      within(screen.getByRole("radiogroup", { name: GROUP })).getByRole(
        "radio",
        { name: "SKIP" },
      ),
    );
    expect(checkedIn("Pace faster color")).toBe("RED");
    expect(checkedIn("Pace slower color")).toBe("OFF");
    expect(checkedIn("SPM faster color")).toBe("OFF");
    expect(checkedIn("SPM slower color")).toBe("BLUE");
    expect(vi.mocked(saveJudgeColors)).not.toHaveBeenCalled();
  });
});

/**
 * TWO CONTROLS, TWO WARNINGS. The colour screen's existing notice says "These
 * colors are on now, but they won't stick" — a sentence about a control the
 * rower did not touch — so the ready card cannot borrow it. And a single
 * shared `saveFailed` boolean would let a successful tap on one control clear
 * a genuine warning raised by the other, which is what these two cases pin.
 */
describe("SettingsScreen — a refused write belongs to the control that made it", () => {
  async function tapSkip() {
    await userEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "Ready screen" }),
      ).getByRole("radio", { name: "SKIP" }),
    );
  }

  async function tapBlue() {
    await userEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "Pace slower color" }),
      ).getByRole("radio", { name: "BLUE" }),
    );
  }

  it("warns in the ready screen's own words, which never mention colours", async () => {
    vi.mocked(saveReadyCard).mockReturnValue(false);
    renderScreen();
    await tapSkip();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/reload/i);
    expect(alert).not.toHaveTextContent(/colors/i);
    // The CONTROL still shows the new choice, which is this screen's half of
    // the promise. `saveReadyCard` is mocked to `false` here, so the store's
    // real in-memory fallback never runs — that half is `readyCard.test.ts`'s
    // "still governs the next connect..." pair, and saying so keeps this
    // assertion from being read as covering it.
    expect(checkedIn("Ready screen")).toBe("SKIP");
  });

  it("does not let a working colour tap clear the ready screen's warning", async () => {
    vi.mocked(saveReadyCard).mockReturnValue(false);
    renderScreen();
    await tapSkip();
    expect(screen.getAllByRole("alert")).toHaveLength(1);

    await tapBlue(); // this write succeeds
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(/reload/i);
    expect(alerts[0]).not.toHaveTextContent(/colors/i);
  });

  it("does not let a working ready-screen tap clear the colour warning", async () => {
    seed(STORED);
    vi.mocked(saveJudgeColors).mockReturnValue(false);
    renderScreen();
    await tapBlue();
    expect(screen.getByRole("alert")).toHaveTextContent(/colors/i);

    await tapSkip(); // this write succeeds
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(/colors/i);
  });

  it("shows BOTH warnings when both writes are refused", async () => {
    seed(STORED);
    vi.mocked(saveJudgeColors).mockReturnValue(false);
    vi.mocked(saveReadyCard).mockReturnValue(false);
    renderScreen();
    await tapBlue();
    await tapSkip();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });
});
