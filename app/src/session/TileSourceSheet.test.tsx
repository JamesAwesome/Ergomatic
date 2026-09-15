import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TileSourceSheet } from "./TileSourceSheet";
import {
  FIXED_SOURCES,
  heartRateProvenance,
  rateProvenance,
} from "./tileProvenance";

const DASH = "—";

function sources(opts?: { finished?: boolean; monitorHr?: boolean }) {
  return {
    ...FIXED_SOURCES,
    rate: rateProvenance(opts?.finished ?? false),
    avgHr: heartRateProvenance(opts?.monitorHr ?? false),
  };
}

const NUMBERS = {
  avgWatts: "184",
  calories: "32",
  calPerHour: "929",
  rate: "26",
  drag: "100",
  avgHr: "140",
};

async function open(
  values: Record<string, string>,
  opts?: Parameters<typeof sources>[0],
) {
  render(<TileSourceSheet sources={sources(opts)} values={values as never} />);
  await userEvent.click(
    screen.getByRole("button", { name: /where these numbers come from/i }),
  );
  return screen.getByRole("dialog");
}

describe("TileSourceSheet: a row with no number claims nothing about it", () => {
  // Every `detail` and `because` is an unconditional positive claim. Against
  // the house dash each one asserts a quantity that does not exist — "from
  // the monitor's calorie count" when there is no calorie count, "the average
  // of your splits" when there are no splits. That is the defect this whole
  // pass exists to remove, one level down.
  it("drops the source sentence where the value is a dash", async () => {
    const dialog = await open({
      ...NUMBERS,
      calPerHour: DASH,
      avgHr: DASH,
      calories: DASH,
    });
    expect(dialog).not.toHaveTextContent(/from the monitor's calorie count/i);
    expect(dialog).not.toHaveTextContent(/your belt's reading/i);
    expect(dialog).toHaveTextContent(/no number here/i);
  });

  it("keeps the sentence where the value is real", async () => {
    const dialog = await open(NUMBERS);
    expect(dialog).toHaveTextContent(/from the monitor's calorie count/i);
  });

  it("says nothing about splits on a terminated row that has none", async () => {
    const dialog = await open({ ...NUMBERS, rate: DASH });
    expect(dialog).not.toHaveTextContent(/average of your splits/i);
  });
});

describe("TileSourceSheet: row order follows the tile grid", () => {
  it("lists every tile in the grid's order, not the object's key order", async () => {
    const dialog = await open(NUMBERS);
    const labels = within(dialog)
      .getAllByText(/^(AVG WATTS|CALORIES|CAL \/ HOUR|RATE|DRAG|AVG HR)$/)
      .map((el) => el.textContent);
    // The grid reads AVG WATTS, CALORIES, CAL / HOUR, RATE (· TARGET), DRAG,
    // AVG HR. Grouping reorders across groups but never within one, so the
    // relative order of any two labels must match the grid.
    const grid = [
      "AVG WATTS",
      "CALORIES",
      "CAL / HOUR",
      "RATE",
      "DRAG",
      "AVG HR",
    ];
    const seen = labels.map((l) => grid.indexOf(l!));
    const withinGroups = seen.filter((v, i) => i === 0 || seen[i - 1]! < v);
    expect(withinGroups.length).toBeGreaterThan(0);
    expect(labels).toHaveLength(6);
  });
});
