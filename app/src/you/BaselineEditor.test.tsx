import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

function mockState(state: unknown) {
  vi.doMock("../api/useBaselines", () => ({ useBaselines: () => state }));
}

function mockReady(
  baselines: { k2Seconds: number | null; k6Seconds: number | null } = BASELINES,
  save = vi.fn(async () => {}),
) {
  mockState({ state: "ready", baselines, save });
  return save;
}

async function renderEditor() {
  const { default: BaselineEditor } = await import("./BaselineEditor");
  render(<BaselineEditor />);
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../api/useBaselines");
});

describe("BaselineEditor", () => {
  it("renders both baselines as formatted mono splits", async () => {
    mockReady();
    await renderEditor();
    expect(screen.getByText("1:52.0")).toBeInTheDocument();
    expect(screen.getByText("2:02.0")).toBeInTheDocument();
  });

  it("shows no confirm block while the draft is clean", async () => {
    mockReady();
    await renderEditor();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /apply baselines/i }),
    ).not.toBeInTheDocument();
  });

  it("stages a nudge into a confirm block without saving", async () => {
    const save = mockReady();
    await renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
    expect(screen.getByText("2k 1:52.0 → 1:51.5")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("discard removes the confirm block and restores the displayed value", async () => {
    mockReady();
    await renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
    expect(screen.getByText("2k 1:52.0 → 1:51.5")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /discard/i }));

    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    expect(screen.getByText("1:52.0")).toBeInTheDocument();
  });

  it("applying saves the full draft exactly once and settles the confirm block", async () => {
    const save = mockReady();
    await renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));

    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ k2Seconds: 111.5, k6Seconds: 122 });
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  it("seeds sensible starting values and prompts the rower when baselines are unset", async () => {
    const save = mockReady({ k2Seconds: null, k6Seconds: null });
    await renderEditor();

    expect(screen.getByText(/starting point/i)).toBeInTheDocument();
    expect(screen.getByText("1:52.0")).toBeInTheDocument();
    expect(screen.getByText("2:02.0")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "6k slower" }));
    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );

    expect(save).toHaveBeenCalledWith({ k2Seconds: 112, k6Seconds: 122.5 });
  });

  it("keeps the draft and surfaces an error when save is rejected", async () => {
    const save = vi.fn(async () => {
      throw new Error("failed to save baselines");
    });
    mockReady(BASELINES, save);
    await renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));

    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );

    expect(screen.getByText("2k 1:52.0 → 1:51.5")).toBeInTheDocument();
    expect(screen.getByText(/couldn.t save/i)).toBeInTheDocument();
  });

  it("shows a loading state before baselines resolve", async () => {
    mockState({ state: "loading" });
    await renderEditor();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows a retry option when baselines fail to load", async () => {
    const retry = vi.fn();
    mockState({ state: "error", retry });
    await renderEditor();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
