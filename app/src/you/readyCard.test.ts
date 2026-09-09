import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `you/readyCard.ts` — the rower's choice about the ready screen (Phase RN,
 * spec `2026-09-09-ready-card-preference-design.md`, Gate 0 CLOSED
 * 2026-09-09).
 *
 * EVERY CASE LOADS THE MODULE FRESH, and that is not ceremony. The module
 * owns a `lastSet` in module scope, so a value written by one `it()` would
 * otherwise be visible to every later one — and `localStorage.removeItem` in
 * a `beforeEach` cannot clear it, because it does not live in localStorage.
 * The anchor antagonist pass proved exactly this leak on the first draft of
 * the module. `vi.resetModules()` plus a dynamic import per case is what
 * makes each test describe a fresh process.
 */
async function freshModule() {
  vi.resetModules();
  return await import("./readyCard");
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the default (I-1: a rower who never opens Settings)", () => {
  it("is SHOW, so today's ready screen is what an untouched device renders", async () => {
    const { READY_CARD_DEFAULT } = await freshModule();
    expect(READY_CARD_DEFAULT).toBe("show");
  });

  it("reads SHOW from an empty store", async () => {
    const { loadReadyCard } = await freshModule();
    expect(loadReadyCard()).toBe("show");
  });
});

describe("the read is total (I-2)", () => {
  /** Writes the key EXACTLY as given, bypassing `saveReadyCard`, so each case
   *  describes a byte sequence on disk rather than something this module
   *  could itself have produced. */
  async function loadWithRaw(raw: string): Promise<string> {
    const { READY_CARD_KEY, loadReadyCard } = await freshModule();
    localStorage.setItem(READY_CARD_KEY, raw);
    return loadReadyCard();
  }

  // ABSENT, EMPTY, VALUED — the three every input gets. The empty string is
  // the one that has actually bitten this repo before: `?code=` present but
  // empty parses to `""`, not `null`, and survived eleven review passes.
  it.each([
    ["an empty string", ""],
    ["the wrong case", "SKIP"],
    ["trailing whitespace", "skip "],
    ["a word we never wrote", "hide"],
    ["a boolean from some other build", "true"],
    ["a number", "1"],
    ["JSON, in case someone assumes an envelope", '{"choice":"skip"}'],
  ])("falls back to SHOW for %s", async (_label, raw) => {
    expect(await loadWithRaw(raw)).toBe("show");
  });

  it("returns SKIP for the exact word, so the fallback is not swallowing everything", async () => {
    expect(await loadWithRaw("skip")).toBe("skip");
  });

  it("returns SHOW for the exact word", async () => {
    expect(await loadWithRaw("show")).toBe("show");
  });

  it("never lets a thrown getter escape — a detached document throws TypeError, not SecurityError", async () => {
    const { loadReadyCard } = await freshModule();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new TypeError("Cannot read properties of null");
    });
    expect(loadReadyCard()).toBe("show");
  });
});

describe("the write (I-6: a refused write costs the reload, not the session)", () => {
  it("stores the bare word, not a JSON envelope", async () => {
    const { READY_CARD_KEY, saveReadyCard } = await freshModule();
    expect(saveReadyCard("skip")).toBe(true);
    expect(localStorage.getItem(READY_CARD_KEY)).toBe("skip");
  });

  it("reports FALSE when the device refuses the write", async () => {
    const { saveReadyCard } = await freshModule();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(saveReadyCard("skip")).toBe(false);
  });

  it("still governs this session's next connect after a refused write", async () => {
    const { loadReadyCard, saveReadyCard } = await freshModule();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(saveReadyCard("skip")).toBe(false);
    expect(loadReadyCard()).toBe("skip");
  });
});

/**
 * THE PRECEDENCE GATE. This describe block exists because the first draft of
 * the module read `lastSet` before storage, which made every persistence
 * gate in the phase structurally incapable of failing: with the in-memory
 * value winning, a completely broken `setItem` still looked like a working
 * save. Both cases below go red under that draft and green under this one.
 */
describe("storage outranks the in-memory fallback", () => {
  it("re-reads the store rather than trusting what it last wrote", async () => {
    const { READY_CARD_KEY, loadReadyCard, saveReadyCard } =
      await freshModule();
    expect(saveReadyCard("skip")).toBe(true);
    // Something else changed the store under us. Only a module that actually
    // reads storage can see it.
    localStorage.setItem(READY_CARD_KEY, "show");
    expect(loadReadyCard()).toBe("show");
  });

  it("sees a cleared store, so a save that never landed cannot masquerade as one that did", async () => {
    const { loadReadyCard, saveReadyCard } = await freshModule();
    expect(saveReadyCard("skip")).toBe(true);
    localStorage.clear();
    expect(loadReadyCard()).toBe("show");
  });
});
