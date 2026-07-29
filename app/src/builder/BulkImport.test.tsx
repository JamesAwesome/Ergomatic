import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  render(<BulkImport onImported={onImported} />);
}

beforeEach(() => {
  vi.resetModules();
});

describe("BulkImport", () => {
  it("hides the panel until + PASTE TO BULK IMPORT is pressed, then reveals the textarea with its placeholder", async () => {
    mockApi(() => new Response(null, { status: 201 }));
    await renderBulkImport();

    expect(
      screen.queryByPlaceholderText(
        "One workout per block, blank line between",
      ),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "+ PASTE TO BULK IMPORT" }),
    );

    expect(
      screen.getByPlaceholderText("One workout per block, blank line between"),
    ).toBeInTheDocument();
  });

  it("posts the raw pasted text to /api/workouts/bulk", async () => {
    const apiMock = mockApi(
      () =>
        new Response(JSON.stringify({ created: [], errors: [] }), {
          status: 200,
        }),
    );
    await renderBulkImport();

    await userEvent.click(
      screen.getByRole("button", { name: "+ PASTE TO BULK IMPORT" }),
    );
    const pasted = "12 | Ladder Day | AT | medium | 3\nwu 10\nw 1' 6k-2 @22 r5";
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

  it("renders both halves of a partial result — the created count and the failing line's number and message", async () => {
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
    await renderBulkImport();

    await userEvent.click(
      screen.getByRole("button", { name: "+ PASTE TO BULK IMPORT" }),
    );
    await userEvent.type(
      screen.getByPlaceholderText("One workout per block, blank line between"),
      "irrelevant, server owns parsing",
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText(/2 created/)).toBeInTheDocument();
    expect(screen.getByText(/unknown step word: zz/)).toBeInTheDocument();
    expect(screen.getByText(/line 7/)).toBeInTheDocument();
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

    await userEvent.click(
      screen.getByRole("button", { name: "+ PASTE TO BULK IMPORT" }),
    );
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

    await userEvent.click(
      screen.getByRole("button", { name: "+ PASTE TO BULK IMPORT" }),
    );
    await userEvent.type(
      screen.getByPlaceholderText("One workout per block, blank line between"),
      "irrelevant, server owns parsing",
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText(/3 created/)).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledTimes(1);
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

    await userEvent.click(
      screen.getByRole("button", { name: "+ PASTE TO BULK IMPORT" }),
    );
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
