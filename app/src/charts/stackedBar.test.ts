import { describe, expect, it } from "vitest";
import { layoutStackedBar } from "./stackedBar";

describe("layoutStackedBar", () => {
  it("lays segments in the given order, widths proportional to value, one gap between neighbours, ending flush at the width", () => {
    const segs = layoutStackedBar(
      [
        { key: "a", value: 1 },
        { key: "b", value: 3 },
      ],
      104,
      4,
    );
    expect(segs).toStrictEqual([
      { key: "a", x: 0, width: 25 },
      { key: "b", x: 29, width: 75 },
    ]);
    expect(segs[1]!.x + segs[1]!.width).toBe(104);
  });

  it("a zero-value entry gets no segment and steals no gap; an all-zero input yields none", () => {
    expect(
      layoutStackedBar(
        [
          { key: "a", value: 0 },
          { key: "b", value: 2 },
        ],
        100,
        2,
      ),
    ).toStrictEqual([{ key: "b", x: 0, width: 100 }]);
    expect(layoutStackedBar([{ key: "a", value: 0 }], 100, 2)).toStrictEqual(
      [],
    );
  });
});
