# Design handoff — Concept2 connect + send (Wave E)

**For:** a Claude Design session (James coordinates). **Output feeds Gate 0:**
James approves the RENDERED screens — real proportions, both orientations,
every colour pairing's contrast ratio computed and stated — before any client
implementation task starts.

**Spec:** `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`
(§Surfaces). **Design reference:** `docs/design/` tokens and conventions;
44px hit targets and WCAG AA are hard requirements; house style: no
em-dashes in user-facing copy (periods/colons/middle dots instead).

## Surface 1 — You: the Concept2 card

A new card on the You screen (`app/src/You.tsx` composition; see the
baseline card for the house card idiom).

States to design:

1. **Unlinked.** What Concept2 is, why link (send your rows to your
   Concept2 logbook), a Connect action. Before the OAuth redirect the app
   must ask ONE question, required by Concept2 for rowers: weight class,
   H (heavyweight) or L (lightweight). Binary choice, asked here and only
   here — never at onboarding (James's ruling, 2026-08-22; minimal-PII).
   Design the ask as part of the connect flow, not a lingering form field.
   Flow note: Connect leaves the app for the SYSTEM browser (Concept2's
   own consent page) and the rower returns to the app afterwards — the
   card should set that expectation, and a "waiting for Concept2" /
   just-returned state exists while the app confirms the link.
2. **Linked.** Show linked state + the stored weight class; an Unlink
   action with a confirm step (unlink is local: our copy of the grant is
   destroyed; rows already sent stay on Concept2).
3. **Link failed** (the OAuth callback bounced): a retryable error state.

## Surface 2 — the log row: Send to Concept2

On a stored log row (History/log detail context, `app/src/log/LogRow.tsx`
area) — ONLY on rows that qualify: monitor-connected, finished, with the
work/rest columns present. Manual send; no auto-upload exists.

States: idle (Send action) → sending → **sent** (persists; the row carries
Concept2's own result id, and the state INCLUDES a "View on Concept2"
link-out to the result — the thing that answers "did it actually land?") /
**duplicate** ("Concept2 already has this row" — their logbook rejected it
as matching an existing row's date, time and distance) / **failed**
(retryable). The link-out goes to the rower's Concept2 logbook, whose
contents are theirs: a row deleted over there 404s, and the copy should
survive that honestly. Also decide the treatment for non-qualifying rows
and for the not-linked case (absence vs disabled-with-why; the spec leaves
this to design).

RF23 note for the pass: enumerate what already sits on the log row surface
(hero numbers, MACHINE CONFIRMED badge, recording/download actions) so the
new affordance doesn't crowd or duplicate an existing offer.

## Constraints

- Native-first (iOS is the primary surface); portrait and landscape both.
- Copy is part of the gate: the H/L question's exact wording, the
  duplicate message, and the unlink confirm all get approved as rendered.
- Contrast: compute and state the ratio for every new pairing (RF6).
