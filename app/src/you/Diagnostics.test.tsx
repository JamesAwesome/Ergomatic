import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Diagnostics from "./Diagnostics";

// Probe standing in for MonitorLogs: renders the carried location.state.from
// so one assertion pins BOTH the target route and the origin BackLink will
// read there (same pattern as RetestShortcut.test.tsx's own DetailProbe).
function MonitorLogsProbe() {
  const from = (useLocation().state as { from?: unknown } | null)?.from;
  return <p>MONITOR LOGS from={String(from)}</p>;
}

function renderDiagnostics(initialEntries = ["/you/diagnostics"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/you/diagnostics" element={<Diagnostics />} />
        <Route
          path="/you/diagnostics/monitor-logs"
          element={<MonitorLogsProbe />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Diagnostics (the menu, Gate 0 rev 2/3)", () => {
  it('has the "Diagnostics" screen title and the approved caption, exactly', () => {
    renderDiagnostics();
    expect(screen.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
    expect(
      screen.getByText("Tools for looking under the hood."),
    ).toBeInTheDocument();
  });

  it("carries a BACK link falling back to /you", () => {
    renderDiagnostics();
    expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
      "href",
      "/you",
    );
  });

  it('offers exactly one entry, "Monitor logs", with its sub label — built to take more later, one today', () => {
    renderDiagnostics();
    expect(screen.getByText("Monitor logs")).toBeInTheDocument();
    expect(
      screen.getByText("THE LAST 3 CONNECTED SESSIONS"),
    ).toBeInTheDocument();
    const entryLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") !== "/you");
    expect(entryLinks).toHaveLength(1);
  });

  it("tapping Monitor logs navigates there, carrying from=/you/diagnostics for its own BackLink", async () => {
    renderDiagnostics();
    await userEvent.click(screen.getByRole("link", { name: /Monitor logs/ }));
    expect(
      await screen.findByText("MONITOR LOGS from=/you/diagnostics"),
    ).toBeInTheDocument();
  });

  it("the root carries the overlay-screen class and is keyboard-tabbable (tabIndex 0)", () => {
    const { container } = renderDiagnostics();
    const root = container.querySelector("main");
    expect(root).toHaveClass("overlay-screen");
    expect((root as HTMLElement).tabIndex).toBe(0);
  });
});
