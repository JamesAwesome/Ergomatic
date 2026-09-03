# PR1.5 fix round 2 — on-device walk card (P1a-device)

**HISTORICAL — 2026-09-02:** the `Browser.open` + `browserFinished` return
arm this card walked was retired at PR1.75b
(`2026-09-02-concept2-pr175b-native.md`, Task 3's census). Kept as the
record of what was built and why.

**Revised, fix round 3** (antagonist findings 9-11): step 7 corrected —
returning from background lands you on the STILL-OPEN sheet, not a
dismissed one, so the counter is deterministically 3, not "2 or briefly
3"; the flagless-build `dist:grep` step relabeled as proving the fold
mechanism, not your phone's artifact; and `log-dev.concept2.com`
corrected from a guessed "error page" to its measured reality (a real
Concept2 sign-in page, HTTP 200) with an explicit do-not-sign-in warning.

**Revised, fix round 5** (reviewer P1: the first-open race): the opener
now DISABLES itself (reading "Arming…") until `useReturnToApp`'s two
subscriptions actually settle, closing the race where an impatient first
tap could open-and-finish the browser before registration completed —
step 2 updated to describe it, and a final step added: `ios-release.sh`
now refuses to run while `VITE_ENABLE_C2_LINK_PROBE` is exported in your
shell (reviewer proved a walk operator's own shell could otherwise ship
the probe card via a later release) — unset it when you're done. Also
added an optional device probe for the design-gate's own open cookie
question (§4 there).

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
   **"C2 LINK PROBE (DEV HARNESS)"** with a line reading **"Returns
   detected: 0"**. The button may briefly read **"Arming…"** and be
   un-tappable for a moment right after the screen appears — that is
   expected (fix round 5: it is disabled until the return-signal
   subscriptions are actually live, closing the exact race this whole
   card exists to catch) — wait for it to become **"Open consent
   browser"** before continuing. If you don't see this card at all, the
   build did not carry the flag — stop and re-check the export above
   before continuing.
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

## RESULT — PASS (James, on device, 2026-09-01, build 0.31.0/840)

Measured by counter DELTA (unreliable to count taps by hand, so each path
was run as an isolated single trial from a known starting value):

- **browserFinished path:** counter 8 → 9 on a plain Done/X dismiss with NO
  backgrounding — delta exactly +1. The signal this fix round exists to add
  fires, once, on the modal-dismiss return path `pause`/`resume` alone misses.
- **resume + browserFinished path:** 9 → 11 on background-app → return (lands
  on the still-open sheet) → dismiss — delta exactly +2 (resume on return,
  browserFinished on dismiss). No over-count (the lifecycle-event-overcount
  class of RF is absent — a plain dismiss never triggers resume).
- SFSafariViewController confirmed presented as an in-app sheet (X top-left,
  `log-dev.concept2.com` in the bar, Concept2's real HTTP-200 page), not an
  app-switch to Safari. Probe card rendered on You, armed to "Open consent
  browser" (no stuck "Arming…").

The earlier raw total of 8 before the controlled trials was background cycles
mixed with plain dismisses (each cycle +2), consistent with the deltas above;
the per-path deltas are the deterministic evidence, not the running total.

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
- **Dropped, fix round 7 (finding 2):** this bullet used to ask you to
  check `document.cookie` in mobile Safari for an `erg_session` cookie
  and compare it against this card's `SFSafariViewController` sheet. Two
  things made that unworkable, found this round: `erg_session` is
  `HttpOnly` (`server/auth/cookies.ts:20-29`) — `document.cookie` can
  never see it regardless of any sharing question — and the underlying
  premise (a PRE-EXISTING web session cookie riding along into the
  consent browser) was itself dropped from the design-gate doc this
  round; Apple's own docs point at a different mechanism
  (`ASWebAuthenticationSession`) for deliberately sharing session state,
  not `SFSafariViewController`. The design-gate's actual open question
  now (§2/§4/§3(d)) is whether a cookie our OWN not-yet-built `/start`
  route sets survives ONE continuous consent-browser session — nothing
  this probe card, or any check against a PRIOR web session, can measure.
  There is no substitute check for this walk to carry until `/start`
  exists.
- **Optional, round 9 (P2, gate doc §1a's provider-remedy claim):**
  unrelated to this card's own probe (which never completes a real OAuth
  exchange) — if you have login access to the log-dev Concept2 account
  used for PR0's own anchor measurement (`user 2211`, spec's own
  "Operator steps" line), it costs nothing extra to open that account's
  **Applications** settings page (Profile → Edit Profile → Applications,
  per Concept2's own Help page, `https://log.concept2.com/help`) and
  confirm whether Ergomatic's registered client appears there with a
  working **Revoke** button. This is the ONE piece of the gate doc's own
  victim-remedy claim (§1a) that a real account login can settle rather
  than infer — not blocking, not pass/fail, do it whenever convenient.

## Afterwards

Nothing to clean up on the phone — this build is disposable. Don't ship
it; the next real TestFlight build should go out via the normal
`pnpm ios:release` (which never sets `VITE_ENABLE_C2_LINK_PROBE`).

**Last step, do this even if you're stopping here — fix round 5 (P1, the
release-flag leak the reviewer proved):** `unset VITE_ENABLE_C2_LINK_PROBE`
in this shell, or just close the terminal. `pnpm ios:release` now
refuses outright while that variable is exported — it exists specifically
so a real release built later in this SAME shell can never silently ship
the probe card — but the safest habit is still to unset it the moment
you're done with the walk, not to rely on the guard alone.
