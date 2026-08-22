import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

function mockState(state: unknown) {
  vi.doMock("../api/useBaselines", () => ({ useBaselines: () => state }));
}

function mockReady(
  baselines: { k2Seconds: number | null; k6Seconds: number | null } = BASELINES,
  save = vi.fn(async () => {}),
) {
  mockState({ state: "ready", baselines, save });
  return save;
}

async function renderEditor() {
  const { default: BaselineEditor } = await import("./BaselineEditor");
  return render(<BaselineEditor />);
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../api/useBaselines");
});

describe("BaselineEditor", () => {
  it("renders both baselines as formatted mono splits", async () => {
    mockReady();
    await renderEditor();
    expect(screen.getByText("1:52.0")).toBeInTheDocument();
    expect(screen.getByText("2:02.0")).toBeInTheDocument();
  });

  it("shows no confirm block while the draft is clean", async () => {
    mockReady();
    await renderEditor();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /apply baselines/i }),
    ).not.toBeInTheDocument();
  });

  it("stages a nudge into a confirm block without saving", async () => {
    const save = mockReady();
    await renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
    expect(screen.getByText("2k 1:52.0 → 1:51.5")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  // Pre-existing gap this round's own per-file coverage check found
  // (recurring-failure #2): only "2k faster" and "6k slower" were ever
  // exercised anywhere in this file — the other two stepper directions
  // never had a test of their own.
  it("the other two stepper directions also nudge (2k slower, 6k faster)", async () => {
    mockReady();
    await renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "2k slower" }));
    expect(screen.getByText("2k 1:52.0 → 1:52.5")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "6k faster" }));
    expect(screen.getByText("6k 2:02.0 → 2:01.5")).toBeInTheDocument();
  });

  it("discard removes the confirm block and restores the displayed value", async () => {
    mockReady();
    await renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
    expect(screen.getByText("2k 1:52.0 → 1:51.5")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /discard/i }));

    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    expect(screen.getByText("1:52.0")).toBeInTheDocument();
  });

  it("applying saves the touched field exactly once, stamped manual, and settles the confirm block", async () => {
    const save = mockReady();
    await renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));

    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ k2Seconds: 111.5, k2Source: "manual" });
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  it("seeds sensible starting values and prompts the rower when baselines are unset", async () => {
    const save = mockReady({ k2Seconds: null, k6Seconds: null });
    await renderEditor();

    expect(screen.getByText(/starting point/i)).toBeInTheDocument();
    expect(screen.getByText("1:52.0")).toBeInTheDocument();
    expect(screen.getByText("2:02.0")).toBeInTheDocument();
    // Neither side is a known real value here (both null) — deriving one
    // from the other would mean deriving from a made-up seed, so the offer
    // must not appear at all (ui-notes round, item 2's "exactly one side
    // has a value" condition, false on both).
    expect(
      screen.queryByRole("button", { name: /ESTIMATE FROM/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "6k slower" }));
    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );

    // Task review round, Finding 1 (BLOCKER): Apply must send ONLY the
    // TOUCHED field — k2 was never acted on and is still server-null, so
    // sending a fabricated k2Seconds:112 here would silently manufacture a
    // 2k baseline the rower never rowed and never asked for. This is the
    // exact fresh-both-null-user case Finding 1's test list names.
    // Phase BL PR A: the touched field now also carries its truthful
    // provenance — a stepper edit is a manual entry.
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ k6Seconds: 122.5, k6Source: "manual" });
  });

  it("keeps the draft and surfaces an error when save is rejected", async () => {
    const save = vi.fn(async () => {
      throw new Error("failed to save baselines");
    });
    mockReady(BASELINES, save);
    await renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));

    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );

    expect(screen.getByText("2k 1:52.0 → 1:51.5")).toBeInTheDocument();
    expect(screen.getByText(/couldn.t save/i)).toBeInTheDocument();
  });

  it("shows a loading state before baselines resolve", async () => {
    mockState({ state: "loading" });
    await renderEditor();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows a retry option when baselines fail to load", async () => {
    const retry = vi.fn();
    mockState({ state: "error", retry });
    await renderEditor();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

// ui-notes round, item 2 — the derivation OFFER. Realistic fixture
// (recurring-failure #3): {k2Seconds: null, k6Seconds: 122} is exactly the
// real state onboarding.spec.ts's own flow produces the instant a rower
// enters ONE baseline (`setBaselines(page, { k6Seconds: 122 })`) — not a
// hand-built minimum.
describe("the derivation offer (ui-notes round, item 2)", () => {
  it("offers to estimate the 2k from a known 6k when only the 6k is set", async () => {
    mockReady({ k2Seconds: null, k6Seconds: 122 });
    await renderEditor();

    expect(
      screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /ESTIMATE FROM 2K/ }),
    ).not.toBeInTheDocument();
  });

  // Found while capturing this round's own screenshot (recurring-failure
  // #7: open the image and look at it): the "seeded" prompt used to read
  // `k2Seconds === null || k6Seconds === null`, so a rower with a REAL,
  // rowed 6k still saw "No baselines yet" sitting right next to it — a
  // false claim the offer button now makes newly visible and confusing.
  // Only the both-unset state is genuinely "no baselines yet."
  it("does not claim 'No baselines yet' when one side is a real, rowed value", async () => {
    mockReady({ k2Seconds: null, k6Seconds: 122 });
    await renderEditor();

    expect(screen.queryByText(/no baselines yet/i)).not.toBeInTheDocument();
  });

  it("offers to estimate the 6k from a known 2k when only the 2k is set", async () => {
    mockReady({ k2Seconds: 130, k6Seconds: null });
    await renderEditor();

    expect(
      screen.getByRole("button", { name: "ESTIMATE FROM 2K (+7s)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /ESTIMATE FROM 6K/ }),
    ).not.toBeInTheDocument();
  });

  it("never offers once both baselines are set", async () => {
    mockReady({ k2Seconds: 112, k6Seconds: 122 });
    await renderEditor();

    expect(
      screen.queryByRole("button", { name: /ESTIMATE FROM/i }),
    ).not.toBeInTheDocument();
  });

  it("tapping the offer fills only the empty DRAFT field, staging a confirm — nothing saves yet", async () => {
    const save = mockReady({ k2Seconds: null, k6Seconds: 122 });
    await renderEditor();

    await userEvent.click(
      screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
    );

    // 122 - 7 = 115s/500m = 1:55.0, replacing the SEED_K2 starting point
    // (112 = 1:52.0) the confirm line's "from" side still names.
    expect(screen.getByText("2k 1:52.0 → 1:55.0")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("declining is simply not tapping it: the confirm block stays absent and the seeded value stands", async () => {
    mockReady({ k2Seconds: null, k6Seconds: 122 });
    await renderEditor();

    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    // The SEED_K2 starting point (112 -> 1:52.0), never the derived 1:55.0.
    expect(screen.getByText("1:52.0")).toBeInTheDocument();
  });

  it("the filled value is an ordinary draft edit: a stepper still adjusts it afterward", async () => {
    mockReady({ k2Seconds: null, k6Seconds: 122 });
    await renderEditor();

    await userEvent.click(
      screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));

    expect(screen.getByText("2k 1:52.0 → 1:54.5")).toBeInTheDocument();
  });

  it("Apply round-trips the derived value through the real save path, stamped derived — the case the per-number provenance ruling exists for", async () => {
    const save = mockReady({ k2Seconds: null, k6Seconds: 122 });
    await renderEditor();

    await userEvent.click(
      screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );

    // Phase BL PR A: the accepted offer is a DERIVATION, not a manual
    // entry (rev 1 of the spec would have mislabeled exactly this write),
    // and the untouched, already-real 6k stays out of the body entirely
    // so its own stored source cannot be flipped by a write it wasn't in.
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ k2Seconds: 115, k2Source: "derived" });
  });

  // THE binding client case from PR A's brief: one save carrying both a
  // typed number and an accepted derivation, each with its own truthful
  // source — derived from real editor interaction (a stepper click and
  // the offer button), never prop injection.
  it("one Apply carrying a nudged 6k and an accepted 2k derivation stamps manual and derived respectively", async () => {
    const save = mockReady({ k2Seconds: null, k6Seconds: 122 });
    await renderEditor();

    await userEvent.click(screen.getByRole("button", { name: "6k slower" }));
    await userEvent.click(
      screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );

    expect(save).toHaveBeenCalledExactlyOnceWith({
      k2Seconds: 115,
      k2Source: "derived",
      k6Seconds: 122.5,
      k6Source: "manual",
    });
  });

  it("nudging AFTER accepting the offer demotes the field to manual — the saved number is the rower's, not the derivation's", async () => {
    const save = mockReady({ k2Seconds: null, k6Seconds: 122 });
    await renderEditor();

    await userEvent.click(
      screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );

    // 115 - 0.5: no longer the derived value, and the on-screen
    // "ESTIMATED" line hides itself at the same predicate — what the
    // rower sees and what gets stored agree.
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k2Seconds: 114.5,
      k2Source: "manual",
    });
  });

  // Task review round, Finding 1 (BLOCKER), tightened by Phase BL PR A:
  // Apply commits a side iff the rower TOUCHED it this session — full
  // stop. Finding 1's original fix also resent an untouched side whenever
  // the server already had a real value (a harmless value-level no-op);
  // provenance makes that resend a LIE, because a value write stamps
  // k2Source/k6Source "manual" and would flip a stored tested/derived
  // source on a field the rower never went near. Untouched now means
  // absent from the body, which is what keeps its stored source alive
  // (the server's per-field patch semantics — see
  // baselineProvenance.integration.test.ts).
  describe("Apply commits only touched fields (Finding 1, tightened by PR A provenance)", () => {
    it("touching only one already-real side sends ONLY it — resending the untouched side would flip its stored source to manual", async () => {
      // Both start real (BASELINES-shaped): touching 2k, leaving 6k alone.
      const save = mockReady({ k2Seconds: 112, k6Seconds: 122 });
      await renderEditor();

      await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
      await userEvent.click(
        screen.getByRole("button", { name: /apply baselines/i }),
      );

      expect(save).toHaveBeenCalledWith({
        k2Seconds: 111.5,
        k2Source: "manual",
      });
      expect(save).not.toHaveBeenCalledWith(
        expect.objectContaining({ k6Seconds: expect.anything() }),
      );
    });

    // The MIRRORED side (triad review, low finding): the resend ban is two
    // independent per-field checks, and the case above only pins the k6
    // arm — re-adding `|| baselines.k2Seconds !== null` to the k2 arm
    // left every test green until this one existed. Same shape, sides
    // swapped: k2 is the already-real untouched field this time.
    it("touching only 6k leaves an already-real, untouched k2 out of the body — resending it would flip its stored source to manual", async () => {
      const save = mockReady({ k2Seconds: 112, k6Seconds: 122 });
      await renderEditor();

      await userEvent.click(screen.getByRole("button", { name: "6k faster" }));
      await userEvent.click(
        screen.getByRole("button", { name: /apply baselines/i }),
      );

      expect(save).toHaveBeenCalledWith({
        k6Seconds: 121.5,
        k6Source: "manual",
      });
      expect(save).not.toHaveBeenCalledWith(
        expect.objectContaining({ k2Seconds: expect.anything() }),
      );
      expect(save).not.toHaveBeenCalledWith(
        expect.objectContaining({ k2Source: expect.anything() }),
      );
    });

    it("an untouched, still-null 2k is never fabricated: nudging only 6k, Apply omits k2Seconds entirely", async () => {
      // Both start null. Only 6k is acted on — 2k is never touched and
      // stays server-null, so it must never appear in the PUT body even
      // though the draft needs SOME number (the seed) to display it.
      const save = mockReady({ k2Seconds: null, k6Seconds: null });
      await renderEditor();

      await userEvent.click(screen.getByRole("button", { name: "6k faster" }));
      await userEvent.click(
        screen.getByRole("button", { name: /apply baselines/i }),
      );

      expect(save).toHaveBeenCalledWith({
        k6Seconds: 121.5,
        k6Source: "manual",
      });
      expect(save).not.toHaveBeenCalledWith(
        expect.objectContaining({ k2Seconds: expect.anything() }),
      );
    });

    // The symmetric case (Finding 1's Apply condition is two independent
    // per-field checks, not one shared expression) — exercises the OTHER
    // field's own "untouched and still-null" branch, which the test above
    // never reaches (there, 6k is the one touched).
    it("an untouched, still-null 6k is never fabricated: nudging only 2k, Apply omits k6Seconds entirely", async () => {
      const save = mockReady({ k2Seconds: null, k6Seconds: null });
      await renderEditor();

      await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
      await userEvent.click(
        screen.getByRole("button", { name: /apply baselines/i }),
      );

      expect(save).toHaveBeenCalledWith({
        k2Seconds: 111.5,
        k2Source: "manual",
      });
      expect(save).not.toHaveBeenCalledWith(
        expect.objectContaining({ k6Seconds: expect.anything() }),
      );
    });

    // Finding 3, dissolved by Finding 1's fix: a filled value that happens
    // to equal the seed must still be Applyable — `touched` (not a value
    // comparison) is what Apply keys on.
    it("pins Finding 3's exact case: k6=119 derives k2=112 (=SEED_K2) — Apply still commits it", async () => {
      // deriveK2FromK6(119) = 119 - 7 = 112, identical to SEED_K2.
      const save = mockReady({ k2Seconds: null, k6Seconds: 119 });
      await renderEditor();

      await userEvent.click(
        screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: /apply baselines/i }),
      );

      // Untouched 6k stays out of the body (PR A); the accepted offer is
      // a derivation even when it lands exactly on the seed value.
      expect(save).toHaveBeenCalledWith({
        k2Seconds: 112,
        k2Source: "derived",
      });
    });

    it("the confirm block previews ONLY the field(s) actually being committed — a rower never sees an untouched value listed as changing", async () => {
      mockReady({ k2Seconds: null, k6Seconds: null });
      await renderEditor();

      await userEvent.click(screen.getByRole("button", { name: "6k slower" }));

      // The 6k line names the real edit; no 2k line exists anywhere on
      // screen, even though 2k is ALSO displayed (at its seed) elsewhere.
      expect(screen.getByText("6k 2:02.0 → 2:02.5")).toBeInTheDocument();
      expect(screen.queryByText(/^2k .* → /)).not.toBeInTheDocument();
    });

    // Re-review round (PR #66), accepted edge: `touched` tracks the ACT of
    // nudging, not a net value change (deliberate — see Finding 3, which
    // needs exactly this property for a derived value that lands back on
    // the seed). Nudging away and back to the EXACT original value leaves
    // `touched` true, so the confirm card still renders (Apply/Discard
    // live) even though both ConfirmLines suppress themselves (from===to
    // for every field) — a confirm card with zero visible lines. Apply
    // still fires: an idempotent resend of the unchanged values, never an
    // error or a silently-skipped no-op.
    it("Apply is an idempotent resend when nudged back to the original value — the confirm card can render with zero ConfirmLines but live Apply/Discard (accepted edge)", async () => {
      const save = mockReady({ k2Seconds: 112, k6Seconds: 122 });
      await renderEditor();

      await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
      await userEvent.click(screen.getByRole("button", { name: "2k slower" }));

      expect(
        screen.getByRole("button", { name: /apply baselines/i }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/→/)).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: /apply baselines/i }),
      );

      // Both sides are set, so no offer exists — a nudge-away-and-back is
      // a manual act on the field, and only that field rides (PR A).
      expect(save).toHaveBeenCalledWith({ k2Seconds: 112, k2Source: "manual" });
    });
  });

  // Review finding (task review, PR #66): the offer used to key ONLY on the
  // raw `baselines` prop, ignoring the draft entirely — so a rower who had
  // already hand-nudged the seeded, still-server-null field away from
  // SEED_K2/SEED_K6 (their own implicit decline) still saw the offer, and
  // tapping it would have silently overwritten that manual adjustment.
  // Nudging the target field now counts as declining: the offer disappears
  // the moment its own field moves off the untouched seed, with no path
  // back to it short of a reload (a fresh, unmodified draft).
  describe("nudging the target field is declining (task review fix)", () => {
    it("is visible while the target (empty) field still sits at its untouched seed", async () => {
      mockReady({ k2Seconds: null, k6Seconds: 122 });
      await renderEditor();

      expect(
        screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
      ).toBeInTheDocument();
    });

    it("disappears the instant the rower nudges the target field themselves", async () => {
      mockReady({ k2Seconds: null, k6Seconds: 122 });
      await renderEditor();

      // 2k is the empty/target side here (k2Seconds is null) — nudge IT,
      // not the already-known 6k side.
      await userEvent.click(screen.getByRole("button", { name: "2k faster" }));

      expect(
        screen.queryByRole("button", { name: /ESTIMATE FROM/i }),
      ).not.toBeInTheDocument();
    });

    it("stays gone after nudging away — no click path remains that could still overwrite the manual value", async () => {
      const save = mockReady({ k2Seconds: null, k6Seconds: 122 });
      await renderEditor();

      await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
      // The nudge itself is the only edit made — 112 - 0.5 = 111.5s = 1:51.5.
      expect(screen.getByText("2k 1:52.0 → 1:51.5")).toBeInTheDocument();
      // No offer button exists anywhere to click, so there is no remaining
      // path to the overwrite the finding describes — asserted by absence
      // (docs/TESTING.md's own "invoke it and assert the consequence" rule
      // has nothing to invoke here; the consequence IS the absence).
      expect(
        screen.queryByRole("button", { name: /ESTIMATE FROM/i }),
      ).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: /apply baselines/i }),
      );
      // The rower's own manual nudge survives untouched — never silently
      // replaced by a derived estimate — and it is stamped manual: the
      // nudged value is NOT the offer's (111.5 ≠ 115), so no derived
      // label can attach to it. The untouched, already-real 6k stays out
      // of the body (PR A).
      expect(save).toHaveBeenCalledWith({
        k2Seconds: 111.5,
        k2Source: "manual",
      });
    });

    it("nudging the OTHER (already-known) side does not hide the offer — only the target field's own movement counts as declining it", async () => {
      mockReady({ k2Seconds: null, k6Seconds: 122 });
      await renderEditor();

      // 6k is the already-known side; nudging it is unrelated to the 2k
      // offer's own decline condition.
      await userEvent.click(screen.getByRole("button", { name: "6k slower" }));

      expect(
        screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
      ).toBeInTheDocument();
    });

    // The symmetric case on the other side (target = 6k this time) —
    // written separately from the 2k-target tests above rather than
    // parameterized, so a mutation isolated to ONE branch of `deriveOffer`
    // (they're two separate `if` blocks, not a shared helper) still fails
    // exactly one describe block, not both by accident.
    it("also disappears on the 6k side when the rower nudges the target field themselves", async () => {
      mockReady({ k2Seconds: 130, k6Seconds: null });
      await renderEditor();

      await userEvent.click(screen.getByRole("button", { name: "6k slower" }));

      expect(
        screen.queryByRole("button", { name: /ESTIMATE FROM/i }),
      ).not.toBeInTheDocument();
    });
  });

  // Task review round, Finding 2 (ship-risk): accepting the offer used to
  // unmount the button under the rower's own finger — a 56px collapse that
  // slides the 6k steppers up into the tap band (an iOS ghost-tap hazard).
  // The slot now reserves its own height; only its CHILD content swaps.
  describe("the offer slot reserves its height across accept (task review Finding 2, ship-risk)", () => {
    it("the slot's own container element persists (never unmounted) across accepting the offer", async () => {
      mockReady({ k2Seconds: null, k6Seconds: 122 });
      const { container } = await renderEditor();

      const slotBefore = container.querySelector(".baseline-derive-slot");
      expect(slotBefore).not.toBeNull();

      await userEvent.click(
        screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
      );

      const slotAfter = container.querySelector(".baseline-derive-slot");
      // Same DOM node — React never unmounted the container, only swapped
      // its child (button -> inert line), so the reserved box never leaves
      // the layout even for a single frame.
      expect(slotAfter).toBe(slotBefore);
      expect(
        screen.getByText("ESTIMATED — ADJUST WITH ± BELOW"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /ESTIMATE FROM/i }),
      ).not.toBeInTheDocument();
    });

    it("the inert line disappears (blank, still-reserved slot) once the rower nudges further away from the exact accepted value", async () => {
      mockReady({ k2Seconds: null, k6Seconds: 122 });
      const { container } = await renderEditor();

      await userEvent.click(
        screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
      );
      expect(
        screen.getByText("ESTIMATED — ADJUST WITH ± BELOW"),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "2k faster" }));

      // No longer exactly the derived value, so the "ESTIMATED" claim would
      // be false — hidden, but the slot itself is still in the DOM (same
      // reserved box), never re-showing the button either (declined stays
      // declined).
      expect(screen.queryByText(/ESTIMATED/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /ESTIMATE FROM/i }),
      ).not.toBeInTheDocument();
      expect(container.querySelector(".baseline-derive-slot")).not.toBeNull();
    });

    // jsdom never loads index.css as a real stylesheet (no browser layout
    // engine backs getComputedStyle here — same limitation
    // TimerTargets.test.tsx's own comment documents for the identical
    // reason), so this reads the CSS source text directly rather than a
    // computed value; the real, rendered pixel-height-stability proof lives
    // in e2e/design.spec.ts's own boundingBox() comparison against the
    // actual browser (Finding 2's own "computed min-height... is acceptable
    // here", satisfied there, not here).
    it("the slot's own CSS reserves a fixed min-height rather than leaving it to content", () => {
      // Plain string surgery on `import.meta.url`, not `new URL(...)` —
      // same jsdom quirk (resolves against `http://localhost:3000/`
      // instead of the given `file://` base) `TimerTargets.test.tsx`'s own
      // identical CSS-source-reading precedent already documents.
      const indexCssPath = import.meta.url
        .replace(/^file:\/\//, "")
        .replace(/you\/[^/]+\.test\.tsx$/, "index.css");
      const css = readFileSync(indexCssPath, "utf-8");
      const rule = css.match(/\.baseline-derive-slot\s*{[^}]*}/)?.[0] ?? "";
      expect(rule).toMatch(/min-height:\s*48px/);
    });
  });

  it("refuses the offer when the derived value would leave the editor's own split bounds", async () => {
    // 65 - 7 = 58, below MIN_SPLIT (60) — not offered at all, not clamped
    // silently to a value the "−7s" copy would then be lying about.
    mockReady({ k2Seconds: null, k6Seconds: 65 });
    await renderEditor();

    expect(
      screen.queryByRole("button", { name: /ESTIMATE FROM/i }),
    ).not.toBeInTheDocument();
  });

  it("refuses the offer on the other side too, at the MAX_SPLIT boundary", async () => {
    // 235 + 7 = 242, above MAX_SPLIT (240).
    mockReady({ k2Seconds: 235, k6Seconds: null });
    await renderEditor();

    expect(
      screen.queryByRole("button", { name: /ESTIMATE FROM/i }),
    ).not.toBeInTheDocument();
  });
});
