import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUILDER_DRAFT_KEY,
  clearBuilderDraft,
  formFingerprint,
  loadBuilderDraft,
  saveBuilderDraft,
  type BuilderDraft,
} from "./builderDraft";
import { adoptForm, newForm, newRow } from "./builderState";

function draftOf(form = newForm(), baseline = newForm()): BuilderDraft {
  return {
    v: 1,
    mode: { kind: "new" },
    form,
    baseline,
    savedAt: "2026-08-10T00:00:00.000Z",
  };
}

describe("formFingerprint", () => {
  it("two pristine forms fingerprint identically despite different row ids", () => {
    const a = newForm();
    const b = newForm();
    expect(a.rows[0].id).not.toBe(b.rows[0].id); // the counter guarantees this
    expect(formFingerprint(a)).toBe(formFingerprint(b));
  });

  it("changes when ANY non-id row field or form field changes", () => {
    const base = newForm();
    const baseFp = formFingerprint(base);
    // form-level fields
    expect(formFingerprint({ ...base, title: "x" })).not.toBe(baseFp);
    expect(formFingerprint({ ...base, type: "AT" })).not.toBe(baseFp);
    expect(formFingerprint({ ...base, pain: 3 })).not.toBe(baseFp);
    expect(formFingerprint({ ...base, reps: 4 })).not.toBe(baseFp);
    // every enumerable row field except id — future-field guard: iterate
    // the row's own keys so a new BuilderRow field that the fingerprint
    // ignores fails THIS test the day it is added.
    const row = newRow("w");
    for (const key of Object.keys(row).filter((k) => k !== "id")) {
      const mutated = {
        ...base,
        rows: [{ ...base.rows[0], [key]: "MUTANT" }],
      };
      expect(formFingerprint(mutated), `field ${key}`).not.toBe(baseFp);
    }
  });

  it("row count and order participate", () => {
    const base = newForm();
    const twoRows = { ...base, rows: [...base.rows, newRow("r")] };
    expect(formFingerprint(twoRows)).not.toBe(formFingerprint(base));
    const swapped = { ...twoRows, rows: [...twoRows.rows].reverse() };
    expect(formFingerprint(swapped)).not.toBe(formFingerprint(twoRows));
  });
});

describe("save/load/clear round trip", () => {
  beforeEach(() => localStorage.clear());

  // Phase DE PR 1: a draft saved by a pre-PR-1 build carries a
  // `difficulty` the form no longer has. It must still load; the stray
  // field is simply ignored (Builder never reads it).
  it("loads a pre-PR-1 draft that still carries a difficulty field", () => {
    const d = draftOf({ ...newForm(), title: "Old draft" });
    const raw = JSON.parse(JSON.stringify(d)) as {
      form: Record<string, unknown>;
    };
    raw.form.difficulty = "medium";
    localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify(raw));
    const back = loadBuilderDraft();
    expect(back?.form.title).toBe("Old draft");
    expect(back?.mode).toStrictEqual({ kind: "new" });
  });

  it("round-trips a draft and load returns the stored forms", () => {
    const d = draftOf({ ...newForm(), title: "Half done" });
    expect(saveBuilderDraft(d)).toBe(true);
    const back = loadBuilderDraft();
    expect(back?.form.title).toBe("Half done");
    expect(back?.mode).toStrictEqual({ kind: "new" });
  });

  it("edit-mode drafts carry their workoutId", () => {
    saveBuilderDraft({
      ...draftOf(),
      mode: { kind: "edit", workoutId: "w-1" },
    });
    expect(loadBuilderDraft()?.mode).toStrictEqual({
      kind: "edit",
      workoutId: "w-1",
    });
  });

  it("clear removes the slot", () => {
    saveBuilderDraft(draftOf());
    clearBuilderDraft();
    expect(loadBuilderDraft()).toBeNull();
    expect(localStorage.getItem(BUILDER_DRAFT_KEY)).toBeNull();
  });

  it("garbage, wrong version, and shape-invalid payloads load as null", () => {
    localStorage.setItem(BUILDER_DRAFT_KEY, "not json {");
    expect(loadBuilderDraft()).toBeNull();
    localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify({ v: 2 }));
    expect(loadBuilderDraft()).toBeNull();
    localStorage.setItem(
      BUILDER_DRAFT_KEY,
      JSON.stringify({ v: 1, mode: { kind: "new" }, form: { rows: "no" } }),
    );
    expect(loadBuilderDraft()).toBeNull();
    localStorage.setItem(
      BUILDER_DRAFT_KEY,
      JSON.stringify({
        v: 1,
        mode: { kind: "edit" },
        form: newForm(),
        baseline: newForm(),
        savedAt: "2026-08-10T00:00:00.000Z",
      }),
    );
    // edit mode without a workoutId string is invalid
    expect(loadBuilderDraft()).toBeNull();
  });
});

describe("localStorage error handling", () => {
  afterEach(() => vi.restoreAllMocks());

  it("saveBuilderDraft returns false when localStorage.setItem throws", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    const d = draftOf();
    expect(saveBuilderDraft(d)).toBe(false);
    spy.mockRestore();
  });

  it("clearBuilderDraft swallows and does not throw when localStorage.removeItem throws", () => {
    const spy = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    expect(() => clearBuilderDraft()).not.toThrow();
    spy.mockRestore();
  });
});

describe("adoptForm", () => {
  it("remaps every row id to a fresh one and touches nothing else", () => {
    const original = { ...newForm(), title: "keep me" };
    original.rows = [...original.rows, newRow("r")];
    const adopted = adoptForm(original);
    expect(adopted.title).toBe("keep me");
    expect(adopted.rows).toHaveLength(2);
    adopted.rows.forEach((row, i) => {
      expect(row.id).not.toBe(original.rows[i].id);
      const { id: _a, ...restAdopted } = row;
      const { id: _b, ...restOriginal } = original.rows[i];
      expect(restAdopted).toStrictEqual(restOriginal);
    });
    const ids = adopted.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
