# Wave A PR2 · rendered Gate 0

**What this is for.** PR2 lets a rower who signs in with a second provider and
says "I already have an account" end up with that provider attached, instead of
back where they started. James ruled on 2026-09-14 that **the confirmation comes
after the proof**, which makes the confirmation a screen that does not exist
today. This gate approves that screen before any implementation task starts, and
it carries the four copy rows that ride the same PR.

Open `index.html`. The left rail selects every state and both orientations. No
control calls Apple, Google, or Ergomatic authentication.

Copy is the **shipped** copy wherever a screen exists today, read from
`app/src/SignIn.tsx`, `app/src/you/SignInMethods.tsx`,
`app/src/you/DeleteAccount.tsx` and `app/src/theme/tokens.css` in this worktree.

## What you are approving

### 1. The new screen: "Attach Apple to this account?"

`renders/04-attach-portrait.png`, `04-attach-landscape.png`,
`04-attach-web-portrait.png`.

It names **three** things, and the third is the one revision 4 nearly left out:
the identity being attached (the carried Apple one, with its relay address in
full), the account it is being attached **to**, and that the rower is already
signed in. A confirmation that says "attach this?" without naming the
destination is not a control, because the whole failure it guards against is
attaching to the wrong account.

**Landscape puts the pair side by side.** Stacked, it pushed the actions 267 px
below the fold on an 844 × 390 frame, which is the RC-24 failure exactly: the
one control the screen exists for, off-screen on the orientation a rower is most
likely holding at an erg. Measured by `render.mjs` before and after. **No
content is hidden in either orientation** — only spacing shrinks.

**The relay address wraps rather than truncates.** The shared `.identity-email`
rule ellipsises it, and on a 390 px frame that cut it at `…appleid…` — the half
that says it is a relay is exactly the half that was lost, while the spec's own
global constraint is that the confirmation "names the provider AND the relay
address". It breaks at the `@`.

### 2. Three open questions on that screen

**The No button** (`renders/06-no-button-options.png`). Refusing here is not
cancelling: the rower is already signed in, so the screen is "you're in, attach
Apple too?" rather than "sign in?". Three options, each with its cost stated.
**"Cancel" is the one to look at hardest** — it matches every other auth screen
in the app, and it is a lie on this one.

**The 300-second clock** (`renders/07-the-300s-clock.png`). The confirmation is
now the *last* thing inside a window that also has to hold a full provider round
trip. Refresh `expires_at` at the second exchange, or do not. The sibling arm
this code sits beside already refreshes it, so "unchanged" is a silent departure
rather than a default. **Both options are marked untested** — no measurement of
a real two-provider round trip exists, and inventing one would pick the design
for you (RF30).

**The Back button.** The mock keeps `← BACK` from the screens it is modelled on,
and next to "Not now" it is ambiguous — two exits, no stated difference. Ruling
it either way is yours; I have not silently removed it.

### 3. The copy round, four rows, one gate

- **`renders/08-delete-reauth-options.png` — Delete account never says a
  provider re-auth is coming.** You found this running the deletion twice for
  real. The proposal puts the disclosure at the **tap**, on You, not on the
  confirm screen — because the re-auth happens *before* that screen, so a
  warning there arrives after the cost has been paid. It also leaves the confirm
  screen untouched, which respects its own 2026-09-14 ruling (state facts, not
  prose).
- **`renders/09-link-notice-options.png` — the redundant success notice.**
  Current and trimmed, side by side, with the CONNECTED row visible beneath both
  so the duplication is on screen rather than described.
- **`renders/10-naming-you-options.png` — naming the "You" screen.** **The
  census was wrong in the row and is corrected here: seven live strings, not
  five, and three treatments, not two.** `SignIn.tsx:173` was missed, and
  `Concept2SendBlock.tsx:226` uses a third form ("the You tab") that the row
  never mentioned. Three undated News article bodies use that form too, which
  Phase JC's ruling makes rendering surfaces; dated release notes stand as
  history and are exempt. The board shows the Today sentence under each
  treatment, because that is the one whose grammar you flagged.
- **`renders/11-hairline-options.png` — the `--rule` hairline.** Today it
  measures **1.47:1** on `--surface`. **The obvious small step does not work:**
  `#a39c88` measures 2.69:1 and 2.42:1 and still misses the 3:1 floor. The
  lightest value clearing 3:1 against **both** grounds is `#928a78` (3.37:1 and
  3.03:1), and it is visibly darker than a hairline. `--rule` is used across the
  whole app, so this is a global change, not a local one.

## Rendering and checks

Run from this directory:

```sh
node contrast.mjs
node render.mjs
```

`contrast.mjs` computes WCAG relative-luminance ratios for every pairing this
pack puts on screen and writes `contrast.json` with each one's floor and
verdict. **Every non-decorative pairing clears its floor.** The lowest body-text
ratio is cream on accent at 5.94:1; the identity card's meaningful `--ink-4`
edge is 4.76:1; the focus ring is 7.43:1 beside page and 8.25:1 beside surface.
The two `--rule` rows are reported as decorative and exempt **with their numbers
anyway**, because the exemption is the claim under question and a reader has to
be able to check it.

`render.mjs` uses the repository's installed Playwright and Chromium at
`deviceScaleFactor: 2`. It writes `renders/layout-audit.json` recording, per
capture, horizontal overflow, vertical overflow in pixels, and every interactive
box below 44 × 44. **Current state: no horizontal overflow anywhere, and every
target clears 44 × 44.** The option boards (08-11) scroll vertically by design —
they are decision aids you read, not screens a rower stands in front of. The
four flow screens do not.

## What this pack does NOT settle

The flow's reachability. Staging stays `restricted`, and `requireAccess` refuses
an Apple **Hide My Email** identity before the attempt reaches this screen at
all, so under the live configuration only *Share My Email* from an allowlisted
address gets here. That is a build-now question and it is yours, but it is **not
a reason to skip this gate** — the screen is the same screen whenever the path
opens, and deferring the design on an unsettled reachability question is how a
design decision gets made by accident (RF30).

## GATE 0 RULINGS (James, 2026-09-15)

All four settled. The pack above is the record of what was shown; this is what
was decided.

1. **The No button is "Not now".** Option A. Goes to Today, signed in; Apple
   stays unattached and the screen returns on the next Apple sign-in.
2. **The second sign-in RESETS the 300-second window.** The rower gets a fresh
   300 s to read the confirmation, matching what `accept()`'s reauth arm
   already does for link and delete at exactly this point. James's own reason
   is the strongest one in the record: **"what 300 second clock I don't see a
   clock"** — nothing on screen shows it, counts it down, or warns when it is
   about to run out, so a rower cannot manage a deadline they are not told
   about. Putting a screen they are meant to READ inside an invisible,
   already-spent window is what the reset removes. **Cost, stated and
   accepted:** the carried Apple identity can live across two windows rather
   than one.
3. **The delete re-auth is disclosed AT THE TAP.** The proposed version: one
   sentence in the ACCOUNT quarantine box naming the provider, and the confirm
   screen is left untouched — which is what keeps its own 2026-09-14 ruling
   (state facts, not prose) intact.
4. **The "You" naming treatment is "the You tab".** Applies to every live
   string, including the two `SignInMethods.tsx` ones #444 shipped as quoted.
   Re-measure the census at implementation time rather than trusting a number
   written here.
5. **The `--rule` hairline STAYS at 1.47:1**, and the policy is written down
   instead: **a boundary that carries meaning uses `--ink-4`** (4.76:1 on
   page, measured above), **and `--rule` stays decorative.** James asked for an
   opinion rather than a menu; the argument he accepted is that WCAG's 3:1
   non-text minimum governs boundaries needed to IDENTIFY a component or its
   state, and this one sits between rows their own labels already separate —
   so raising it would repaint every card, list and divider in the app to fix
   a line that carries no information. The policy is the durable half: it
   stops the question returning the next time a divider genuinely means
   something.
