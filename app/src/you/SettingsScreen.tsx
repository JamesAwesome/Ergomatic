import { useState, type ReactNode } from "react";
import BackLink from "../shell/BackLink";
import OptionGroup from "../onboarding/OptionGroup";
import {
  applyJudgeColors,
  loadJudgeColors,
  saveJudgeColors,
  type JudgeColor,
  type JudgeColors,
} from "./judgeColors";
import {
  loadReadyCard,
  saveReadyCard,
  type ReadyCardChoice,
} from "./readyCard";

/**
 * `/you/settings` — the screen behind You's SETTINGS row (Phase JC, spec
 * `2026-09-08-judge-colours-design.md`, Gate 0 CLOSED 2026-09-08). Four
 * slots — faster and slower, for pace and for stroke rate — each RED, BLUE
 * or OFF. Defaults are today's colours, so a rower who never opens this
 * screen sees no change anywhere (I-1).
 *
 * COPY IS GATE 0's, NOT THIS FILE'S (ruling 2, approved as rendered): the
 * row on You reads SETTINGS, the group headings read `COLORS · PACE` and
 * `COLORS · SPM`, the slots are FASTER and SLOWER with their parentheticals,
 * and the options are RED / BLUE / OFF. American in copy, British in prose
 * (the repo's split); no em-dashes in anything a rower reads.
 *
 * FASTER/SLOWER RATHER THAN OVER/UNDER, and the parentheticals are why: a
 * higher split is SLOWER and a higher rate is FASTER, so "over" would mean
 * opposite things on the two groups. The words match `domain/judge.ts`'s own
 * `Judgement` union, which both metrics already resolve to.
 *
 * APPLY AND SAVE ARE SEPARATE STEPS, AND THAT IS THE POINT OF I-6. A tap
 * calls `applyJudgeColors` first — the four resolved custom properties on
 * the root, which every judged surface reads through plain CSS — and only
 * then tries to persist. A refused write (RF25: the caller branches on the
 * boolean rather than swallowing it) costs the rower persistence and
 * nothing else: the colours are live for this session and the screen says
 * the choice will not survive a reload. A storage failure must never also
 * make the screen look inert.
 *
 * PHASE RN ADDED THE READY SCREEN SECTION (spec
 * `2026-09-09-ready-card-preference-design.md`, Gate 0 CLOSED 2026-09-09,
 * copy candidate A). Same `OptionGroup`, same `.setting-*` styling — those
 * class names were added to the existing `.judge-*` rules' selector lists IN
 * PLACE rather than by moving or renaming anything, because RF37 is this
 * repo's most recent production bug and it was caused by relocating colour
 * rules past an equal-specificity neighbour.
 *
 * TWO WARNINGS, ONE PER CONTROL, AND THAT IS NOT TIDINESS. The colour
 * notice's own words are "These colors are on now" — a promise about a
 * control the rower may not have touched — and a single shared boolean would
 * let a successful tap on either control clear a genuine warning raised by
 * the other. The two `useState`s below are what make each warning belong to
 * the write that produced it.
 *
 * PLAIN `.screen`, like `BaselinesScreen.tsx` and unlike the two read-only
 * `.overlay-screen` doors — this screen carries interactive controls and
 * `.overlay-screen`'s nested fixed scroller is a risk none of our
 * instruments can see (that file's own comment carries the full account).
 */

/** The three options, in the order Gate 0 approved. Each label is a swatch
 *  in that option's own ink PLUS its word, so the choice is never carried by
 *  colour alone (WCAG 1.4.1). The swatch is `aria-hidden` — it is decoration,
 *  and it would otherwise leak into the accessible name that
 *  `getByRole("radio", { name: "BLUE" })` and a screen reader both use. */
const COLOR_OPTIONS: readonly { value: JudgeColor; label: ReactNode }[] = [
  {
    value: "red",
    label: (
      <>
        <span className="judge-swatch" data-color="red" aria-hidden="true" />
        RED
      </>
    ),
  },
  {
    value: "blue",
    label: (
      <>
        <span className="judge-swatch" data-color="blue" aria-hidden="true" />
        BLUE
      </>
    ),
  },
  {
    value: "off",
    label: (
      <>
        <span className="judge-swatch" data-color="off" aria-hidden="true" />
        OFF
      </>
    ),
  },
];

interface SlotRow {
  slot: keyof JudgeColors;
  name: string;
  /** The parenthetical that keeps FASTER honest on both metrics. */
  hint: string;
  ariaLabel: string;
  /** The live class the preview specimen wears — the SAME class the judged
   *  surfaces emit, so the preview cannot drift from what a row will do. */
  judgedClass: string;
  specimen: string;
}

/** Specimen numbers are a plausible 2k pace pair and a plausible rate pair,
 *  not lorem — the preview is the only place a rower sees the choice before
 *  going rowing to find out. */
const GROUPS: readonly { heading: string; rows: readonly SlotRow[] }[] = [
  {
    heading: "COLORS · PACE",
    rows: [
      {
        slot: "paceFaster",
        name: "FASTER",
        hint: "a lower split",
        ariaLabel: "Pace faster color",
        judgedClass: "judge-pace-faster",
        specimen: "1:52.3",
      },
      {
        slot: "paceSlower",
        name: "SLOWER",
        hint: "a higher split",
        ariaLabel: "Pace slower color",
        judgedClass: "judge-pace-slower",
        specimen: "1:58.0",
      },
    ],
  },
  {
    heading: "COLORS · SPM",
    rows: [
      {
        slot: "spmFaster",
        name: "FASTER",
        hint: "a higher rate",
        ariaLabel: "SPM faster color",
        judgedClass: "judge-spm-faster",
        specimen: "26",
      },
      {
        slot: "spmSlower",
        name: "SLOWER",
        hint: "a lower rate",
        ariaLabel: "SPM slower color",
        judgedClass: "judge-spm-slower",
        specimen: "22",
      },
    ],
  },
];

/** Gate 0's approved wording. No swatch and no preview specimen: the thing
 *  being switched is a whole screen, and it is not this one. */
const READY_CARD_OPTIONS: readonly {
  value: ReadyCardChoice;
  label: ReactNode;
}[] = [
  { value: "show", label: "SHOW" },
  { value: "skip", label: "SKIP" },
];

export default function SettingsScreen() {
  const [colors, setColors] = useState<JudgeColors>(loadJudgeColors);
  const [colorSaveFailed, setColorSaveFailed] = useState(false);
  const [readyCard, setReadyCard] = useState<ReadyCardChoice>(loadReadyCard);
  const [readyCardSaveFailed, setReadyCardSaveFailed] = useState(false);

  function choose(slot: keyof JudgeColors, next: JudgeColor) {
    const updated = { ...colors, [slot]: next };
    setColors(updated);
    // ORDER IS LOAD-BEARING (I-6): paint first, persist second, and branch
    // on the persist. A `false` here is not an error the rower can act on
    // beyond knowing it happened, and it never costs them the repaint.
    applyJudgeColors(updated);
    setColorSaveFailed(!saveJudgeColors(updated));
  }

  /** The ready card has no live half to apply — its consumers read the store
   *  at the next connect — so the state below IS the session's answer, and
   *  the store's in-memory fallback is what keeps it true after a refused
   *  write. The rower is told only that it will not survive a reload. */
  function chooseReadyCard(next: ReadyCardChoice) {
    setReadyCard(next);
    setReadyCardSaveFailed(!saveReadyCard(next));
  }

  return (
    <main className="screen">
      <BackLink fallback="/you" />
      <h1 className="screen-title">Settings</h1>
      {colorSaveFailed && (
        <p className="notice" role="alert">
          These colors are on now, but they won&apos;t stick. This device
          wouldn&apos;t let the app save them, so a reload brings the old ones
          back.
        </p>
      )}
      {readyCardSaveFailed && (
        <p className="notice" role="alert">
          This is set for now, but it won&apos;t stick. This device
          wouldn&apos;t let the app save it, so a reload brings the old choice
          back.
        </p>
      )}
      {GROUPS.map((group) => (
        <section className="judge-group" key={group.heading}>
          <h2 className="section-heading">{group.heading}</h2>
          {group.rows.map((row) => (
            <div className="judge-slot" key={row.slot}>
              <p className="judge-slot-name">
                <span className="judge-slot-title">{row.name}</span>{" "}
                <span className="judge-slot-hint">({row.hint})</span>
              </p>
              <OptionGroup
                options={COLOR_OPTIONS}
                value={colors[row.slot]}
                onChange={(next) => choose(row.slot, next)}
                ariaLabel={row.ariaLabel}
                className="judge-options"
                optionClassName="judge-option"
              />
            </div>
          ))}
          {/* The live preview (spec, "The screen"): the group's two
              specimens wearing the group's own judged classes, so they
              repaint through the same cascade a real judged row does.
              `aria-hidden` because a colour swatch of two numbers is
              information only to an eye — the words RED/BLUE/OFF above
              already carry the choice for everyone else. */}
          <p className="judge-preview" aria-hidden="true">
            <span className="judge-preview-label">PREVIEW</span>
            {group.rows.map((row) => (
              <span
                key={row.slot}
                className={`judge-preview-value ${row.judgedClass}`}
              >
                {row.specimen}
              </span>
            ))}
          </p>
        </section>
      ))}
      <section className="setting-group">
        <h2 className="section-heading">READY SCREEN</h2>
        <div className="setting-slot">
          <p className="setting-slot-name">
            <span className="setting-slot-title">
              WHEN THE MONITOR IS READY
            </span>{" "}
            <span className="setting-slot-hint">(before your first pull)</span>
          </p>
          <OptionGroup
            options={READY_CARD_OPTIONS}
            value={readyCard}
            onChange={chooseReadyCard}
            ariaLabel="Ready screen"
            className="setting-options"
            optionClassName="setting-option"
          />
        </div>
      </section>
    </main>
  );
}
