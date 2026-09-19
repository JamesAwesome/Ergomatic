import { describe, expect, it, vi } from "vitest";
import type { AuthFlowController } from "../adapters/authFlow";
import { accountDoorAvailable, accountScreenController } from "./accountDoor";

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

describe("accountScreenController", () => {
  const ready = {
    state: "ready",
    frontDoorEnabled: true,
    legacyGoogle: false,
    apple: true,
    google: true,
  } as const;

  it("refuses when there is no controller to serve the screen", () => {
    expect(accountScreenController(undefined)).toBeUndefined();
  });

  it("refuses on a settled no", () => {
    expect(
      accountScreenController(
        controller({
          state: "ready",
          frontDoorEnabled: false,
          legacyGoogle: true,
          apple: false,
          google: true,
        }),
      ),
    ).toBeUndefined();
  });

  // THE ONE STATE THE TWO PREDICATES DISAGREE ON, and the disagreement is
  // the point: the door hides on an unanswered read, the route waits on it.
  // Refusing here bounces every direct arrival — a bookmark, a deep link,
  // and every OAuth return — off the screen before its own read lands.
  it("does not refuse while the options read is still in flight, where the door is merely not drawn yet", () => {
    const loading = controller({ state: "loading" });
    expect(accountScreenController(loading)).toBe(loading);
    expect(accountDoorAvailable(loading)).toBe(false);
  });

  it("hands the screen the very controller it was given once the front door is ready", () => {
    const live = controller(ready);
    expect(accountScreenController(live)).toBe(live);
  });
});
