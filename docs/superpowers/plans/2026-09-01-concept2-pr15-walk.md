# PR1.5 fix round 2 — on-device walk card (P1a-device)

**Revised, fix round 3** (antagonist findings 9-11): step 7 corrected —
returning from background lands you on the STILL-OPEN sheet, not a
dismissed one, so the counter is deterministically 3, not "2 or briefly
3"; the flagless-build `dist:grep` step relabeled as proving the fold
mechanism, not your phone's artifact; and `log-dev.concept2.com`
corrected from a guessed "error page" to its measured reality (a real
Concept2 sign-in page, HTTP 200) with an explicit do-not-sign-in warning.

**What this is for:** proving the modal-return signal (fix round 2, P1a)
actually fires on a real device. `src/native/**` is coverage-exempt (RF19)
and `pnpm e2e` runs on web — nothing in this repo's own gates can reach
`SFSafariViewController`'s modal dismissal, so this is the one check that
has to happen on your phone. Two minutes, no erg, no rowing budget.

## What you're checking

`Browser.open` presents the Concept2 consent screen MODALLY inside the
app. Dismissing it (tapping Done, or swiping it away) does **not**
background or foreground Ergomatic the way switching apps does — so the
app's existing foreground-detection (`pause`/`resume`) never fires for
that return path on its own. This fix round adds a second signal
(`browserFinished`, the Capacitor Browser plugin's own "the user closed
this" event) specifically for that case. The card below lets you trigger
`Browser.open` and watch a counter that only moves when one of those two
signals fires — no real Concept2 account, no OAuth exchange, nothing
saved.

## Build it

From `app/`:

```
export VITE_ENABLE_C2_LINK_PROBE=1
pnpm ios:build
```

Then open the project in Xcode (`pnpm ios:open` or your usual flow) and
run it on your phone, same as any other TestFlight/dev build. **Do not**
release this build to TestFlight — it is a desk-only debug build; the
card folds out of the ordinary `pnpm ios:release` build (`VITE_ENABLE_C2_LINK_PROBE`
is unset there), so a normal release build never carries it.

**Optional, separate from your phone build — proves the MECHANISM can
fail, not anything about your phone:** `pnpm build && pnpm dist:grep`
(flag unset) prints `dist-grep: OK`; the same two commands with the flag
exported print `dist-grep: FOUND dev-only reference "C2 link probe (dev
harness)"` and exit non-zero. This runs against a plain WEB build
(`dist/client`) on your laptop — a completely different artifact from
what Xcode compiles into the phone app — so it only demonstrates that the
fold CAN be proven to fail on demand (RF12), never that your specific
iOS build carries the card. **Step 2 below (actually seeing the card on
your phone) is your real confirmation this build has the flag.**

## What to tap

1. Open the app, go to the **You** tab (bottom tab bar).
2. Scroll to the bottom. You should see a card titled
   **"C2 LINK PROBE (DEV HARNESS)"** with a button labeled **"Open consent
   browser"** and a line reading **"Returns detected: 0"**. If you don't
   see this card, the build did not carry the flag — stop and re-check the
   export above before continuing.
3. Tap **"Open consent browser"**. A browser sheet should slide up over
   the app (this IS `SFSafariViewController` — it should look like an
   in-app browser, not a full app-switch to Safari) showing
   `log-dev.concept2.com` — **Concept2's own real "Concept2 Logbook" sign-in
   page (measured: a real HTTP 200, not an error page)**. **Do NOT sign in
   on that page** — it is Concept2's genuine dev environment; this card
   never needs to complete a real OAuth flow, it only needs the browser
   to OPEN. Just look at it, then move to the next step.
4. Dismiss the browser sheet by tapping **Done** (top-left/right corner,
   iOS's own SFSafariViewController chrome) — do NOT background the app
   first, this step is specifically checking the modal-dismiss path.
5. **Read the counter.** It should now say **"Returns detected: 1"**.
   That's the whole check for the browserFinished path.
6. Tap **"Open consent browser"** again (do not sign in, same as step 3).
   This time, background the app (swipe up to the app switcher, or press
   the side button briefly) for a couple of seconds, then return to
   Ergomatic by tapping it in the app switcher.
7. **You will land back on the still-open browser sheet** —
   backgrounding/foregrounding the app does NOT dismiss
   `SFSafariViewController` on its own; it is still there showing the
   same page. The `resume` signal already fired the instant you returned
   (counter is now 2, though you haven't looked yet). **Tap Done** to
   dismiss the sheet — this fires `browserFinished` on top of the
   `resume` that already happened. **Read the counter: it should now say
   exactly "Returns detected: 3"** — deterministic and monotonic, not
   "2 or briefly 3". If you background-and-return WITHOUT ever tapping
   Done, the counter stays at 2 until you do.

## What a PASS looks like

- Step 5: counter went from 0 to 1 after a plain Done-tap dismiss, with NO
  app backgrounding in between.
- Step 7: counter reaches exactly 3 after a background/foreground cycle
  followed by a Done-tap dismiss of the sheet you land back on.

If step 5's counter does NOT move (stays at 0) after a plain Done-tap
dismiss, that is exactly the bug this fix round exists to close —
`browserFinished` did not fire, or did not reach the counter. Stop and
report it rather than continuing to step 6.

## Also worth a glance (not pass/fail, just useful evidence)

- The page you land on IS Concept2's real sign-in screen (measured HTTP
  200, title "Concept2 Logbook") — without signing in, does the SECOND
  open (step 6) load visibly fresh, or does it look instant/cached
  compared to the first (step 3)? Either is fine; it's UX evidence for
  PR2's copy about what the consent browser feels like on a second visit,
  not a security question (the design-gate doc,
  `docs/superpowers/plans/2026-09-01-concept2-pr15-gate.md`, already
  covers why this card's platform has no Ergomatic session artifact to
  observe either way — this is purely about Concept2's OWN page,
  observed, never signed into).

## Afterwards

Nothing to clean up on the phone — this build is disposable. Don't ship
it; the next real TestFlight build should go out via the normal
`pnpm ios:release` (which never sets `VITE_ENABLE_C2_LINK_PROBE`).
