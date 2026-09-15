import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MachineSummaryTable from "./MachineSummaryTable";

describe("MachineSummaryTable (Phase LP §3)", () => {
  it("renders one row per machine split — a dash where the machine did not say (undefined or a null belt), 0 as 0", () => {
    render(
      <MachineSummaryTable
        rows={[
          {
            index: 1,
            hr: 55,
            watts: 157,
            calories: 73,
            calPerHour: 838,
            drag: 101,
            restMeters: undefined,
          },
          {
            index: 2,
            hr: null,
            watts: 164,
            calories: 0,
            calPerHour: 0,
            drag: undefined,
            restMeters: 18,
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "MACHINE SUMMARY" }),
    ).toBeInTheDocument();
    expect(screen.getByText("PER INTERVAL")).toBeInTheDocument();
    // The eyebrow NO LONGER claims the PM5 for all six columns — the group
    // row does that job now, for the four it is true of (Gate 0B round 2,
    // approved 2026-09-15).
    expect(screen.queryByText("PM5 · PER INTERVAL")).not.toBeInTheDocument();
    const table = screen.getByRole("table", {
      name: "Machine summary per interval",
    });
    const [groups, header, ...body] = within(table).getAllByRole("row");
    // DERIVED leads, and that is load-bearing rather than cosmetic: this
    // table scrolls sideways and overflows ~30px at 390px, so whatever sits
    // rightmost is invisible at rest. With MEASURED first, the two derived
    // columns and their own heading were the part clipped off — the table
    // hid the disclosure it exists to make (round 2, measured).
    expect(
      within(groups!)
        .getAllByRole("columnheader")
        .map((c) => c.textContent),
      // TWO, not three: the group row's cell over the pinned `#` is empty and
      // `aria-hidden`, so a screen reader is not told about a header with no
      // name. Asserted rather than assumed — if it ever becomes announceable
      // this goes red.
    ).toStrictEqual(["DERIVED", "MEASURED"]);
    expect(
      within(groups!)
        .getAllByRole("columnheader")
        .map((c) => c.getAttribute("colspan")),
    ).toStrictEqual(["2", "4"]);
    expect(
      within(header!)
        .getAllByRole("columnheader")
        .map((c) => c.textContent),
    ).toStrictEqual(["#", "WATTS", "CAL/HOUR", "HR", "CAL", "DRAG", "REST m"]);
    expect(body).toHaveLength(2);
    expect(
      within(body[0]!)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toStrictEqual(["1", "157", "838", "55", "73", "101", "—"]);
    expect(
      within(body[1]!)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toStrictEqual(["2", "164", "0", "—", "0", "—", "18"]);
  });

  it("renders nothing at all without machine rows — a manual row or a Just Row adds no surface", () => {
    const { container } = render(<MachineSummaryTable rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
