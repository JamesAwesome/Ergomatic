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

/** Types digits into a split field the way a rower does — tap, keypad,
 *  digits right to left (Option T). Never prop injection: the provenance
 *  pins below are all re-derived through this real typed path. */
async function typeSplit(name: "2k split" | "6k split", digits: string) {
  await userEvent.type(screen.getByRole("textbox", { name }), digits);
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../api/useBaselines");
});

describe("BaselineEditor", () => {
  it("renders both baselines as typed fields resting on their formatted mono splits", async () => {
    mockReady();
    await renderEditor();
    expect(screen.getByRole("textbox", { name: "2k split" })).toHaveValue(
      "1:52.0",
    );
    expect(screen.getByRole("textbox", { name: "6k split" })).toHaveValue(
      "2:02.0",
    );
  });

  it("shows no confirm block while the draft is clean", async () => {
    mockReady();
    await renderEditor();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /apply baselines/i }),
    ).not.toBeInTheDocument();
  });

  it("stages a typed entry into a confirm block without saving", async () => {
    const save = mockReady();
    await renderEditor();
    await typeSplit("2k split", "151");
    expect(screen.getByText("2k 1:52.0 → 1:51.0")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  // Both fields are independent real inputs (the old file pinned all four
  // stepper directions for the same reason — each side's own path).
  it("the 6k field types too, staging its own confirm line beside the 2k's", async () => {
    mockReady();
    await renderEditor();
    await typeSplit("2k split", "153");
    expect(screen.getByText("2k 1:52.0 → 1:53.0")).toBeInTheDocument();
    await typeSplit("6k split", "201");
    expect(screen.getByText("6k 2:02.0 → 2:01.0")).toBeInTheDocument();
  });

  it("discard removes the confirm block and restores the displayed value", async () => {
    mockReady();
    await renderEditor();
    await typeSplit("2k split", "151");
    expect(screen.getByText("2k 1:52.0 → 1:51.0")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /discard/i }));

    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "2k split" })).toHaveValue(
      "1:52.0",
    );
  });

  it("applying saves the typed field exactly once, stamped manual, and settles the confirm block", async () => {
    const save = mockReady();
    await renderEditor();
    await typeSplit("2k split", "151");

    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ k2Seconds: 111, k2Source: "manual" });
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  // The honest-empty round (2026-08-24, James's report): the seeds used to
  // render as the fields' VALUES, in the same accent ink a saved baseline
  // gets, so a number the app invented was indistinguishable from one the
  // rower had rowed. They are PLACEHOLDERS now — the field is empty.
  it("leaves an unset baseline EMPTY, showing the seed only as a placeholder — never as a value the rower never gave", async () => {
    const save = mockReady({ k2Seconds: null, k6Seconds: null });
    await renderEditor();

    expect(screen.getByText(/No baselines yet/i)).toBeInTheDocument();
    // The seeds are the estimate table's most-common cell (2:25 / 2:32),
    // not the old club-rower 112/122 pair — the PR C constants
    // reconciliation; domain/estimateBaseline.test.ts pins the derivation.
    const k2 = screen.getByRole("textbox", { name: "2k split" });
    const k6 = screen.getByRole("textbox", { name: "6k split" });
    expect(k2).toHaveValue("");
    expect(k2).toHaveAttribute("placeholder", "2:25.0");
    expect(k6).toHaveValue("");
    expect(k6).toHaveAttribute("placeholder", "2:32.0");
    // Neither side is a known real value here (both null) — deriving one
    // from the other would mean deriving from a made-up seed, so the offer
    // must not appear at all (ui-notes round, item 2's "exactly one side
    // has a value" condition, false on both).
    expect(
      screen.queryByRole("button", { name: /ESTIMATE FROM/i }),
    ).not.toBeInTheDocument();

    await typeSplit("6k split", "233");
    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );

    // Task review round, Finding 1 (BLOCKER): Apply must send ONLY the
    // TOUCHED field — k2 was never acted on and is still server-null, so
    // sending a fabricated k2Seconds:145 here would silently manufacture a
    // 2k baseline the rower never rowed and never asked for. This is the
    // exact fresh-both-null-user case Finding 1's test list names.
    // Phase BL PR A: the touched field now also carries its truthful
    // provenance — a typed edit is a manual entry ("233" -> 2:33 = 153s).
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ k6Seconds: 153, k6Source: "manual" });
  });

  // The one-control round: the You editor had NO steppers — a rower who
  // learned minus/plus on door 1 found nothing here. Both sides, because
  // each field wires its own handler (the 6k arm went uncovered until this
  // existed, and a mutation isolated to it would have survived).
  it("nudges an already-saved 2k by half a second and Apply writes the nudged number", async () => {
    const save = mockReady();
    await renderEditor();

    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));

    expect(screen.getByRole("textbox", { name: "2k split" })).toHaveValue(
      "1:51.5",
    );
    expect(screen.getByText("2k 1:52.0 → 1:51.5")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k2Seconds: 111.5,
      k2Source: "manual",
    });
  });

  it("nudges the 6k side too, its own handler and its own confirm line", async () => {
    const save = mockReady();
    await renderEditor();

    await userEvent.click(screen.getByRole("button", { name: "6k slower" }));

    expect(screen.getByText("6k 2:02.0 → 2:02.5")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k6Seconds: 122.5,
      k6Source: "manual",
    });
  });

  it("keeps the draft and surfaces an error when save is rejected", async () => {
    const save = vi.fn(async () => {
      throw new Error("failed to save baselines");
    });
    mockReady(BASELINES, save);
    await renderEditor();
    await typeSplit("2k split", "151");

    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );

    expect(screen.getByText("2k 1:52.0 → 1:51.0")).toBeInTheDocument();
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
    // (145 = 2:25.0) the confirm line's "from" side still names.
    expect(screen.getByText("2k Not set → 1:55.0")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("declining is simply not tapping it: the confirm block stays absent and the 2k side stays empty", async () => {
    mockReady({ k2Seconds: null, k6Seconds: 122 });
    await renderEditor();

    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    // Nothing was accepted, so nothing is claimed: the field is empty,
    // with the OFFER's own number (1:55.0) as the suggestion it shows —
    // see "one suggestion per row" below for why it is not SEED_K2.
    const k2 = screen.getByRole("textbox", { name: "2k split" });
    expect(k2).toHaveValue("");
    expect(k2).toHaveAttribute("placeholder", "1:55.0");
  });

  // REVIEW FIX 1 (2026-08-24) — a regression this round introduced, and
  // the reason it needs its own describe: the honest-empty field and the
  // derivation offer are two suggestion mechanisms that landed on the same
  // row without ever being reconciled. `you-derive-offer.png` had a
  // placeholder reading 2:25.0 (SEED_K2) directly above a button offering
  // 2:23.0 — two different numbers, two seconds apart, for the same empty
  // field. Worse, the steppers this round ADDED made the offer destroyable
  // in one tap: materialising the generic seed marked the side touched at
  // a value that is not the offer's, so `DeriveSlot` rendered nothing and
  // the estimate — derived from a split the rower actually rowed — became
  // unreachable short of Discard, with Apply writing the generic seed as
  // `manual`. Impossible before this round (the editor had no steppers),
  // and no test reached the field any way but the offer button or typing.
  //
  // The fix is that an offer-eligible side has ONE suggested number: the
  // field's own seed becomes the offer's value, so the placeholder, the
  // button and the first-tap materialisation all name it.
  describe("one suggestion per row: the offer IS the empty field's seed (review fix 1)", () => {
    it("shows the DERIVED value as the placeholder, not the generic seed the button contradicts", async () => {
      mockReady({ k2Seconds: null, k6Seconds: 122 });
      await renderEditor();

      // deriveK2FromK6(122) = 115 = 1:55.0. The button says −7s from the
      // rower's own 6k; the field must not whisper a different number.
      expect(
        screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "2k split" })).toHaveAttribute(
        "placeholder",
        "1:55.0",
      );
    });

    it("the mirror side agrees too — the seed follows whichever side the offer is for", async () => {
      mockReady({ k2Seconds: 130, k6Seconds: null });
      await renderEditor();

      // deriveK6FromK2(130) = 137 = 2:17.0.
      expect(
        screen.getByRole("button", { name: "ESTIMATE FROM 2K (+7s)" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "6k split" })).toHaveAttribute(
        "placeholder",
        "2:17.0",
      );
    });

    it("a first stepper tap materialises the DERIVED value and the offer survives it — the tap reads as accepting, not as destroying", async () => {
      const save = mockReady({ k2Seconds: null, k6Seconds: 122 });
      await renderEditor();

      await userEvent.click(screen.getByRole("button", { name: "2k faster" }));

      expect(screen.getByRole("textbox", { name: "2k split" })).toHaveValue(
        "1:55.0",
      );
      // The slot resolves to its already-applied state instead of
      // vanishing: before the fix this tap left the slot empty and the
      // estimate unreachable.
      expect(
        screen.getByText("ESTIMATED · TYPE TO ADJUST"),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: /apply baselines/i }),
      );
      // And the stored source tells the truth about where the number came
      // from: it is the derivation's, not a generic seed the rower would
      // have been given by accident.
      expect(save).toHaveBeenCalledExactlyOnceWith({
        k2Seconds: 115,
        k2Source: "derived",
      });
    });

    it("with NO offer eligible, the field falls back to the estimate table's own seed", async () => {
      // Both null: deriving one side from the other would mean deriving
      // from a made-up number, so there is no offer and no better
      // suggestion than the table's modal cell.
      mockReady({ k2Seconds: null, k6Seconds: null });
      await renderEditor();

      expect(
        screen.queryByRole("button", { name: /ESTIMATE FROM/i }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "2k split" })).toHaveAttribute(
        "placeholder",
        "2:25.0",
      );
      expect(screen.getByRole("textbox", { name: "6k split" })).toHaveAttribute(
        "placeholder",
        "2:32.0",
      );
    });

    it("an out-of-band derivation is no offer at all, so that field keeps the table's seed", async () => {
      // 65 - 7 = 58, below MIN_SPLIT — `deriveOffer` refuses it, and the
      // seed must not quietly follow a number nothing is offering.
      mockReady({ k2Seconds: null, k6Seconds: 65 });
      await renderEditor();

      expect(
        screen.queryByRole("button", { name: /ESTIMATE FROM/i }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "2k split" })).toHaveAttribute(
        "placeholder",
        "2:25.0",
      );
    });
  });

  // THE HALF-SET ACCOUNT, the second half of James's report: the only
  // "unset" marker used to be an 11px prose line shown when BOTH sides
  // were null, so a rower with one real baseline got no marker at all on
  // the fabricated side — it simply read as a second saved number.
  it("reads correctly half-set: the rowed 6k is a filled value, the never-rowed 2k is empty", async () => {
    mockReady({ k2Seconds: null, k6Seconds: 122 });
    await renderEditor();

    expect(screen.getByRole("textbox", { name: "6k split" })).toHaveValue(
      "2:02.0",
    );
    expect(
      screen.getByRole("textbox", { name: "6k split" }),
    ).not.toHaveAttribute("placeholder");
    expect(screen.getByRole("textbox", { name: "2k split" })).toHaveValue("");
  });

  // The unified control, on the surface that had no steppers at all.
  // Both sides null on purpose (review fix 1): with no derivation offer
  // eligible, the table's own seed IS this field's one suggestion, and a
  // first tap is the rower adopting it — theirs now, so `manual`. The
  // offer-eligible case is a different number and a different source; it
  // lives in "one suggestion per row" below.
  it("the steppers work here too: the first tap on the empty 2k materialises its seed exactly, and Apply saves that number", async () => {
    const save = mockReady({ k2Seconds: null, k6Seconds: null });
    await renderEditor();

    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));

    // The seed itself (145 = 2:25.0), NOT 144.5: a rower reaching for −
    // on an empty field is starting from the suggestion, not stepping past
    // it.
    expect(screen.getByRole("textbox", { name: "2k split" })).toHaveValue(
      "2:25.0",
    );
    expect(screen.getByText("2k Not set → 2:25.0")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k2Seconds: 145,
      k2Source: "manual",
    });
  });

  // REVIEW FIX 2 (2026-08-24): the live region is component state, and
  // Discard does not remount the field — so a stale announcement sat
  // beside an emptied field, and worse, the NEXT identical announcement
  // was a no-op (same string, no DOM mutation, so a polite region never
  // fires). A screen-reader user got silence on a real change. The
  // announcement is now tied to the value it describes: it clears the
  // moment the value moves for any other reason, which both removes the
  // stale text and guarantees the next one is a real DOM change.
  it("a Discard clears the spoken announcement, and materialising again speaks the same value rather than going silent", async () => {
    mockReady({ k2Seconds: null, k6Seconds: null });
    await renderEditor();
    const live = () =>
      screen
        .getByRole("group", { name: "2k baseline split" })
        .querySelector("[aria-live]");

    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));
    expect(live()).toHaveTextContent("2k 2:25.0");

    await userEvent.click(screen.getByRole("button", { name: /discard/i }));

    // The field is empty again, so the announcement describing 2:25.0 is
    // a claim about a value that no longer exists.
    expect(screen.getByRole("textbox", { name: "2k split" })).toHaveValue("");
    expect(live()).toHaveTextContent("");

    await userEvent.click(screen.getByRole("button", { name: "2k faster" }));

    // Same string as the first time. It can only be ANNOUNCED because the
    // region was emptied in between — that empty step is the whole fix.
    expect(live()).toHaveTextContent("2k 2:25.0");
  });

  // RECURRING FAILURE 4, and the wire discipline the brief calls out: the
  // seed must stay unsendable. Touch NOTHING, Apply is not even reachable
  // — and the derive offer, whose own eligibility depends on 2k staying
  // server-null, is still standing.
  //
  // Review note (2026-08-24): named for what it actually proves. It
  // asserts `isDirty` is false, NOT that `handleApply`'s touched-gate
  // works — deleting `state.touched.k2 &&` leaves this green. That gate
  // is pinned by the `toHaveBeenCalledExactlyOnceWith` assertions in the
  // "Apply commits only touched fields" block below.
  it("with nothing touched there is no Apply button at all, so an untouched seed has no path to the wire", async () => {
    const save = mockReady({ k2Seconds: null, k6Seconds: 122 });
    await renderEditor();

    expect(
      screen.queryByRole("button", { name: /apply baselines/i }),
    ).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("the filled value is an ordinary draft edit: typing still adjusts it afterward", async () => {
    mockReady({ k2Seconds: null, k6Seconds: 122 });
    await renderEditor();

    await userEvent.click(
      screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
    );
    await typeSplit("2k split", "154");

    expect(screen.getByText("2k Not set → 1:54.0")).toBeInTheDocument();
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
  // source — derived from real editor interaction (typed digits and the
  // offer button), never prop injection.
  it("one Apply carrying a typed 6k and an accepted 2k derivation stamps manual and derived respectively", async () => {
    const save = mockReady({ k2Seconds: null, k6Seconds: 122 });
    await renderEditor();

    await typeSplit("6k split", "204");
    await userEvent.click(
      screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );

    // The offer derives from the SERVER's 122 (-7 = 115), not the typed
    // draft; the typed 6k ("204" -> 124s) is the rower's own manual entry.
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k2Seconds: 115,
      k2Source: "derived",
      k6Seconds: 124,
      k6Source: "manual",
    });
  });

  it("typing AFTER accepting the offer demotes the field to manual — the saved number is the rower's, not the derivation's", async () => {
    const save = mockReady({ k2Seconds: null, k6Seconds: 122 });
    await renderEditor();

    await userEvent.click(
      screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
    );
    await typeSplit("2k split", "154");
    await userEvent.click(
      screen.getByRole("button", { name: /apply baselines/i }),
    );

    // "154" -> 114s: no longer the derived 115, and the on-screen
    // "ESTIMATED" line hides itself at the same predicate — what the
    // rower sees and what gets stored agree.
    expect(save).toHaveBeenCalledExactlyOnceWith({
      k2Seconds: 114,
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
      // Both start real (BASELINES-shaped): typing in 2k, leaving 6k alone.
      const save = mockReady({ k2Seconds: 112, k6Seconds: 122 });
      await renderEditor();

      await typeSplit("2k split", "151");
      await userEvent.click(
        screen.getByRole("button", { name: /apply baselines/i }),
      );

      expect(save).toHaveBeenCalledWith({
        k2Seconds: 111,
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

      await typeSplit("6k split", "201");
      await userEvent.click(
        screen.getByRole("button", { name: /apply baselines/i }),
      );

      expect(save).toHaveBeenCalledWith({
        k6Seconds: 121,
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

      await typeSplit("6k split", "231");
      await userEvent.click(
        screen.getByRole("button", { name: /apply baselines/i }),
      );

      expect(save).toHaveBeenCalledWith({
        k6Seconds: 151,
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

      await typeSplit("2k split", "224");
      await userEvent.click(
        screen.getByRole("button", { name: /apply baselines/i }),
      );

      expect(save).toHaveBeenCalledWith({
        k2Seconds: 144,
        k2Source: "manual",
      });
      expect(save).not.toHaveBeenCalledWith(
        expect.objectContaining({ k6Seconds: expect.anything() }),
      );
    });

    // Finding 3, dissolved by Finding 1's fix: a filled value that happens
    // to equal the seed must still be Applyable — `touched` (not a value
    // comparison) is what Apply keys on.
    it("pins Finding 3's exact case: k6=152 derives k2=145 (=SEED_K2) — Apply still commits it", async () => {
      // deriveK2FromK6(152) = 152 - 7 = 145, identical to SEED_K2 (the
      // estimate table's most-common cell).
      const save = mockReady({ k2Seconds: null, k6Seconds: 152 });
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
        k2Seconds: 145,
        k2Source: "derived",
      });
    });

    it("the confirm block previews ONLY the field(s) actually being committed — a rower never sees an untouched value listed as changing", async () => {
      mockReady({ k2Seconds: null, k6Seconds: null });
      await renderEditor();

      await typeSplit("6k split", "233");

      // The 6k line names the real edit; no 2k line exists anywhere on
      // screen, even though 2k is ALSO displayed (at its seed) elsewhere.
      expect(screen.getByText("6k Not set → 2:33.0")).toBeInTheDocument();
      expect(screen.queryByText(/^2k .* → /)).not.toBeInTheDocument();
    });

    // Phase BL PR B — THE ORIGIN PREDICATE (James's ruling, 2026-08-22:
    // provenance is ORIGIN, not act — a source describes where the NUMBER
    // came from, so an unchanged value keeps its stamp). PR A shipped the
    // conservative interim: a touched field always rode with `manual`, so
    // an away-and-back nudge, Applied, silently demoted a stored
    // tested/derived source with zero visible ConfirmLines. Now a touched
    // field ships ONLY when its value actually differs from the server's
    // (`draft !== server value`, or the server side is null); an
    // unchanged field is omitted from the body entirely — PR A's own
    // untouched rule, extended to the touched-but-unmoved case. The
    // confirm card still renders for the act (Apply/Discard live, zero
    // ConfirmLines), and Apply with nothing changed makes NO network call
    // at all: it just settles the card.
    it("retyping the server's own value, Applied, sends NOTHING — an unchanged number keeps its stored source (ORIGIN ruling)", async () => {
      const save = mockReady({ k2Seconds: 112, k6Seconds: 122 });
      await renderEditor();

      // The rower types the number the server already holds ("152" ->
      // 112, exactly k2Seconds) — the typed path's own away-and-back.
      await typeSplit("2k split", "152");

      expect(
        screen.getByRole("button", { name: /apply baselines/i }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/→/)).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: /apply baselines/i }),
      );

      // No wire call: the value never moved, so its provenance must not
      // either — and the confirm card settles as if applied.
      expect(save).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: /apply baselines/i }),
      ).not.toBeInTheDocument();
    });

    it("a retyped-identical k2 beside a genuinely-moved k6 sends ONLY the k6 — value identity is per field", async () => {
      const save = mockReady({ k2Seconds: 112, k6Seconds: 122 });
      await renderEditor();

      await typeSplit("2k split", "152");
      await typeSplit("6k split", "203");

      await userEvent.click(
        screen.getByRole("button", { name: /apply baselines/i }),
      );

      expect(save).toHaveBeenCalledWith({
        k6Seconds: 123,
        k6Source: "manual",
      });
    });

    // The predicate compares against the SERVER value, never the local
    // seed: on a server-null side the displayed number is a fabricated
    // seed (the "never a bare dash" rule), so returning to it via
    // away-and-back is still a REAL change from null — omitting it here
    // would make a rower's deliberate first entry silently unsavable at
    // exactly the seed value (Finding 3's ghost, back in a new costume).
    it("on a server-null side, typing exactly the SEED value still saves it — null to a number IS a change", async () => {
      const save = mockReady({ k2Seconds: null, k6Seconds: null });
      await renderEditor();

      // "225" -> 145, the displayed seed's own value: the predicate
      // compares against the SERVER (null), never the local seed, so this
      // deliberate first entry must save (Finding 3's ghost otherwise).
      await typeSplit("2k split", "225");

      await userEvent.click(
        screen.getByRole("button", { name: /apply baselines/i }),
      );

      expect(save).toHaveBeenCalledWith({ k2Seconds: 145, k2Source: "manual" });
    });
  });

  // Review finding (task review, PR #66): the offer used to key ONLY on the
  // raw `baselines` prop, ignoring the draft entirely — so a rower who had
  // already edited the seeded, still-server-null field away from
  // SEED_K2/SEED_K6 (their own implicit decline) still saw the offer, and
  // tapping it would have silently overwritten that manual adjustment.
  // Typing in the target field now counts as declining: the offer
  // disappears the moment its own field is touched, with no path back to
  // it short of a reload (a fresh, unmodified draft).
  describe("typing in the target field is declining (task review fix)", () => {
    it("is visible while the target (empty) field still sits at its untouched seed", async () => {
      mockReady({ k2Seconds: null, k6Seconds: 122 });
      await renderEditor();

      expect(
        screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
      ).toBeInTheDocument();
    });

    it("disappears the instant the rower types in the target field themselves", async () => {
      mockReady({ k2Seconds: null, k6Seconds: 122 });
      await renderEditor();

      // 2k is the empty/target side here (k2Seconds is null) — type in
      // IT, not the already-known 6k side. A single digit is already an
      // act (touched commits per keystroke).
      await typeSplit("2k split", "2");

      expect(
        screen.queryByRole("button", { name: /ESTIMATE FROM/i }),
      ).not.toBeInTheDocument();
    });

    it("stays gone after typing — no click path remains that could still overwrite the manual value", async () => {
      const save = mockReady({ k2Seconds: null, k6Seconds: 122 });
      await renderEditor();

      await typeSplit("2k split", "224");
      // The typed entry is the only edit made — "224" -> 2:24 = 144s.
      expect(screen.getByText("2k Not set → 2:24.0")).toBeInTheDocument();
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
      // The rower's own typed entry survives untouched — never silently
      // replaced by a derived estimate — and it is stamped manual: the
      // typed value is NOT the offer's (144 ≠ 115), so no derived label
      // can attach to it. The untouched, already-real 6k stays out of
      // the body (PR A).
      expect(save).toHaveBeenCalledWith({
        k2Seconds: 144,
        k2Source: "manual",
      });
    });

    it("typing in the OTHER (already-known) side does not hide the offer — only the target field's own touch counts as declining it", async () => {
      mockReady({ k2Seconds: null, k6Seconds: 122 });
      await renderEditor();

      // 6k is the already-known side; typing there is unrelated to the
      // 2k offer's own decline condition.
      await typeSplit("6k split", "203");

      expect(
        screen.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
      ).toBeInTheDocument();
    });

    // The symmetric case on the other side (target = 6k this time) —
    // written separately from the 2k-target tests above rather than
    // parameterized, so a mutation isolated to ONE branch of `deriveOffer`
    // (they're two separate `if` blocks, not a shared helper) still fails
    // exactly one describe block, not both by accident.
    it("also disappears on the 6k side when the rower types in the target field themselves", async () => {
      mockReady({ k2Seconds: 130, k6Seconds: null });
      await renderEditor();

      await typeSplit("6k split", "2");

      expect(
        screen.queryByRole("button", { name: /ESTIMATE FROM/i }),
      ).not.toBeInTheDocument();
    });
  });

  // Task review round, Finding 2 (ship-risk): accepting the offer used to
  // unmount the button under the rower's own finger — a 56px collapse that
  // slid the row below up into the tap band (an iOS ghost-tap hazard,
  // found in the stepper era and just as real for the typed fields).
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
        screen.getByText("ESTIMATED · TYPE TO ADJUST"),
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
        screen.getByText("ESTIMATED · TYPE TO ADJUST"),
      ).toBeInTheDocument();

      await typeSplit("2k split", "154");

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
