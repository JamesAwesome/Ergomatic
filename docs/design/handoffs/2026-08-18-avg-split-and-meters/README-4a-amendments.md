# Live view amendments — 4A (avg split + total meters)

Screenshot: `4a-meters-on-bar.png` (844×390 landscape mock @2x).
Base: shipped live view (LIVE/GRID header · progress bar · two-hero panel · footer strip). Only the deltas below change.

## 1. Average split (interval)

- Location: the target baseline row under the split hero, extended to `TGT <target> · AVG <avg>`.
- Geometry: labels IBM Plex Mono 15px, letter-spacing 0.1em, `#57544c`; values 34px, letter-spacing −0.03em; 12px gap label→value, 8px extra before AVG label.
- Colour: target stays ink `#1b1a17`. Avg takes the judgement colour vs target: faster = blue `#2a6275`, slower = red `#b5341f`, within ±0.5s/500m = ink.
- Scope: current WORK interval only; resets at each work interval start. Not rendered during REST (the split column is the rest clock) or in Free pieces with no split target — then show avg in ink with no TGT pair.
- Data: cumulative avg pace for the interval from the PM5 (or derive: interval meters / interval elapsed).

## 2. Total meters (whole workout)

- Location: right end of the session progress-bar row — the bar flexes, the counter is `flex:none`, 14px gap.
- Format: IBM Plex Mono 22px, letter-spacing 0.02em, ink `#1b1a17`, thousands separator + `m` suffix, e.g. `3,842m`. Vertically centered on the 6px bar.
- Scope: whole-session cumulative meters incl. rest-phase meters (matches PM5 total). Present in every phase (WORK, REST, countdown ticks from 0m).
- Rationale: same session scope as the progress bar; costs the footer nothing, so NEXT keeps full width even with HR connected (ZONE · CAL · TOTAL LEFT).

## Footer — unchanged

- HR off: `NEXT …` + TOTAL LEFT. HR on: `NEXT …` + ZONE + CAL + TOTAL LEFT.
- NEXT truncates with ellipsis rather than pushing stat columns.

## Rejected

- Meters as a 4th footer column (turn 3): crushes NEXT preview when HR connected.
- Meters/TOTAL LEFT stacked column (4b): both drop to 19px, below the footer's glance size.
