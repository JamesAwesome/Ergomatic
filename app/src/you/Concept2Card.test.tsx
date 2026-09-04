import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  act,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LinkOutcome } from "../adapters/linkFlow";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.doUnmock("../api");
  vi.doUnmock("../adapters/linkFlow");
});

function mount(status: unknown, startLink = vi.fn()) {
  const api = vi.fn(
    async (_path: string, _init?: RequestInit) =>
      new Response(JSON.stringify(status), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.doMock("../api", () => ({ api }));
  vi.doMock("../adapters/linkFlow", () => ({ startLink }));
  return { api, startLink };
}

async function renderCard() {
  vi.resetModules();
  const { default: Concept2Card } = await import("./Concept2Card");
  render(<Concept2Card email="james@jamestheaweso.me" />);
}

const LINKED = {
  available: true,
  linked: true,
  c2UserId: 2211,
  c2Username: "jamesawesome",
  needsReauth: false,
  logbookBaseUrl: "https://log-dev.concept2.com",
};

describe("Concept2Card availability (spec §Architecture 8: a capability gate, not a cosmetic hide)", () => {
  it("renders NOTHING when the server says the surface is unavailable", async () => {
    const { api } = mount({ available: false });
    await renderCard();
    // Await a POSITIVE observable owned by the async work before asserting
    // an absence. There is no DOM signal here by construction (the whole
    // point is that nothing renders), so the observable is the mount
    // effect's own request. M14 is what proves this can go red: with the
    // `!link.available` clause dropped the card renders and this fails.
    // The earlier draft awaited a `c2-probe-settled` testid that no
    // prescribed component ever renders, and the paste-test measured M14
    // NOT BITING against it.
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/concept2/link"));
    expect(screen.queryByText("CONCEPT2")).toBeNull();
  });
});

describe("Concept2Card read failed (Gate 0 amendment 1i)", () => {
  it("says the read failed and offers a Retry, rather than going silent like an unavailable server", async () => {
    // 1h and 1i are different answers and must not share one rendering.
    // `{available:false}` means "this deployment has no Concept2" and
    // renders nothing. A failed read means "we could not find out", which
    // is a fault, is retryable, and would be a lie if drawn as absence.
    const api = vi.fn(
      async () => new Response("<html>502</html>", { status: 502 }),
    );
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    expect(
      await screen.findByText("Couldn't reach Concept2 linking."),
    ).toBeTruthy();
    expect(screen.getByText("REASON: THE SERVER ANSWERED 502")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    // Never the unlinked card: no Connect, no weight-class ask.
    expect(
      screen.queryByRole("button", { name: "CONNECT TO CONCEPT2" }),
    ).toBeNull();
  });

  it("names NO CONNECTION when the request never completed", async () => {
    const api = vi.fn(async () => Promise.reject(new Error("offline")));
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    expect(await screen.findByText("REASON: NO CONNECTION")).toBeTruthy();
  });

  it("Retry re-reads, and a card that comes back renders the real state", async () => {
    let ok = false;
    const api = vi.fn(async () =>
      ok
        ? new Response(JSON.stringify({ available: true, linked: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        : new Response("nope", { status: 500 }),
    );
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    await screen.findByRole("button", { name: "Retry" });
    ok = true;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    ).toBeTruthy();
    expect(screen.queryByText("Couldn't reach Concept2 linking.")).toBeNull();
  });
});

describe("Concept2Card unlinked (board 1a, Gate 0 amendment change 1)", () => {
  it("asks the rower NOTHING and offers a live Connect from the first paint (ruling i)", async () => {
    // James, 2026-09-03: "I don't want that set in our app. I want it to
    // be set on Concept2's side." An earlier revision dimmed Connect until
    // a weight class was picked; there is no question to answer now, so a
    // dimmed Connect would be a control waiting on nothing.
    mount({ available: true, linked: false });
    await renderCard();
    const connect = await screen.findByRole("button", {
      name: "CONNECT TO CONCEPT2",
    });
    expect(connect).not.toBeDisabled();
    // No radiogroup, and no input of any kind: this card collects nothing.
    // Asserted as an ABSENCE only after the positive observable above
    // resolved, so it cannot pass by arriving early.
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("calls startLink with NO arguments, so nothing about the rower can travel with it", async () => {
    // Exit criterion 3 as amended: the link flow's request bodies carry NO
    // new user attribute. `toHaveBeenCalledWith()` with an empty argument
    // list is the assertion — `toHaveBeenCalled()` alone would stay green
    // against a card that started passing something again.
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "navigating",
    }));
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    expect(startLink).toHaveBeenCalledWith();
  });
});

describe("Concept2Card linked (Gate 0 amendment 1c)", () => {
  it("names both principals, and no weight class exists to show", async () => {
    mount(LINKED);
    await renderCard();
    expect(
      await screen.findByText(
        "Concept2 jamesawesome · Ergomatic james@jamestheaweso.me",
      ),
    ).toBeTruthy();
    expect(screen.getByText("LINKED ✓")).toBeTruthy();
    // The board's approved amendment said "Weight class does not show on
    // linked cards"; ruling (i) makes that true of every card, because
    // there is no class anywhere in the client to show. Kept as an
    // assertion rather than deleted: it is the cheapest gate on a future
    // change putting one back.
    expect(screen.queryByText(/Heavyweight|Lightweight/)).toBeNull();
  });
});

describe("Concept2Card unlink (board 1d: two taps, 4 s auto-disarm)", () => {
  it("does not delete on the first tap", async () => {
    const { api } = mount(LINKED);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Unlink Concept2" }),
    );
    expect(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    ).toBeTruthy();
    expect(
      api.mock.calls.filter((c) => c[1]?.method === "DELETE"),
    ).toHaveLength(0);
  });

  it("deletes on the second tap", async () => {
    const { api } = mount(LINKED);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    const deletes = api.mock.calls.filter((c) => c[1]?.method === "DELETE");
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.[0]).toBe("/api/concept2/link");
  });

  it("disarms on its own after 4 s, so a forgotten arm cannot be completed by a later stray tap", async () => {
    // `fireEvent.click`, NOT `userEvent`, for this one interaction. Root
    // caused by the paste-test down to a minimal two-test repro: an
    // earlier test in the file using the module-level `userEvent.click`
    // API leaves state that makes a LATER
    // `userEvent.setup({ advanceTimers })` click misbehave — the label
    // reverts as if the 4 s timer had already fired, immediately after the
    // click. Converting every click in the file to `.setup()` instances
    // did not fix it, and neither did installing fake timers only after
    // the render settled. `fireEvent.click` has no internal pointer or
    // timer machinery and was stable across three repeated runs.
    mount(LINKED);
    await renderCard();
    const unlink = await screen.findByRole("button", {
      name: "Unlink Concept2",
    });
    vi.useFakeTimers();
    fireEvent.click(unlink);
    expect(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    ).toBeTruthy();
    // INDEPENDENT literals, never the production constant (RF21's own
    // "a test that imports the constant it exists to gate proves nothing").
    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    ).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      screen.getByRole("button", { name: "Unlink Concept2" }),
    ).toBeTruthy();
  });

  it("says the link is unchanged when the DELETE is refused, instead of appearing to do nothing", async () => {
    // Gate 0 amendment 1j. Without the `else`, a refused DELETE takes the
    // `finally` and nothing else: the arm clears, the card re-renders
    // LINKED, and the rower's second tap looks like it silently failed —
    // or worse, like it worked and the card is wrong.
    const api = vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? new Response("nope", { status: 500 })
        : new Response(JSON.stringify(LINKED), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
    );
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    expect(
      await screen.findByText("Couldn't unlink. Your link is unchanged."),
    ).toBeTruthy();
    expect(screen.getByText("REASON: THE SERVER ANSWERED 500")).toBeTruthy();
    // The link is genuinely still there, and the card still says so.
    expect(screen.getByText("LINKED ✓")).toBeTruthy();
  });

  it("clears the unlink failure when a later unlink succeeds", async () => {
    let deleteOk = false;
    let linked = true;
    const api = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        if (deleteOk) linked = false;
        return new Response(null, { status: deleteOk ? 204 : 500 });
      }
      return new Response(
        JSON.stringify(linked ? LINKED : { available: true, linked: false }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    await screen.findByText("Couldn't unlink. Your link is unchanged.");
    deleteOk = true;
    await userEvent.click(
      screen.getByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    expect(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    ).toBeTruthy();
    expect(
      screen.queryByText("Couldn't unlink. Your link is unchanged."),
    ).toBeNull();
  });

  it("a relink offers Connect again and asks nothing, exactly as the first link did (invariant I4)", async () => {
    // Ruling (i) retired this test's original subject — there is no draft
    // class to reset on unlink, because there is no draft. What survives
    // is the property worth keeping: after an unlink the card returns to
    // the unlinked state cleanly, with a live Connect and no residue of
    // the account just removed. Drives the real sequence rather than
    // mounting the end state, so the return is observed rather than
    // assumed.
    let linked = false;
    const api = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        linked = false;
        return new Response(null, { status: 204 });
      }
      return new Response(
        JSON.stringify(linked ? LINKED : { available: true, linked: false }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const startLink = vi.fn(async (): Promise<LinkOutcome> => {
      linked = true;
      return { kind: "linked", c2UserId: 2211, stateEchoed: true };
    });
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink }));
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    await screen.findByText("LINKED ✓");
    await userEvent.click(
      screen.getByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    const connect = await screen.findByRole("button", {
      name: "CONNECT TO CONCEPT2",
    });
    expect(connect).not.toBeDisabled();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    // No residue of the account just removed: the identity line is gone.
    expect(screen.queryByText(/jamesawesome/)).toBeNull();
  });

  it("leaves no failed attempt on screen once the unlink lands", async () => {
    // THE TEST THE BRIEF'S M21 NEEDED AND DID NOT HAVE. The brief asserts
    // that removing `setOutcome(null)` from `unlink()`'s success branch
    // reddens "a relink offers Connect again"; measured against that test,
    // it does not, and cannot — the outcome that survives there is
    // `{kind:"linked"}`, which `describeFailure` answers `null` for and
    // nothing else on the card reads, so the residue is unobservable.
    //
    // The residue IS observable one state over. A RECONNECT that fails sets
    // `outcome` while the card is still LINKED, where every failure panel
    // is gated shut by `!link.linked`. The unlink then opens that gate:
    // without the clear, the freshly unlinked card renders the OLD
    // attempt's panel and a Try again, describing an attempt against an
    // account this device no longer has.
    let linked = true;
    const api = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        linked = false;
        return new Response(null, { status: 204 });
      }
      return new Response(
        JSON.stringify(
          linked
            ? { ...LINKED, needsReauth: true }
            : { available: true, linked: false },
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "declined",
      stateEchoed: false,
    }));
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink }));
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "RECONNECT CONCEPT2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    // Positive observable first, then the absences (RF21's async rule).
    await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" });
    expect(screen.queryByText("THE LINK DIDN'T FINISH")).toBeNull();
    expect(
      screen.queryByText("You cancelled at Concept2. Nothing was linked."),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("names NO CONNECTION when the unlink request never completed", async () => {
    // The 1j panel's other reading. A DELETE that never reaches the server
    // at all takes `unlink()`'s `catch`, not its `else`, and a rower on a
    // dropped connection must still be told the link is UNCHANGED rather
    // than left to guess from a control that silently re-armed.
    const api = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") throw new Error("offline");
      return new Response(JSON.stringify(LINKED), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    expect(await screen.findByText("REASON: NO CONNECTION")).toBeTruthy();
    expect(
      screen.getByText("Couldn't unlink. Your link is unchanged."),
    ).toBeTruthy();
    // The grant is genuinely still live and the card still says so; and the
    // arm is spent on this exit too, so no stray tap re-fires the DELETE.
    expect(screen.getByText("LINKED ✓")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Unlink Concept2" }),
    ).toBeTruthy();
  });
});

describe("Concept2Card outcomes (Gate 0 amendment 1e/1f/1g)", () => {
  it("renders the failure line and its REASON", async () => {
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "exchangeFailed",
      status: 502,
      error: "c2_error",
      stateEchoed: true,
    }));
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    expect(
      await screen.findByText("REASON: CONCEPT2 REFUSED THE LINK · 502"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("Try again runs a whole new attempt, and a link that lands clears the failure", async () => {
    // RF4: the panel's button is asserted to WORK, not merely to exist.
    // The test above proves 1e renders a Try again; nothing proved it was
    // wired, and a dead retry on the one screen that offers recovery is
    // exactly the defect that costs a walk.
    let attempt = 0;
    let linked = false;
    const api = vi.fn(
      async () =>
        new Response(
          JSON.stringify(linked ? LINKED : { available: true, linked: false }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    const startLink = vi.fn(async (): Promise<LinkOutcome> => {
      attempt += 1;
      if (attempt === 1) return { kind: "networkError", message: "boom" };
      linked = true;
      return { kind: "linked", c2UserId: 2211, stateEchoed: true };
    });
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink }));
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    await screen.findByText("THE LINK DIDN'T FINISH");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("LINKED ✓")).toBeTruthy();
    expect(startLink).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("THE LINK DIDN'T FINISH")).toBeNull();
  });

  it("renders the update-required panel with no retry, because retrying this build cannot work", async () => {
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "updateRequired",
    }));
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    expect(
      await screen.findByText(
        "Update Ergomatic to link your Concept2 account.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("re-reads the server after every attempt instead of trusting the outcome (invariant I1)", async () => {
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "linked",
      c2UserId: 2211,
      stateEchoed: true,
    }));
    // The server disagrees: it still says unlinked. The card must believe
    // the server, which is exactly what Concept2LinkProbe.tsx:173-176
    // says this surface exists to surface.
    const { api } = mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    // `waitFor`, not a bare assertion: `connect()` awaits `startLink` and
    // THEN `reload()`, and `userEvent`'s act wrapper does not guarantee both
    // microtask hops have flushed by the time the click resolves. A bare
    // count here makes M19 (delete the `await reload()`) bite intermittently
    // instead of reliably, which is a probe that proves nothing.
    await waitFor(() =>
      expect(
        api.mock.calls.filter((c) => c[0] === "/api/concept2/link"),
      ).toHaveLength(2),
    );
    expect(screen.queryByText(/Concept2 jamesawesome/)).toBeNull();
  });

  it("an updateRequired RECONNECT says UPDATE NEEDED, instead of not moving at all", async () => {
    // Fix round 2, F2. `describeFailure` answers `null` for `updateRequired`
    // — correctly, it is not a failure — so it never reaches `FailurePanel`,
    // and while the `updateRequired` const carried `&& !link.linked` this
    // outcome rendered NOTHING on the reauth card. The server answers
    // `409 update_required` from the mint for any build predating the
    // WebAuth plugin, regardless of link state, and `needsReauth` is sticky:
    // a real rower taps RECONNECT and the screen does not move.
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "updateRequired",
    }));
    mount({ ...LINKED, needsReauth: true }, startLink);
    await renderCard();
    const reconnect = await screen.findByRole("button", {
      name: "RECONNECT CONCEPT2",
    });
    // THE ASSERTION THE DEFECT NEEDED, in the shape the review caught it in:
    // the card's whole text, before and after the tap. Asserting only that
    // the panel appears would pass against a card that also silently threw
    // away everything else.
    const before = document.querySelector(".c2-card")?.textContent ?? "";
    await userEvent.click(reconnect);
    expect(await screen.findByText("UPDATE NEEDED")).toBeTruthy();
    expect(
      screen.getByText("Update Ergomatic to link your Concept2 account."),
    ).toBeTruthy();
    const after = document.querySelector(".c2-card")?.textContent ?? "";
    expect(after).not.toBe(before);
    // Still the reauth card, and the link is still kept.
    expect(screen.getByText("RECONNECT NEEDED")).toBeTruthy();
    expect(
      screen.getByText("CONCEPT2 STOPPED ACCEPTING THIS LINK"),
    ).toBeTruthy();
    // No Try again: retrying the same build cannot succeed, which is 1g's
    // rule and holds identically here.
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("a failed RECONNECT says what happened, instead of leaving the screen unchanged", async () => {
    // Fix round 1, R2 — amendment 1f-b. Every failure panel used to be gated
    // `!link.linked`, so a declined or refused RECONNECT on the needs-reauth
    // card rendered NOTHING: the rower tapped, something failed, and the
    // screen was identical. It now draws the same line and REASON the
    // unlinked card would, from the same `describeFailure`.
    //
    // Literals transcribed from the amendment's own outcome table
    // (`exchangeFailed · any other error` → board copy, REASON
    // `CONCEPT2 REFUSED THE LINK · <status>`), never read back off the model.
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "exchangeFailed",
      status: 502,
      error: "c2_error",
      stateEchoed: true,
    }));
    mount({ ...LINKED, needsReauth: true }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "RECONNECT CONCEPT2" }),
    );
    expect(
      await screen.findByText("REASON: CONCEPT2 REFUSED THE LINK · 502"),
    ).toBeTruthy();
    expect(
      screen.getByText("The connection didn't complete. Nothing was linked."),
    ).toBeTruthy();
    expect(screen.getByText("THE LINK DIDN'T FINISH")).toBeTruthy();
    // The link is KEPT — that is 1f's whole point — and the recovery is one
    // tap, on a button nothing has disabled.
    expect(screen.getByText("RECONNECT NEEDED")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "RECONNECT CONCEPT2" }),
    ).not.toBeDisabled();
    expect(
      screen.getByText("CONCEPT2 STOPPED ACCEPTING THIS LINK"),
    ).toBeTruthy();
  });

  it("reconnects with a live button and no question, the same way Connect does (ruling i)", async () => {
    // An earlier revision had RECONNECT read a STORED class and disabled
    // itself when that class could not be read back — a button nothing
    // could press, plus a state (1k) drawn to rescue it. Neither exists:
    // there is no stored class, so `busy` is the only thing that can
    // disable this button.
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "navigating",
    }));
    mount({ ...LINKED, needsReauth: true }, startLink);
    await renderCard();
    const reconnect = await screen.findByRole("button", {
      name: "RECONNECT CONCEPT2",
    });
    expect(reconnect).not.toBeDisabled();
    await userEvent.click(reconnect);
    expect(startLink).toHaveBeenCalledWith();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});

// The three lines below live NOWHERE else. `describeFailure` answers `null`
// for `navigating`, `updateRequired` and `busy · source guard` — correctly,
// since none of the three is a failure — so no `LinkFailure`, and no
// totality check over `LinkOutcome`, protects their copy. This component is
// the only thing that can get them wrong, and these are the only assertions
// that would notice. Each literal is transcribed from the Gate 0 amendment's
// own outcome table (`amendment-2026-09-03.html`, §"The full outcome → copy
// table": `navigating` and `busy · source guard` both read "Approve access on
// Concept2's page."; `updateRequired` reads "Update Ergomatic to link your
// Concept2 account."), never read back off the symbol that renders it.
describe("Concept2Card panel lines no type protects (Task 1 review F9)", () => {
  it("tells the rower what to do on Concept2's page while the attempt is open", async () => {
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "navigating",
    }));
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    expect(await screen.findByText("OPENING CONCEPT2")).toBeTruthy();
    expect(screen.getByText("Approve access on Concept2's page.")).toBeTruthy();
  });

  it("draws a busy·guard outcome as the rower's own tap still working, never as a failure", async () => {
    // `describeFailure` returns `null` for this member on purpose: the
    // previous tap IS still working, so a failure panel here would have the
    // card contradict itself. The card must therefore keep drawing the
    // OPENING panel — and its line — rather than falling through to the
    // unlinked card as if nothing had been tapped.
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "busy",
      source: "guard",
    }));
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    expect(await screen.findByText("OPENING CONCEPT2")).toBeTruthy();
    expect(screen.getByText("Approve access on Concept2's page.")).toBeTruthy();
    // Absences asserted only after the positive observable above resolved.
    expect(screen.queryByText("THE LINK DIDN'T FINISH")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("labels the update-required panel as well as lining it", async () => {
    // The line itself is pinned by the 1g test above; this pins the LABEL,
    // which is the other half of a panel that no type checks.
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "updateRequired",
    }));
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    expect(await screen.findByText("UPDATE NEEDED")).toBeTruthy();
    expect(
      screen.getByText("Update Ergomatic to link your Concept2 account."),
    ).toBeTruthy();
  });
});

// FIX ROUND 2, F5 — the anti-drift claim, made TRUE rather than narrowed.
// `e2e/design.spec.ts` measures committed fixtures, and the previous round
// claimed the component "pins the same two class names so the fixture cannot
// silently drift". It pinned four structural facts; the `<hr>`'s position,
// the explain/helper order, the status text and the aria wiring could all
// change with the fixture left stale and the suite green.
//
// These tests compare the WHOLE committed fixture against the component's
// own `innerHTML`, so any drift at all reddens. One normaliser owns both
// sides and strips only whitespace BETWEEN tags — which is also exactly what
// the e2e loader applies before injecting, so the browser sees the
// component's markup no matter how the file is formatted on disk (that
// matters: the empty act column must stay `:empty`, and a pretty-printer's
// newline between `<div>` and `</div>` would silently defeat it).
describe("the e2e fixtures ARE this component's output (F5)", () => {
  const norm = (html: string) => html.replace(/>\s+</g, "><").trim();

  async function renderTo(status: unknown, startLink = vi.fn()) {
    const api = vi.fn(
      async () =>
        new Response(JSON.stringify(status), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink }));
    vi.resetModules();
    const { default: Concept2Card } = await import("./Concept2Card");
    return render(<Concept2Card email="james@jamestheaweso.me" />);
  }

  function committed(name: string): string {
    return readFileSync(join(process.cwd(), "e2e/fixtures", name), "utf-8");
  }

  it("c2-card-unlinked.html is what the unlinked card renders", async () => {
    const { container } = await renderTo({ available: true, linked: false });
    await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" });
    expect(norm(container.innerHTML)).toBe(
      norm(committed("c2-card-unlinked.html")),
    );
  });

  it("c2-card-armed.html is what the armed card renders", async () => {
    const { container } = await renderTo(LINKED);
    await userEvent.click(
      await screen.findByRole("button", { name: "Unlink Concept2" }),
    );
    await screen.findByRole("button", { name: "Tap again to unlink" });
    expect(norm(container.innerHTML)).toBe(
      norm(committed("c2-card-armed.html")),
    );
  });

  it("c2-card-read-failed.html is what the read-failed card renders", async () => {
    const api = vi.fn(
      async () => new Response("<html>502</html>", { status: 502 }),
    );
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    vi.resetModules();
    const { default: Concept2Card } = await import("./Concept2Card");
    const { container } = render(
      <Concept2Card email="james@jamestheaweso.me" />,
    );
    await screen.findByRole("button", { name: "Retry" });
    expect(norm(container.innerHTML)).toBe(
      norm(committed("c2-card-read-failed.html")),
    );
  });

  it("c2-card-update-required.html is what the update-required card renders", async () => {
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "updateRequired",
    }));
    const { container } = await renderTo(
      { available: true, linked: false },
      startLink,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    await screen.findByText("UPDATE NEEDED");
    expect(norm(container.innerHTML)).toBe(
      norm(committed("c2-card-update-required.html")),
    );
    // The act column really is empty, which is what `:empty` needs in order
    // to collapse it — and what the e2e width assertion measures.
    expect(container.querySelector(".c2-card-act")?.childNodes.length).toBe(0);
  });
});

// The landscape two-column rule (fix round 1, R1) is a CSS rule that acts on
// TWO CLASS NAMES. `index.css` cannot check that the component still emits
// them, and jsdom does no layout, so the proof is split deliberately and each
// half says what it proves: THESE tests pin the DOM the rule targets, and
// `e2e/design.spec.ts`'s "the Concept2 card's landscape interior" test proves
// the rule actually moves that DOM in a real engine. Neither half alone is
// evidence — a green layout assertion against markup the component no longer
// renders is exactly RF21's "measuring the wrong element".
describe("Concept2Card layout structure (the tell/act pair the grid targets)", () => {
  it("puts what the card SAYS in the tell column and every control in the act column", async () => {
    mount({ available: true, linked: false });
    await renderCard();
    const connect = await screen.findByRole("button", {
      name: "CONNECT TO CONCEPT2",
    });
    const tell = document.querySelector(".c2-card-body > .c2-card-tell");
    const act = document.querySelector(".c2-card-body > .c2-card-act");
    expect(tell).not.toBeNull();
    expect(act).not.toBeNull();
    // The control is in ACT and nowhere else — this is the fact the grid
    // rule depends on, and the fact the e2e fixture measures.
    expect(act?.contains(connect)).toBe(true);
    expect(tell?.contains(connect)).toBe(false);
    expect(tell?.textContent).toContain(
      "Sends finished monitor rows to your Concept2 logbook, one row at a time, from the log.",
    );
    expect(act?.textContent).toContain("OPENS CONCEPT2 IN YOUR BROWSER");
    // The head stays OUTSIDE the pair: every amendment frame draws it full
    // width above the split.
    expect(document.querySelector(".c2-card-body .c2-card-head")).toBeNull();
  });

  it("leaves the act column with no child nodes at all when the state has nothing to do", async () => {
    // 1g: a panel and no control. `.c2-card-act:empty { display: none }` is
    // what keeps that panel full width in landscape, and `:empty` matches
    // only when React emitted no child node — not even a whitespace text
    // node. Asserting the node count is what makes that CSS rule reachable
    // rather than decorative.
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "updateRequired",
    }));
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    await screen.findByText("UPDATE NEEDED");
    const act = document.querySelector(".c2-card-act");
    expect(act).not.toBeNull();
    expect(act?.childNodes.length).toBe(0);
  });

  it("wraps the read-failed card the same way, so the one rule has no exception", async () => {
    const api = vi.fn(
      async () => new Response("<html>502</html>", { status: 502 }),
    );
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    const retry = await screen.findByRole("button", { name: "Retry" });
    const tell = document.querySelector(".c2-card-body > .c2-card-tell");
    const act = document.querySelector(".c2-card-body > .c2-card-act");
    expect(act?.contains(retry)).toBe(true);
    expect(tell?.textContent).toContain("Couldn't reach Concept2 linking.");
  });
});

// EVERY rendered literal, pinned (fix round 2, F4). This file's own header
// argues that these strings have no type behind them and that only this
// component can get them wrong; that argument covers all of them, and ten
// used to have no assertion anywhere — a mutation of the weight-class helper
// reddened one LAYOUT test and no copy test at all.
//
// Each literal below was transcribed from `amendment-2026-09-03.html` by
// extracting the text of every `c2label`/`c2status`/`c2explain`/`c2helper`/
// `c2foot`/`panel-*`/`btn-*` node inside its `c2card` frames, and comparing
// that set against this component's JSX. Never read back off the symbol that
// renders it.
describe("Concept2Card copy, pinned literal by literal (F4)", () => {
  it("1a unlinked: the label, the status, its ONE body line, the button and its footnote", async () => {
    mount({ available: true, linked: false });
    await renderCard();
    expect(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    ).toBeTruthy();
    expect(screen.getByText("CONCEPT2")).toBeTruthy();
    expect(screen.getByText("NOT LINKED")).toBeTruthy();
    expect(
      screen.getByText(
        "Sends finished monitor rows to your Concept2 logbook, one row at a time, from the log.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("OPENS CONCEPT2 IN YOUR BROWSER")).toBeTruthy();
    // James, 2026-09-04: "Stop talking about the weight class." 1a carried a
    // helper line saying where the class comes from; the card now says
    // nothing about it at all. ENUMERATED over the class the line was drawn
    // in, not queried by its old wording — a differently worded replacement
    // reddens this too, and a `queryByText` of the withdrawn sentence would
    // not. The unlinked card renders NO `.c2-card-helper` (that class still
    // draws 1c's "Finished monitor rows can be sent from the log.").
    expect(document.querySelectorAll(".c2-card-helper")).toHaveLength(0);
  });

  it("1b opening: the status chip reads WAITING", async () => {
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "navigating",
    }));
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    await screen.findByText("OPENING CONCEPT2");
    expect(screen.getByText("WAITING")).toBeTruthy();
  });

  it("1c linked: the helper that says where sending happens", async () => {
    mount(LINKED);
    await renderCard();
    await screen.findByText("LINKED \u2713");
    expect(
      screen.getByText("Finished monitor rows can be sent from the log."),
    ).toBeTruthy();
  });

  it("1d armed: the warning and the auto-disarm footnote", async () => {
    mount(LINKED);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Unlink Concept2" }),
    );
    expect(
      screen.getByText(
        "Unlink removes this app's access. Rows already sent stay on Concept2.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("DISARMS ON ITS OWN AFTER 4 SECONDS")).toBeTruthy();
  });

  it("1f needs re-auth: the status, the panel label and its line", async () => {
    mount({ ...LINKED, needsReauth: true });
    await renderCard();
    expect(await screen.findByText("RECONNECT NEEDED")).toBeTruthy();
    expect(
      screen.getByText("CONCEPT2 STOPPED ACCEPTING THIS LINK"),
    ).toBeTruthy();
    expect(
      screen.getByText("Your link is kept. Reconnect to send rows again."),
    ).toBeTruthy();
  });

  it("1i read failed: the status chip and the panel label", async () => {
    const api = vi.fn(
      async () => new Response("<html>502</html>", { status: 502 }),
    );
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    expect(await screen.findByText("COULDN'T READ")).toBeTruthy();
    expect(screen.getByText("COULDN'T READ CONCEPT2")).toBeTruthy();
  });

  it("1j unlink refused: the panel label", async () => {
    const api = vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? new Response("nope", { status: 500 })
        : new Response(JSON.stringify(LINKED), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
    );
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    expect(await screen.findByText("UNLINK DIDN'T HAPPEN")).toBeTruthy();
  });
});

describe("Concept2Card comes back from Concept2 (observation 19, invariant I5)", () => {
  it("a restore mid-attempt leaves a reachable card, not a frozen OPENING panel", async () => {
    // The web arm resolves `navigating` and unloads the document. A
    // back-forward-cache restore runs NO mount, and it preserves the JS
    // heap — so `outcome` is still `{kind:"navigating"}` and the card is
    // still drawing a buttonless OPENING CONCEPT2 panel over a link that
    // did NOT succeed (the rower declined, or the exchange failed). Re-
    // reading the link alone does not fix that: the panel is drawn from
    // `outcome`, not from `link`.
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "navigating",
    }));
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    expect(await screen.findByText("OPENING CONCEPT2")).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    ).toBeTruthy();
    expect(screen.queryByText("OPENING CONCEPT2")).toBeNull();
  });
});

describe("Concept2Card unlink failure does not latch (Gate 0 amendment 1j)", () => {
  it("clears the previous REASON the moment a new unlink starts", async () => {
    // Without the clear at the top of `unlink()`, the panel from the FIRST
    // refusal sits over the second attempt while it is still in flight —
    // a stale status line describing a request that is not the one running.
    let attempt = 0;
    const api = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        attempt += 1;
        if (attempt === 1) return new Response("nope", { status: 500 });
        return new Promise<Response>(() => {
          // never resolves: the second unlink stays in flight
        });
      }
      return new Response(JSON.stringify(LINKED), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    await screen.findByText("REASON: THE SERVER ANSWERED 500");

    await userEvent.click(
      screen.getByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("REASON: THE SERVER ANSWERED 500")).toBeNull(),
    );
    expect(
      screen.queryByText("Couldn't unlink. Your link is unchanged."),
    ).toBeNull();
  });
});
