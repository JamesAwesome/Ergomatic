# PR B — the link-outs leave the app (device walk card)

> **Run every block in `bash`** — type `bash`, paste, and `exit` when done.
> These are bash snippets. Every block was pasted into this machine's fish
> (4.8.1) too and behaved the same, so this is convention, not a requirement.

**What this proves:** that tapping a Concept2 link-out on the phone opens the
phone's default browser, signed in, on the rower's own row. **Nothing in this
repo's gates can reach it:** the unit tests mock the adapter, `src/native/**`
is coverage-exempt, `pnpm e2e` runs the web arm, and CI never builds the app.
This card is the whole instrument.

**No erg. No rowing budget. ~10 minutes.** Phone, Xcode, and a Concept2
account already linked in the app with at least one row already sent.

**All commands run from
`/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk`.**

## W0 — the precondition, BEFORE the build is launched

Ergomatic's link-outs are built from the **server's own** `logbookBaseUrl`
(`api/useConcept2Link.ts`), so the host depends on what this deployment's
`C2_BASE_URL` is pointed at — `server/index.ts:124` defaults it to
`https://log-dev.concept2.com`. **Read the host off the app rather than
assuming it:** on the CURRENT installed build, open a sent row's log detail
and note which origin `View on Concept2 →` goes to.

Then, in **the phone's DEFAULT browser — not the app** — open **that** host,
and confirm the rower is signed in. Check which browser that is first
(Settings → Apps → Default Apps → Browser): the pass condition below names
Safari only because Safari is the default on this phone unless it was
changed. `UIApplication.open` honours the default-browser setting since
iOS 14, so a Chrome default would open Chrome, and that is also a PASS.

**This is the discriminator.** If Safari has no session, "opened signed in"
cannot be told apart from "opened in a sheet", and W4 cannot fail honestly.
**Record that this was checked, and which host.**

## The build

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk/app
export GOOGLE_IOS_CLIENT_ID="$(bash scripts/ios-google-client-id.sh ios/App/App/Info.plist)"
pnpm ios:build
pnpm ios:open
```

Then Run to the phone from Xcode.

- **No tunnel, no local Postgres, no `.env`.** PR B is a client-only change;
  the server is untouched. `pnpm ios:build` defaults `VITE_API_BASE` to
  `https://ergomatic.waffle.haus` (`package.json`'s `ios:build` line), which is
  the deployment the shipped surface already runs on and the one James walked
  on 2026-09-03 and 2026-09-04.
- **`GOOGLE_IOS_CLIENT_ID` does not fail loudly if unset** — `package.json`
  defaults it to empty and the build SUCCEEDS with a bundle whose native
  Google sign-in is silently dead. The `export` line above is not optional.
- **Watch for `ios-version: stamped <VERSION> (<BUILD>)`** — that line is the
  success signal for the last step. `BUILD` is `git rev-list --count HEAD`,
  so it moves with every commit on the branch — do not expect a specific
  number, only that the line appears rather than the
  "Xcode/agvtool unavailable — skipping stamp" warning. It rewrites two
  TRACKED files (`App.xcodeproj/project.pbxproj`, `App/Info.plist`) —
  expected, and restored below before anything is committed.
- **Do not release this build.**

## The seven checks

- [ ] **W1.** Ergomatic → **You** → the Concept2 card reads **`LINKED ✓`**.
      *(This is the base build's surface. PR A moves it behind a row; PR A is
      not in this PR and the card is still on You.)*
- [ ] **W2.** Open the log detail of a row already sent to Concept2. The
      CONCEPT2 block reads **`SENT`** with **`RESULT <id>`**.
- [ ] **W3.** Tap **View on Concept2 →**. **Observe which app is now in
      front, and record which of five things happened.**

  - **PASS = the default browser** (Safari on this phone unless W0 found
    otherwise). URL bar, tab bar, and a **`← Ergomatic`** chip at the top
    left. Record which browser it was.
  - **NO (a):** the sheet appears anyway — a **`Done`** button at the top
    left, no tab bar, no URL bar.
  - **NO (b):** nothing happens at all (WebKit dropped the `noopener`
    `window.open`).
  - **NO (c):** a different app opens.
  - **NO (d):** **the Ergomatic WebView ITSELF navigates to concept2.com,
    with no way back.** This is the outcome our own tree predicts:
    `log/Concept2SendBlock.tsx:181-184`'s comment on the result-link button
    says a plain `<a href>` would do exactly this — testimony that used to
    live in `adapters/externalBrowser.ts` and moved to this JSX comment when
    an earlier task in this same plan deleted that file's native branch; the
    claim itself is unchanged and still unmeasured, and Capacitor 8.5.0's own
    `decidePolicyFor` appears to contradict it, which is exactly why it gets
    a slot rather than a dismissal.

  **"It didn't open Safari" is not a record. Which of the five happened is.**
  Take a photograph or a screen capture.

- [ ] **W4.** Read the page that loaded. **PASS = the actual result** — the
      row's own numbers. **FAIL = "The user has made this result private"**,
      which is the walk's original symptom and means the cookie jar is still
      wrong.
- [ ] **W5.** Return to Ergomatic via the top-left chip. **Record what is on
      screen:** the log row still showing `SENT` / `RESULT <id>` (warm return),
      or Today (cold relaunch — iOS reclaimed the app). **Both are acceptable
      outcomes**; the point is to record which one a real return produces,
      because the approved design page §7.2 promises the first.
- [ ] **W6.** On that return, confirm the CONCEPT2 block is **still rendered**
      and has not been replaced by nothing. `useConcept2Link` re-reads
      `GET /api/concept2/link` on every foreground transition
      (`api/useConcept2Link.ts:200-215` — one effect registering `pageshow`
      and `visibilitychange`, each calling `reload()`), and a failed read makes
      `Concept2SendBlock` render `null` (`:77-79`). If it flickers, record it —
      **pre-existing behaviour that PR B makes more frequent**, not something
      PR B introduces.
- [ ] **W7 — the second call site, honestly scoped.** The no-weight refusal
      cannot be provoked at will on an account whose weight class Concept2
      already knows. **If it cannot be reached, do not claim it walked.** It
      shares one function with W3 (`Concept2SendBlock.tsx:189` and `:245` both
      call `openReadOnlyUrl`) and that identity is an INFERENCE from a two-line
      read — record it as one. If it *can* be reached, tap
      `OPEN CONCEPT2 PROFILE` and record whether the id-less `/profile` lands
      on the rower's own account now that Safari carries the session.

## Afterwards

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk
git diff --stat -- app/ios
```

That must show ONLY `project.pbxproj` and `Info.plist` (the version keys).
Then:

```
git -C /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk restore app/ios/App/App.xcodeproj/project.pbxproj app/ios/App/App/Info.plist
```

Never commit version stamps.

## Recording the walk

- [ ] Create `docs/monitor/sessions/walk-<YYYY-MM-DD>-c2-linkout/README.md`
      (the date it actually ran) and commit: the build's head SHA, W0's host
      and its signed-in check, W1-W7 each with PASS/FAIL/NOT-REACHED, **which
      of the five W3 outcomes occurred**, the W3 photograph, the W4 page, and
      W5's warm-or-cold answer. This directory is exit criterion B1's evidence
      and RF14's home for it — not the PR body.

## The branch

- [ ] **Branch A — W3 = Safari and W4 = the result. PASS.** Proceed to
      Task 4. The probe's inference is now an observation, and
      `@capacitor/browser` has no consumer.

- [ ] **Branch B — any of NO (a)-(d), or W4 shows the privacy page. FAIL.**
      **Task 4 is CANCELLED** (L6's premise is false — a branch survives, so
      the plugin may still be needed) and this PR becomes the fallback shape:

  1. **Verify the version at the moment of adding, not from this plan.**
     `npm view @capacitor/app-launcher version` and
     `npm view @capacitor/app-launcher peerDependencies`. Measured 2026-09-04:
     `8.0.1` and `{ '@capacitor/core': '>=8.0.0' }`, satisfied by
     `@capacitor/core@8.5.0`. **Re-run both.**
  2. Restore an `isNative()` branch in `openReadOnlyUrl` — **in the adapter
     layer only** (L5) — over a new `src/native/appLauncher.ts` wrapper
     reached by dynamic `import()`, following the idiom
     `src/native/keepAwake.ts` and `appLifecycle.ts` already set, including
     the `v8 ignore` block every file in that directory carries.
  3. The branch carries a comment naming **the WebKit behaviour that forced
     it and citing the walk that observed it** (exit criterion B2's second
     half), with the NO outcome recorded by letter.
  4. Add the plugin to `app/package.json`, `pnpm install`, `pnpm build`,
     `npx cap sync ios`, commit the regenerated `Package.swift`.
  5. **Re-walk from W1.** A new plugin is a new binary.
  6. Task 1's test grows a native case asserting the launcher wrapper is
     reached and `openWebInNewTab` is not — with its own mutation, its own
     recorded failure text, and its own **paste-test**, because this branch's
     code is the one block in this plan that was never run.
  7. Task 6's reconciliation shrinks: the two ROADMAP lines about
     `@capacitor/browser` stay true, and the census target changes.

  **This branch is a real outcome, not a contingency to skim.** Whichever one
  runs, the PR body says which and why.

---

## Pre-flight (RF13) — run or read in worktree
`/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk` at head
`2ddcd337` (2026-09-04)

Every command and citation in this card was executed, or read against the
code that serves it, at this head before the card reached James. RUN =
executed on this machine today. READ = checked against the named source at
this head.

| # | Command / claim | RUN or READ | What it printed / what the code says |
| - | --------------- | ----------- | ------------------------------------ |
| 1 | `git rev-parse HEAD` | RUN | `2ddcd33770853d8a628799c11c75334d21745d04` — the head this card is checked against. |
| 2 | `package.json:29` (`ios:build`) | READ | `VITE_API_BASE=${ERGOMATIC_API_BASE:-https://ergomatic.waffle.haus} VITE_GOOGLE_IOS_CLIENT_ID=${GOOGLE_IOS_CLIENT_ID:-} vite build && npx cap sync ios && bash scripts/ios-version.sh`. Both env mappings and the empty default match the card's claims exactly. |
| 3 | `package.json:30` (`ios:open`) | READ | `npx cap open ios`. Exists as claimed. |
| 4 | `scripts/ios-version.sh` (whole file) | READ | `cd "$(dirname "$0")/.." ; eval "$(bash ../scripts/version.sh)"`, then a guard — `command -v agvtool` and `xcode-select -p \| grep -q Xcode` — that on failure prints `ios-version: Xcode/agvtool unavailable — skipping stamp (VERSION=$VERSION BUILD=$BUILD)` and exits 0, or on success runs `agvtool new-marketing-version`/`agvtool new-version -all` and prints `ios-version: stamped $VERSION ($BUILD)`. |
| 5 | `command -v agvtool` | RUN | `/usr/bin/agvtool` |
| 5 | `xcode-select -p` | RUN | `/Applications/Xcode.app/Contents/Developer` — so the guard passes and the stamp line WILL print rather than the skip warning. |
| 6 | `bash scripts/version.sh` (from the worktree root) | RUN | `VERSION=0.37.0` / `BUILD=857` / `DESCRIBE=v0.37.0-9-g2ddcd337` at this head. **Not printed in the card body** — `BUILD` is a commit count and will already differ by the time the walk runs, which is why the card states the mechanism instead of a number. |
| 7 | `bash scripts/ios-google-client-id.sh ios/App/App/Info.plist` | RUN | `896004543555-9m5cf46vdgf57dv1r68u7stad6ngi304.apps.googleusercontent.com` (exit 0) — the value the `export` line in the card's build block assigns. |
| 8 | **The whole build block, end to end**: `export GOOGLE_IOS_CLIENT_ID=...` then `pnpm ios:build` | **RUN** | Real build. Output ended `ios-version: stamped 0.37.0 (857)` — exactly the mechanism the card describes, matching line 6's `bash scripts/version.sh` output at this head. `npx cap sync` logged `Podspec already up to date` / `Package.swift already up to date` (no dependency change from this card — expected, since Task 4 has not run). |
| 9 | `git status --short` (worktree root) before and after step 8 | RUN | Clean before. After: exactly `M app/ios/App/App.xcodeproj/project.pbxproj` and `M app/ios/App/App/Info.plist` — nothing else. Matches the card's "Afterwards" claim ("must show ONLY `project.pbxproj` and `Info.plist`") verbatim. |
| 10 | `git diff --stat -- app/ios` after step 8 | RUN | `app/ios/App/App.xcodeproj/project.pbxproj \| 4 ++--` and `app/ios/App/App/Info.plist \| 4 ++--`, 2 files changed. |
| 11 | `git -C <worktree> restore app/ios/App/App.xcodeproj/project.pbxproj app/ios/App/App/Info.plist` | RUN | Ran after step 8/10; `git status --short` returned to clean. The card's exact restore line works as written. |
| 12 | `server/index.ts:124` | READ | `const c2BaseUrl = process.env.C2_BASE_URL \|\| "https://log-dev.concept2.com";` — matches W0's claim exactly. |
| 13 | `src/log/Concept2SendBlock.tsx:97-98,108` (`logbookBaseUrl` consumption) | READ | `link.logbookBaseUrl !== null ? c2ResultUrl(link.logbookBaseUrl, ...) : ...` and the profile-URL equivalent — confirms the client's link-out URL is built from the server-sourced `logbookBaseUrl`, as W0 states. |
| 14 | `src/log/Concept2SendBlock.tsx:112` (`"SENT"`) | READ | `? "SENT"` — matches W2. |
| 15 | `src/log/Concept2SendBlock.tsx:137` (`CONCEPT2`) | READ | `CONCEPT2` block label — matches W2. |
| 16 | `src/log/Concept2SendBlock.tsx:207` (`RESULT {resultId}`) | READ | `` {resultId !== null && <p className="c2-send-foot">RESULT {resultId}</p>} `` — matches W2. |
| 17 | `src/you/Concept2Card.tsx:281` (`LINKED ✓`) | READ | `: "LINKED ✓"` — matches W1. |
| 18 | `src/log/Concept2SendBlock.tsx:181-184` | READ | **CARD CORRECTED.** At this head the JSX comment reads: `/* A BUTTON, not an anchor: inside the Capacitor WebView a plain `<a href>` drives the WebView itself to concept2.com with no way back (`adapters/externalBrowser.ts`'s own note on `openReadOnlyUrl`). 44px hit row. */`. The comment's OWN internal citation to `adapters/externalBrowser.ts` is itself stale (see row 19) — the card cites this JSX comment directly instead, since it is where the testimony currently lives, not the file that comment points at. |
| 19 | `src/adapters/externalBrowser.ts` (whole file, 52 lines) | READ | The file no longer contains the "plain anchor drives the WebView ITSELF to concept2.com" sentence at all — it was removed when the prior task in this plan (commit `2ddcd337`, "delete the in-app browser branch") rewrote this file to drop its native branch. `git show 718fd5b5:app/src/adapters/externalBrowser.ts` (the commit before that rewrite) shows the sentence at exactly `:75-77`, confirming it moved rather than never existed. **The card's original NO (d) citation (`adapters/externalBrowser.ts:75-77`) is stale at this head and has been corrected in this card to cite `Concept2SendBlock.tsx:181-184` instead.** |
| 20 | `src/api/useConcept2Link.ts:200-215` | READ | `useEffect(() => { void reload(); ... window.addEventListener("pageshow", onPageShow); document.addEventListener("visibilitychange", onVisibility); return () => {...}; }, [reload]);` spans exactly lines 200-215. Matches W6. |
| 21 | `src/log/Concept2SendBlock.tsx:77-79` | READ | `if (failed !== null \|\| link === null \|\| !link.available \|\| !link.linked) { return null; }` spans exactly 77-79. Matches W6. |
| 22 | `src/log/Concept2SendBlock.tsx:189` and `:245` (`openReadOnlyUrl` call sites) | READ | `grep -n "openReadOnlyUrl(" src/log/Concept2SendBlock.tsx` returns exactly `189:` and `245:`. Matches W7. |
| 23 | `src/log/Concept2SendBlock.tsx:191` (`View on Concept2 →`) and `:247` (`OPEN CONCEPT2 PROFILE`) | READ | Both strings present verbatim at those lines. |
| 24 | `npm view @capacitor/app-launcher version` / `peerDependencies` | READ (inherited from the plan, dated 2026-09-04) | `8.0.1` / `{ '@capacitor/core': '>=8.0.0' }`, satisfied by this repo's `@capacitor/core@8.5.0`. Branch B's step 1 re-runs both at the moment they are actually needed, per the standing rule. |
| 25 | Every block is bash; the card says so up top | READ | Every fenced block uses `cd`, `export`, `pnpm`, `git diff`, `git -C ... restore` — all valid bash. |
| 26 | The blockquote's fish claim, checked against the actual shell on this machine | **RUN**, `fish -c '...'` | `fish --version` = `4.8.1`. Contrary to this repo's `.claude/agent-briefing.md` and older walk cards, **`export FOO=bar` and the `VAR=value cmd` prefix form both WORK in this fish** (`fish -c 'export FOO="bar"; echo $FOO'` → `bar`; `fish -c 'FOOBARBAZ=hello env \| grep FOOBARBAZ'` → `FOOBARBAZ=hello`), and fish 4.8.1 also accepts bash's `$(...)` command substitution as an alias for its own `(...)` (`fish -c 'export X="$(bash scripts/ios-google-client-id.sh ios/App/App/Info.plist)"; echo $X'` printed the real client id). This matches `docs/superpowers/audits/2026-09-02-harden-skill-lens2-test.md:421`'s already-recorded finding, not the broader "export/VAR=value are not fish" claim in the agent briefing. **This card's specific blocks (`cd`, `export ...=$(...)`, `pnpm ...`, `git ...`) contain none of the constructs that actually DO fail in this fish** (`set -a; . file; set +a` and bare `unset`, per the same audit) — so nothing in this card would behave differently if pasted straight into fish. The card still says "run in bash" per this repo's standing convention for walk cards; the "type bash, paste, exit" instruction is followed as directed and doubles as a safety margin against the two constructs that DO fail, even though none of them appear here. |
| 27 | The full build+restore sequence, run via `bash` invoked from inside `fish` (simulating "type bash, paste, exit") | **RUN** | `fish -c 'bash -c "cd .../app; export GOOGLE_IOS_CLIENT_ID=\"\$(bash scripts/ios-google-client-id.sh ios/App/App/Info.plist)\"; echo ...; pwd"'` printed the real client id and the correct `pwd`, exit 0. The afterwards block (`git diff --stat`, `git -C ... restore`) run the same way also completed with exit 0 and left the tree clean. |
