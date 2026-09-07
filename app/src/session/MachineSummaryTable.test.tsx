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
    expect(screen.getByText("PM5 · PER INTERVAL")).toBeInTheDocument();
    const table = screen.getByRole("table", {
      name: "Machine summary per interval",
    });
    const [header, ...body] = within(table).getAllByRole("row");
    expect(
      within(header!)
        .getAllByRole("columnheader")
        .map((c) => c.textContent),
    ).toStrictEqual(["#", "HR", "WATTS", "CAL", "CAL/HR", "DRAG", "REST m"]);
    expect(body).toHaveLength(2);
    expect(
      within(body[0]!)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toStrictEqual(["1", "55", "157", "73", "838", "101", "—"]);
    expect(
      within(body[1]!)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toStrictEqual(["2", "—", "164", "0", "0", "—", "18"]);
  });

  it("renders nothing at all without machine rows — a manual row or a Just Row adds no surface", () => {
    const { container } = render(<MachineSummaryTable rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
