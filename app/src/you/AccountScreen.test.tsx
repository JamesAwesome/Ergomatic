import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { AuthFlowController } from "../adapters/authFlow";
import { api } from "../api";
import AccountScreen from "./AccountScreen";

vi.mock("../api", () => ({ api: vi.fn() }));

beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue(
    new Response(JSON.stringify({ apple: false, google: true }), {
      status: 200,
    }),
  );
});

function controller(): AuthFlowController {
  return {
    options: {
      state: "ready",
      frontDoorEnabled: true,
      legacyGoogle: false,
      apple: true,
      google: true,
    },
    view: { kind: "idle" },
    targetAuthorizationBusy: false,
    destination: null,
    startSignIn: vi.fn(),
    confirmAccount: vi.fn(),
    useUsualSignIn: vi.fn(),
    confirmAttach: vi.fn(),
    declineAttach: vi.fn(),
    prepareLink: vi.fn(),
    startPreparedLink: vi.fn(),
    authorizeLinkTarget: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
    abandon: vi.fn(),
    removeMethod: vi.fn(),
    startDelete: vi.fn(),
    confirmDelete: vi.fn(),
  };
}

describe("AccountScreen", () => {
  it("carries the whole account block — the methods list and the delete box", async () => {
    render(
      <MemoryRouter>
        <AccountScreen auth={controller()} />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "SIGN-IN METHODS" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Delete account" }),
    ).toBeVisible();
  });

  it("is titled Account and backs out to You", async () => {
    render(
      <MemoryRouter>
        <AccountScreen auth={controller()} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Account" }),
    ).toBeVisible();
    // No `from` in state here — a cold load or a deep link — so the fallback
    // is what the rower gets, and it is You rather than the app-wide
    // `/library` default.
    expect(screen.getByRole("link", { name: "← BACK" })).toHaveAttribute(
      "href",
      "/you",
    );
    await screen.findByRole("heading", { name: "SIGN-IN METHODS" });
  });
});
