import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BackLink from "./BackLink";

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
