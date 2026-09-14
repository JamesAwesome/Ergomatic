# Apple sign-in · rendered Gate 0

This handoff extends the shipped sign-in and You surfaces without redesigning them. Open `index.html` for a navigation-only prototype; it opens on the current/proposed entry comparison. The left rail selects every compact state, simulated native/web frame, and portrait/landscape size. No control calls Apple, Google, or Ergomatic authentication.

Visual references were the current `app/src/SignIn.tsx`, `app/src/You.tsx`, `app/src/theme/tokens.css`, `app/src/index.css`, `docs/screenshots/signin.png`, and `docs/screenshots/you.png` in this worktree.

## Decisions shown

- Apple appears first on the welcome screen, with Google retained at identical 52 px height and width. Both providers can create accounts.
- A provider identity that Ergomatic has not seen opens **Create your account** before any account is created. **I already have an account** returns the rower to their usual provider and directs them to You → Sign-in methods. This avoids silent duplicates.
- Apple’s realistic relay address and the fallback display name **Rower** show the least-profile-data case.
- An unseen Apple identity without a verified email creates no account and offers **Continue with Google**. A returning Apple identity that is already linked still resolves by Apple subject and does not need profile email to sign in.
- You gains one flat **SIGN-IN METHODS** block after the existing career strip. It preserves the current identity card, career summary, bottom doors, and tab bar.
- Linking works in both directions. The confirmation states say that the rower first confirms the provider already attached to the Ergomatic account, then authorizes the provider being added. Cancel returns to the unchanged You state. Success connects both methods; conflict and account-switch rejection say that nothing changed. Expiration uses the same uncertainty notice as a lost response: check the connected methods, then try again. Account switching requires starting the link again.
- The native desk frames simulate 47 px above and 34 px below in portrait, and 44 px at each side plus 21 px below in landscape. They are review mockups, not measurements or captures of device behavior. Web desk frames use the same product layout without simulated native insets.
- Entry content keeps the current `main` geometry: 480 px maximum outer width including 20 px padding at each side, leaving a 440 px maximum content/button width in landscape.

## Apple artwork

`apple-logo-left-white-medium.svg` is Apple’s unmodified **Left-aligned White Medium** Sign in with Apple logo file. It was downloaded on 2026-09-12 from Apple’s current [Design Resources](https://developer.apple.com/design/resources/) package at `https://devimages-cdn.apple.com/design/resources/download/Logo-Sign-in-with-Apple.dmg`. The file is used only inside the Sign in with Apple control and scales to the button’s full 52 px height without cropping or added vertical padding. Apple’s accompanying license permits use in the app UI and screenshots subject to its terms; do not reuse this file as a general Apple mark.

Button treatment follows Apple’s [Sign in with Apple HIG](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple): official artwork only, black background with white logo/title, permitted label **Continue with Apple**, rectangular shape, and clear space around the button. The 350 × 52 px portrait result clears Apple’s 140 × 30 pt minimum and Ergomatic’s 44 px tap floor.

## Rendering and checks

Run from this directory:

```sh
node contrast.mjs
node render.mjs
```

`render.mjs` uses the repository’s installed Playwright 1.62.1 and Chromium. Its output reports the capture count, including a current/proposed side-by-side, before/after sign-in at 390 × 844 and 844 × 390, native/web welcome variants, signup and missing-email recovery, both You provider states, linking in both directions, success/conflict/expired/account-changed outcomes, and landscape evidence for the Apple-create, You methods, link-confirmation, expired and account-changed states. `renders/layout-audit.json` records every interactive box and checks for horizontal overflow and targets below 44 × 44 px.

The expiry notice was corrected after [mechanism-review F4](../../superpowers/research/2026-09-13-apple-harden/mechanism-report.md) on 2026-09-13. A consumed attempt can follow a committed link whose response was lost, so expiry cannot promise that nothing changed. The original Gate 0 render remains in git history; current portrait and landscape captures show the corrected copy.

`contrast.json` computes WCAG relative-luminance ratios for every text, action fill, meaningful boundary, and focus-ring pairing used here. The lowest body-text ratio is supporting ink on page at 6.69:1; cream on accent is 5.94:1; white on the Apple button is 21:1; the blue focus ring is 7.43:1 beside page and 8.25:1 beside surface. The pale `--rule` is 1.32:1 and remains decorative; state and action boundaries use ink, accent, black, or text rather than that rule alone.

## Selected defaults

Keep **Rower** as the visible fallback account name. After linking, return to You with the short success notice above the persistent connected states. The provider order, button geometry, duplicate-account guard, two-step linking explanation, and unchanged-on-cancel behavior are fully rendered.
