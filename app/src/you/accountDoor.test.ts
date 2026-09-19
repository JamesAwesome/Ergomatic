import { describe, expect, it, vi } from "vitest";
import type { AuthFlowController } from "../adapters/authFlow";
import { accountDoorAvailable } from "./accountDoor";

function controller(
  options: AuthFlowController["options"],
): AuthFlowController {
  return {
    options,
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

describe("accountDoorAvailable", () => {
  it("is false while the options read is still in flight", () => {
    expect(accountDoorAvailable(controller({ state: "loading" }))).toBe(false);
  });

  it("is false on a host whose front door is off, which is where the block renders nothing", () => {
    expect(
      accountDoorAvailable(
        controller({
          state: "ready",
          frontDoorEnabled: false,
          legacyGoogle: true,
          apple: false,
          google: true,
        }),
      ),
    ).toBe(false);
  });

  it("is true once the front door is ready, even with only one proof available", () => {
    // The block itself handles a single-proof host: the other row's Add is
    // disabled and Delete stays live on the provider the account holds. The
    // door must not second-guess that, or `Delete account` disappears on a
    // host where it still works.
    expect(
      accountDoorAvailable(
        controller({
          state: "ready",
          frontDoorEnabled: true,
          legacyGoogle: false,
          apple: false,
          google: true,
        }),
      ),
    ).toBe(true);
  });
});
