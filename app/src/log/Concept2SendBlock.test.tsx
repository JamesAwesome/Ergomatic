import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index.js";
import type { StoredLog } from "./storedSummary";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("../api");
  vi.doUnmock("../adapters/externalBrowser");
});

const LINKED = {
  available: true,
  linked: true,
  c2UserId: 2211,
  c2Username: "jamesawesome",
  needsReauth: false,
  logbookBaseUrl: "https://log-dev.concept2.com",
};

/** RF3: a REAL stored row over a seeded library workout (SEA_FRET), never
 *  a hand-built minimum.
 *
 *  DUPLICATED locally rather than imported from `FromTheLog.test.tsx`,
 *  which is this file's own established precedent for a small fixture and
 *  is NOT merely a style choice: importing a `.test.tsx` MODULE executes
 *  every top-level `describe`/`it` in it a second time, registered inside
 *  THIS file's run. `FromTheLog.test.tsx` says the same thing about its own
 *  `realisticSeries` fixture. */
const SEA_FRET = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret")!;

function eligibleRow(over: Partial<StoredLog> = {}): StoredLog {
  return {
    id: "log-1",
    workoutId: null,
    workoutTitle: SEA_FRET.title,
    workoutType: SEA_FRET.type,
    loggedAt: "2026-08-18T18:57:00.000Z",
    held: null,
    pain: null,
    notes: null,
    thumbs: null,
    deviceName: "PM5 432331249",
    source: "pm5",
    c2ResultId: null,
    c2UserId: null,
    steps: [],
    avgSplitSeconds: 130,
    timeSeconds: 1550,
    distanceMeters: 6000,
    planKey: null,
    planIndex: null,
    machineWorkSeconds: null,
    machineWorkMeters: null,
    machineSummary: null,
    restSeconds: null,
    restMeters: null,
    endedBy: "finished",
    workSeconds: 1234.5,
    workMeters: 5000,
    ...over,
  };
}

/** One `api` mock for both endpoints this component talks to: the link
 *  read its hook makes on mount, and the upload it posts on tap.
 *
 *  `sendThrows` is the ONE state the response parser cannot produce, and
 *  it is this component's own: a request that never completed carries no
 *  status and no body, so §2e's `network throw -> NO CONNECTION` row is
 *  served by the `catch` in `post()` and by nothing else. The LINK read
 *  still resolves in that case, deliberately — an `api` that threw for
 *  every path would fail the hook's read instead and render nothing at
 *  all, which is a different row of the table. */
function mockApi(opts: {
  link?: unknown;
  linkStatus?: number;
  send?: { status: number; body?: unknown; text?: string };
  sendThrows?: boolean;
}) {
  const openReadOnlyUrl = vi.fn();
  const api = vi.fn(async (path: string, _init?: RequestInit) => {
    if (path === "/api/concept2/link") {
      return new Response(JSON.stringify(opts.link ?? LINKED), {
        status: opts.linkStatus ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (opts.sendThrows === true) throw new TypeError("Failed to fetch");
    const send = opts.send ?? { status: 200, body: { resultId: 339 } };
    return new Response(send.text ?? JSON.stringify(send.body ?? {}), {
      status: send.status,
      headers: {
        "Content-Type":
          send.text === undefined ? "application/json" : "text/html",
      },
    });
  });
  vi.doMock("../api", () => ({ api }));
  vi.doMock("../adapters/externalBrowser", () => ({ openReadOnlyUrl }));
  return { api, openReadOnlyUrl };
}

async function renderBlock(row: StoredLog) {
  vi.resetModules();
  const { default: Concept2SendBlock } = await import("./Concept2SendBlock");
  return render(<Concept2SendBlock row={row} />);
}

describe("Concept2SendBlock absence (board: not linked -> nothing on the row)", () => {
  it("renders nothing when no account is linked", async () => {
    const { api } = mockApi({ link: { available: true, linked: false } });
    await renderBlock(eligibleRow());
    // The positive observable is the hook's own request; there is no DOM
    // signal by construction. M29 is what proves this can go red.
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/concept2/link"));
    expect(screen.queryByText("CONCEPT2")).toBeNull();
  });

  it("renders nothing when the surface is unavailable", async () => {
    const { api } = mockApi({ link: { available: false } });
    await renderBlock(eligibleRow());
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/concept2/link"));
    expect(screen.queryByText("CONCEPT2")).toBeNull();
  });

  it("renders nothing when the link read fails, and offers no retry here", async () => {
    // Deliberately NOT the card's 1i treatment. The You card is the sole
    // discovery surface and owns the retry; a log row that cannot find out
    // whether an account is linked says nothing rather than growing a
    // second Concept2 error panel on a screen about a rowing session.
    const { api } = mockApi({ linkStatus: 502 });
    await renderBlock(eligibleRow());
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/concept2/link"));
    expect(screen.queryByText("CONCEPT2")).toBeNull();
  });

  it("renders nothing for every non-qualifying row, with an account linked", async () => {
    // RF3 and the eligibility fence, one row per clause. Mapped, never a
    // conditional expect.
    const shapes: Partial<StoredLog>[] = [
      { source: "timer" },
      { source: "manual" },
      { source: "no-reading" },
      { endedBy: "link-lost" },
      { endedBy: "rower" },
      { endedBy: null },
      { workSeconds: null },
      { workMeters: null },
    ];
    const seen: (string | null)[] = [];
    for (const shape of shapes) {
      const { api } = mockApi({});
      await renderBlock(eligibleRow(shape));
      await waitFor(() =>
        expect(api).toHaveBeenCalledWith("/api/concept2/link"),
      );
      seen.push(screen.queryByText("CONCEPT2")?.textContent ?? null);
      cleanup();
    }
    expect(seen).toStrictEqual(shapes.map(() => null));
  });
});

describe("Concept2SendBlock idle -> sent (board 2a/2b/2c, amendment change 4)", () => {
  it("posts the row with this device's IANA zone, which the route requires on EVERY upload", async () => {
    // routes/concept2.ts 400s without it, even when the row already
    // carries a stored zone.
    const { api } = mockApi({});
    await renderBlock(eligibleRow({ id: "log-1" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    const post = api.mock.calls.find(
      ([path]) => path === "/api/concept2/results/log-1",
    );
    expect(post).toBeTruthy();
    expect(post?.[1]?.method).toBe("POST");
    const body = JSON.parse(String(post?.[1]?.body)) as { tz?: unknown };
    expect([...Intl.supportedValuesOf("timeZone"), "UTC"]).toContain(body.tz);
  });

  it("draws the idle and sending frames word for word, helper included", async () => {
    // Every literal here is transcribed from the amendment's 2a and 2b
    // PORTRAIT frames, never read back off the component that produces
    // them. `Sending to Concept2 …` carries the page's own space before
    // the ellipsis.
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = () => {
        resolve();
      };
    });
    const openReadOnlyUrl = vi.fn();
    const api = vi.fn(async (path: string) => {
      if (path === "/api/concept2/link") {
        return new Response(JSON.stringify(LINKED), { status: 200 });
      }
      await gate;
      return new Response(JSON.stringify({ resultId: 339 }), { status: 200 });
    });
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/externalBrowser", () => ({ openReadOnlyUrl }));
    await renderBlock(eligibleRow());

    const send = await screen.findByRole("button", {
      name: "Send to Concept2",
    });
    expect(screen.getByText("NOT SENT")).toBeTruthy();
    expect(
      screen.getByText(
        "Sends this row's work time and meters to your Concept2 logbook.",
      ),
    ).toBeTruthy();

    await userEvent.click(send);
    expect(await screen.findByText("SENDING")).toBeTruthy();
    const sending = screen.getByRole("button", {
      name: "Sending to Concept2 …",
    });
    expect(sending).toBeDisabled();
    // The helper stays through the send: 2b's frame draws it.
    expect(
      screen.getByText(
        "Sends this row's work time and meters to your Concept2 logbook.",
      ),
    ).toBeTruthy();
    release();
    await screen.findByText("Accepted by Concept2.");
  });

  it("keeps the status dim until Concept2 has answered, and lights it after", async () => {
    // The page's own markup, not a principle: `2a NOT SENT` and
    // `2b SENDING` are both a bare `.c2status`, while every state from 2c
    // on carries `.c2status.on` (`--ink` 17.11:1, weight 600, against
    // `--ink-4` 5.29:1 for the dim one). Counted over §2's frames:
    // two bare, nineteen `on`.
    mockApi({});
    const { container } = await renderBlock(eligibleRow());
    const status = () => container.querySelector(".c2-send-status")!;
    await screen.findByRole("button", { name: "Send to Concept2" });
    expect(status().className).toBe("c2-send-status");
    await userEvent.click(
      screen.getByRole("button", { name: "Send to Concept2" }),
    );
    await screen.findByText("Accepted by Concept2.");
    expect(status().className).toBe("c2-send-status c2-send-status-on");
  });

  it("renders SENT with the result id and NO timestamp", async () => {
    // Amendment change 4: nothing stores WHEN Concept2 accepted the row, so
    // printing `loggedAt` here would put the save clock under a line naming
    // a different event.
    mockApi({});
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(await screen.findByText("Accepted by Concept2.")).toBeTruthy();
    expect(screen.getByText(/RESULT 339/)).toBeTruthy();
    expect(screen.queryByText(/Accepted by Concept2 ·/)).toBeNull();
  });

  it("opens the result through the read-only adapter, never by navigating this document", async () => {
    const { openReadOnlyUrl } = mockApi({});
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "View on Concept2 →" }),
    );
    // The origin is the SERVER's own (observation 5) — a hardcoded
    // log.concept2.com 404s for the whole sandbox phase.
    expect(openReadOnlyUrl).toHaveBeenCalledWith(
      "https://log-dev.concept2.com/profile/2211/log/339",
    );
  });
});

describe("Concept2SendBlock stored sent state (spec anchor F8)", () => {
  it("renders SENT on mount for a row already carrying the LIVE link's result", async () => {
    mockApi({});
    await renderBlock(eligibleRow({ c2ResultId: 339, c2UserId: 2211 }));
    expect(await screen.findByText("Accepted by Concept2.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Send to Concept2" }),
    ).toBeNull();
  });

  it("keeps the result id when the server sends no logbook origin, and promises no link", async () => {
    // `url` is null whenever `logbookBaseUrl` is — an older image mid
    // rolling deploy is the named case. Gating the id on the BUTTON's
    // condition made a SENT row render "Accepted by Concept2." and nothing
    // else: no id, no link, and no way for a tester to say which row
    // landed. The id line reads the same in both frames now that the copy
    // is mechanical, so the button's ABSENCE is the only difference — which
    // is why the id and the button are asserted separately rather than
    // through one combined string.
    mockApi({ link: { ...LINKED, logbookBaseUrl: null } });
    await renderBlock(eligibleRow({ c2ResultId: 339, c2UserId: 2211 }));
    expect(await screen.findByText("Accepted by Concept2.")).toBeTruthy();
    expect(screen.getByText("RESULT 339")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "View on Concept2 →" }),
    ).toBeNull();
  });

  it("renders the OFFER for a row accepted by a DIFFERENT account", async () => {
    // The current grant cannot see account 999's row, so "sent" would point
    // at something this rower cannot open (anchor F8's own case).
    mockApi({});
    await renderBlock(eligibleRow({ c2ResultId: 339, c2UserId: 999 }));
    expect(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    ).toBeTruthy();
    expect(screen.queryByText("Accepted by Concept2.")).toBeNull();
  });
});

describe("Concept2SendBlock refusals (amendment 2d/2e/2f/2h/2i)", () => {
  it("renders ALREADY THERE with the colliding result's own link", async () => {
    const { openReadOnlyUrl } = mockApi({
      send: { status: 409, body: { error: "duplicate", c2ResultId: 512 } },
    });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(await screen.findByText("ALREADY THERE")).toBeTruthy();
    expect(
      screen.getByText(
        "Concept2 already has this row: same date, time and distance.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/RESULT 512/)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "View on Concept2 →" }),
    );
    expect(openReadOnlyUrl).toHaveBeenCalledWith(
      "https://log-dev.concept2.com/profile/2211/log/512",
    );
  });

  it("renders RECONNECT NEEDED with no retry, because retrying cannot help", async () => {
    mockApi({ send: { status: 409, body: { error: "needs_reauth" } } });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(await screen.findByText("RECONNECT NEEDED")).toBeTruthy();
    expect(
      screen.getByText(
        "Concept2 stopped accepting this link. Reconnect on the You tab.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry send" })).toBeNull();
  });

  it("sends the rower to their Concept2 account AND offers Send again, because the repair is one visit away (amendment 2i)", async () => {
    // Ruling (i)'s one rower-facing consequence. The class is Concept2's
    // fact and we ask for none, so this is the state where neither producer
    // could supply one — and the ONLY send failure whose repair exists, on a
    // screen that is not ours. `Send again` is not decoration: the native
    // link-out RETURNS to a still-mounted block, and the panel's own
    // sentence tells the rower to come back and send.
    const { openReadOnlyUrl } = mockApi({
      send: {
        status: 422,
        body: { error: "no_weight_class", reason: "no_weight" },
      },
    });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(await screen.findByText("NO WEIGHT CLASS")).toBeTruthy();
    // THE SENTENCE, not only the REASON. Asserting the REASON alone cannot
    // tell the two slots apart, so a build rendering `send.reason` into the
    // sentence slot would pass it (M34e).
    expect(
      screen.getByText(
        "Concept2 needs a weight class. Your Concept2 profile has no weight set.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("REASON: SET YOUR WEIGHT ON CONCEPT2"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send again" })).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "OPEN CONCEPT2 PROFILE" }),
    );
    // The ID-LESS path (observation 28), the server's own origin rather than
    // a hardcoded one (M34d), and the read-only adapter rather than
    // `openExternalUrl` — an account page is a look the rower comes back
    // from.
    expect(openReadOnlyUrl).toHaveBeenCalledWith(
      "https://log-dev.concept2.com/profile",
    );
  });

  it("gives a profile Concept2 cannot classify its OWN sentence, never SET YOUR WEIGHT", async () => {
    // `no_gender`: Concept2's category is two-valued with gendered
    // thresholds, so there is no derivation at all — and that rower's weight
    // is not the broken thing. Telling them to set it sends them after a
    // field that is fine, forever.
    mockApi({
      send: {
        status: 422,
        body: { error: "no_weight_class", reason: "no_gender" },
      },
    });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(
      await screen.findByText(
        "Concept2 needs a weight class. We couldn't work one out from your Concept2 profile.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("REASON: COULDN'T GET A CLASS FROM CONCEPT2"),
    ).toBeTruthy();
    expect(screen.queryByText(/no weight set/)).toBeNull();
    // And it does not name a destination this state's one control cannot
    // reach: the class is PER-RESULT, while the button opens the profile.
    expect(screen.queryByText(/logbook/)).toBeNull();
  });

  it("names the class it sent AND where it came from, on the send that sent it", async () => {
    // Ruling R2. A DERIVED class is a guess about a fact Concept2 lets its
    // owner declare, and Concept2 permits per-result editing — so the guess
    // is visible at the moment it is written, or it can never be corrected.
    mockApi({
      send: {
        status: 200,
        body: {
          resultId: 339,
          weightClass: "H",
          weightClassSource: "profile",
        },
      },
    });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(
      await screen.findByText("WEIGHT CLASS H · FROM YOUR CONCEPT2 WEIGHT"),
    ).toBeTruthy();
  });

  it("renders a SENT row read back from the RECORD with no class line, because nothing about the class is stored", async () => {
    // I4, made visible: a row that already carries `c2ResultId` renders SENT
    // on mount with no send in this session, so there is no class to name.
    // The line is ABSENT rather than invented.
    //
    // ENUMERATED, not queried by pattern. `queryByText(/WEIGHT CLASS/)`
    // stays null even when the class paragraph IS rendered with a null
    // child, so it cannot tell an absent line from an empty one — M34f
    // (gating the class line on `resultId` instead of on
    // `weightClassLine(send)`) beats it. Listing the mono sub-lines states
    // the whole of what this frame draws.
    mockApi({});
    const { container } = await renderBlock(
      eligibleRow({ c2ResultId: 339, c2UserId: 2211 }),
    );
    expect(await screen.findByText("SENT")).toBeTruthy();
    expect(
      [...container.querySelectorAll(".c2-send-foot")].map(
        (el) => el.textContent,
      ),
    ).toStrictEqual(["RESULT 339"]);
  });

  it("still names the repair and still offers Send again when the server sent no logbook origin", async () => {
    // Observation 22 one surface over: with no origin there is no safe URL
    // to build, and a relative `/profile` would open on Ergomatic's own
    // domain. The sentence, the REASON and `Send again` still tell the rower
    // what to do; only the shortcut is missing.
    mockApi({
      link: { ...LINKED, logbookBaseUrl: null },
      send: {
        status: 422,
        body: { error: "no_weight_class", reason: "no_weight" },
      },
    });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(
      await screen.findByText("REASON: SET YOUR WEIGHT ON CONCEPT2"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "OPEN CONCEPT2 PROFILE" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Send again" })).toBeTruthy();
  });

  it("renders SEND FAILED with a REASON and a retry", async () => {
    mockApi({ send: { status: 502, body: { error: "c2_error" } } });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(await screen.findByText("SEND FAILED")).toBeTruthy();
    expect(screen.getByText("The send didn't reach Concept2.")).toBeTruthy();
    expect(screen.getByText("REASON: CONCEPT2 ERROR · 502")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry send" })).toBeTruthy();
  });

  it("says NO CONNECTION when the request never completed at all", async () => {
    // §2e's `network throw` row, and the ONE row of that table this
    // component owns outright: `readSendResponse` maps a status and a body,
    // and a thrown request has neither. Nothing upstream can produce this
    // sentence, so nothing upstream can gate it.
    mockApi({ sendThrows: true });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(await screen.findByText("SEND FAILED")).toBeTruthy();
    expect(screen.getByText("The send didn't reach Concept2.")).toBeTruthy();
    expect(screen.getByText("REASON: NO CONNECTION")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry send" })).toBeTruthy();
  });

  it("disappears rather than offering a retry when the server says unlinked", async () => {
    mockApi({ send: { status: 409, body: { error: "unlinked" } } });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    await waitFor(() => expect(screen.queryByText("CONCEPT2")).toBeNull());
  });

  it("disappears when the flag went off mid-session (403 unavailable)", async () => {
    // The table's other `block disappears` row. Same treatment, different
    // producer: the deployment stopped offering Concept2 while this screen
    // was open.
    mockApi({ send: { status: 403, body: { error: "unavailable" } } });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    await waitFor(() => expect(screen.queryByText("CONCEPT2")).toBeNull());
  });

  it("SAYS SO when the server refuses the row as ineligible, instead of vanishing on tap", async () => {
    // The client mirror of `eligibilityFailure` said yes and the server's
    // own copy said no about the SAME row. Drawing that as the block
    // disappearing shows the rower a control that was there a second ago
    // and now is not, and reports the divergence to nobody.
    mockApi({
      send: {
        status: 422,
        body: { error: "not_eligible", reason: "no_work_totals" },
      },
    });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(
      await screen.findByText(
        "REASON: CONCEPT2 WON'T TAKE THIS ROW · NO WORK TIME OR METERS",
      ),
    ).toBeTruthy();
  });

  it("survives a non-JSON error body without throwing", async () => {
    // The rolling-deploy case `adapters/linkFlow.ts` names: an old image
    // answering with HTML.
    mockApi({ send: { status: 502, text: "<html>502 Bad Gateway</html>" } });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(
      await screen.findByText("REASON: CONCEPT2 ERROR · 502"),
    ).toBeTruthy();
  });
});

/** The same gate Surface 1 carries (`Concept2Card.test.tsx`'s "the e2e
 *  fixtures ARE this component's output"): the committed fixtures the
 *  browser gate measures are this component's own `innerHTML`, in full, so
 *  any drift at all — a changed class, a moved button, a reworded status —
 *  reddens here rather than leaving the height gate measuring a stale
 *  drawing of a control that no longer exists. */
describe("the e2e fixtures ARE this block's output", () => {
  const norm = (html: string) => html.replace(/>\s+</g, "><").trim();

  function committed(name: string): string {
    return readFileSync(join(process.cwd(), "e2e/fixtures", name), "utf-8");
  }

  it("c2-send-idle.html is what the idle block renders", async () => {
    mockApi({});
    const { container } = await renderBlock(eligibleRow());
    await screen.findByRole("button", { name: "Send to Concept2" });
    expect(norm(container.innerHTML)).toBe(
      norm(committed("c2-send-idle.html")),
    );
  });

  it("c2-send-sent.html is what a stored SENT row renders", async () => {
    mockApi({});
    const { container } = await renderBlock(
      eligibleRow({ c2ResultId: 339, c2UserId: 2211 }),
    );
    await screen.findByRole("button", { name: "View on Concept2 →" });
    expect(norm(container.innerHTML)).toBe(
      norm(committed("c2-send-sent.html")),
    );
  });

  it("c2-send-no-weight.html is what the 2i block renders", async () => {
    mockApi({
      send: {
        status: 422,
        body: { error: "no_weight_class", reason: "no_weight" },
      },
    });
    const { container } = await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    await screen.findByRole("button", { name: "Send again" });
    expect(norm(container.innerHTML)).toBe(
      norm(committed("c2-send-no-weight.html")),
    );
  });
});
