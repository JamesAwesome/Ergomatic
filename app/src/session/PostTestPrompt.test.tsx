import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { api } from "../api";

// Phase BL PR B (baseline-onboarding spec rev 2, "The post-test prompt"):
// the post-save offer screen. These tests pin the WIRE it produces — the
// accept writes the measured number with a `tested` source, the optional
// second offer writes the derived counterpart with `derived`, and decline
// writes NOTHING (recording already happened in the save flow, before this
// component ever mounted).

function mockApi(
  handler: (path: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const fn = vi.fn<typeof api>(async (path, init) => handler(path, init));
  vi.doMock("../api", () => ({ api: fn }));
  return fn;
}

function ok() {
  return new Response(JSON.stringify({ k2Seconds: 118.4, k6Seconds: null }), {
    status: 200,
  });
}

function parsedBodies(
  fn: ReturnType<typeof mockApi>,
): { path: string; body: Record<string, unknown> }[] {
  return fn.mock.calls.map(([path, init]) => ({
    path: path as string,
    body: JSON.parse((init as RequestInit).body as string) as Record<
      string,
      unknown
    >,
  }));
}

async function renderPrompt(props: {
  offer: { distance: "2k" | "6k"; splitSeconds: number };
  stored: { k2Seconds: number | null; k6Seconds: number | null } | null;
  onDone: () => void;
}) {
  const { default: PostTestPrompt } = await import("./PostTestPrompt");
  return render(<PostTestPrompt {...props} />);
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock("../api");
});

describe("PostTestPrompt", () => {
  it("shows the measured split and confirms the session is already saved", async () => {
    mockApi(ok);
    await renderPrompt({
      offer: { distance: "2k", splitSeconds: 118.4 },
      stored: { k2Seconds: null, k6Seconds: null },
      onDone: vi.fn(),
    });
    expect(screen.getByText("SESSION SAVED")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Set your 2k baseline?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1:58.4")).toBeInTheDocument();
  });

  it("decline calls onDone without a single API call — the baseline is untouched", async () => {
    const apiFn = mockApi(ok);
    const onDone = vi.fn();
    await renderPrompt({
      offer: { distance: "2k", splitSeconds: 118.4 },
      stored: { k2Seconds: null, k6Seconds: 126 },
      onDone,
    });
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(apiFn).not.toHaveBeenCalled();
  });

  it("accept PUTs the measured number with a tested source — the number and its provenance move together", async () => {
    const apiFn = mockApi(ok);
    await renderPrompt({
      offer: { distance: "2k", splitSeconds: 118.4 },
      stored: { k2Seconds: null, k6Seconds: 126 },
      onDone: vi.fn(),
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Set 2k baseline" }),
    );
    const calls = parsedBodies(apiFn);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe("/api/baselines");
    expect(calls[0]!.body).toStrictEqual({
      k2Seconds: 118.4,
      k2Source: "tested",
    });
  });

  it("a consistent stored counterpart means accept finishes immediately — no second offer", async () => {
    mockApi(ok);
    const onDone = vi.fn();
    await renderPrompt({
      offer: { distance: "2k", splitSeconds: 118.4 },
      stored: { k2Seconds: null, k6Seconds: 126 },
      onDone,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Set 2k baseline" }),
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a missing counterpart earns the second, optional derive offer, and accepting it writes derived — never tested, never manual", async () => {
    const apiFn = mockApi(ok);
    const onDone = vi.fn();
    await renderPrompt({
      offer: { distance: "2k", splitSeconds: 118.4 },
      stored: { k2Seconds: null, k6Seconds: null },
      onDone,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Set 2k baseline" }),
    );
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText("2K BASELINE SET")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Also set your 6k?" }),
    ).toBeInTheDocument();
    // 118.4 + 7 = 125.4, the editor's own derivation heuristic.
    expect(screen.getByText("2:05.4")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Set 6k estimate" }),
    );
    expect(onDone).toHaveBeenCalledTimes(1);

    const calls = parsedBodies(apiFn);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.path).toBe("/api/baselines");
    expect(calls[1]!.body).toStrictEqual({
      k6Seconds: 125.4,
      k6Source: "derived",
    });
  });

  it("skipping the second offer finishes with only the tested write on the wire", async () => {
    const apiFn = mockApi(ok);
    const onDone = vi.fn();
    await renderPrompt({
      offer: { distance: "6k", splitSeconds: 130 },
      stored: { k2Seconds: null, k6Seconds: null },
      onDone,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Set 6k baseline" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(parsedBodies(apiFn)).toHaveLength(1);
    expect(parsedBodies(apiFn)[0]!.body).toStrictEqual({
      k6Seconds: 130,
      k6Source: "tested",
    });
  });

  it("an inconsistent stored counterpart (k2 >= k6 after the accept) earns the derive offer too", async () => {
    mockApi(ok);
    await renderPrompt({
      // Accepted 2k of 126 against a stored 6k of 125: inverted pair.
      offer: { distance: "2k", splitSeconds: 126 },
      stored: { k2Seconds: null, k6Seconds: 125 },
      onDone: vi.fn(),
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Set 2k baseline" }),
    );
    expect(
      screen.getByRole("heading", { name: "Also set your 6k?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2:13.0")).toBeInTheDocument();
  });

  it("unknown stored baselines (the fetch never resolved) still allow the tested accept, just never a second offer", async () => {
    const apiFn = mockApi(ok);
    const onDone = vi.fn();
    await renderPrompt({
      offer: { distance: "2k", splitSeconds: 118.4 },
      stored: null,
      onDone,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Set 2k baseline" }),
    );
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(parsedBodies(apiFn)).toHaveLength(1);
  });

  it("a failed accept keeps the offer on screen with an error — retry and decline both stay live", async () => {
    let fail = true;
    const apiFn = mockApi(() =>
      fail ? new Response("nope", { status: 500 }) : ok(),
    );
    const onDone = vi.fn();
    await renderPrompt({
      offer: { distance: "2k", splitSeconds: 118.4 },
      stored: { k2Seconds: null, k6Seconds: 126 },
      onDone,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Set 2k baseline" }),
    );
    expect(
      screen.getByText("Couldn't save your baseline. Try again."),
    ).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    fail = false;
    await userEvent.click(
      screen.getByRole("button", { name: "Set 2k baseline" }),
    );
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(apiFn).toHaveBeenCalledTimes(2);
  });
});
