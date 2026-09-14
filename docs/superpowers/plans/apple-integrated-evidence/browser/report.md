# Integrated Apple browser and capture gate

Status: **PASS for the scoped browser gate at `c8ba5f12`.** The original broad run exposed two visual failures; `d5421946` corrected them, and `c8ba5f12` corrected the capture-readiness race found during reinspection.

## Source identity

- Broad functional/design/capture source: product `9f9276a91b220ea2eede4487c134a7de57f03028` (`fix: consume auth navigation once`), with fixture-only checkout HEAD `1ecd4a196a1a8ed7ddd94ba5748361c1f94c14e0`. `git diff --numstat 9f9276a9 -- app/src` returned zero lines then.
- Final product source: `d5421946ad5ab825dadefb390a7da2e07350e7f1` (`fix(auth-ui): match approved notice colors and flow width`).
- Final capture/test HEAD: `c8ba5f12b381d55ab8cc2ec504cbfdc56319b2ab` (`test(apple): wait for loaded profile captures and retain synced iOS manifest`). `git diff --numstat d5421946 -- app/src` returned zero lines, so this final HEAD changed no product client source after the CSS fix.
- The dispatch identifies this integrated tree as matching client `089a4bfb`, server `259882ba`, and native `81ce6040`; those adopted heads are not direct ancestors of final HEAD, so this report does not use ancestry as its identity proof.

## Commands and results

All pnpm commands ran from `app/` with Node 26.5.0 first on `PATH`. No `TEST_AUTH_SECRET` override was supplied.

1. Case census:
   - `pnpm exec playwright test --project=chromium --list e2e/appleAuth.spec.ts` — 4 tests listed.
   - `pnpm exec playwright test --project=chromium --list e2e/design.spec.ts --grep 'Apple front door and sign-in methods'` — 2 tests listed.
   - `pnpm exec playwright test --project=screenshots --list e2e/screenshots.spec.ts --grep 'apple-'` — 7 tests listed.
2. Broad functional and structural design gate at product source `9f9276a9`:
   - `pnpm e2e e2e/appleAuth.spec.ts e2e/design.spec.ts --grep 'Apple welcome|linking Apple|lost finalize|cancelled link|Apple front door and sign-in methods'`
   - Result: **6 passed, 0 failed** in 1.6 s: all 4 `appleAuth.spec.ts` cases and both Apple `design.spec.ts` cases.
3. Broad capture gate at product source `9f9276a9`:
   - `pnpm screenshots --grep 'apple-'`
   - Result: **7 passed, 0 failed** in 1.1 s after the script's required fresh-volume boot.
4. Original served-bundle proof:
   - `VITE_ENABLE_FAKE_MONITOR=1 pnpm build` — passed with 341 client modules; e2e main asset `index-DaeoTSmZ.js`.
   - `curl http://127.0.0.1:8358/` selected `/assets/index-DaeoTSmZ.js`; the served and fresh local e2e-build SHA-256 both equal `f265489efae48dd442f8a750d7b16faef4cc3444ea1c6dd5f4b47de1257401eb`.
   - The served asset contains the distinctive integrated Apple literals `Create your account` and `authAttempt`.
5. CSS-fix recapture at `d5421946`:
   - `pnpm screenshots --grep 'apple-link-confirm-landscape|apple-link-result-uncertain'`
   - Result: **3 passed, 0 failed** in 921 ms. Styling was corrected, but original-size inspection exposed a pre-existing readiness race: the landscape uncertainty capture showed `LOADING…` instead of career data.
6. Final bounded capture rerun at test HEAD `c8ba5f12`, reusing the already-corrected running stack:
   - After sourcing `scripts/stack-env.sh`: `ERGOMATIC_STABLE_RUN_ID=1 pnpm exec playwright test --project=screenshots e2e/screenshots.spec.ts --grep 'apple-signin-methods|apple-link-confirm-landscape|apple-link-result-uncertain'`
   - Result: **4 passed, 0 failed** in 1.1 s. Methods, confirm landscape, uncertainty portrait, and uncertainty landscape all captured only after the positive `LIFETIME ·` readiness signal.
7. Final served-bundle proof:
   - `curl http://127.0.0.1:8358/` selected JS `/assets/index-3IXZScxA.js` and CSS `/assets/index-BupF1Tm4.css` from the healthy `ergomatic-17458` stack.
   - Served JS SHA-256: `0094b66d3b5aa081b85f8968b207706b98e0b6d57c3c447ce03bbcd89dd78d5d`.
   - Served CSS SHA-256: `711017f3068f84a67e57ffb49aafce49fc55425bbdf6f3930928a231b608f83c`.
   - The served JS contains `Create your account` and `authAttempt`; the served CSS contains `.notice.auth-notice-error{border-color:var(--accent)}` and `.notice.auth-notice-success{border-color:var(--success)}`. The screenshot build log names the same CSS/JS assets at `d5421946`, and final HEAD differs from that product source only in tests/generated native manifest.
8. Computed notice-style check against the corrected served bundle:
   - A headless Chromium page loaded the served CSS and read computed styles on ordinary `.notice` elements.
   - Success: `rgb(73, 98, 79)` / `#49624f`; error: `rgb(181, 52, 31)` / `#b5341f`; base: `rgb(27, 26, 23)` / `#1b1a17`; each is a solid 1 px border.
9. Stack cleanup:
   - Sourced `scripts/stack-env.sh`, then ran `docker compose -f ../compose.yml -f ../compose.e2e.yml down` for `ergomatic-17458` only.
   - Its web, API, and Postgres containers and network are stopped/removed. `ergomatic-17458_pgdata` remains as required until merge.

Exact outputs are in this directory: `functional-design.log`, `screenshots.log`, `screenshots-post-fix.log`, `screenshots-final.log`, `served-bundle-proof.log`, `served-bundle-proof-final.log`, `computed-notice-borders-post-fix.log`, `visual-measurements*.log`, the case-list logs, hash records, and `stack-cleanup-final.log`.

## Functional observations

- Welcome begins at the real Apple control and reaches explicit account confirmation.
- Linking proves Google, then Apple, retains the signed-in account and its real `Sea Fret`-derived workout, and allows ordinary Library navigation afterward.
- A lost finalize response shows uncertainty, reports neither success nor failure, refreshes both methods as connected, and allows ordinary Library navigation afterward.
- A cancelled return reaches You once and then releases ordinary navigation to Library.
- The two structural design cases confirm provider order, button geometry, black Apple palette, accessible names, 44 px minimum controls, no Axe violations, and no tab bar on the linking screen.

## Final image inspection

All 7 final PNGs were opened at original resolution and compared with the named references under `docs/design/apple-signin/renders/`.

- `docs/screenshots/apple-signin-welcome.png` — 390×844; Apple precedes Google, both controls are fully visible, and the Apple artwork is left aligned and uncropped. Matches `after-signin-web-portrait.png`.
- `docs/screenshots/apple-signin-welcome-landscape.png` — 844×390; centered 440 px entry content, controls, and copy fit without clipping. Matches `after-signin-web-landscape.png`.
- `docs/screenshots/apple-create-account.png` — 390×844; fallback `Rower`, relay email, duplicate-account explanation, and both actions are fully visible. It matches `create-account-apple-relay.png` apart from that reference's explicitly simulated native status inset.
- `docs/screenshots/apple-signin-methods.png` — 390×844; the identity email truncates within its card, the loaded `LIFETIME · 0 M` / `SEASON 2027 · 0 M` strip is present, Apple offers Add Apple, Google reads CONNECTED, and normal bottom navigation is present.
- `docs/screenshots/apple-link-confirm-landscape.png` — 844×390; copy, both proof steps, and the action are clear with no clipping; the tab bar is hidden. The action spans x=182..661, exactly 480 px, matching `link-confirm-usual-provider-landscape.png` and its `layout-audit.json` entry.
- `docs/screenshots/apple-link-result-uncertain.png` — 390×844; loaded career state is present, uncertainty copy wraps cleanly in two lines, both providers read CONNECTED, no retry appears because the authoritative refresh reports Apple connected, and normal bottom navigation remains available.
- `docs/screenshots/apple-link-result-uncertain-landscape.png` — 844×390; loaded career state is present rather than `LOADING…`; the same uncertainty copy fits in two lines, connected Apple is visible above the normal fixed tab bar, and the remaining content is scrollable.

Both final uncertainty borders measure `srgb(181,52,31)` (`#b5341f`), matching the approved accent. The reference contrast record gives 5.35:1 for that error boundary on page, 5.92:1 for the green success/connected state, 6.69:1 for supporting text, 5.94:1 for cream on accent, and 21:1 for the Apple label on black.

## Historical findings and preserved evidence

The original broad run found two visual failures despite all automated cases passing:

1. Both uncertainty alerts rendered an ink border. Portrait measured `srgb(60,58,55)` against design `srgb(192,81,62)`; landscape measured `srgb(27,26,23)` against design `srgb(181,52,31)`. The later `.notice` border shorthand outranked the earlier auth state selectors. `d5421946` made the state selectors more specific.
2. The landscape confirmation action was 440 px (x=202..641), while the approved render/audit specifies 480 px (x=182..661). `d5421946` restored the intended flow width.

The first CSS-fix recapture then exposed the `LOADING…` screenshot race. `c8ba5f12` added a positive `LIFETIME ·` readiness wait to the methods and uncertainty capture helpers; the final 4/4 rerun shows loaded state in all affected captures.

Preserved artifacts:

- `before-fix-apple-link-result-uncertain.png` and `before-fix-apple-link-result-uncertain-landscape.png`, with hashes in `before-fix-uncertainty.sha256`.
- `post-css-pre-wait-apple-link-result-uncertain-landscape.png`, with its hash in `post-css-pre-wait-loading.sha256`.

## Final hashes and changed captures

Four captures remain byte-identical to the initial tree. Three changed:

- `apple-link-confirm-landscape.png`: `f8b41d5ed0813bc8d973bebab58c9a7863b9505979ed225c96e484decc939330` → `e1a8ac9df0a2f72cbed23929cefd01e723871a82ecef0081337b62b712ac4149`.
- `apple-link-result-uncertain.png`: `c6cad5475793e5dda7f81221aedf26690a576ad5045e72bb0b2152759598fee4` → `1cbe6b87eb12b773d703c229f6fd3ec5c970c979215bcc4f855e8c6e8048122e`.
- `apple-link-result-uncertain-landscape.png`: `be923d513e6a3d1880a94bc0f8ebae8a8e58916f3160a7cbcba4479de36d7659` → `6bd90af6118ba81e9b66a10c843d951064638f33a0a6a4072ba1c81238c49e6f`.

`apple-png-before.sha256`, `apple-png-final.sha256`, and the intermediate diff/hash files preserve the complete record.

## Change ownership, coverage, mutations, and commits

- This browser-gate worker generated the 7 scoped captures, authored this report, and wrote only evidence under the assigned browser directory. It edited no product or test source, staged nothing, and created no commit.
- Final worktree status shows only the three expected Apple PNGs modified in this worker's owned tracked scope.
- Per-file coverage and self-mutation do not apply to this worker because it added no product behavior or test assertion.
- Relevant commits created by the controller/other worker during this gate: `1ecd4a19`, `d5421946`, and `c8ba5f12`. This worker created none.

## Limitations

- This was an ordinary browser functionality/layout run using repository endpoint-interception fixtures. It did not access live Apple or Google accounts, exercise a phone, validate native provider SDK behavior, perform security review, or run the unfinished expiry probe.
- The hardening code lens remains incomplete after its platform block. This browser PASS does not clear that separate gate.
- After capture work, the controller reported that its later production build restored `app/dist`: `final-dist-sync.json` proves all 81 `dist/client` files equal native `public`, the corrected CSS is present, and `dist:grep` exits 0 with all ten development markers absent.
