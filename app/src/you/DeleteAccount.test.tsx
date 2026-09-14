import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AuthFlowController, AuthFlowView } from "../adapters/authFlow";
import DeleteAccount from "./DeleteAccount";

function controller(view: AuthFlowView): AuthFlowController {
  return {
    options: {
      state: "ready",
      frontDoorEnabled: true,
      legacyGoogle: false,
      apple: true,
      google: true,
    },
    view,
    targetAuthorizationBusy: false,
    destination: null,
    startSignIn: vi.fn(),
    confirmAccount: vi.fn(),
    useUsualSignIn: vi.fn(),
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

describe("DeleteAccount", () => {
  it("names what goes and what happens, and nothing else", () => {
    render(
      <DeleteAccount
        auth={controller({ kind: "delete_ready" })}
        onDeleted={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Delete this account?" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Deletes your workouts, session log, plan, baselines, and test history.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Signs you out on this device.")).toBeVisible();
  });

  // Gate 0 ruling 2 (James, 2026-09-14): the Concept2 link row IS deleted
  // with the account, but this screen must not claim it — we never
  // deauthorize at Concept2's end, and naming it here implies we do.
  it("never names Concept2", () => {
    const { container } = render(
      <DeleteAccount
        auth={controller({ kind: "delete_ready" })}
        onDeleted={vi.fn()}
      />,
    );
    expect(container.textContent).not.toMatch(/concept ?2/i);
  });

  it("acts only on the rower's own confirmation, and offers a way out", async () => {
    const auth = controller({ kind: "delete_ready" });
    render(<DeleteAccount auth={auth} onDeleted={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(auth.cancel).toHaveBeenCalledOnce();
    expect(auth.confirmDelete).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete account" }),
    );
    expect(auth.confirmDelete).toHaveBeenCalledOnce();
  });

  it("hands the signed-out transition over once the server has confirmed", () => {
    const onDeleted = vi.fn();
    const { container, rerender } = render(
      <DeleteAccount
        auth={controller({ kind: "delete_ready" })}
        onDeleted={onDeleted}
      />,
    );
    expect(onDeleted).not.toHaveBeenCalled();
    rerender(
      <DeleteAccount
        auth={controller({ kind: "deleted", appleRevoked: true })}
        onDeleted={onDeleted}
      />,
    );
    expect(onDeleted).toHaveBeenCalledOnce();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on a view that has not proved anything", () => {
    const { container } = render(
      <DeleteAccount auth={controller({ kind: "idle" })} onDeleted={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
