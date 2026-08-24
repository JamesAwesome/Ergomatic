import { useState } from "react";
import { useBaselines, type BaselinesPatch } from "../api/useBaselines";
import { fmtSplit } from "../../domain/format.js";
import {
  K2_K6_OFFSET_SECONDS,
  deriveK2FromK6,
  deriveK6FromK2,
} from "../../domain/deriveBaseline.js";
import { MOST_COMMON_ESTIMATE } from "../../domain/estimateBaseline.js";
import BaselineField from "./BaselineField";
import {
  MAX_SPLIT,
  MIN_SPLIT,
  commit,
  discard,
  initDraft,
  isDirty,
  nudge,
  setDraft,
  type DraftState,
} from "./baselineDraft";

// Phase BL PR C — the constants reconciliation (baseline-onboarding spec
// rev 2, "Existing producers of the same numbers"): the seeds are no
// longer a second hand-typed answer to "what does a rower we know nothing
// about row" (the old 112/122 pair was a club rower's 2k, shipped as
// every new rower's prefill, with a 10s gap disagreeing with the derive
// offer's 7s). They are the estimate table's own most-common cell
// (2:25 / 2:32), so the table, the derive offer and the editor's seeds
// are ONE family — agreement pinned by domain/estimateBaseline.test.ts.
// Honest-empty round (2026-08-24, James's report): these are no longer
// pushed into the draft as VALUES for a side the rower has never entered —
// an unset side is `null` and the seed is what its empty field shows as a
// dim PLACEHOLDER (baselineDraft.ts's header, SplitInput's `seed` prop).
// They are also what the first stepper tap on an empty field materialises,
// exactly.
const SEED_K2 = MOST_COMMON_ESTIMATE.k2Seconds;
const SEED_K6 = MOST_COMMON_ESTIMATE.k6Seconds;

function ConfirmLine({
  label,
  from,
  to,
}: {
  label: "2k" | "6k";
  from: number | null;
  to: number | null;
}) {
  if (from === to) return null;
  // `to` is non-null past that guard: a draft side only ever goes from
  // null to a number (nothing in the editor clears a field back to unset),
  // and `discard`/`commit` move draft and committed together — so a null
  // `to` always arrives with a null `from` and returns above.
  return (
    <p className="baseline-confirm-line">
      {label} {from === null ? "Not set" : fmtSplit(from)} → {fmtSplit(to!)}
    </p>
  );
}

/** ui-notes round, item 2 — the derivation offer's SLOT eligibility. Reads
 *  only the raw, nullable `baselines` prop: "exactly one side has a value"
 *  means exactly one of these API-level fields is non-null, and the raw
 *  derivation stays inside the editor's own MIN_SPLIT/MAX_SPLIT bounds (an
 *  offer that then silently clamped to a different number than its own
 *  "−7s"/"+7s" copy promised would be a small lie, not a convenience).
 *
 *  Deliberately INDEPENDENT of `touched`/`draft` (task-review round, PR #66,
 *  Finding 2, ship-risk): this is the SLOT's own reserved-space
 *  eligibility, not "should the button show." The slot renders whenever
 *  this is non-null and holds EITHER the button (untouched) or an inert
 *  status line (touched) — never nothing-then-something, so accepting the
 *  offer can't collapse the layout out from under a still-moving finger. A
 *  prior version of this function also required the target's own `draft`
 *  to sit at its seed, folding "is it eligible" and "should the button
 *  still show" into one check — that version is what caused Finding 2:
 *  the button's own disappearance (once touched) had no reserved
 *  replacement, so the row below it slid up 56px the instant the offer was
 *  accepted. The two questions are answered separately now, at the call
 *  site (see `ReadyEditor`'s own `touched`/`draft` checks). */
function deriveOffer(baselines: {
  k2Seconds: number | null;
  k6Seconds: number | null;
}): { which: "k2" | "k6"; value: number } | null {
  if (baselines.k2Seconds === null && baselines.k6Seconds !== null) {
    const value = deriveK2FromK6(baselines.k6Seconds);
    return value >= MIN_SPLIT && value <= MAX_SPLIT
      ? { which: "k2", value }
      : null;
  }
  if (baselines.k6Seconds === null && baselines.k2Seconds !== null) {
    const value = deriveK6FromK2(baselines.k2Seconds);
    return value >= MIN_SPLIT && value <= MAX_SPLIT
      ? { which: "k6", value }
      : null;
  }
  return null;
}

/** The offer slot's own three-state content (task-review round, Finding 2):
 *  the BUTTON while untouched, an inert "ESTIMATED" status line once
 *  touched AND still exactly at the value the button would have filled
 *  (the common case: right after tapping it, before any further ±
 *  adjustment), or nothing at all once touched but no longer at that exact
 *  value (nudged away, or the rower nudged the raw seed directly without
 *  ever tapping the button) — declined stays declined; the button never
 *  reappears. The wrapping `.baseline-derive-slot` is what actually
 *  reserves the height in all three cases; this component only decides
 *  what (if anything) goes inside it. */
function DeriveSlot({
  offer,
  touched,
  draftValue,
  onFill,
}: {
  offer: { which: "k2" | "k6"; value: number };
  touched: boolean;
  draftValue: number | null;
  onFill: () => void;
}) {
  const label =
    offer.which === "k2"
      ? `ESTIMATE FROM 6K (−${K2_K6_OFFSET_SECONDS}s)`
      : `ESTIMATE FROM 2K (+${K2_K6_OFFSET_SECONDS}s)`;
  return (
    <div className="baseline-derive-slot">
      {!touched ? (
        <button
          type="button"
          className="button-l3 baseline-derive"
          onClick={onFill}
        >
          {label}
        </button>
      ) : draftValue === offer.value ? (
        <p className="baseline-derive-done">ESTIMATED · TYPE TO ADJUST</p>
      ) : null}
    </div>
  );
}

function ReadyEditor({
  baselines,
  save,
}: {
  baselines: { k2Seconds: number | null; k6Seconds: number | null };
  save: (next: BaselinesPatch) => Promise<void>;
}) {
  // "No baselines yet" is only true when NEITHER side has a real, rowed
  // value — with exactly one set (the derivation-offer state, item 2), the
  // OTHER side's number IS a real baseline, so this prompt would falsely
  // deny it (found capturing this round's own screenshot, recurring-
  // failure #7). Since the honest-empty round `initDraft` carries the raw
  // nulls straight through — a side the rower has never entered stays
  // unset all the way to the field, which renders empty.
  const seeded = baselines.k2Seconds === null && baselines.k6Seconds === null;
  const [state, setState] = useState<DraftState>(() =>
    initDraft(baselines.k2Seconds, baselines.k6Seconds),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = isDirty(state);
  const offer = deriveOffer(baselines);

  // ONE suggested number per row (review fix, 2026-08-24). An empty
  // field's placeholder and the derivation offer below it are two
  // different suggestion mechanisms that met on the same row when the
  // honest-empty round landed, and they disagreed: the placeholder read
  // the generic table seed (2:25.0) while the button offered a
  // derivation from the rower's OWN rowed split (2:23.0) — two numbers,
  // two seconds apart, for one field. The steppers this round added made
  // that worse than untidy: materialising the generic seed marked the
  // side touched at a value that is not the offer's, so `DeriveSlot`
  // rendered nothing and the estimate became unreachable in ONE TAP,
  // with Apply then writing the generic seed as `manual`.
  //
  // So whenever an offer is eligible for a side, that side's seed IS the
  // offer's value. The placeholder, the button and the first-tap
  // materialisation all name the same number; a first tap now lands
  // exactly on `offer.value`, which is the predicate `DeriveSlot` and
  // `sourceFor` already use, so the tap resolves as ACCEPTING the offer
  // (inert "ESTIMATED" line, stored `derived`) instead of destroying it.
  // With no eligible offer — both sides unset, or a derivation outside
  // the storable band — there is nothing better to suggest than the
  // estimate table's own modal cell.
  const seedFor = (which: "k2" | "k6"): number =>
    offer?.which === which ? offer.value : which === "k2" ? SEED_K2 : SEED_K6;

  const handleDiscard = () => {
    setState((s) => discard(s));
    setError(null);
  };

  const handleFillFromOffer = () => {
    if (!offer) return;
    setState((s) => setDraft(s, offer.which, offer.value));
  };

  const handleApply = async () => {
    setError(null);
    setSaving(true);
    try {
      // Task-review round, Finding 1 (BLOCKER): commit a side iff the rower
      // TOUCHED it this session — never an untouched, still-server-null
      // side's fabricated seed. Without this, Apply always sent both
      // fields (server/routes/data.ts's own per-field PUT loop would then
      // happily write the seed as if it were real), so a fresh rower's
      // very first Apply committed a fake baseline for the side they never
      // rowed, and the derivation offer's own eligibility (server-null on
      // one side) could never survive past that first save — unreachable
      // through the real UI.
      //
      // Tightened by Phase BL PR A (per-number provenance): Finding 1's
      // fix also resent an untouched side whenever the server already had
      // a real value — a harmless value-level no-op then, a lie now,
      // because the server stamps any plain value write `manual` and
      // would flip that field's stored tested/derived source. Untouched
      // means absent from the body entirely.
      //
      // Tightened AGAIN by Phase BL PR B — THE ORIGIN PREDICATE (James's
      // ruling, 2026-08-22: provenance is ORIGIN, not act — a source
      // describes where the NUMBER came from, so an unchanged value keeps
      // its stamp). PR A's cut still resent a TOUCHED field whose value
      // ended exactly where the server already had it (the away-and-back
      // nudge), stamping `manual` over a stored tested/derived source
      // with zero visible ConfirmLines. A field now rides the body iff
      // the rower touched it AND its value actually differs from the
      // SERVER's — the raw nullable `baselines` prop, never `committed`
      // (a server-null side's committed is a fabricated display seed, so
      // landing back on the seed is still a real null-to-number change
      // that must save). An Apply where nothing actually changed makes
      // no network call at all: it just settles the confirm card.
      //
      // Each riding field carries its truthful source: `derived` iff it
      // is the offer's own field still sitting at EXACTLY the offer's
      // value — the same predicate DeriveSlot uses to show its
      // "ESTIMATED" line, so what the rower sees and what gets stored
      // agree (a value that changed by definition, since the offer only
      // exists for a server-null side) — and `manual` for every other
      // real change.
      const sourceFor = (which: "k2" | "k6"): "manual" | "derived" =>
        offer?.which === which && state.draft[which] === offer.value
          ? "derived"
          : "manual";
      const changed = (which: "k2" | "k6"): boolean => {
        const server =
          which === "k2" ? baselines.k2Seconds : baselines.k6Seconds;
        return server === null || state.draft[which] !== server;
      };
      //
      // The `!`s are the draft's own stated invariant, not optimism:
      // `touched` implies a number (baselineDraft.ts's header — every
      // mutator that sets `touched` writes a value in the same call, and
      // `nudge` refuses an unset side outright rather than inventing one).
      const patch: BaselinesPatch = {};
      if (state.touched.k2 && changed("k2")) {
        patch.k2Seconds = state.draft.k2!;
        patch.k2Source = sourceFor("k2");
      }
      if (state.touched.k6 && changed("k6")) {
        patch.k6Seconds = state.draft.k6!;
        patch.k6Source = sourceFor("k6");
      }
      if (Object.keys(patch).length > 0) {
        await save(patch);
      }
      setState((s) => commit(s));
    } catch {
      setError("Couldn't save your baselines. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="baselines-card">
      {seeded && (
        <p className="baseline-prompt">
          No baselines yet. Tap a field and type, or use minus and plus to start
          from the suggestion.
        </p>
      )}
      <div className="baseline-row">
        <span className="baseline-label">2k</span>
        <BaselineField
          label="2k"
          seconds={state.draft.k2}
          seed={seedFor("k2")}
          onType={(v) => setState((s) => setDraft(s, "k2", v))}
          onNudge={(d) => setState((s) => nudge(s, "k2", d))}
          className="baseline-input"
        />
      </div>
      {offer?.which === "k2" && (
        <DeriveSlot
          offer={offer}
          touched={state.touched.k2}
          draftValue={state.draft.k2}
          onFill={handleFillFromOffer}
        />
      )}
      <div className="baseline-row">
        <span className="baseline-label">6k</span>
        <BaselineField
          label="6k"
          seconds={state.draft.k6}
          seed={seedFor("k6")}
          onType={(v) => setState((s) => setDraft(s, "k6", v))}
          onNudge={(d) => setState((s) => nudge(s, "k6", d))}
          className="baseline-input"
        />
      </div>
      {offer?.which === "k6" && (
        <DeriveSlot
          offer={offer}
          touched={state.touched.k6}
          draftValue={state.draft.k6}
          onFill={handleFillFromOffer}
        />
      )}
      {dirty && (
        <div className="baseline-confirm">
          <ConfirmLine
            label="2k"
            from={state.committed.k2}
            to={state.draft.k2}
          />
          <ConfirmLine
            label="6k"
            from={state.committed.k6}
            to={state.draft.k6}
          />
          {error && <p className="baseline-error">{error}</p>}
          <div className="baseline-actions">
            <button
              type="button"
              className="button-outline"
              onClick={handleDiscard}
              disabled={saving}
            >
              Discard
            </button>
            <button
              type="button"
              className="button-primary baseline-apply"
              onClick={handleApply}
              disabled={saving}
            >
              Apply baselines
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BaselineEditor() {
  const state = useBaselines();

  if (state.state === "loading") {
    return (
      <div className="baselines-card">
        <p className="mono-status">LOADING…</p>
      </div>
    );
  }

  if (state.state === "error") {
    return (
      <div className="baselines-card">
        <p className="mono-status">Couldn't load your baselines.</p>
        <button type="button" className="button-outline" onClick={state.retry}>
          Retry
        </button>
      </div>
    );
  }

  return <ReadyEditor baselines={state.baselines} save={state.save} />;
}
