// The Countdown blocked-start screen's fixture — same rationale as
// `ConnectedSurface.screens.test.tsx`'s file header. This state needs a
// REAL denied localStorage write, which the e2e stack cannot produce (it
// serves a production bundle, and storage-denial spec §3/§5 rules out
// driving a live quota failure through the stack for the capture — the
// `connected-ended-error` precedent this file follows instead). So: this
// file renders the REAL `Countdown` component tree, with the run write
// denied via a mocked `./run`, and writes the resulting markup to
// `e2e/fixtures/`. `e2e/screenshots.spec.ts` loads the real app (real
// `index.css`, real self-hosted fonts) and swaps this markup into the page.
//
// The fixture CANNOT go stale: `toMatchFileSnapshot` writes it when absent
// and FAILS when the component's output no longer matches, so a copy or
// layout change that isn't re-photographed breaks this test first.

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { WorkoutType } from "../../domain/types.js";
import { buildDraft, saveDraft } from "./draft";

const BASELINES = { k2Seconds: 100, k6Seconds: 120 };
const READY_PREFS = {
  difficulties: [] as never[],
  timeCapMinutes: 60,
  countdownSeconds: 10,
};

// Tropical Wave: Gate 0's own fixture (`2026-09-03-blocked-start-gate.html`
// — "5 x 500m at 2k+2", target split 1:52.0), so the approved artboard and
// this capture show the identical numbers.
function tropicalWaveDraft() {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Tropical Wave");
  if (!w) throw new Error("missing library fixture: Tropical Wave");
  return buildDraft({
    id: "id-tropical-wave",
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
}

function mockAdapters() {
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines: BASELINES }),
  }));
  vi.doMock("../api/usePreferences", () => ({
    usePreferences: () => ({ state: "ready", preferences: READY_PREFS }),
  }));
  vi.doMock("../adapters/keepAwake", () => ({
    keepAwakeOn: vi.fn(async () => {}),
    keepAwakeOff: vi.fn(async () => {}),
  }));
  // The run write denied — the state this whole file exists to capture.
  vi.doMock("./run", () => ({
    saveRun: () => false,
    loadRun: () => null,
    clearRun: vi.fn(),
  }));
}

describe("Countdown screen fixtures", () => {
  it("the blocked start (AUD-011/015 storage-denial spec §2, Gate 0 APPROVED 2026-09-03)", async () => {
    localStorage.clear();
    mockAdapters();
    saveDraft(tropicalWaveDraft());
    const { default: Countdown } = await import("./Countdown");
    const view = render(
      <MemoryRouter initialEntries={["/session/countdown"]}>
        <Routes>
          <Route path="/session/countdown" element={<Countdown />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("Couldn't keep your session on this phone.");
    const html = document.querySelector("main.countdown-screen")!.outerHTML;
    view.unmount();
    await expect(html).toMatchFileSnapshot(
      "../../e2e/fixtures/countdown-blocked-start.html",
    );
  });
});
