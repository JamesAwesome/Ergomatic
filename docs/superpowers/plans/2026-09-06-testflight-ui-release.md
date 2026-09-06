# v0.39.1 UI fixes — TestFlight Release Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to carry out this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the merged Baselines, keyboard-gap, target-nudge and web Connect fixes together in one internal TestFlight release.

**Architecture:** Use the existing annotated-tag release flow. One notes-and-captures PR precedes the tag; `pnpm ios:release` builds, stamps, archives and uploads the tagged source. No product implementation is planned.

**Tech Stack:** React release-note data, Playwright, pnpm, Capacitor, Xcode and internal TestFlight.

**Spec:** [Release procedure](../../RELEASING.md), [control parity record](../../testing/2026-09-06-control-parity.md), [keyboard verification record](../../testing/2026-09-06-keyboard-harness.md), and James's request to plan a release containing Claude's other UI fixes.

## Global constraints

- Candidate version: **v0.39.1**, a UI fixes patch following v0.39.0. Verify it is still available before tagging. Use the actual release date in the notes.
- James authorized execution of this complete release plan on 2026-09-06 ("Let’s do it"), including the notes PR, merge, tag and TestFlight upload. The approved draft notes below define the intended release content; complete the verification and rendered review before publishing.
- All source and documentation edits stay in the release worktree. Main is PR-only; no merge commits. Do not hand-edit package or native version numbers.
- Annotated tags are the version authority. Derive the final build number with `scripts/version.sh`; do not predict it before the notes merge.
- The notes/capture change qualifies for the repository's fast path if its scope remains one product data file, tests and captures, with no domain/server, stored shape, auth, number meaning or device behavior change. Inline preparation; James reviews the PR. No PM or antagonist pass is needed for this release packaging.
- Refresh screenshots on this Mac. Inspect retained images in both orientations; preserve only changes with a product or release-note reason.
- Desktop Playwright cannot prove the iOS software-keyboard appearance. Retain the existing native evidence and perform the focused installed-build check below.
- Production and TestFlight are separate outcomes: verify main's post-merge deploy, then the uploaded build's processing and tester availability.

## Release contents and complete merge census

Checked on 2026-09-06 after fetching tags: `git log v0.39.0..origin/main --oneline` contains these four commits. Base tag v0.39.0 points to `8b033596c7a784be92d76ef9fc26835331dbebae`; reviewed main is `1cda41e7609393c7758aed470ed9bf1b8f2fab71`.

| Merge | What the tester receives | Notes treatment |
| --- | --- | --- |
| [#315](https://github.com/JamesAwesome/Ergomatic/pull/315), `4df605df` | You shows the 2K/6K numbers; BASELINES opens their editor, re-test and reset controls. Existing Set baselines links follow the editor. | Item 1. |
| [#317](https://github.com/JamesAwesome/Ergomatic/pull/317), `125a6828` | The tab bar's surface fills the keyboard-accessory gap, preventing the list from showing through. Tabs remain available. | Item 2. |
| [#318](https://github.com/JamesAwesome/Ergomatic/pull/318), `f78be4fa` | Repository design-gate guidance only. | Account in the source comment; no rower-facing item. |
| [#319](https://github.com/JamesAwesome/Ergomatic/pull/319), `1cda41e7` | Target nudges are ▼▲. Unsupported web browsers disable Connect at every entry point; native Connect remains available. | Items 3 and 4, with item 4 explicitly scoped to web. |

The merged source is authoritative for #317: `app/src/index.css` has `.tabbar::after`; the old PR body describes a withdrawn keyboard-hiding approach. Do not repeat that description in the release notes. _(Superseded 2026-09-06, same day: the fill shipped in v0.39.1 and painted nothing on the phone — Phase KB, `docs/superpowers/specs/2026-09-06-keyboard-webview-resize-design.md`, removes `.tabbar::after` and replaces the note's second item.)_

The only open PR at this check is #316, the NFC design. It is outside this release. Concept2 cohort activation is also outside this release; existing dark functionality is not announced as newly available. The latest git tag is verified. The release uses the existing Xcode CLI account; no browser sign-in is required.

Main's [post-merge CI and deployment](https://github.com/JamesAwesome/Ergomatic/actions/runs/34043313335) passed for `1cda41e7`: 522 browser tests passed. Production `/api/health` returned `ok: true`, `db: true`, version `v0.39.0-4-g1cda41e7`. Refresh these receipts after the notes PR merges.

## Task 1: Prepare one notes-and-captures PR

**Files:** modify `app/src/news/content/releaseNotes.ts`, `app/e2e/releasePin.ts`, `app/e2e/news.spec.ts`, `app/e2e/screenshots.spec.ts`; retain justified updates under `docs/screenshots/`, `releases.png`, `releases-landscape.png`, `news-whats-new.png` and `news-whats-new-landscape.png`. Include this plan in the same PR.

**Consumes:** the four-merge census above and existing note registry. **Produces:** a reviewed notes PR with v0.39.1 first in News and Releases, screenshots, and an up-to-date census.

- [x] Recheck `git log v0.39.0..origin/main --oneline` and open PRs. Account for any intervening merge in the same census before preparing or approving a tag. Include the notes PR itself as packaging, with no separate item.
- [x] Change `NEWEST_RELEASE_VERSION` in `app/e2e/releasePin.ts` to `"v0.39.1"`. In the `/news/releases lists every version, newest first` test, change the count from 40 to 41, insert `await expect(versions.nth(1)).toContainText("v0.39.0");` after index 0, and increase every previous literal index 1–39 to 2–40. Keep every historical version assertion. The shared pin also drives the News and screenshot assertions; there is no second independent newest-version literal to update.
- [x] Before adding the note, run `pnpm e2e news.spec.ts --grep 'lists every version' --reporter=line` from `app/`. Expect failure because the served registry still has 40 releases and starts with v0.39.0. This command rebuilds the actual served stack.
- [x] Prepend this entry to `RELEASE_NOTES`, with a source comment accounting for #315, #317, #318 and #319 as above. Set `date` to the actual release day if it differs from this proposal. Keep shipped entries unchanged.

```ts
{
  version: "v0.39.1",
  date: "2026-09-06",
  items: [
    "Your 2K and 6K baselines are readable on You. Tap BASELINES to edit them, re-test or reset your setup. Set baselines links elsewhere now open that screen too.",
    "The Library no longer shows through the gap below the tab bar while you type. The tabs stay available with the keyboard open.",
    "Target nudges now put ▼ before ▲. Down makes the target split one second faster; up makes it one second slower.",
    "On the web, Connect stays disabled in browsers without Bluetooth support instead of opening an error screen. This applies to workouts and Just Row. Connect in the iPhone app stays available.",
  ],
},
```

- [x] Run the same scoped browser test again and require green. Run the existing news client suites with `pnpm test --project client src/news`; no new test mirroring the note strings is needed.
- [x] Run `pnpm screenshots` twice from `app/`, saving the first run outside the repo before the second so run-to-run churn can be identified. Open every image selected for the PR. Refresh News/Releases for the new note and retain any actual UI change; restore date, generated-address and rasterizer noise by explicit path after inspection.
- [x] Run `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test --project unit --project client`, `pnpm build`, `pnpm dist:grep`, and `pnpm e2e --reporter=line`. CI also runs the aggregate coverage gate. Do not reuse old-head checks as the notes PR's result.
- [ ] Before committing, run `git rev-parse --show-toplevel` and confirm the release worktree. Commit the notes, pins, plan and selected captures together. After this real change is committed, prove the existing release gate rejects both a missing new entry (40 instead of 41) and a new entry placed below v0.39.0 (wrong first version), applying each mutation separately at a unique source anchor. Rebuild and run the scoped browser test for each, record the expected failure, then precisely reverse the mutation and obtain restored green. Push one PR. The visible review is the four note strings and rendered News/Releases captures. The release authorization is recorded above; merge and publish after the concrete notes PR and its gates are ready.

## Task 2: Merge notes and cut the release

**Files:** no hand-authored version-file changes. **Consumes:** the approved notes PR and green checks. **Produces:** an annotated v0.39.1 tag containing all release notes, followed by a TestFlight upload receipt.

- [x] Verify the CLI release path and its existing authentication. `docs/RELEASING.md` and `app/scripts/ios-release.sh` use `xcodebuild -allowProvisioningUpdates` with the Apple ID already signed into Xcode. Xcode 26.6 is installed. No separate App Store Connect sign-in or API key is required for upload.
- [ ] Refresh the merge census one last time. Confirm the notes PR's current head has all required checks green, then squash-merge that approved head. Wait for main's own CI including deployment, and cross-check `curl --fail --silent --show-error https://ergomatic.waffle.haus/api/health` against the deployed commit.
- [ ] Update the main checkout with `git pull --ff-only`. Verify the notes are in main, the release branch has no unique uncommitted work, and main's existing local files are preserved. From the repository root, down this worktree's stack with `POSTGRES_PASSWORD=devpass TEST_AUTH_SECRET=e2e-secret ERGO_STACK=ergomatic-57467 docker compose -p ergomatic-57467 -f compose.yml -f compose.e2e.yml down -v`, then remove `.claude/worktrees/testflight-ui-release` and its merged branch. This exact project name was derived with `REPO_ROOT="$PWD"; source app/scripts/stack-env.sh` from the release worktree; derive it again if execution uses a different worktree.
- [ ] Confirm `git tag --list v0.39.1` is empty and the current HEAD is the intended release commit. With the release approval in hand, run from the repository root:

```bash
git tag -a v0.39.1 -m "Baselines navigation, keyboard gap and target nudge fixes"
git push origin v0.39.1
bash scripts/version.sh
```

- [ ] Record the derived VERSION, BUILD and DESCRIBE. Use a fresh detached build worktree at the tag (`git worktree add --detach .claude/worktrees/testflight-v0391-build v0.39.1`), install dependencies at its root and in `app/`, and verify its hooks before relying on them. From that worktree's `app/`, run `pnpm ios:release`. The script stamps tracked native version fields, so this keeps those generated edits out of the main checkout. After the upload, inspect and restore only those generated version changes and remove the build worktree. This is the real upload command, not a dry run. It derives the Google iOS client ID, rejects the Concept2 probe flag, builds/syncs, checks the built bundle, archives, verifies the stamped version/build and uploads internally. Save its version/build and successful upload output as the release receipt.

## Task 3: Confirm delivery and smoke-check the installed build

**Consumes:** the uploaded version/build. **Produces:** confirmation that internal testers can install the intended build and the named UI fixes work there.

- [ ] Use the CLI upload receipt and any processing status it supplies to verify delivery of the exact version/build. If separate processing or internal tester availability cannot be queried with the existing CLI authentication, report that limit explicitly; do not require a browser login or claim availability from upload success alone.
- [ ] Open News and Releases in the installed build; v0.39.1 is first and all four notes are readable.
- [ ] In portrait and landscape, open You → BASELINES, edit a baseline, return to You and confirm the displayed value agrees. Check a Set baselines link and the re-test BACK path return to the moved editor. Use a test account for edits/reset checks.
- [ ] Open Library search with the software keyboard visible, scroll, and confirm the gap below the tabs is filled. Use a tab with the keyboard open, then close it. Repeat in landscape; pinch zoom with no keyboard must not hide the navigation. The #317 native harness record supplies the earlier evidence; desktop browser gates alone do not establish this appearance.
- [ ] Open a workout and confirm ▼▲ order and the existing faster/slower effects. Check native Connect is enabled on workout detail and Just Row. In iPhone Safari, check those two buttons are disabled from first render and Start Timer remains usable. The development observer is covered by the automated parity suite and is not a TestFlight screen.
- [ ] Report the exact released version/build, processed TestFlight availability and smoke-check results. No full PM5 rowing walk is required by this UI packaging scope; any hardware connection claim would need its own observed run.

## Plan preparation record

The release worktree is `.claude/worktrees/testflight-ui-release`, branch `codex/testflight-ui-release`, based on `1cda41e7`. Its stack identity is `ergomatic-57467` (web 8367, Postgres 15367); no stack has been started during planning. Root and app dependencies are installed. The installed pre-commit hook rejected a deliberately unused TypeScript probe; that probe was precisely unstaged and removed. The proposed entry parsed as TypeScript, matched the existing note shape, and the planned version-test index transition covered all 41 positions. Execution was authorized in the next message. The four-merge census is unchanged. The served release-order gate failed first (expected 41 entries, received 40), then passed with the v0.39.1 entry present. The remaining checkboxes track release execution.

Execution receipts before mutation probes: lint, typecheck, formatting, 7,230 unit/client tests (one existing skip), production build and all eight bundle exclusions passed. Screenshot runs passed 137/137 twice. The top-of-feed News capture did not show the release card, so the existing capture now also records that card in both orientations; Releases gains a landscape view scrolled to the current entry. All four retained views were opened and inspected. Fifty-nine unrelated regenerated captures were restored. The four-note draft is unchanged.

Mutation receipts on committed notes: removing v0.39.1 failed with expected 41 / received 40; placing it below v0.39.0 failed with expected v0.39.1 / received v0.39.0. Each run rebuilt the compose web image and its distinct probe marker was found in the served `/usr/share/nginx/html/assets/` bundle. The source was precisely restored and matches its committed version.

Final local browser gate after source restoration: 522 passed. Neither mutation marker remains in the served bundle. Existing native keyboard evidence remains the hardware-specific receipt; `xcrun devicectl list devices` reports the paired iPhone unavailable for the post-install smoke check. James directed use of the existing CLI release path; the unnecessary browser sign-in request is withdrawn. `xcrun altool --help` offers build-status queries but requires separate credentials, whereas the repository's upload script uses the existing Xcode account.
