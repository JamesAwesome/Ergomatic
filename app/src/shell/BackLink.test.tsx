import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BackLink, { isSafeInAppPath, resolveBackTarget } from "./BackLink";

function renderAt(state: unknown, fallback?: string) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/library/w1", state }]}>
      <BackLink fallback={fallback} />
    </MemoryRouter>,
  );
}

describe("BackLink", () => {
  it.each([
    ["a valid in-app path", { from: "/today" }, "/today"],
    ["no state at all", undefined, "/library"],
    ["state with no `from` key", {}, "/library"],
    [
      "an absolute URL (no leading slash)",
      { from: "https://evil" },
      "/library",
    ],
    ["a protocol-relative path", { from: "//evil" }, "/library"],
    ["an empty string", { from: "" }, "/library"],
    // A "//" doubled up anywhere later in the string, not just at the
    // start — the spec's own wording ("containing //") rather than a
    // leading-only check.
    [
      "a path with a doubled slash mid-string",
      { from: "/library//w1" },
      "/library",
    ],
    ["a non-string value", { from: 42 }, "/library"],
  ])("targets %s -> %s", (_label, state, expected) => {
    renderAt(state);
    expect(screen.getByRole("link", { name: "← BACK" })).toHaveAttribute(
      "href",
      expected,
    );
  });

  it("honors a custom fallback when state is absent", () => {
    renderAt(undefined, "/today");
    expect(screen.getByRole("link", { name: "← BACK" })).toHaveAttribute(
      "href",
      "/today",
    );
  });

  it("honors a custom fallback when state carries a junk `from`", () => {
    renderAt({ from: "//evil" }, "/today");
    expect(screen.getByRole("link", { name: "← BACK" })).toHaveAttribute(
      "href",
      "/today",
    );
  });

  it("still prefers a valid `from` over a custom fallback", () => {
    renderAt({ from: "/plan" }, "/today");
    expect(screen.getByRole("link", { name: "← BACK" })).toHaveAttribute(
      "href",
      "/plan",
    );
  });
});

// ui-notes round, item 1: exported so Reader.tsx's ✕ close can resolve the
// SAME origin BACK does — pinned directly here (not just through the
// component above) so a future refactor of either consumer can't silently
// diverge them.
describe("resolveBackTarget / isSafeInAppPath (exported for Reader.tsx's ✕)", () => {
  it("resolves a valid `from` in state", () => {
    expect(resolveBackTarget({ from: "/today" }, "/news")).toBe("/today");
  });

  it("falls back when state carries no safe `from`", () => {
    expect(resolveBackTarget(null, "/news")).toBe("/news");
    expect(resolveBackTarget({ from: "//evil" }, "/news")).toBe("/news");
  });

  it("isSafeInAppPath rejects the same unsafe shapes BackLink's own table does", () => {
    expect(isSafeInAppPath("/today")).toBe(true);
    expect(isSafeInAppPath("https://evil")).toBe(false);
    expect(isSafeInAppPath("//evil")).toBe(false);
    expect(isSafeInAppPath(42)).toBe(false);
  });
});
