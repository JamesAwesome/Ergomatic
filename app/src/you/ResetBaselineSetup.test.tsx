import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResetBaselineSetup from "./ResetBaselineSetup";

// Phase BL PR C — Reset baseline setup: destructive, so STAGED (nothing
// fires on the first tap), and the DELETE goes out only on the explicit
// confirm. The fetch itself is stubbed at the global seam (src/api.ts's
// `api` is a fetch wrapper); the wire method/path are the assertions.

function stubFetch(response: Partial<Response> = { ok: true }) {
  const fetchSpy = vi.fn(async () => response as Response);
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResetBaselineSetup", () => {
  it("stages: the first tap arms a confirm and sends NOTHING", async () => {
    const fetchSpy = stubFetch();
    const onReset = vi.fn();
    render(<ResetBaselineSetup onReset={onReset} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Reset baseline setup" }),
    );

    // The confirm block says plainly what it does (destructive copy rule)
    // AND what the rower loses the ability to DO (PM final gate C5: the
    // capability clause — split-target workouts can't be started until a
    // baseline is set again).
    expect(
      screen.getByText(
        /This clears both baseline splits\. Workouts with pace targets lose\s+them and can't be started until you set a baseline again\. Today\s+offers the setup doors\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onReset).not.toHaveBeenCalled();
  });

  it("Cancel disarms without sending", async () => {
    const fetchSpy = stubFetch();
    render(<ResetBaselineSetup onReset={vi.fn()} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Reset baseline setup" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByText(/This clears both baseline splits/),
    ).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the confirm sends DELETE /api/baselines and reports success to the caller", async () => {
    const fetchSpy = stubFetch();
    const onReset = vi.fn();
    render(<ResetBaselineSetup onReset={onReset} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Reset baseline setup" }),
    );
    // The armed panel's own lead button (same accessible name — the armed
    // state renders exactly one).
    await userEvent.click(
      screen.getByRole("button", { name: "Reset baseline setup" }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]! as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/baselines");
    expect(init.method).toBe("DELETE");
    expect(onReset).toHaveBeenCalledTimes(1);
    // Settles back to the idle single button.
    expect(
      screen.queryByText(/This clears both baseline splits/),
    ).not.toBeInTheDocument();
  });

  it("a failed clear surfaces an error, stays armed, and never reports success", async () => {
    stubFetch({ ok: false });
    const onReset = vi.fn();
    render(<ResetBaselineSetup onReset={onReset} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Reset baseline setup" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reset baseline setup" }),
    );

    expect(
      await screen.findByText(/Couldn't reset your baseline setup/),
    ).toBeInTheDocument();
    expect(onReset).not.toHaveBeenCalled();
    expect(
      screen.getByText(/This clears both baseline splits/),
    ).toBeInTheDocument();
  });
});
