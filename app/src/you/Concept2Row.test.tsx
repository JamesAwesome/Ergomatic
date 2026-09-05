import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Concept2Row from "./Concept2Row";
import { rowState } from "./concept2RowState";
import { LINK_UNAVAILABLE, type Concept2Link } from "../api/useConcept2Link";
import { api } from "../api";

// Same idiom as `You.test.tsx`: `./api` is mocked (its ONE export), the
// link read is answered from `c2Link`, everything else falls through to
// `fetch`. `c2Link.body === "pending"` answers with a promise that never
// settles, which is how cells 1/2a/2b (no read has resolved this mount) are
// reached honestly rather than by racing the assertion against the read.
const c2Link = vi.hoisted(() => ({
  body: { available: false } as unknown,
  status: 200,
}));

vi.mock("../api", () => ({
  api: vi.fn(async (path: string, init?: RequestInit) => {
    if (path !== "/api/concept2/link") return fetch(path, init);
    if (c2Link.body === "pending") return new Promise<Response>(() => {});
    return new Response(JSON.stringify(c2Link.body), {
      status: c2Link.status,
      headers: { "Content-Type": "application/json" },
    });
  }),
}));

const AVAILABLE_UNLINKED: Concept2Link = {
  ...LINK_UNAVAILABLE,
  available: true,
};
const LINKED: Concept2Link = {
  available: true,
  linked: true,
  c2UserId: 2211,
  c2Username: "jamesawesome",
  needsReauth: false,
  logbookBaseUrl: "https://log-dev.concept2.com",
};
const REAUTH: Concept2Link = { ...LINKED, needsReauth: true };
const FAILED = { status: 502 };

beforeEach(() => {
  c2Link.body = { available: false };
  c2Link.status = 200;
  vi.mocked(api).mockClear();
});
afterEach(() => {
  localStorage.clear();
});

function renderRow(accountId = "u1") {
  return render(
    <MemoryRouter>
      <Concept2Row accountId={accountId} />
    </MemoryRouter>,
  );
}

describe("rowState — the decision table, all eleven leaf cells (spec §5.1)", () => {
  // Written as INDEPENDENT literals against the table's own row numbers, so
  // a change to the derivation is caught by the cell it moves, not by a
  // symbol that moved with it (RF21).
  it.each([
    ["1", null, null, false, null],
    ["1 (seen)", null, null, true, null],
    ["2a", null, FAILED, false, null],
    ["2b", null, FAILED, true, "COULDN'T READ"],
    ["3", LINK_UNAVAILABLE, null, false, null],
    ["4", LINK_UNAVAILABLE, FAILED, true, null],
    ["5", AVAILABLE_UNLINKED, null, false, "NOT LINKED"],
    ["6", AVAILABLE_UNLINKED, FAILED, false, "COULDN'T READ"],
    ["7", LINKED, null, false, "LINKED ✓"],
    ["8", LINKED, FAILED, false, "COULDN'T READ"],
    ["9", REAUTH, null, false, "RECONNECT NEEDED"],
    ["10", REAUTH, FAILED, false, "RECONNECT NEEDED"],
  ] as const)("cell %s", (_cell, link, failed, seen, expected) => {
    expect(rowState(link, failed, seen)).toBe(expected);
  });

  it("cell 10 is ruling 5: a failed re-read does NOT overwrite a sticky RECONNECT NEEDED", () => {
    // Stated on its own because it is the cell the whole revision exists
    // for, and the one the card's own ordering would get wrong.
    expect(rowState(REAUTH, FAILED, false)).toBe("RECONNECT NEEDED");
    expect(rowState(REAUTH, FAILED, true)).toBe("RECONNECT NEEDED");
  });

  it("cell 4: seen does not resurrect a row a successful available:false read removed", () => {
    expect(rowState(LINK_UNAVAILABLE, FAILED, true)).toBeNull();
  });
});

describe("Concept2Row on You (spec §5.1 R1-R4, R11)", () => {
  it("cell 5: an available, unlinked account gets a NOT LINKED row linking to /you/concept2", async () => {
    c2Link.body = { available: true, linked: false };
    renderRow();
    const row = await screen.findByRole("link", { name: /CONCEPT2/ });
    expect(row).toHaveAttribute("href", "/you/concept2");
    expect(screen.getByText("NOT LINKED")).toBeInTheDocument();
  });

  it("cell 7: a healthy link reads LINKED ✓", async () => {
    c2Link.body = LINKED;
    renderRow();
    expect(await screen.findByText("LINKED ✓")).toBeInTheDocument();
  });

  it("cell 9: needsReauth reads RECONNECT NEEDED — the pre-emptive warning the row exists for (R3)", async () => {
    c2Link.body = REAUTH;
    renderRow();
    expect(await screen.findByText("RECONNECT NEEDED")).toBeInTheDocument();
  });

  it("cell 3: a successful available:false read draws nothing, and clears seen (I-C)", async () => {
    localStorage.setItem("ergomatic.concept2Seen.u1", "1");
    c2Link.body = { available: false };
    renderRow();
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/api/concept2/link"),
    );
    await waitFor(() =>
      expect(localStorage.getItem("ergomatic.concept2Seen.u1")).toBeNull(),
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("cell 2a: a FIRST-EVER read that fails draws nothing — never an error about a feature this account may not have (R4)", async () => {
    c2Link.body = { error: "upstream" };
    c2Link.status = 502;
    renderRow();
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/api/concept2/link"),
    );
    // Positive readiness first: the read has resolved (the hook set
    // `failed`), which this test observes through the row NOT rendering
    // after the call — so wait one more macrotask for the state to land.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText("COULDN'T READ")).toBeNull();
  });

  it("cell 2b: an account that HAS been told, whose read fails, keeps its door and reads COULDN'T READ (R11)", async () => {
    localStorage.setItem("ergomatic.concept2Seen.u1", "1");
    c2Link.body = { error: "upstream" };
    c2Link.status = 502;
    renderRow();
    expect(await screen.findByText("COULDN'T READ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /CONCEPT2/ })).toHaveAttribute(
      "href",
      "/you/concept2",
    );
  });

  it("cell 1: nothing while the first read is still pending, seen or not", async () => {
    localStorage.setItem("ergomatic.concept2Seen.u1", "1");
    c2Link.body = "pending";
    renderRow();
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/api/concept2/link"),
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("a successful available:true read mints seen for THIS account only (I-A, I-B)", async () => {
    c2Link.body = { available: true, linked: false };
    renderRow("u1");
    await screen.findByText("NOT LINKED");
    await waitFor(() =>
      expect(localStorage.getItem("ergomatic.concept2Seen.u1")).toBe("1"),
    );
    expect(localStorage.getItem("ergomatic.concept2Seen.u2")).toBeNull();
  });

  it("I-A: a second account on the same device inherits nothing — its own failed first read draws no row", async () => {
    localStorage.setItem("ergomatic.concept2Seen.u1", "1");
    c2Link.body = { error: "upstream" };
    c2Link.status = 502;
    renderRow("u2");
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/api/concept2/link"),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("R2: the row carries no attempt state — none of the card's tap-born strings can appear", async () => {
    c2Link.body = LINKED;
    renderRow();
    await screen.findByText("LINKED ✓");
    for (const s of ["WAITING", "OPENING CONCEPT2", "Tap again to unlink"]) {
      expect(screen.queryByText(s)).toBeNull();
    }
  });
});
