import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { api } from "../api";

// Typed against the real `api` signature so `.mock.calls[0]` carries the
// actual [path, RequestInit] shape callers below destructure to inspect the
// posted body — same convention as Builder.test.tsx's mockApi.
function mockApi(handler: () => Response) {
  const fn = vi.fn<typeof api>(async () => handler());
  vi.doMock("../api", () => ({ api: fn }));
  return fn;
}

async function renderBulkImport(onImported: () => void = vi.fn()) {
  const { default: BulkImport } = await import("./BulkImport");
  render(
    <MemoryRouter>
      <BulkImport onImported={onImported} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetModules();
});

describe("BulkImport", () => {
  it("renders as its own screen with a heading, a back link to the library, and the textarea already visible", async () => {
    mockApi(() => new Response(null, { status: 201 }));
    await renderBulkImport();

    expect(screen.getByRole("heading", { name: "Import" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← BACK" })).toHaveAttribute(
      "href",
      "/library",
    );
    // No reveal toggle any more — the textarea is on screen immediately.
    expect(
      screen.queryByRole("button", { name: /BULK IMPORT/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("One workout per block, blank line between"),
    ).toBeInTheDocument();
  });

  it("documents the now-optional leading number in the grammar help", async () => {
    mockApi(() => new Response(null, { status: 201 }));
    await renderBulkImport();

    expect(document.body.textContent).toMatch(
      /title \| TYPE \| difficulty \| pain/,
    );
  });

  it("posts the raw pasted text to /api/workouts/bulk", async () => {
    const apiMock = mockApi(
      () =>
        new Response(JSON.stringify({ created: [], errors: [] }), {
          status: 200,
        }),
    );
    await renderBulkImport();

    const pasted = "Ladder Day | AT | medium | 3\nwu 10\nw 1' 6k-2 @22 r5";
    await userEvent.type(
      screen.getByPlaceholderText("One workout per block, blank line between"),
      pasted,
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(apiMock).toHaveBeenCalledWith("/api/workouts/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: pasted }),
    });
  });

  it("renders both halves of a partial result and stays on the panel instead of navigating away", async () => {
    const onImported = vi.fn();
    mockApi(
      () =>
        new Response(
          JSON.stringify({
            created: [{}, {}],
            errors: [{ line: 7, message: "unknown step word: zz" }],
          }),
          { status: 200 },
        ),
    );
    await renderBulkImport(onImported);

    await userEvent.type(
      screen.getByPlaceholderText("One workout per block, blank line between"),
      "irrelevant, server owns parsing",
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    // Both halves render: what was created, and every error with its line
    // number, so the rower can fix the bad blocks and paste again.
    expect(await screen.findByText(/2 created/)).toBeInTheDocument();
    expect(screen.getByText(/unknown step word: zz/)).toBeInTheDocument();
    expect(screen.getByText(/line 7/)).toBeInTheDocument();
    // A partial result must not navigate away — that would bury the error
    // the rower needs to read before pasting again.
    expect(onImported).not.toHaveBeenCalled();
  });

  it("does not claim success when every block errored", async () => {
    const onImported = vi.fn();
    mockApi(
      () =>
        new Response(
          JSON.stringify({
            created: [],
            errors: [{ line: 2, message: "title is required" }],
          }),
          { status: 200 },
        ),
    );
    await renderBulkImport(onImported);

    await userEvent.type(
      screen.getByPlaceholderText("One workout per block, blank line between"),
      "irrelevant, server owns parsing",
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText(/title is required/)).toBeInTheDocument();
    expect(screen.getByText(/0 created/)).toBeInTheDocument();
    expect(screen.queryByText(/success/i)).not.toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });

  it("reports the count and calls onImported when every block is created", async () => {
    const onImported = vi.fn();
    mockApi(
      () =>
        new Response(JSON.stringify({ created: [{}, {}, {}], errors: [] }), {
          status: 200,
        }),
    );
    await renderBulkImport(onImported);

    await userEvent.type(
      screen.getByPlaceholderText("One workout per block, blank line between"),
      "irrelevant, server owns parsing",
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText(/3 created/)).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it("announces the result summary to assistive tech via role=alert", async () => {
    mockApi(
      () =>
        new Response(JSON.stringify({ created: [{}], errors: [] }), {
          status: 200,
        }),
    );
    await renderBulkImport();

    await userEvent.type(
      screen.getByPlaceholderText("One workout per block, blank line between"),
      "irrelevant, server owns parsing",
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("1 created");
  });

  it("shows an error and claims no success when the server responds non-ok (e.g. 413 on an oversized paste)", async () => {
    const onImported = vi.fn();
    mockApi(() => new Response(null, { status: 413 }));
    await renderBulkImport(onImported);

    await userEvent.type(
      screen.getByPlaceholderText("One workout per block, blank line between"),
      "a paste too large for the server to accept",
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(
      await screen.findByText("Couldn't import. Try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/created/)).not.toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });

  it("shows an error and claims no success when the request throws (dropped connection)", async () => {
    const onImported = vi.fn();
    const fn = vi.fn<typeof api>(async () => {
      throw new Error("network down");
    });
    vi.doMock("../api", () => ({ api: fn }));
    await renderBulkImport(onImported);

    await userEvent.type(
      screen.getByPlaceholderText("One workout per block, blank line between"),
      "irrelevant, connection drops before a response arrives",
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(
      await screen.findByText("Couldn't import. Try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/created/)).not.toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });

  it("shows the dropped-warm-ups notice when the server reports a nonzero count", async () => {
    mockApi(
      () =>
        new Response(
          JSON.stringify({ created: [{}], errors: [], droppedWarmups: 2 }),
          { status: 200 },
        ),
    );
    await renderBulkImport();

    await userEvent.type(
      screen.getByPlaceholderText("One workout per block, blank line between"),
      "irrelevant, server owns parsing",
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(
      await screen.findByText(
        "2 warm-up lines dropped. Warm-ups are a setting now.",
      ),
    ).toBeInTheDocument();
  });

  it("shows no dropped-warm-ups notice when the count is zero", async () => {
    mockApi(
      () =>
        new Response(
          JSON.stringify({ created: [{}], errors: [], droppedWarmups: 0 }),
          { status: 200 },
        ),
    );
    await renderBulkImport();

    await userEvent.type(
      screen.getByPlaceholderText("One workout per block, blank line between"),
      "irrelevant, server owns parsing",
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText(/1 created/)).toBeInTheDocument();
    expect(screen.queryByText(/dropped/)).not.toBeInTheDocument();
  });

  // Task 6's own brief: the warm-up-only-block parse error
  // (domain/bulk.ts's "workout needs at least one step. Warm-ups are a
  // setting now.") is a plain line-keyed BulkError, so it needs no special
  // rendering — this pins that the existing generic errors.map already
  // carries it through unchanged.
  it("renders the warm-up-only-block error like any other line error", async () => {
    mockApi(
      () =>
        new Response(
          JSON.stringify({
            created: [],
            errors: [
              {
                line: 1,
                message:
                  "workout needs at least one step. Warm-ups are a setting now.",
              },
            ],
            droppedWarmups: 1,
          }),
          { status: 200 },
        ),
    );
    await renderBulkImport();

    await userEvent.type(
      screen.getByPlaceholderText("One workout per block, blank line between"),
      "irrelevant, server owns parsing",
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(
      await screen.findByText(
        /workout needs at least one step\. Warm-ups are a setting now\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/line 1/)).toBeInTheDocument();
  });

  it("renders a null-line error's message with no 'line null' artifact", async () => {
    mockApi(
      () =>
        new Response(
          JSON.stringify({
            created: [],
            errors: [{ line: null, message: "text must not be empty" }],
          }),
          { status: 200 },
        ),
    );
    await renderBulkImport();

    await userEvent.type(
      screen.getByPlaceholderText("One workout per block, blank line between"),
      "irrelevant, server owns parsing",
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(
      await screen.findByText(/text must not be empty/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/line null/)).not.toBeInTheDocument();
  });
});
