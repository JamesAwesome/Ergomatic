# Handoff: Concept2 connect + send (Wave E)

**Origin:** this documents a Claude Design session (James coordinating) that
was asked to produce two surfaces from the brief below; the rest of this file
is the design session's own record of what came back. Output fed Gate 0:
James approves the RENDERED screens — real proportions, both orientations,
every colour pairing's contrast ratio computed and stated — before any
client implementation task starts. Gate 0 passed 2026-08-31; the board is
final and gate-approved (see Fidelity).

**The weight-class question is asked once**, from the You card's Connect
flow, and only there — never at onboarding (James's ruling, 2026-08-22;
minimal-PII).

## Overview

Two surfaces that link a rower's Concept2 logbook account and send finished
monitor rows to it, one row at a time, manually:

1. **You tab · Concept2 card** — owns the link (OAuth via the system
   browser), the conditional weight-class ask, and unlink.
2. **Log detail · Send block** — owns the per-row manual send and its
   persistent send state.

Spec: `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`
(§Surfaces). Design reference: `docs/design/` tokens and conventions; 44px
hit targets and WCAG AA are hard requirements; house style: no em-dashes in
user-facing copy (periods/colons/middle dots instead).

## About the Design Files

`Concept2 connect.dc.html` is a **design reference created in HTML** — a
rendered state board, not production code. Recreate these designs in the
target codebase's existing environment (`app/src/You.tsx` composition for
Surface 1; `app/src/log/LogRow.tsx` area for Surface 2) using its
established patterns. Open the file in a browser; every state is rendered
at real proportions with an ID badge (1a-1e, 2a-2e, 3a-3b).

## Fidelity

**High-fidelity.** Colors, type, spacing, and copy are final and
gate-approved (Gate 0, James, 2026-08-31). Recreate pixel-perfectly with the
app's existing card idiom. All user-facing copy is approved as rendered: do
not rewrite it.

## Approved amendments (reflected in the board)

- **Weight class ask is CONDITIONAL** (James): do NOT ask H/L if Concept2
  already has a weight class on the account. Check after the OAuth
  exchange; ask only when blank on Concept2. The rendered ask (1a) is kept
  for that case. **Open question for PR0:** the documented
  `GET /api/users/me` returns no weight field; if the API cannot report the
  stored class, this needs a ruling before implementation.
- **Weight class does not show on linked cards** (1c, 1d) — linked state is
  just LINKED ✓, helper line, unlink.
- **Not linked → nothing on the log row.** The Concept2 block renders only
  when an account is linked. No pointer, no disabled control. The You card
  is the sole discovery surface.
- **Non-qualifying rows** (manual, terminated, no work/rest columns): the
  block does not render, ever.

## Screens / States

### Surface 1 — You: Concept2 card (board IDs 1a-1e)

House card: `#fffdf7` background, `1px solid #d8d3c4` border,
`border-radius: 2px`, 16px padding, 12px vertical gap. Card header row: mono
label `CONCEPT2` (11px, 600, letter-spacing 0.16em, `#1b1a17`) left; mono
status right (11px, letter-spacing 0.12em: muted `#6f6a5f` for NOT LINKED /
WAITING / CHECKING; `#1b1a17` 600 for LINKED ✓).

- **1a Unlinked** (in situ on You, 390×844): explainer "Sends finished
  monitor rows to your Concept2 logbook. Manual, per row, from the log." ·
  hairline `#ded8c9` · (conditional) WEIGHT CLASS section: label 11px mono
  600; ask "Concept2 requires a weight class. Asked once, at connect."
  (14px `#1b1a17`); segmented binary control, 2 equal columns,
  `1px solid #c9c3b2`, min-height 44px, selected = `#1b1a17` fill /
  `#fffdf7` text, unselected = `#57544c` on card; helper "Lightweight: 61.5
  kg or under (women) · 75 kg or under (men). Otherwise heavyweight." (12px
  `#57544c`) · primary CONNECT TO CONCEPT2 button (48px, `#1b1a17` fill,
  `#fffdf7` mono 12px 600 0.16em) · footnote "OPENS CONCEPT2 IN YOUR
  BROWSER · YOU COME BACK HERE" (11px mono `#6f6a5f`, centered). Until a
  class is picked (when the ask is shown), Connect is dimmed (border
  `#c9c3b2`, label `#57544c`) and inert.
- **1b Waiting / just returned**: sunken panel (`#efeade`,
  `1px solid #d8d3c4`, 12px 14px padding) — WAITING FOR CONCEPT2: "Approve
  access in the browser. On return, this card confirms the link." + Cancel
  button (44px, outline `1px solid #1b1a17`). Just-returned variant:
  CONFIRMING THE LINK: "Checking the link with Concept2." (no Cancel).
- **1c Linked**: LINKED ✓ status; helper "Finished monitor rows can be sent
  from the log. Send state shows on each row." (12px `#57544c`); hairline;
  **Unlink Concept2** button (52px, outline `1px solid #b5341f`, text
  `#b5341f` 16px 600). No weight class shown. **Gate 0 amendment,
  callback pages: APPROVED 2026-09-02 and BUILT at PR1.75a — the shared
  callback template (`2026-09-02-concept2-pr175-app-bind-design.md` §7)
  now covers 401 Not signed in, 403 Wrong account, 409 Already linked
  (D1) and a Linked page naming BOTH identities (D2). This CARD's own
  identity line (the detect-identity hedge for the app surface) is
  still NOT in the frozen board and still needs its own rendered Gate 0
  pass before PR2 implements it.**
- **1d Unlink armed confirm** (two-tap): first tap swaps in explainer
  "Unlink removes this app's access. Rows already sent stay on Concept2."
  and the button becomes filled `#b5341f` / `#fffdf7`, label "Tap again to
  unlink". Auto-disarms after 4 s (footnote states this).
- **1e Link failed** (OAuth callback bounced): status NOT LINKED; sunken
  panel THE LINK DIDN'T FINISH: "The connection didn't complete. Nothing
  was linked, nothing was saved. Your weight class pick is kept." · **Try
  again** button (52px outline `#1b1a17`).

### Surface 2 — Log detail: Send block (board IDs 2a-2e)

Renders ONLY when: account linked AND row qualifies (monitor-connected,
finished, work/rest columns present). Otherwise absent entirely. Placement:
end of the log-detail scroll, after the "Logged to <plan>" line (see 2a in
situ — it sits below the intervals table, MACHINE CONFIRMED block, and
PACE/RATE/HR chart; it duplicates nothing above: send is not Edit, and
"View on Concept2 →" is the surface's only link-out). Card: same house
card,
14px 16px padding, 10px gap.

- **2a Idle**: status NOT SENT (muted); **Send to Concept2** button (48px,
  outline `1px solid #1b1a17`, 15px 600); helper "Sends this row's work
  time and meters to your Concept2 logbook." (12px `#57544c`).
- **2b Sending**: status SENDING; button inert, border `#c9c3b2`, label
  "Sending to Concept2 …" `#57544c`.
- **2c Sent** (persists on the row): status SENT (`#1b1a17` 600); line
  "Accepted by Concept2 · Aug 27, 11:31" (13px `#3f3c35`); link-out
  **View on Concept2 →** (14px 600 `#b5341f`, 44px hit row); footnote
  "RESULT 339 · OPENS YOUR CONCEPT2 LOGBOOK" (11px mono `#6f6a5f`). Store
  Concept2's result id on the row. The logbook is the rower's: a row
  deleted over there 404s and our record stands. Sent renders only when
  the row's Concept2 account matches the live link.
- **2d Duplicate** (Concept2 rejected as matching): status ALREADY THERE;
  "Concept2 already has this row: same date, time and distance. Nothing
  changed."; link-out **Open your Concept2 logbook →**. No retry.
- **2e Failed** (retryable): status SEND FAILED; "The send didn't reach
  Concept2. This row is unchanged."; **Retry send** button (48px outline
  `#1b1a17`).

### Landscape (3a-3b)

844×390 renders of both surfaces. Log detail: same block, same width
behavior. You card: two-column grid inside the card (copy + helper left;
segmented control, Connect, footnote right).

## Interactions & Behavior

- Connect leaves the app for the SYSTEM browser (Concept2's own consent
  page); the rower returns to the app. Card states: unlinked → waiting
  (Cancel available) → checking → linked | failed.
- Unlink is local: destroy our copy of the grant; rows already sent stay
  on Concept2. Two-tap confirm with 4 s auto-disarm (1d).
- Send: idle → sending → sent (persists, with result id + link-out) |
  duplicate (terminal, link-out) | failed (retry returns to idle
  behavior).
- No auto-upload exists anywhere. Manual, per row.
- All tappables ≥ 44px. Portrait and landscape both; iOS is the primary
  surface.
- House copy style: no em-dashes in user-facing copy (periods/colons/
  middle dots).

## State Management

- Link state (global): `unlinked | waiting | checking | linked |
  link_failed`; stored weight class (H/L) when the ask was shown; kept
  across a failed attempt.
- Per-row send state: `not_sent | sending | sent(resultId, acceptedAt) |
  duplicate | failed`. `sent` persists with the row and includes
  Concept2's result id; render sent only if the row's account matches the
  currently linked account.

## Design Tokens (as used here)

Colors: ink `#1b1a17` · body `#3f3c35` · helper/inactive `#57544c` · muted
mono `#6f6a5f` · card `#fffdf7` · sunken panel `#efeade` · page `#f4f1e8` ·
hairline `#ded8c9` · border `#d8d3c4` · control border `#c9c3b2` · frame
`#b8b2a3` · accent (destructive/link-out only) `#b5341f`.
Type: Newsreader (display), Archivo (UI text), IBM Plex Mono
(labels/data). Mono labels: 11px/600/0.16em section, 11px/0.12em status,
10-11px footnotes.
Radius: 2px cards, 0 controls. No shadows.

### Contrast (computed, WCAG AA ≥ 4.5)

`#1b1a17`/`#fffdf7` 17.11 · `#3f3c35`/`#fffdf7` 10.81 · `#57544c`/`#fffdf7`
7.43 · `#6f6a5f`/`#fffdf7` 5.29 · `#fffdf7`/`#1b1a17` 17.11 ·
`#fffdf7`/`#b5341f` 5.94 · `#b5341f`/`#fffdf7` 5.94 · `#1b1a17`/`#efeade`
14.50 · `#57544c`/`#efeade` 6.30 · `#1b1a17`/`#f4f1e8` 15.41 ·
`#57544c`/`#f4f1e8` 6.69 · `#6f6a5f`/`#f4f1e8` 4.76. All pass.

## RF23 note (carried from the brief)

The brief that produced this board asked for an explicit enumeration of
what already sits on the log-row surface (hero numbers, MACHINE CONFIRMED
badge, recording/download actions) so the new Send affordance would not
crowd or duplicate an existing offer. The resulting placement (end of the
scroll, after "Logged to <plan>") and copy ("send is not Edit") are that
enumeration's outcome.

## Assets

None. No images or icons beyond text glyphs (✓, →, ·).

## Files

- `Concept2 connect.dc.html` — the gate-approved state board (open in a
  browser).
- `support.js` — runtime required by the .dc.html file (same folder).
