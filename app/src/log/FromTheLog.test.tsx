import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { api } from "../api";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { StoredLog } from "./storedSummary";

// Same `vi.doMock` + returned-spy idiom as LogSession.test.tsx's own
// `mockApi` — a real `Response`, not a bare object, so `.ok`/`.status`/
// `.json()` all behave like the real fetch this replaces.
function mockApi(
  handler: (path: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const fn = vi.fn<typeof api>(async (path, init) => handler(path, init));
  vi.doMock("../api", () => ({ api: fn }));
  return fn;
}

function parsedBody(call: Parameters<typeof fetch> | unknown[]): unknown {
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string);
}

// Realistic fixture, per repo convention: a real library title/type
// (app/server/seed/library) rather than an invented placeholder string.
const SEA_FRET = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret")!;

function storedRow(overrides: Partial<StoredLog> = {}): StoredLog {
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
    steps: [
      {
        label: "6:00 @ 6k",
        actualSplit: 120,
        actualSource: "stopwatch",
        meters: 1500,
      },
      {
        label: "6:00 @ 6k",
        actualSplit: 140,
        actualSource: "stopwatch",
        meters: 1500,
      },
    ],
    avgSplitSeconds: 130,
    timeSeconds: 1550,
    distanceMeters: 6000,
    planKey: null,
    planIndex: null,
    ...overrides,
  };
}

async function renderFromTheLog(
  initialEntry: {
    pathname: string;
    state?: unknown;
  } = { pathname: "/today/log/log-1" },
) {
  const { default: FromTheLog } = await import("./FromTheLog");
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/today/log/:id" element={<FromTheLog />} />
        <Route path="/today/log" element={<p>HISTORY SCREEN</p>} />
        <Route path="/today" element={<p>TODAY SCREEN</p>} />
        <Route path="/plan" element={<p>PLAN SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("FromTheLog — fetch states", () => {
  it("shows LOADING… and the FROM YOUR LOG eyebrow while the fetch is in flight", async () => {
    mockApi(() => new Promise(() => {})); // never resolves
    await renderFromTheLog();
    expect(screen.getByText("FROM YOUR LOG")).toBeVisible();
    expect(screen.getByText("LOADING…")).toBeVisible();
  });

  it("renders 'This session is gone.' with a ← LOG link to /today/log on a 404, regardless of origin", async () => {
    mockApi(
      () =>
        new Response(JSON.stringify({ error: "not found" }), { status: 404 }),
    );
    await renderFromTheLog({
      pathname: "/today/log/log-1",
      state: { from: "/today" },
    });
    await waitFor(() =>
      expect(screen.getByText("This session is gone.")).toBeVisible(),
    );
    const back = screen.getByRole("link", { name: "← LOG" });
    expect(back).toHaveAttribute("href", "/today/log");
  });

  it("shows an error message with a Retry that refetches on a non-404 failure", async () => {
    let calls = 0;
    const apiMock = mockApi(() => {
      calls += 1;
      return calls === 1
        ? new Response("", { status: 500 })
        : new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog();
    await waitFor(() =>
      expect(screen.getByText("Couldn't load this session.")).toBeVisible(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Sea Fret")).toBeVisible());
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it("shows the same error state when the fetch itself rejects (a network failure, not merely a non-2xx response)", async () => {
    vi.doMock("../api", () => ({
      api: vi.fn(async () => {
        throw new Error("network down");
      }),
    }));
    await renderFromTheLog();
    await waitFor(() =>
      expect(screen.getByText("Couldn't load this session.")).toBeVisible(),
    );
  });
});

describe("FromTheLog — §4 N5 back label", () => {
  it("reads ← LOG targeting /today/log when origin is /today/log", async () => {
    mockApi(() => new Response(JSON.stringify(storedRow()), { status: 200 }));
    await renderFromTheLog({
      pathname: "/today/log/log-1",
      state: { from: "/today/log" },
    });
    const back = await screen.findByRole("link", { name: "← LOG" });
    expect(back).toHaveAttribute("href", "/today/log");
  });

  it("reads ← TODAY targeting /today when origin is a Today row", async () => {
    mockApi(() => new Response(JSON.stringify(storedRow()), { status: 200 }));
    await renderFromTheLog({
      pathname: "/today/log/log-1",
      state: { from: "/today" },
    });
    const back = await screen.findByRole("link", { name: "← TODAY" });
    expect(back).toHaveAttribute("href", "/today");
  });

  it("reads ← PLAN targeting /plan when origin is a Plan row", async () => {
    mockApi(() => new Response(JSON.stringify(storedRow()), { status: 200 }));
    await renderFromTheLog({
      pathname: "/today/log/log-1",
      state: { from: "/plan" },
    });
    const back = await screen.findByRole("link", { name: "← PLAN" });
    expect(back).toHaveAttribute("href", "/plan");
  });

  it("a cold deep link (no state) reads ← LOG targeting /today/log", async () => {
    mockApi(() => new Response(JSON.stringify(storedRow()), { status: 200 }));
    await renderFromTheLog({ pathname: "/today/log/log-1" });
    const back = await screen.findByRole("link", { name: "← LOG" });
    expect(back).toHaveAttribute("href", "/today/log");
  });

  // Fix round LOW (a): a SAFE in-app origin this screen doesn't have a
  // label for (unmapped, but still `isSafeInAppPath`) used to link to
  // that arbitrary path while labeling it `← LOG` — falling the TARGET
  // back to /today/log too, not just the label, is what this test pins.
  it("an unmapped-but-safe origin falls BOTH the target and the label back to /today/log · ← LOG (never a label naming one place while linking to another)", async () => {
    mockApi(() => new Response(JSON.stringify(storedRow()), { status: 200 }));
    await renderFromTheLog({
      pathname: "/today/log/log-1",
      state: { from: "/library" },
    });
    const back = await screen.findByRole("link", { name: "← LOG" });
    expect(back).toHaveAttribute("href", "/today/log");
  });
});

describe("FromTheLog — ready state rendering", () => {
  it("renders the title, meta, heroes, and rows exactly as buildStoredSummary derives them", async () => {
    mockApi(() => new Response(JSON.stringify(storedRow()), { status: 200 }));
    await renderFromTheLog();
    expect(
      await screen.findByRole("heading", { name: "Sea Fret" }),
    ).toBeVisible();
    // Time-of-day is locale/TZ-derived (`formatTimeOfDay`, summaryModel.ts)
    // — asserted loosely (date + source, any HH:MM) rather than a
    // hardcoded clock string that would only match UTC test runners.
    expect(
      screen.getByText(/^AUG 18 · \d{2}:\d{2} · PM5 432331249$/),
    ).toBeVisible();
    expect(screen.getByText("AVG SPLIT")).toBeVisible();
    expect(screen.getByText("2:10.0")).toBeVisible();
    expect(screen.getByText("DISTANCE")).toBeVisible();
    expect(screen.getByText("6000")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders the read-back segment line and note, and the Edit affordance", async () => {
    mockApi(
      () =>
        new Response(
          JSON.stringify(
            storedRow({
              held: "under",
              pain: 3,
              thumbs: "up",
              notes: "felt great",
            }),
          ),
          { status: 200 },
        ),
    );
    await renderFromTheLog();
    expect(
      await screen.findByText("UNDER · FASTER · PAIN 3/5 · LIKED"),
    ).toBeVisible();
    expect(screen.getByText("felt great")).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();
  });

  it("renders the empty-state 'Add how it felt' affordance when all four reflection fields are null", async () => {
    mockApi(() => new Response(JSON.stringify(storedRow()), { status: 200 }));
    await renderFromTheLog();
    expect(
      await screen.findByRole("button", { name: "Add how it felt" }),
    ).toBeVisible();
  });

  it("renders the plan footer when linkage is stored, and omits it otherwise", async () => {
    mockApi(
      () =>
        new Response(
          JSON.stringify(storedRow({ planKey: "sprint", planIndex: 11 })),
          { status: 200 },
        ),
    );
    const { rerender } = await renderFromTheLog();
    expect(
      await screen.findByText("Logged to Sprint (2k) Prep · SESSION 12 OF 84"),
    ).toBeVisible();
    void rerender;
  });

  it("omits the plan footer when no linkage is stored", async () => {
    mockApi(() => new Response(JSON.stringify(storedRow()), { status: 200 }));
    await renderFromTheLog();
    await screen.findByRole("heading", { name: "Sea Fret" });
    expect(screen.queryByText(/^Logged to/)).not.toBeInTheDocument();
  });

  it("carries the overlay-screen structural class (§4 N3's own scroller)", async () => {
    mockApi(() => new Response(JSON.stringify(storedRow()), { status: 200 }));
    const { container } = await renderFromTheLog();
    await screen.findByRole("heading", { name: "Sea Fret" });
    expect(container.querySelector("main.overlay-screen")).not.toBeNull();
  });

  // Fix round ❌1's own regression guard (review round 2): the JSX order
  // fix is otherwise unwitnessed by anything but a PNG a human has to
  // eyeball — a future edit could silently re-invert it. Asserts DOM
  // ORDER directly (`compareDocumentPosition`), not merely that both
  // blocks exist, against the handoff's own §3 "Section order" (reflection
  // ABOVE intervals, "same minus the save options").
  it("renders the read-back block BEFORE the intervals list in DOM order (regression guard for the handoff's §3 section order)", async () => {
    mockApi(
      () =>
        new Response(JSON.stringify(storedRow({ held: "held" })), {
          status: 200,
        }),
    );
    const { container } = await renderFromTheLog();
    await screen.findByRole("heading", { name: "Sea Fret" });

    const readback = container.querySelector(".log-readback");
    const intervals = container.querySelector(".summary-intervals");
    expect(readback).not.toBeNull();
    expect(intervals).not.toBeNull();

    // DOCUMENT_POSITION_FOLLOWING set on the result of comparing FROM
    // readback TO intervals means intervals comes AFTER readback in
    // document order — i.e. readback precedes intervals, the property
    // under test.
    const position = readback!.compareDocumentPosition(intervals!);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The converse must also hold (intervals does NOT precede readback) —
    // a single-bit assertion above could pass on garbage input; this
    // pins the actual relative order both ways.
    expect(
      intervals!.compareDocumentPosition(readback!) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });
});

describe("FromTheLog — §4 N6 edit", () => {
  it("Edit swaps the read-back for the reflection card, pre-filled from the stored row", async () => {
    mockApi(
      () =>
        new Response(
          JSON.stringify(
            storedRow({ held: "held", pain: 2, thumbs: "down", notes: "ok" }),
          ),
          { status: 200 },
        ),
    );
    await renderFromTheLog();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "HELD" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Pain 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Less like this" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByPlaceholderText("What happened out there?")).toHaveValue(
      "ok",
    );
  });

  it("Save PATCHes ONLY the changed subset — untouched fields never appear in the body", async () => {
    const apiMock = mockApi((_path, init) => {
      if (init?.method === "PATCH") {
        return new Response(JSON.stringify(storedRow({ held: "held" })), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: "Add how it felt" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "HELD" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit" })).toBeVisible(),
    );
    const patchCall = apiMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
    )!;
    expect(patchCall[0]).toBe("/api/logs/log-1");
    // The exact SET of keys sent — a subset assertion, not toMatchObject,
    // so a mutation that also sends pain/thumbs/notes unchanged turns
    // this red (self-mutation target, per this task's own brief).
    expect(parsedBody(patchCall)).toStrictEqual({ held: "held" });
  });

  it("editing notes alone sends only notes in the PATCH, normalized the same way the live door's save does", async () => {
    const apiMock = mockApi((_path, init) => {
      if (init?.method === "PATCH") {
        return new Response(JSON.stringify(storedRow({ notes: "new note" })), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: "Add how it felt" }),
    );
    await userEvent.type(
      screen.getByPlaceholderText("What happened out there?"),
      "new note",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit" })).toBeVisible(),
    );
    const patchCall = apiMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
    )!;
    expect(parsedBody(patchCall)).toStrictEqual({ notes: "new note" });
    expect(screen.getByText("new note")).toBeVisible();
  });

  it("editing pain alone sends only pain in the PATCH", async () => {
    const apiMock = mockApi((_path, init) => {
      if (init?.method === "PATCH") {
        return new Response(JSON.stringify(storedRow({ pain: 4 })), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: "Add how it felt" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Pain 4" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit" })).toBeVisible(),
    );
    const patchCall = apiMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
    )!;
    expect(parsedBody(patchCall)).toStrictEqual({ pain: 4 });
  });

  it("editing thumbs alone sends only thumbs in the PATCH", async () => {
    const apiMock = mockApi((_path, init) => {
      if (init?.method === "PATCH") {
        return new Response(JSON.stringify(storedRow({ thumbs: "up" })), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: "Add how it felt" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "↑ MORE LIKE THIS" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit" })).toBeVisible(),
    );
    const patchCall = apiMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
    )!;
    expect(parsedBody(patchCall)).toStrictEqual({ thumbs: "up" });
  });

  it("Save with nothing changed sends no PATCH at all and returns to read-back", async () => {
    const apiMock = mockApi(
      () => new Response(JSON.stringify(storedRow()), { status: 200 }),
    );
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: "Add how it felt" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Add how it felt" }),
      ).toBeVisible(),
    );
    expect(
      apiMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
      ),
    ).toBe(false);
  });

  it("Cancel reverts in place — no PATCH sent, read-back shows the original stored values", async () => {
    const apiMock = mockApi(
      () =>
        new Response(JSON.stringify(storedRow({ held: "held" })), {
          status: 200,
        }),
    );
    await renderFromTheLog();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.click(
      screen.getByRole("button", { name: "UNDER · FASTER" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("HELD")).toBeVisible();
    expect(
      apiMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
      ),
    ).toBe(false);
  });

  it("a PATCH failure re-enables Save with the server's field-named message, staying in edit mode", async () => {
    mockApi((_path, init) => {
      if (init?.method === "PATCH") {
        return new Response(
          JSON.stringify({
            error: "held must be one of held|under|over or null",
            field: "held",
          }),
          { status: 400 },
        );
      }
      return new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: "Add how it felt" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "HELD" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("held must be one of held|under|over or null"),
    ).toBeVisible();
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeEnabled();
  });

  it("a PATCH that rejects outright (a network failure, not a non-2xx response) also re-enables Save with the generic message", async () => {
    mockApi((_path, init) => {
      if (init?.method === "PATCH") {
        throw new Error("network down");
      }
      return new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: "Add how it felt" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "HELD" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Couldn't save. Try again.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("a PATCH failure with a JSON body that carries no string error field falls back to the generic message", async () => {
    mockApi((_path, init) => {
      if (init?.method === "PATCH") {
        return new Response(JSON.stringify({}), { status: 500 });
      }
      return new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: "Add how it felt" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "HELD" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Couldn't save. Try again.")).toBeVisible();
  });

  it("a PATCH failure with a non-JSON error body falls back to the generic message rather than throwing", async () => {
    mockApi((_path, init) => {
      if (init?.method === "PATCH") {
        return new Response("not json", { status: 500 });
      }
      return new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: "Add how it felt" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "HELD" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Couldn't save. Try again.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("disables Save/Cancel while the PATCH is in flight", async () => {
    let resolvePatch: (res: Response) => void = () => {};
    mockApi((_path, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          resolvePatch = resolve;
        });
      }
      return new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: "Add how it felt" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "HELD" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolvePatch(
      new Response(JSON.stringify(storedRow({ held: "held" })), {
        status: 200,
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit" })).toBeVisible(),
    );
  });
});

// Fix round LOW (b): the previous version of this describe block compared
// jsdom's localStorage before/after against itself with NOTHING ever
// seeded into it — `before`/`after` were both `{}` every run, so the
// assertion could never distinguish "nothing written" from a real write-
// then-remove; it was empty-to-empty by construction, not evidence of
// anything. Dropped in favor of the real N1 witness: `e2e/log.spec.ts`'s
// "N1: a live in-progress session is byte-identical..." test seeds a
// GENUINE draft/run pair via a real session in progress and diffs actual
// stored values, which this unit-level stand-in never could.

describe("FromTheLog — criterion 2 (a v0.11.0, all-null-hero row)", () => {
  // Exit criterion 2, this screen's own witness: "a session saved on
  // v0.11.0 (no heroes posted) renders in history with rows and
  // reflection, heroes absent — proven with a fixture posting the
  // v0.11.0 body shape verbatim." `storedSummary.test.ts` already pins
  // the MODEL half of this (every hero field independently `undefined`);
  // this is the missing SCREEN half — buildStoredSummary's output
  // actually reaching the DOM without a hero block, a crash, or a bare
  // dash anywhere a hero used to be.
  it("an all-null-hero row (the frozen v0.11.0 shape) renders no AVG SPLIT/TIME/DISTANCE anywhere, while rows and the read-back render normally", async () => {
    mockApi(
      () =>
        new Response(
          JSON.stringify(
            storedRow({
              deviceName: null,
              avgSplitSeconds: null,
              timeSeconds: null,
              distanceMeters: null,
              held: "held",
              pain: 2,
              steps: [
                {
                  label: "Work",
                  targetSplit: 120,
                  actualSplit: 121,
                  actualSource: "stopwatch",
                },
              ],
            }),
          ),
          { status: 200 },
        ),
    );
    await renderFromTheLog();
    await screen.findByRole("heading", { name: "Sea Fret" });

    expect(screen.queryByText("AVG SPLIT")).not.toBeInTheDocument();
    expect(screen.queryByText("TIME")).not.toBeInTheDocument();
    expect(screen.queryByText("DISTANCE")).not.toBeInTheDocument();
    // Rows still render (the stored step, unmeasured since no meters
    // field means the reconstructed elapsed time can't clear the floor —
    // this row's own point is the HERO absence, not row judging).
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    // The read-back still renders from the two answered fields.
    expect(screen.getByText("HELD · PAIN 2/5")).toBeVisible();
  });
});
