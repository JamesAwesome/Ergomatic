import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import BaselinesScreen from "./BaselinesScreen";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The library read the re-test shortcut rides, plus the baselines read the
 *  editor rides. Both go through the real `src/api.ts`, whose relative-URL
 *  fetch is what these stubs answer. */
function stubApi(
  baselines: { k2Seconds: number | null; k6Seconds: number | null },
  workouts: unknown[] = [],
) {
  const calls: { url: string; method: string }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url === "/api/baselines" && method === "DELETE") {
      return new Response(
        JSON.stringify({ k2Seconds: null, k6Seconds: null }),
        { status: 200 },
      );
    }
    if (url === "/api/baselines") {
      return new Response(JSON.stringify(baselines), { status: 200 });
    }
    if (url.startsWith("/api/workouts")) {
      return new Response(JSON.stringify(workouts), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const renderScreen = (entry = "/you/baselines") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/you" element={<p>You screen</p>} />
        <Route path="/you/baselines" element={<BaselinesScreen />} />
      </Routes>
    </MemoryRouter>,
  );

describe("BaselinesScreen — the three controls that left You", () => {
  it("holds the editor, so the numbers are still editable one tap in", async () => {
    stubApi({ k2Seconds: 118, k6Seconds: 127 });
    renderScreen();
    expect(
      await screen.findByRole("textbox", { name: "2k split" }),
    ).toHaveValue("1:58.0");
    expect(screen.getByRole("textbox", { name: "6k split" })).toHaveValue(
      "2:07.0",
    );
  });

  it("holds the re-test shortcut, still pointing at the designated rows", async () => {
    stubApi({ k2Seconds: 118, k6Seconds: 127 }, [
      { id: "w6", title: "6K Test", isGlobal: true, steps: [] },
      { id: "w2", title: "2K Test", isGlobal: true, steps: [] },
    ]);
    renderScreen();
    expect(
      await screen.findByRole("link", { name: "ROW THE 6K" }),
    ).toHaveAttribute("href", "/library/w6");
    expect(screen.getByRole("link", { name: "RACE THE 2K" })).toHaveAttribute(
      "href",
      "/library/w2",
    );
  });

  // Moved here from `You.test.tsx` with the components themselves: this is
  // the screen's OWN contribution now — a successful reset remounts the
  // editor so it refetches the emptied server state instead of keeping the
  // cleared numbers on screen. The staged-confirm behavior itself still
  // lives in ResetBaselineSetup's own test.
  it("a confirmed reset makes the editor refetch (remount via the generation key)", async () => {
    const calls = stubApi({ k2Seconds: 118, k6Seconds: 127 });
    renderScreen();
    expect(
      await screen.findByRole("textbox", { name: "2k split" }),
    ).toHaveValue("1:58.0");
    const baselineGets = () =>
      calls.filter((c) => c.url === "/api/baselines" && c.method === "GET")
        .length;
    expect(baselineGets()).toBe(1);

    await userEvent.click(
      screen.getByRole("button", { name: "Reset baseline setup" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reset baseline setup" }),
    );

    await vi.waitFor(() => expect(baselineGets()).toBe(2));
    expect(
      calls.some((c) => c.url === "/api/baselines" && c.method === "DELETE"),
    ).toBe(true);
  });

  // The one class the review's keyboard-occlusion concern turns on
  // (`BaselinesScreen.tsx`'s own comment): pinned so a later tidy-up that
  // "makes it match its sibling doors" has to argue with a red test.
  it("is a plain .screen, never the fixed .overlay-screen its read-only siblings use", async () => {
    stubApi({ k2Seconds: 118, k6Seconds: 127 });
    const { container } = renderScreen();
    await screen.findByRole("textbox", { name: "2k split" });
    const main = container.querySelector("main");
    expect(main).toHaveClass("screen");
    expect(main).not.toHaveClass("overlay-screen");
  });

  it("BACK falls back to You when nothing said where the rower came from", async () => {
    stubApi({ k2Seconds: null, k6Seconds: null });
    renderScreen();
    await userEvent.click(await screen.findByRole("link", { name: "← BACK" }));
    expect(screen.getByText("You screen")).toBeVisible();
  });
});
