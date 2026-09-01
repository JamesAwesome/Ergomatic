# PR1.5 fix round 2 — on-device walk card (P1a-device)

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
is unset there), so a normal release build never carries it. Confirm you
built with the flag exported: `pnpm build && pnpm dist:grep` from a
DIFFERENT terminal (flag NOT exported there) should print `dist-grep: OK`;
the same two commands WITH the flag exported should print
`dist-grep: FOUND dev-only reference "C2 link probe (dev harness)"` and
exit non-zero — if you see the opposite of either, stop, something is
wrong with the build, not the app.

## What to tap

1. Open the app, go to the **You** tab (bottom tab bar).
2. Scroll to the bottom. You should see a card titled
   **"C2 LINK PROBE (DEV HARNESS)"** with a button labeled **"Open consent
   browser"** and a line reading **"Returns detected: 0"**. If you don't
   see this card, the build did not carry the flag — stop and re-check the
   export above before continuing.
3. Tap **"Open consent browser"**. A browser sheet should slide up over
   the app (this IS `SFSafariViewController` — it should look like a
   in-app browser, not a full app-switch to Safari) showing
   `log-dev.concept2.com`. It will very likely show an error page or a
   blank/unreachable-host screen — that's fine and expected, this card
   never completes a real OAuth flow, it only needs the browser to OPEN.
4. Dismiss the browser sheet by tapping **Done** (top-left/right corner,
   iOS's own SFSafariViewController chrome) — do NOT background the app
   first, this step is specifically checking the modal-dismiss path.
5. **Read the counter.** It should now say **"Returns detected: 1"**.
   That's the whole check for the browserFinished path.
6. Tap **"Open consent browser"** again. This time, instead of tapping
   Done, background the app (swipe up to the app switcher, or press the
   side button briefly) for a couple of seconds, then return to Ergomatic
   by tapping it in the app switcher.
7. **Read the counter again.** It should now say **"Returns detected: 2"**
   (or briefly touch 3 if both signals happened to fire — that's the
   documented harmless double-fire, not a bug; see
   `useForegroundRefetch.ts`'s own header comment).

## What a PASS looks like

- Step 5: counter went from 0 to 1 after a plain Done-tap dismiss, with NO
  app backgrounding in between.
- Step 7: counter increased again after a background/foreground cycle.

If step 5's counter does NOT move (stays at 0) after a plain Done-tap
dismiss, that is exactly the bug this fix round exists to close —
`browserFinished` did not fire, or did not reach the counter. Stop and
report it rather than continuing to step 6.

## Also worth a glance (not pass/fail, just useful evidence)

- When you tap "Open consent browser" a SECOND time on the same session,
  does the consent browser show a fresh login prompt, or does it skip
  straight to whatever Concept2's error page shows (a Safari-shared
  cookie/session carrying over)? Either is fine; it's UX evidence for
  PR2's copy, not a security question (the design-gate doc,
  `docs/superpowers/plans/2026-09-01-concept2-pr15-gate.md`, already
  covers why this card's platform has no session artifact to observe
  either way).

## Afterwards

Nothing to clean up on the phone — this build is disposable. Don't ship
it; the next real TestFlight build should go out via the normal
`pnpm ios:release` (which never sets `VITE_ENABLE_C2_LINK_PROBE`).
