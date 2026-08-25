import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { api } from "../api";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { SeriesData } from "../monitor/seriesRecorder";
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
    // RC-2/RC-3 wave (Task 1): default to the common case — older rows,
    // and any row saved before this wave shipped, carry all three as
    // null (recurring failure 3's own "empty is the wrong default"
    // notwithstanding: null here is the REAL common case per the design
    // spec's own "older records are the common case for a long time",
    // §3 — the walk's real values are the exception, exercised by the
    // machine-confirmed describe block below via an explicit override).
    machineWorkSeconds: null,
    machineWorkMeters: null,
    machineSummary: null,
    // RC-1 (storage-spine design spec §3): same "null is the common
    // case" default as the RC-2/RC-3 trio above — this suite's own
    // heroes/total-line coverage lives in `storedSummary.test.ts`, so
    // every fixture here defaults to the pair being absent.
    restSeconds: null,
    restMeters: null,
    // RC-1 work pair (fix round 1, Task 3 review): same default — this
    // suite's own tier coverage lives in `storedSummary.test.ts`.
    workSeconds: null,
    workMeters: null,
    ...overrides,
  };
}

// walk-2026-08-23 keystone capture, the same 8 verification bytes the
// design spec's own §3 example renders (docs/superpowers/specs/2026-08-
// 24-summary-record-design.md §3) — real hardware-captured values, not
// invented ones (recurring failure 3).
const WALK_VERIFICATION_BYTES = [
  0x06, 0x47, 0x99, 0xaf, 0x54, 0xb0, 0x21, 0xc0,
];

// Derived by hand from WALK_VERIFICATION_BYTES, LE u32 words:
// word 0 = bytes[3]<<24 | bytes[2]<<16 | bytes[1]<<8 | bytes[0]
//        = 0xaf<<24 | 0x99<<16 | 0x47<<8 | 0x06 = 0xAF994706 -> AF99-4706
// word 1 = bytes[7]<<24 | bytes[6]<<16 | bytes[5]<<8 | bytes[4]
//        = 0xc0<<24 | 0x21<<16 | 0xb0<<8 | 0x54 = 0xC021B054 -> C021-B054
const WALK_VERIFICATION_CODE = "CODE AF99-4706 C021-B054";

// Phase LT spec 3, Task 3: a plausible multi-interval `SeriesData` — same
// small three-segment shape `PostWorkoutSummary.test.tsx`'s own
// `realisticSeries` builds (duplicated per this file's own established
// precedent of NOT sharing small fixtures across test files), never
// touching the sentinel/gap questions Task 1/2 already proved against a
// real capture.
function realisticSeries(): SeriesData {
  const samples: SeriesData["samples"] = [];
  let t = 0;
  for (const [pace, spm, hr] of [
    [140, 22, 128],
    [138, 22, 130],
    [135, 23, 132],
    [125, 24, 138],
    [122, 24, 140],
    [120, 25, 142],
    [116, 26, 148],
    [114, 27, 150],
    [112, 28, 152],
  ] as const) {
    samples.push({ t: t * 10, d: t * 4, p: pace * 10, spm, hr });
    t += 20;
  }
  return { samples };
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

// Cohort-unlock spec (2026-08-23), §2: the detail header's marked line —
// `storedRow()` (this file's own fullest fixture, reused rather than a
// fresh minimal stub, recurring failure 3) with `endedBy` set is the
// realistic payload; the finished case proves ABSENCE, not merely that a
// different value renders differently.
describe("FromTheLog — cohort-unlock §2 link-lost line", () => {
  it("renders the marked line in the detail header for a link-lost session", async () => {
    mockApi(
      () =>
        new Response(JSON.stringify(storedRow({ endedBy: "link-lost" })), {
          status: 200,
        }),
    );
    await renderFromTheLog();
    expect(
      await screen.findByText(
        "LINK LOST · the app lost the monitor before the end",
      ),
    ).toBeVisible();
  });

  it("renders nothing new for a finished session", async () => {
    mockApi(
      () =>
        new Response(JSON.stringify(storedRow({ endedBy: "finished" })), {
          status: 200,
        }),
    );
    await renderFromTheLog();
    await screen.findByRole("heading", { name: "Sea Fret" });
    expect(
      screen.queryByText("LINK LOST · the app lost the monitor before the end"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^LINK LOST/)).not.toBeInTheDocument();
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

// Log-delete spec (2026-08-18), §1 — the affordance. Copy strings and the
// button label are quoted verbatim from the spec's own table; a self-
// mutation swapping them is this task's own red-provable target.
const LINKED_COPY =
  "This removes the session and its reflection. If it is your latest plan session, the checkmark un-ticks.";
const UNLINKED_COPY = "This removes the session and its reflection.";
const DELETE_BUTTON_NAME = "Delete session";

describe("FromTheLog — log-delete spec (2026-08-18) §1 delete affordance", () => {
  it("renders the Delete session trigger only in the ready state, never while loading/erroring/not-found", async () => {
    mockApi(() => new Promise(() => {}));
    await renderFromTheLog();
    expect(
      screen.queryByRole("button", { name: DELETE_BUTTON_NAME }),
    ).not.toBeInTheDocument();
  });

  it("renders no Delete session trigger on the not-found state", async () => {
    mockApi(
      () =>
        new Response(JSON.stringify({ error: "not found" }), { status: 404 }),
    );
    await renderFromTheLog();
    await waitFor(() =>
      expect(screen.getByText("This session is gone.")).toBeVisible(),
    );
    expect(
      screen.queryByRole("button", { name: DELETE_BUTTON_NAME }),
    ).not.toBeInTheDocument();
  });

  it("renders no Delete session trigger on the error state", async () => {
    mockApi(() => new Response("", { status: 500 }));
    await renderFromTheLog();
    await waitFor(() =>
      expect(screen.getByText("Couldn't load this session.")).toBeVisible(),
    );
    expect(
      screen.queryByRole("button", { name: DELETE_BUTTON_NAME }),
    ).not.toBeInTheDocument();
  });

  it("renders the Delete session trigger below the plan footer in DOM order (Placement: bottom, below the plan footer, away from Edit)", async () => {
    mockApi(
      () =>
        new Response(
          JSON.stringify(storedRow({ planKey: "sprint", planIndex: 11 })),
          { status: 200 },
        ),
    );
    const { container } = await renderFromTheLog();
    const trigger = await screen.findByRole("button", {
      name: DELETE_BUTTON_NAME,
    });
    const footer = container.querySelector(".log-plan-footer");
    expect(footer).not.toBeNull();
    const position = footer!.compareDocumentPosition(trigger);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("first tap stages the confirm panel — the LINKED copy and Cancel/Delete session pair — when plan_key is non-null on the fetched row", async () => {
    mockApi(
      () =>
        new Response(
          JSON.stringify(storedRow({ planKey: "sprint", planIndex: 11 })),
          { status: 200 },
        ),
    );
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: DELETE_BUTTON_NAME }),
    );
    expect(screen.getByText(LINKED_COPY)).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: DELETE_BUTTON_NAME }),
    ).toBeVisible();
  });

  it("first tap stages the confirm panel — the NO-LINKAGE copy — when plan_key is null on the fetched row", async () => {
    mockApi(() => new Response(JSON.stringify(storedRow()), { status: 200 }));
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: DELETE_BUTTON_NAME }),
    );
    expect(screen.getByText(UNLINKED_COPY)).toBeVisible();
  });

  it("Cancel unstages — the trigger reappears, no DELETE call was ever sent", async () => {
    const apiMock = mockApi(
      () => new Response(JSON.stringify(storedRow()), { status: 200 }),
    );
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: DELETE_BUTTON_NAME }),
    );
    expect(screen.getByText(UNLINKED_COPY)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(UNLINKED_COPY)).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: DELETE_BUTTON_NAME }),
    ).toBeVisible();
    expect(
      apiMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toBe(false);
  });

  it("disables Cancel and the confirm button while the DELETE is in flight", async () => {
    let resolveDelete: (res: Response) => void = () => {};
    mockApi((_path, init) => {
      if (init?.method === "DELETE") {
        return new Promise<Response>((resolve) => {
          resolveDelete = resolve;
        });
      }
      return new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: DELETE_BUTTON_NAME }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: DELETE_BUTTON_NAME }),
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: DELETE_BUTTON_NAME }),
    ).toBeDisabled();

    resolveDelete(
      new Response(JSON.stringify({ unCounted: false }), { status: 200 }),
    );
    await waitFor(() =>
      expect(screen.getByText("HISTORY SCREEN")).toBeVisible(),
    );
  });

  it("a server error re-enables the confirm button with the server's message, staying staged", async () => {
    mockApi((_path, init) => {
      if (init?.method === "DELETE") {
        return new Response(JSON.stringify({ error: "Couldn't delete." }), {
          status: 500,
        });
      }
      return new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: DELETE_BUTTON_NAME }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: DELETE_BUTTON_NAME }),
    );

    expect(await screen.findByText("Couldn't delete.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: DELETE_BUTTON_NAME }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    // Still staged — the copy is still on screen, the trigger hasn't come back.
    expect(screen.getByText(UNLINKED_COPY)).toBeVisible();
  });

  it("a DELETE that rejects outright (a network failure, not a non-2xx response) re-enables with the generic message", async () => {
    mockApi((_path, init) => {
      if (init?.method === "DELETE") {
        throw new Error("network down");
      }
      return new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: DELETE_BUTTON_NAME }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: DELETE_BUTTON_NAME }),
    );

    expect(
      await screen.findByText("Couldn't delete this session. Try again."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: DELETE_BUTTON_NAME }),
    ).toBeEnabled();
  });

  it("a 404 at confirm time (another tab already deleted it) navigates as success, not an error", async () => {
    mockApi((_path, init) => {
      if (init?.method === "DELETE") {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        });
      }
      return new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: DELETE_BUTTON_NAME }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: DELETE_BUTTON_NAME }),
    );

    await waitFor(() =>
      expect(screen.getByText("HISTORY SCREEN")).toBeVisible(),
    );
    expect(screen.queryByText(UNLINKED_COPY)).not.toBeInTheDocument();
  });

  it("success navigates to resolveLogBack's target — a Plan origin lands back on /plan", async () => {
    mockApi((_path, init) => {
      if (init?.method === "DELETE") {
        return new Response(JSON.stringify({ unCounted: false }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog({
      pathname: "/today/log/log-1",
      state: { from: "/plan" },
    });
    await userEvent.click(
      await screen.findByRole("button", { name: DELETE_BUTTON_NAME }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: DELETE_BUTTON_NAME }),
    );

    await waitFor(() => expect(screen.getByText("PLAN SCREEN")).toBeVisible());
  });

  it("success navigates to resolveLogBack's target — a Today origin lands back on /today", async () => {
    mockApi((_path, init) => {
      if (init?.method === "DELETE") {
        return new Response(JSON.stringify({ unCounted: true }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog({
      pathname: "/today/log/log-1",
      state: { from: "/today" },
    });
    await userEvent.click(
      await screen.findByRole("button", { name: DELETE_BUTTON_NAME }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: DELETE_BUTTON_NAME }),
    );

    await waitFor(() => expect(screen.getByText("TODAY SCREEN")).toBeVisible());
  });

  it("the confirm DELETE call targets /api/logs/:id", async () => {
    const apiMock = mockApi((_path, init) => {
      if (init?.method === "DELETE") {
        return new Response(JSON.stringify({ unCounted: false }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(storedRow()), { status: 200 });
    });
    await renderFromTheLog();
    await userEvent.click(
      await screen.findByRole("button", { name: DELETE_BUTTON_NAME }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: DELETE_BUTTON_NAME }),
    );
    await waitFor(() =>
      expect(screen.getByText("HISTORY SCREEN")).toBeVisible(),
    );
    const deleteCall = apiMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
    )!;
    expect(deleteCall[0]).toBe("/api/logs/log-1");
  });
});

// §5.1 exit criterion 1: "the copy/decision honesty test is a TABLE of
// server decisions vs rendered outcomes... INCLUDING a state where plan
// state changed between the fetch and the confirm: the copy's conditional
// wording stays true and `unCounted` reports what actually happened."
//
// The client has NO predicate that predicts `unCounted` (spec's own words:
// "the client only reads plan_key presence") — so this table proves the
// STATIC, plan_key-only-derived copy never contradicts whatever the server
// (mocked here) actually decides, across every shape that decision can
// take. The linked copy is a HEDGE ("if it is your latest plan session,
// the checkmark un-ticks") — true whether unCounted comes back true (row
// 1) or false (rows 2 and 4, for two entirely different reasons: a
// non-terminal index, and a race that invalidated an index that WAS
// terminal at fetch time). The unlinked copy never mentions the checkmark
// at all, so it can't be contradicted by any unCounted value (row 3).
const HONESTY_TABLE: {
  name: string;
  row: StoredLog;
  unCounted: boolean;
  expectedCopy: string;
}[] = [
  {
    name: "terminal linked — server actually un-counts",
    row: storedRow({ planKey: "sprint", planIndex: 11 }),
    unCounted: true,
    expectedCopy: LINKED_COPY,
  },
  {
    name: "non-terminal linked — server declines (not the latest slot)",
    row: storedRow({ planKey: "sprint", planIndex: 3 }),
    unCounted: false,
    expectedCopy: LINKED_COPY,
  },
  {
    name: "unlinked — no plan_key at all",
    row: storedRow({ planKey: null, planIndex: null }),
    unCounted: false,
    expectedCopy: UNLINKED_COPY,
  },
  {
    name: "stale-plan-changed-between-fetch-and-confirm — terminal at fetch time, but a Reset/Switch/second delete raced it before confirm",
    row: storedRow({ planKey: "sprint", planIndex: 11 }),
    unCounted: false,
    expectedCopy: LINKED_COPY,
  },
];

describe("FromTheLog — §5.1 the copy/decision honesty table", () => {
  for (const { name, row, unCounted, expectedCopy } of HONESTY_TABLE) {
    it(`${name}: renders the honest copy pre-confirm and completes cleanly on {unCounted: ${unCounted}}`, async () => {
      mockApi((_path, init) => {
        if (init?.method === "DELETE") {
          return new Response(JSON.stringify({ unCounted }), { status: 200 });
        }
        return new Response(JSON.stringify(row), { status: 200 });
      });
      await renderFromTheLog();
      await userEvent.click(
        await screen.findByRole("button", { name: DELETE_BUTTON_NAME }),
      );
      // The copy is a pure function of plan_key presence, computed BEFORE
      // the server has said anything about unCounted — asserted here,
      // before the confirm tap below ever reaches the mocked response.
      expect(screen.getByText(expectedCopy)).toBeVisible();
      // Neither copy string ever claims the OTHER row's fact (no
      // cross-contamination between the hedge and the unlinked copy).
      const otherCopy =
        expectedCopy === LINKED_COPY ? UNLINKED_COPY : LINKED_COPY;
      expect(screen.queryByText(otherCopy)).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: DELETE_BUTTON_NAME }),
      );
      // Whatever the server actually decided, the delete completes and
      // navigates — the copy never has to be "walked back" by a follow-up
      // screen state, because it never promised more than the hedge.
      await waitFor(() =>
        expect(screen.getByText("HISTORY SCREEN")).toBeVisible(),
      );
    });
  }
});

// Phase LT spec 3, Task 3 (§1: "the from-the-log view" host, placement
// below the intervals list, above the plan footer; ABSENT for "every
// session logged before spec 2 shipped" — a stored row with `series:
// null`, this describe's own fixture). `<TraceChart>` (Task 2) owns every
// absence/gate rule already — this suite proves only that THIS screen
// passes the fetched row's own `series` through and places the result
// correctly.
describe("FromTheLog — the trace chart (Phase LT spec 3)", () => {
  it("renders the chart below the intervals list and above the plan footer, from the fetched row's own series", async () => {
    mockApi(
      () =>
        new Response(
          JSON.stringify(
            storedRow({
              series: realisticSeries(),
              planKey: "sprint",
              planIndex: 11,
            }),
          ),
          { status: 200 },
        ),
    );
    const { container } = await renderFromTheLog();
    await screen.findByRole("heading", { name: "Sea Fret" });

    const figure = container.querySelector(".trace-figure");
    const intervals = container.querySelector(".summary-intervals");
    const footer = container.querySelector(".log-plan-footer");
    expect(figure).not.toBeNull();
    expect(intervals).not.toBeNull();
    expect(footer).not.toBeNull();

    // DOM order, both directions (spec 1's own fix-round technique) —
    // below intervals...
    expect(
      intervals!.compareDocumentPosition(figure!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      figure!.compareDocumentPosition(intervals!) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    // ...and above the plan footer.
    expect(
      figure!.compareDocumentPosition(footer!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      footer!.compareDocumentPosition(figure!) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  it("renders NOTHING for a pre-spec-2 stored row — `series: null`, §1's own ABSENT case", async () => {
    mockApi(
      () =>
        new Response(JSON.stringify(storedRow({ series: null })), {
          status: 200,
        }),
    );
    const { container } = await renderFromTheLog();
    await screen.findByRole("heading", { name: "Sea Fret" });
    expect(container.querySelector(".trace-figure")).toBeNull();
  });
});

// RC-2/RC-3 wave, Task 1 (docs/superpowers/specs/2026-08-24-summary-
// record-design.md §3 as amended by the 2026-08-25 plan's Global
// Constraints, James's label ruling): the MACHINE CONFIRMED · WORK ONLY
// block. Reads straight off the fetched `StoredLog` row (never the pure
// `buildStoredSummary` view) — `machineWorkSeconds`/`machineWorkMeters`/
// `machineSummary.verificationBytes` are the only three fields this
// block ever touches; the other nine decoded `machineSummary` fields
// have no display surface this wave and are never asserted here.
describe("FromTheLog — the MACHINE CONFIRMED · WORK ONLY block", () => {
  it("renders the label, the value line, the verification code, and the caption for the walk's real values", async () => {
    mockApi(
      () =>
        new Response(
          JSON.stringify(
            storedRow({
              machineWorkSeconds: 124,
              machineWorkMeters: 500,
              machineSummary: { verificationBytes: WALK_VERIFICATION_BYTES },
            }),
          ),
          { status: 200 },
        ),
    );
    const { container } = await renderFromTheLog();
    await screen.findByRole("heading", { name: "Sea Fret" });

    expect(screen.getByText("MACHINE CONFIRMED · WORK ONLY")).toBeVisible();
    expect(screen.getByText("2:04.0 work · 500m")).toBeVisible();
    expect(screen.getByText(WALK_VERIFICATION_CODE)).toBeVisible();
    // RC-5 (hero-truth spec) §3, Task 3: the caption's SECOND correction.
    // The PM-gate wording above ("Everything else on this screen includes
    // rest") went false the moment this task made the heroes work-only —
    // the totals ABOVE the block no longer include rest either. THIRD
    // correction (Task 3 fix round 4, PM gate finding 6): the second
    // wording still argued with the screen — the TOTAL line ("4:04 total
    // · plus 242 m coasting in rest") sits four lines above this caption
    // and is the only thing on screen actually called a total, and it
    // DOES include rest. New copy separates "the three numbers above"
    // (work-only) from "the total line and the chart below" (both
    // rest-inclusive) instead of implying every number above is
    // rest-free.
    expect(
      screen.getByText(
        "Rest metres excluded from the three numbers above. The total line and the chart below both span rest.",
      ),
    ).toBeVisible();

    // Placement: below the interval table (§3's own placement rule).
    const block = container.querySelector(".log-machine-confirmed");
    const intervals = container.querySelector(".summary-intervals");
    expect(block).not.toBeNull();
    expect(intervals).not.toBeNull();
    expect(
      intervals!.compareDocumentPosition(block!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders NO block when all three machine fields are null (the common case, old rows)", async () => {
    mockApi(() => new Response(JSON.stringify(storedRow()), { status: 200 }));
    const { container } = await renderFromTheLog();
    await screen.findByRole("heading", { name: "Sea Fret" });

    expect(screen.queryByText("MACHINE CONFIRMED · WORK ONLY")).toBeNull();
    expect(container.querySelector(".log-machine-confirmed")).toBeNull();
  });

  it("renders the block WITHOUT a CODE line when the totals are present but machineSummary is null", async () => {
    mockApi(
      () =>
        new Response(
          JSON.stringify(
            storedRow({
              machineWorkSeconds: 124,
              machineWorkMeters: 500,
              machineSummary: null,
            }),
          ),
          { status: 200 },
        ),
    );
    await renderFromTheLog();
    await screen.findByRole("heading", { name: "Sea Fret" });

    expect(screen.getByText("2:04.0 work · 500m")).toBeVisible();
    expect(screen.queryByText(/^CODE /)).toBeNull();
  });

  it("renders the block WITHOUT a CODE line when verificationBytes has fewer than 8 entries", async () => {
    mockApi(
      () =>
        new Response(
          JSON.stringify(
            storedRow({
              machineWorkSeconds: 124,
              machineWorkMeters: 500,
              machineSummary: {
                verificationBytes: WALK_VERIFICATION_BYTES.slice(0, 7),
              },
            }),
          ),
          { status: 200 },
        ),
    );
    await renderFromTheLog();
    await screen.findByRole("heading", { name: "Sea Fret" });

    expect(screen.getByText("2:04.0 work · 500m")).toBeVisible();
    expect(screen.queryByText(/^CODE /)).toBeNull();
  });

  // `machineWorkMeters` is independently nullable at the DB layer even
  // though the guard is keyed on `machineWorkSeconds` alone (§3's own
  // trigger) — the value line degrades to just the work clause, never
  // inventing a meters figure or a stray " · " with nothing after it.
  it("renders the value line WITHOUT the meters clause when machineWorkMeters alone is null", async () => {
    mockApi(
      () =>
        new Response(
          JSON.stringify(
            storedRow({ machineWorkSeconds: 124, machineWorkMeters: null }),
          ),
          { status: 200 },
        ),
    );
    await renderFromTheLog();
    await screen.findByRole("heading", { name: "Sea Fret" });

    expect(screen.getByText("2:04.0 work")).toBeVisible();
    expect(screen.queryByText(/·.*m$/)).toBeNull();
  });
});
