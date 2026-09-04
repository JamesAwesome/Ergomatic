# Handoff: Concept2 connect + send (Wave E)

**Origin:** this documents a Claude Design session (James coordinating) that
was asked to produce two surfaces from the brief below; the rest of this file
is the design session's own record of what came back. Output fed Gate 0:
James approves the RENDERED screens — real proportions, both orientations,
every colour pairing's contrast ratio computed and stated — before any
client implementation task starts. Gate 0 passed 2026-08-31; the board is
final and gate-approved (see Fidelity).

**There is no weight-class question. James, 2026-09-03: "I don't want
that set in our app. I want it to be set on Concept2's side."** This
SUPERSEDES the 2026-08-22 ruling ("asked once, from the You card's Connect
flow") and the conditional-ask amendment below. Concept2's API refuses a
result carrying no `weight_class` (measured 422, 2026-09-03), so the class
is READ FROM CONCEPT2 on each send and stored by us nowhere: the rower's
own most recent DECLARATION first — Concept2's help says *"you must
designate L or H for every piece that you enter"*, so the declaration is
the vendor's own producer — and our derivation from the profile's `weight`
+ `gender` only as a fallback. **An earlier revision of this note said
"derived", which named the wrong producer; that wording is withdrawn.**

**And the app does not TALK about it either. James, 2026-09-04: "Stop
talking about the weight class."** A second ruling, on top of the one
above: the two places the app volunteered the class are gone — 1a's helper
line "Your weight class comes from Concept2." and the SENT state's
provenance sub-line "WEIGHT CLASS H · FROM YOUR LAST CONCEPT2 ROW" /
"· FROM YOUR CONCEPT2 WEIGHT" (amendment change 7, now WITHDRAWN). **This
replaces the sentence that used to stand here saying the SENT state names
the class and its producer.** The class and its producer stay on the
route's 200 and in the send's log line, so an operator can still say which
producer answered; the rower is shown neither. The one surface that still
says the words is amendment 2i, where Concept2 has REFUSED the send for
that reason — a refusal that will not say why is worse than the words.
Every 1a detail below
describing a WEIGHT CLASS section, its segmented control, its helper line,
or a dimmed Connect is a record of a rendered board that is no longer
built — see `amendment-2026-09-03.html` for what replaces it, and the
2026-09-03 revision of
`docs/superpowers/plans/2026-09-03-concept2-pr2-client.md` for the
implementation.

## Overview

Two surfaces that link a rower's Concept2 logbook account and send finished
monitor rows to it, one row at a time, manually:

1. **You tab · Concept2 card** — owns the link (OAuth via the system
   browser) and unlink. It asks the rower nothing (2026-09-03 ruling).
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

**Copy exception, James 2026-09-03 (amendment change 11):** "check the prose
and make it a bit more mechanical." Every rendered string now says what is
true, once, and drops any second clause that reassured the rower or restated
a control already on screen. So "OPENS CONCEPT2 IN YOUR BROWSER · YOU COME
BACK HERE" became "OPENS CONCEPT2 IN YOUR BROWSER", the id line became
"RESULT 339", and the send failure became "The send didn't reach Concept2."
`amendment-2026-09-03.html` is the authority for the current strings; where
this file still quotes an older one, the amendment wins.

## Approved amendments (reflected in the board)

- **~~Weight class ask is CONDITIONAL~~ — WITHDRAWN, and its open
  question is ANSWERED (James, 2026-09-03).** The amendment read: "do NOT
  ask H/L if Concept2 already has a weight class on the account. Check
  after the OAuth exchange; ask only when blank on Concept2." Its own open
  question — whether the API can report the stored class — was measured
  and the answer is no: `GET /api/users/me` carries no `weight_class`
  field, and a result POSTed without one is refused
  `422 {"errors":{"weight_class":["The weight class field is required."]}}`.
  But the same measurement showed the profile DOES carry `weight` and
  `gender`, and a later one showed that **every result Concept2 returns
  carries `weight_class`** — which is the rower's own designation, and the
  producer Concept2 itself uses. **The ruling is therefore neither
  conditional nor unconditional: there is no ask.** The server reads the
  rower's latest declaration, derives from the profile only when there is
  none, and refuses the send when neither answers. A rower who reaches that
  refusal is told which of the two it was, with a button to their Concept2
  account and a Send again (amendment 2i, redrawn 2026-09-03).
  **That read ignores every row Ergomatic itself posted** (amendment change
  9): Concept2's list carries our own rows, its 201 echoes back the class we
  sent, and nothing on the row marks it as ours — so without the exclusion a
  derived guess would return as the rower's own declaration on the next send,
  and the SENT line that makes the guess correctable would go silent.
- **~~The SENT state names the class and its source~~ — WITHDRAWN
  2026-09-04** (James: "Stop talking about the weight class"). Amendment
  change 7 added a sub-line reading "WEIGHT CLASS H · FROM YOUR LAST
  CONCEPT2 ROW", or "· FROM YOUR CONCEPT2 WEIGHT" when we derived it. **2c
  is the result id and nothing else**, on the send that just happened and on
  every later visit alike. What the line was for — a derived class is a
  guess, and Concept2 permits per-result editing, so a visible guess is a
  fixable one — is a cost the ruling accepts; the provenance stays on the
  route's 200 and in the send's log line for an operator.
- **2i's link-out targets the ID-LESS `{origin}/profile`** (2026-09-03).
  The id-bearing path was measured to render a public read-only card with
  no weight and no form, while the id-less one 302s to login. The target is
  PROVISIONAL until one logged-in glance names the page that carries the
  weight and weight-class fields.
- **Weight class does not show on ANY card** (1a, 1c, 1d) — there is none
  to show. Linked state is LINKED ✓, the identity line, helper, unlink.
- **Not linked → nothing on the log row.** The Concept2 block renders only
  when an account is linked. No pointer, no disabled control. The You card
  is the sole discovery surface.
- **Non-qualifying rows** (manual, terminated, no work/rest columns): the
  block does not render, ever.
- **Mechanism note, added 2026-09-02 (PR1.75b), reconciliation only — no
  copy changes.** "The system browser" below (Interactions & Behavior;
  the 1a footnote "OPENS CONCEPT2 IN YOUR BROWSER"; 1b's "Approve access
  in the browser") described PR1.5's original `@capacitor/browser` +
  background-return arm, since retired. The shipped native mechanism is
  `ASWebAuthenticationSession`: an in-app system sheet that resolves via
  a promise, not a background hop the app detects on return. The rendered
  copy stays as gate-approved (Fidelity: do not rewrite) — "browser" still
  reads accurately to a rower, since Concept2's own consent page is what's
  shown — but PR2 must wire states 1a-1e against `linkFlow`'s promise
  result, not a foreground-refetch/backgrounding lifecycle. Cancel (1b)
  now means dismissing the sheet, not backgrounding the app.

## Screens / States

### Surface 1 — You: Concept2 card (board IDs 1a-1e)

House card: `#fffdf7` background, `1px solid #d8d3c4` border,
`border-radius: 2px`, 16px padding, 12px vertical gap. Card header row: mono
label `CONCEPT2` (11px, 600, letter-spacing 0.16em, `#1b1a17`) left; mono
status right (11px, letter-spacing 0.12em: muted `#6f6a5f` for NOT LINKED /
WAITING / CHECKING; `#1b1a17` 600 for LINKED ✓).

- **1a Unlinked** (in situ on You, 390×844): explainer "Sends finished monitor rows to your Concept2 logbook, one row at a time, from the log." ·
  hairline `#ded8c9` · **[WITHDRAWN 2026-09-03: the WEIGHT CLASS section,
  its 2-column segmented control, its "Concept2 requires a weight class.
  Asked once, at connect." ask, its 61.5/75 kg helper, and the dimmed-
  Connect-until-picked rule are all GONE. The ruling removed the question,
  so the control, its explanation and the state it gated no longer exist.
  Nothing stands in their place: a 2026-09-03 revision put one helper line
  there ("Your weight class comes from Concept2.", 12px `#57544c`) and that
  line is WITHDRAWN too (James, 2026-09-04). 1a is the explainer, the
  hairline, Connect and its footnote.]** · primary CONNECT TO CONCEPT2
  button (48px, `#1b1a17` fill, `#fffdf7` mono 12px 600 0.16em), **live on
  first paint** · footnote "OPENS CONCEPT2 IN YOUR BROWSER" (11px mono `#6f6a5f`, centered).
- **1b Waiting / just returned**: sunken panel (`#efeade`,
  `1px solid #d8d3c4`, 12px 14px padding) — WAITING FOR CONCEPT2: "Approve
  access in the browser. On return, this card confirms the link." + Cancel
  button (44px, outline `1px solid #1b1a17`). Just-returned variant:
  CONFIRMING THE LINK: "Checking the link with Concept2." (no Cancel).
- **1c Linked**: LINKED ✓ status; helper "Finished monitor rows can be sent from the log." (12px `#57544c`); hairline;
  **Unlink Concept2** button (52px, outline `1px solid #b5341f`, text
  `#b5341f` 16px 600). No weight class shown — as of 2026-09-03 none
  exists to show, on this card or any other, and as of 2026-09-04 no card
  mentions one either. **Gate 0 amendment,
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
  panel THE LINK DIDN'T FINISH: "The connection didn't complete. Nothing was linked." (the trailing "Your weight class pick is
  kept." is dropped 2026-09-03: there is no pick to keep) · **Try again**
  button (52px outline `#1b1a17`).

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
  "RESULT 339" (11px mono `#6f6a5f`). Store
  Concept2's result id on the row. The logbook is the rower's: a row
  deleted over there 404s and our record stands. Sent renders only when
  the row's Concept2 account matches the live link.
- **2d Duplicate** (Concept2 rejected as matching): status ALREADY THERE;
  "Concept2 already has this row: same date, time and distance."; link-out **Open your Concept2 logbook →**. No retry.
- **2e Failed** (retryable): status SEND FAILED; "The send didn't reach Concept2."; **Retry send** button (48px outline
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
  link_failed`. **No stored weight class** (2026-09-03 ruling): the app
  holds none, at any lifetime.
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
