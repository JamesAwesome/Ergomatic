import { describe, it, expect, vi } from "vitest";
import {
  adoptEffortKey,
  effortError,
  withPainAlias,
  notePainWrite,
} from "./effortCompat.js";

describe("adoptEffortKey (spec §4.3: presence-preserving, effort wins, disagreement is 400)", () => {
  it("leaves a body with neither key untouched — no effort key is created", () => {
    const body: Record<string, unknown> = { held: "held" };
    expect(adoptEffortKey(body)).toStrictEqual({
      ok: true,
      usedPainKey: false,
    });
    expect("effort" in body).toBe(false);
    expect("pain" in body).toBe(false);
  });
  it("copies a pain key to effort when effort is absent, including an explicit null (a clear)", () => {
    const b1: Record<string, unknown> = { pain: 3 };
    expect(adoptEffortKey(b1)).toStrictEqual({ ok: true, usedPainKey: true });
    expect(b1.effort).toBe(3);
    const b2: Record<string, unknown> = { pain: null };
    expect(adoptEffortKey(b2)).toStrictEqual({ ok: true, usedPainKey: true });
    expect("effort" in b2 && b2.effort === null).toBe(true);
  });
  it("effort wins when both are present and agree, and when pain is null", () => {
    const b1: Record<string, unknown> = { pain: 3, effort: 3 };
    expect(adoptEffortKey(b1).ok).toBe(true);
    expect(b1.effort).toBe(3);
    const b2: Record<string, unknown> = { pain: null, effort: 4 };
    expect(adoptEffortKey(b2).ok).toBe(true);
    expect(b2.effort).toBe(4);
  });
  it("pain wins when effort is null beside a non-null pain (null is 'no answer', not a disagreement)", () => {
    const b: Record<string, unknown> = { pain: 3, effort: null };
    expect(adoptEffortKey(b)).toStrictEqual({ ok: true, usedPainKey: true });
    expect(b.effort).toBe(3);
  });
  it("rejects two non-null values that disagree, naming effort", () => {
    const b: Record<string, unknown> = { pain: 2, effort: 4 };
    expect(adoptEffortKey(b)).toStrictEqual({
      ok: false,
      field: "effort",
      error: "pain and effort disagree; send one",
    });
  });
  it("does not validate the value — that is effortError's job", () => {
    const b: Record<string, unknown> = { pain: "3" };
    expect(adoptEffortKey(b).ok).toBe(true);
    expect(b.effort).toBe("3");
    expect(effortError("3")).toBe("effort must be an integer 1..5 or null");
    expect(effortError(0)).toBe("effort must be an integer 1..5 or null");
    expect(effortError(null)).toBeNull();
    expect(effortError(undefined)).toBeNull();
    expect(effortError(5)).toBeNull();
  });
});

describe("withPainAlias", () => {
  it("adds pain equal to effort and keeps everything else", () => {
    expect(withPainAlias({ id: "a", effort: 3 })).toStrictEqual({
      id: "a",
      effort: 3,
      pain: 3,
    });
    expect(withPainAlias({ id: "b", effort: null })).toStrictEqual({
      id: "b",
      effort: null,
      pain: null,
    });
  });
});

describe("notePainWrite", () => {
  it("emits one structured console.info line naming the route", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    notePainWrite("PATCH /api/logs/:id");
    expect(spy).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        event: "compat.pain_write",
        route: "PATCH /api/logs/:id",
      }),
    );
    spy.mockRestore();
  });
});
