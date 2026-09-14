# Bounded Apple real-browser gate

Raw `.log`, served HTML and CSS references resolve after extracting `runtime-logs.tar.gz` at the evidence root; [artifact instructions](../artifacts.md) preserve their exact bytes.

## Verdict and identity

**The 9 named Playwright cases pass (7 Apple functional + 2 Apple structural/design).** The requested synthetic states were captured from the freshly built `ergomatic-17458` web image at both exact viewports. Manual inspection found one misleading disabled-control treatment and Axe found the existing You page lacks an `h1`; neither was caught by the named cases.

- Booted commit: `7a961b975d4380265de0942ef8310c96f45a3782` (`Merge current main into Apple review fixes`).
- Accepted auth candidate: `970fb10eba9c90dc296b21cd9d10c04a34e0fee6`.
- `app/src`, `app/server`, `app/shared`, `appleAuth.spec.ts`, and `design.spec.ts` are byte-identical from `970fb10e` through the booted commit. The only app change from `970fb10e` to `7a961b9` is `app/e2e/screenshots.spec.ts`.
- The image was created at `2026-09-13T17:35:59Z`. A concurrent native-only commit, `15f99cc1108efd33bd5dec22c7f7561445737772`, reached checkout HEAD at `2026-09-13T17:40:10Z`; its web/auth scope is byte-identical to `7a961b9`, and the served image predates it.
- Stack: `ergomatic-17458`, web `127.0.0.1:8358`, PostgreSQL `127.0.0.1:15358`. `ergomatic-99321` had no running or stopped containers in the isolated Docker view and was never addressed.
- Built web image: `sha256:bd0266ad76f8a932ba49b3091fe739002b1734d4fbcde9f73202b5199110c1b2`; served index SHA-256 `d1677d9c99b85b9d113fa70b2bb5290d25c1fb7134cfb5fdb0bf6e0c56cea4f0`.
- Final teardown stopped and removed only the `ergomatic-17458` containers/network. `ergomatic-17458_pgdata` remains retained. Evidence: [stack-stop.log](stack-stop.log).

## Commands and results

Environment for stack actions: `DOCKER_CONFIG=/tmp/ergomatic-review-docker`, Node `26.5.0`, `ERGOMATIC_E2E_WORKERS=3`.

```sh
cd app
pnpm e2e e2e/appleAuth.spec.ts
```

This rebuilt and booted the worktree stack, then passed **7/7** in 1.4 s. Full output: [appleAuth-run.log](appleAuth-run.log).

```sh
cd app
REPO_ROOT="$(cd .. && pwd)" source scripts/stack-env.sh
pnpm exec playwright test --project=chromium e2e/design.spec.ts \
  --grep 'Apple front door and sign-in methods'
```

This selected exactly the two discovered cases and passed **2/2** in 939 ms. Case census: [design-list.log](design-list.log); final output: [design-run-stack.log](design-run-stack.log).

```sh
cd app
REPO_ROOT="$(cd .. && pwd)" source scripts/stack-env.sh
node ../.superpowers/sdd/2026-09-13-apple-review-fixes/browser/capture.mjs
```

This produced **8/8** captures: denial, unavailable Add, failed-cancel notice, and recovered welcome in portrait and landscape. It uses only existing synthetic route fixtures and the test sign-in backdoor. The failed-cancel recovery assertion observed two cancellation deliveries, one replacement start, no retained alert, and scrubbed return parameters. Full metrics and Axe output: [capture-metrics.json](capture-metrics.json); computed contrast: [contrast.json](contrast.json); hashes: [capture-sha256.txt](capture-sha256.txt).

## Capture inspection

All PNGs are exact `390x844` or `844x390`, are sharp at 1x CSS pixels, and have no horizontal overflow. Notices remain centered and uncut at 350 px portrait / 440 px landscape; denial is 60 px high and failed-cancel is 43 px. Provider controls are 52 px high. The unavailable Add row is 54 px high. Recovery removes the failed-cancel notice and recenters the provider controls. The landscape denial document has a harmless 2 px vertical scroll extent (`392` vs `390`); the visible content is not clipped. The You page scrolls vertically as expected in landscape, and its sign-in rows remain above the fixed tab bar.

- [Access denial portrait](captures/access-denied-portrait-390x844.png) · [landscape](captures/access-denied-landscape-844x390.png)
- [Unavailable Add portrait](captures/unavailable-add-portrait-390x844.png) · [landscape](captures/unavailable-add-landscape-844x390.png)
- [Failed-cancel notice portrait](captures/failed-cancel-notice-portrait-390x844.png) · [landscape](captures/failed-cancel-notice-landscape-844x390.png)
- [Failed-cancel recovery portrait](captures/failed-cancel-recovery-portrait-390x844.png) · [landscape](captures/failed-cancel-recovery-landscape-844x390.png)

Notice text measures 17.11:1 against its surface; the error border and Google label each measure 5.94:1; Apple label 21:1; connected label 5.92:1. Axe found no violations in denial, failed-cancel, or recovery at either viewport.

**Manual concern at the booted `7a961b9` source:** the unavailable Apple button is functionally disabled, but only the provider name takes Chromium's disabled gray (2.48:1, exempt disabled text). The explicit `Add Apple ›` child stays dark at 9.74:1, so it reads visually like an available action despite doing nothing. The original inspection did not collect cursor style; the earlier report wording inferred `pointer` from an upstream rule but missed the later equal-specificity `button:disabled` rule. No pre-fix cursor defect is claimed.

Follow-up `c7fce223` dims the action to match the row without changing copy or geometry. Its focused browser evidence is preserved separately at [disabled-final/report.md](disabled-final/report.md).

**Incidental Axe finding:** both unavailable-Add captures report `page-has-heading-one` (moderate) because the You page has no level-one heading. This is confirmed browser output but is outside the auth fix delta.

## Non-product invocation failures and limits

The isolated Docker config initially lacked the Compose CLI symlink; the first boot command stopped with exit 125 before container mutation ([appleAuth-boot-failed.log](appleAuth-boot-failed.log)). Two early design invocations targeted unused ports 8081 and 8157 because the manual command omitted or non-canonically hashed `REPO_ROOT`; both failed on connection refusal before an app assertion ([design-run.log](design-run.log), [design-run-corrected.log](design-run-corrected.log)). The corrected worktree-targeted result is the 2/2 pass above. The first capture pass asserted counters before the replacement request settled; the corrected helper uses the same positive polling contract as the passing product case ([capture-run.log](capture-run.log), [capture-run-corrected.log](capture-run-corrected.log)).

This gate verifies Chromium behavior against synthetic auth fixtures. It does not verify Apple/Google provider pages, external network redirects, native provider SDK behavior, iOS install/runtime, or the original platform-blocked security gate.

Runtime identity details: [runtime-evidence.log](runtime-evidence.log).
