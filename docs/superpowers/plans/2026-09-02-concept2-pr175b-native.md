# Wave E PR1.75b — the native half of the authenticated Concept2 link (implementation plan)

> **RECORD, not an instruction — this plan was executed and merged (#277).**
> Two things it prescribes are now superseded and are deliberately NOT
> rewritten here: the probe line `not available (C2_LINK_ENABLED is off)`
> (Task 4's prescribed `Concept2LinkProbe.tsx` block, and the walk card's
> read-the-card guidance it quotes) became `not available (C2_LINK_ENABLED
> off, or not on C2_ALLOWED_EMAILS)` when the per-user gate landed on
> 2026-09-04
> (`docs/superpowers/specs/2026-09-04-concept2-per-user-gate.md`), since the
> flag stopped being the only reason a server answers `{available:false}`.
> The source is the authority on what the app says; this file is the
> authority on what was built and why.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**REV 12** — 2026-09-02: **antagonist DELTA pass 11 folded** (an eleventh verification pass, and the first to check the plan's prescribed source with the REPO's gates instead of the plan's own). The class it found had survived ten passes for one reason: every earlier pass validated the code blocks with `prettier --check`, which is the one gate that cannot fail on semantics. Placing all six prescribed TS/TSX blocks at their real paths and running `pnpm typecheck` and `pnpm lint` produced two REVISE items that are paste-readiness defects, not design defects (the prescribed TESTS pass against the prescribed IMPLEMENTATION — 19/19, 11/11 and 4/4 green): (1) Task 4 step 1's `mockLink` declared `vi.fn(async () => …)`, zero parameters, so the re-read test's `api.mock.calls.filter((c) => c[0] === "/api/concept2/link")` died `TS2493: Tuple type '[]' of length '0' has no element at index '0'` — corrected to `vi.fn(async (_path: string) => …)` (underscore-prefixed, or it fails `noUnusedParameters` and `no-unused-vars`), with the reason recorded in the block itself; every other `vi.fn(` in that file and in `linkFlow.test.ts` was re-checked for the same arity gap and none has it, the sibling file having declared `(path, init)` from the start. (2) Task 4 step 3's `readStatus` was a `useCallback(async …)` that sets state, called from `useEffect(() => { void readStatus(); })` — `react-hooks/set-state-in-effect` (live repo-wide, `eslint.config.js:35`) rejects it, because an `async` function's pre-`await` body runs synchronously inside the effect. Rewritten to the repo's own established mount-fetch idiom (`WorkoutDetail.tsx:52`, `void f().then(cb)`): a non-async `api(...).then(res => res.json()).then(s => {…}).catch(() => …)`, every `setState` in a callback, cloudflared rationale kept and extended with the lint reason. Because that changed the function's SHAPE, Task 4 step 9's dependent mutation row was rewritten too — the mutation is now "delete the `.catch(…)` clause" and the `try {}`-is-a-SyntaxError rationale is gone; both rows were re-run against the placed blocks and both still bite (2 failed of 11, same assertion text), with the unhandled-rejection pair now named as what distinguishes them. Plus (3) Task 1 step 4's Info.plist rationale paragraph still argued the census's `appUrlOpen` expectation as "0 under `app/src` and `app/ios`" — the used-fixed/argued-stale direction of pass 6's own fix, corrected to match the table (0 under `app/src`, the tripwire, plus exactly one prose hit under `app/ios`); no other site carries the stale phrasing. And a nit: step 3b's example human-read line said "all 19 surviving `browserFinished` hits" where the table sums to 25. Task 9 gains one agent-config candidate: CLAUDE.md's `pnpm exec vitest run --project client <file>` footgun's DIAGNOSIS was wrong (corrected at #277's PM gate: the footgun is real; mechanism = the dropped `NODE_OPTIONS=--no-experimental-webstorage`; the plan's uses carry the prefix), landed in CLAUDE.md at the merge. Pass ledger: `.claude/agents/antagonist-ledger.md`, entry `2026-09-02 — Wave E PR1.75b native plan (DELTA pass 11, the whole-plan consistency lens)`. **Attacked and held:** all five of pass 10's folds, every cell of the census table against a live run, the leader-strip red proof corpus-wide, and the six recounts (prettier 4-of-6 and precisely the four named — still exactly those four after this pass's edits, re-measured; `browserFinished` = 52 split 3/1/1/14/33; 14 reject lines; fold 120/24; `fails=5`; RF5 = 5). **The lesson to carry, now demonstrated ten times: a fix is not evidence that the defect is gone** — and a plan that prescribes source is making a claim about the repo's gates, not about its own prose.

**REV 11** — 2026-09-02: **antagonist DELTA pass 10 folded** (a tenth verification pass, over REV 10's own fix, found by re-running the previous pass's own token list against the sources it never re-measured). One REVISE item: pass 9's fix (folded at REV 10) claimed the RF5 sweep's only surviving hits were the three lines inside Task 3's own two files (`externalBrowser.ts`'s replacement header, `appLifecycle.ts`'s appended sentence) — FALSE, there are FIVE: Task 2 step 4's `linkFlow.ts` header and Task 4 step 3's `Concept2LinkProbe.tsx` doc comment each carry `useReturnToApp` too, and the sweep step's own escalation clause ("Any other hit is dead prose or a dead import: fix it here") would have directed an implementer to strip two sentences the plan deliberately prescribes, including its own stated retirement rationale. Settled by extracting every prescribed `app/src` fence to files and running the sweep command verbatim against them: 5 lines across 4 files (measured 2026-09-02). Corrected: Task 4 step 4's RF5 sweep now names all five lines by provenance (Task 2 step 4's `linkFlow.ts` header; Task 3 step 3's `externalBrowser.ts` replacement header, two lines; Task 3 step 4's `appLifecycle.ts` appended sentence; Task 4 step 3's `Concept2LinkProbe.tsx` doc comment), and a guard sentence is added at Task 2 step 4 and Task 4 step 3 (beside the existing census-token guard) so new prose at either site cannot silently reintroduce a token beyond the five the sweep names. Plus two nits: (1) REV 10's own header paragraph and Task 9's antagonist bullet cited the plan's OWN line numbers (`:41`, `:292-296`, `:1674`, `:1678`, `:1705`), and prepending the REV 10 paragraph moved every one of them by +2 in the same commit that wrote them — plan-internal line citations cannot survive their own fold, so every such citation in the REV history paragraphs and in Task 9 is now cited by provenance (Task/step/symbol) instead; `file:line` citations into `app/`, `docs/` and the SDK are unchanged. (2) Task 2 step 6's `webauth-contract` census had no stated reason it is the ONLY instrument for the JS↔Swift string contract — now cites RF19 (CLAUDE.md) by name: `src/native/**` is coverage-excluded, there is no XCTest target, and `pnpm e2e` runs on web, so this committed census test is the sole gate that can see a typo in this contract. Pass ledger: `.claude/agents/antagonist-ledger.md`, entry `2026-09-02 — Wave E PR1.75b native plan (DELTA pass 10, verifying pass 9's fixes)`. **Attacked and held:** the whole thread-confinement chain re-read in the iOS 26.5 SDK (`WKNavigationDelegate.h:69-70`, `WKFoundation.h:59-60`, `NSObjCRuntime.h:253`, `WebViewDelegationHandler.swift:7,67,82`), with every clause of the REV 10 comment accurate including its corrected framework attribution; ten further citations spot-checked verbatim across `ASWebAuthenticationSession.h`, `CapacitorBridge.swift`, `CAPPlugin+LoadInstance.swift`, `CAPBridgeViewController.swift` and `project.pbxproj`; the Global Constraint and the Swift header confirmed to enumerate the same four source categories; `pnpm format` measured unable to reach the scope gate (`.prettierignore` excludes `ios`/`dist`/`drizzle`, and `pnpm format:check` is green at `cdcfee41`); the pass count consistent at both live sites; and the design↔plan seam closed in both directions, with every §0/§2/§4/§Testing/exit-4/6(a)/8 requirement mapped to a task and all three scope-creep items carrying a named rule. **The lesson to carry, now demonstrated nine times: a fix is not evidence that the defect is gone.**

**REV 10** — 2026-09-02: **antagonist DELTA pass 9 folded** (a ninth verification pass, over REV 9's own fixes, found by testing the surviving universal rather than the two claims that triggered pass 8). One REVISE item: pass 8's fix widened the Swift header's citation rule to four source categories where it is USED (the `WebAuthPlugin.swift` header doc comment, Task 1 step 5) but not where it is ARGUED (the Global Constraint, the citation rule bullet, still three — missing "the vendored Capacitor sources by file:line", the category the `shouldOverrideLoad` comment leans on hardest), and REV 9's own summary sentence claimed the two now "mirror … exactly" when they did not. Re-testing the relaxed universal against every claim it governs (not only the two that triggered pass 8) found the uncited premise it exists to catch, still live: `// shouldOverrideLoad(_:) is a WKNavigationDelegate callback, which UIKit already delivers on main` cites nothing, is the whole thread-confinement argument for the RF27 table's four fields, names the wrong framework (WebKit, not UIKit, ships the delegate), and mis-describes a `CAPPlugin` method as a delegate callback (`WebViewDelegationHandler.swift:67` -> `:82`). Corrected with the identical idiom the plan already uses one observation away: `WKNavigationDelegate` is declared `WK_SWIFT_UI_ACTOR` (`WebKit.framework/Headers/WKNavigationDelegate.h:69-70`, iOS 26.5 SDK, read 2026-09-02), `#define`d `NS_SWIFT_UI_ACTOR` at `WKFoundation.h:60` — WebKit, not UIKit, delivers the callback on the main actor. The Global Constraint now enumerates the same four categories the header uses. Every other Apple-behaviour comment in the prescribed Swift (grepped for "main", "thread", "actor", "delivers", "calls", "retain", "weak", "deallocat", "fires", "once") was re-checked against those four categories, with no further uncited survivor of this class. Plus two nits: (1) a plan that predicts `format:check → green` is a measurable claim about its own prescribed code, and four of six extracted blocks fail `prettier --check` (pure re-wrapping, no literal or census phrase moves) — Task 2 step 5 and Task 4 step 4 now run `pnpm format` over the new/changed files before `pnpm lint`/`typecheck`/`format:check`, so the diff reviewed equals the diff committed rather than the one the pre-commit hook silently rewrites; (2) Task 4 step 4's RF5 sweep said the only surviving hits "may be the two narrative sentences added in Task 3 steps 3-4," when the plan's own prescribed text leaves three grep lines in two files (Task 3 step 3's `externalBrowser.ts` replacement header, two lines, and Task 3 step 4's `appLifecycle.ts` appended sentence, one line) — corrected to name the three lines exactly; nothing was wrongly deleted, this is the same off-by-one class as passes 6 and 7. Pass ledger: `.claude/agents/antagonist-ledger.md`, entry `2026-09-02 — Wave E PR1.75b native plan (DELTA pass 9, verifying pass 8's fixes)`. **Attacked and held:** the step-1 block run against a scratch copy pointed at the real `app/scripts` (20 pre-existing `ok`, `fails=5`, exactly as REV 9 states); `:246` as the summary-block anchor on the current 250-line file; `git status --short -- app/ios` at both live sites; the census guard at all three sites naming both tokens; the pass count at both live sites; the fold at 120/24 words; `94b83c84` confirmed as the commit before the plan file was added and an ancestor of HEAD; the `/tmp/pr175b-base` lifecycle and step 6b's placement; Task 5's gate order; every walk-card citation verbatim; `no-non-null-assertion` absent from tseslint `recommended`; `NATIVE_REDIRECT_URI` at `routes/concept2.ts:67` matching the contract test's regex; and `Concept2LinkProbe.test.tsx` loading cleanly with `toHaveBeenCalledExactlyOnceWith` already in use elsewhere. **The lesson to carry, now demonstrated eight times: a fix is not evidence that the defect is gone.**

**REV 9** — 2026-09-02: **antagonist DELTA pass 8 folded** (an eighth verification pass, over REV 8's own fixes). Two REVISE items, both found by running something the plan only asserted, not by reading it: (1) Task 1 step 2's failing-test-first claim, "the six new checks FAIL," is false before implementation — only FIVE do. The third check (`[ "$rc" -ne 0 ]` on a script that does not exist yet) passes vacuously: `bash <missing file>` exits 127, indistinguishable from the correct refusal it is meant to prove later, so a check whose assertion is "exits non-zero", "returns empty" or "is absent" can never by itself be part of a red proof. The step is corrected to name the real count, the vacuous check, and the NEXT check as the actual discriminator (it fails on the `No such file or directory` text), with all six lines to be recorded (measured 2026-09-02: `fails=5`). (2) Pass 7's own fold widened the SDK-header citation rule in the Global Constraints, but the argument never reached the code it governs: the prescribed `WebAuthPlugin.swift` header still read "Every Apple-behaviour claim below quotes the SDK header … by line," which two of its own comments below it violate (the bare-scheme guard rests on a labelled SECONDARY developer-forums post — no header line exists to quote; the `shouldOverrideLoad` comment cites WebKit/Capacitor sources, not the header). Reworded to widen the header to four source categories (SDK header line, class documentation, the vendored Capacitor sources by file:line, a labelled SECONDARY forum post); the Global Constraint (the citation rule bullet) was NOT brought to the same four categories until REV 10. Every other prescribed code block was re-grepped for the relaxed absolutes ("every", "only", "by line", "always", "never") with no further survivor of this class. Plus a nit: Task 9's `git status -- app/ios` "must be empty" corrected to the `--short` form, which is the one that actually reads empty on a clean tree; and a guard added to Task 7, whose fold edits touch `linkFlow.ts` and `WebAuthPlugin.swift` inside the plan's own task order — replacement prose there must not reintroduce a census phrase, and the existing `browserFinished` warnings (Task 2 step 4, the census row) are extended to name `appUrlOpen` too, with step 6b's diff named as the actual check. Pass ledger: `.claude/agents/antagonist-ledger.md`, entry `2026-09-02 — Wave E PR1.75b native plan (DELTA pass 8, verifying pass 7's fixes)`. **Attacked and held:** the whole census re-run once more, per phrase, against every prescribed insertion and code block, with the 2→3 and 1→2 residual cells confirmed exact and two apparent extra hits traced to extraction artefacts; `ios-version.sh:14`, `Main.storyboard:14` and the `Info.plist:21-30` fragment byte-identical to the plan's replacements; all four `project.pbxproj` anchors and the seven existing id prefixes; Task 1's commit staging zero lint-staged-matching files; no Xcode state required that a fresh engineer lacks; `linkFlow.test.ts` loading cleanly in the jsdom `client` project with no zero-collection trap; `eslint.config.js:89-90` still exact. **The lesson to carry, now demonstrated seven times: a fix is not evidence that the defect is gone.**

**REV 8** — 2026-09-02: **antagonist DELTA pass 7 folded** (a seventh verification pass, over REV 7's own fixes). Three REVISE items, each found by re-running the previous pass's own reasoning one column over: (1) pass 6 re-counted `browserFinished`'s three record-edit residuals exactly right but never re-counted the OTHER phrase living inside that same prescribed ROADMAP Status block — step 4's replacement text also contains `appUrlOpen` once ("...NOT a URL scheme + `appUrlOpen`"), so the PERMANENT row's ROADMAP residual is 2→3 and step 6b's gate diff would have emitted an unpermitted line; the row's residual cell and step 6b's permitted set are both corrected, and every other census phrase was re-audited against steps 4-6's own prescribed text with no further hit. (2) The walk card's `pnpm ios:build` (§4) ends in `scripts/ios-version.sh:12-13`, which rewrites two TRACKED files (`project.pbxproj`, `Info.plist`) with tag-derived version stamps — the Global Constraints already state the rule and the required `git restore`, but the card, the plan's only invocation of the command, carried neither, and Task 9's SDLC check named those same two files as pre-existing dirt in the MAIN checkout only. §4 now names `ios-version: stamped …` as the success signal, §7 adds the restore (a scoped `git diff --stat` then `git restore`), Task 6 step 4's commit is gated on `git status --short -- app/ios` reading empty, and Task 9's SDLC bullet adds the same check for the WORKTREE. (3) Check (d)'s optional WebContent-termination variant is, by the plan's own words, the only thing that can settle the `shouldOverrideLoad` comment's own `INFERENCE, not measured` claim — it had no bullet in the §6 report contents and no row in Task 7's fold, so a measurement taken on the walk would have left the INFERENCE wording standing in shipped code; both are added. Plus seven nits: the SDK-header citation rule widened to name any labelled source (class documentation, a labelled SECONDARY forum post), not only a header line; card (b)'s unlink workaround deleted, keeping only the re-link citation (`routes/concept2.ts:212-277`); a caveat added at the card's and the probe's own `cancelled`+`linked` explanation that on THIS walk a web-callback completion cannot occur (the tunnel callback is unregistered at Concept2) and the `auth_via` lines are the authority; card (d) now opens with tapping Start real link before the reload; card §1 notes the long-lived `erg-dev-pg` container may already hold port 5433 and gives the two ways around it; card §5 locates the probe card precisely (second from the bottom, above the diagnostics row); and the §6 report contents add the `auth_disagreement` line beside `auth_via`. Pass ledger: `.claude/agents/antagonist-ledger.md`, entry `2026-09-02 — Wave E PR1.75b native plan (DELTA pass 7, verifying pass 6's fixes)`. **Attacked and held:** all four of pass 6's folds (the `linkFlow.ts` header and every prescribed `app/src` block re-grepped for `browserFinished`, 0 hits; the single permitted `app/ios` `appUrlOpen` hit; step 6b's placement and all three `browserFinished` post-edit counts re-derived; the `/tmp/pr175b-base` worktree lifecycle created once, reused, removed once) plus the census mutation RUN with a required survivor (`posts nothing and carries no client id` drops 1→0 while `never a real link` holds at 1); and, newly verified PRIMARY, the whole (d) inspector chain (`debug.xcconfig:1` → `project.pbxproj:187,308` → `Info.plist:5-6` → `CAPInstanceDescriptor.swift:144`/`CapacitorBridge.swift:31,458` `isInspectable`, documented at `CAPInstanceDescriptor.h:102`) and `POST /connect`'s (`routes/concept2.ts:212-277`) missing already-linked refusal. **The lesson to carry, now demonstrated six times: a fix is not evidence that the defect is gone.**

**REV 7** — 2026-09-02: **antagonist DELTA pass 6 folded** (a sixth verification pass, over REV 6's own fixes). Four REVISE items, all census/gate-shape, no new ground: (1) the retirement census's `browserFinished` row expected 0 under `app/src`, but Task 2 step 4's own prescribed `linkFlow.ts` header comment contained the literal token — the header is reworded to describe the retired arm without spelling it, one sentence is added at both Task 2 step 4 and the census row warning that new prose must not reintroduce the token (`onBrowserFinished`, capital-B, is safe because it does not match), and every other prescribed code block under `app/src` was re-grepped for the lowercase form with no further hit. (2) The PERMANENT `appUrlOpen` row expected 0 under `app/src` AND `app/ios`, but Task 1 step 5's own prescribed `WebAuthPlugin.swift` doc comment contains it — both counts were measured against the pre-PR tree, where the new files did not yet exist, so the table was true when written and false the moment the plan executes; the row's expected cell now reads 0 under `app/src` (the tripwire) plus exactly ONE permitted prose hit under `app/ios` (the plugin's own "why not a URL scheme" rationale, an argument about the alternative, not a listener), and that line is added to step 3b's permitted-diff list. (3) The base-vs-head census diff (step 3b) sat BEFORE steps 4-6, which each add a `browserFinished` sentence to a record document — `ROADMAP.md`'s Status block (1→2), and the two PR1.5 documents' HISTORICAL notes (`…pr15-native-link.md` 3→4, `…pr15-walk.md` 7→8) — so the diff either judged a tree the PR does not ship or would have reported its own prescribed edits as defects; a new Step 6b re-runs the SAME diff after step 6 as the actual gate, permitting those three residual lines by exact before-to-after count, and the `browserFinished` table row's residual counts and pass-condition sentence are corrected to match. (4) Step 2's census red-proof mutation ("delete the `sed -E` leader-strip") leaves `norm() { | tr … }`, a bash syntax error that exits 2 with NO output — every hit "disappears" and the probe reads red for the wrong reason; the mutation is now a full-function replacement (`norm() { tr -s '[:space:]' ' ' < "$1"; }`), re-run against `/tmp/pr175b-base`, and the red proof now requires a SURVIVOR: `posts nothing and carries no client id` must disappear while `never a real link` (same file) must still report 1, so a tool crash can no longer be mistaken for a bite. Plus a locator nit (the eslint `no-restricted-imports` citation is Task 2 step 5, not Task 4 step 5) and an attribution nit (the "only the calling app's session" Swift comment is cited to Apple's class documentation, PRIMARY, design §Research — not the SDK header, which does not carry the sentence). Pass ledger: `.claude/agents/antagonist-ledger.md`, entry `2026-09-02 — Wave E PR1.75b native plan (DELTA pass 6, verifying pass 5's fixes)`. **Attacked and held:** all six of pass 5's folds (pass counts consistent at both sites; the baseline-tree probe run end to end and biting, `never a real link` surviving; `eslint.config.js:89-90`; `You.tsx:19-20`'s `DEV ||` OR; observation 10's grep list exact); ~30 fresh citations across `concept2.ts`, `middleware.ts`, `index.ts`, `auth/routes.ts`, `project.pbxproj` (all four anchors + thirteen settings lines), `Main.storyboard:14`, `dist-grep.sh`, `ios-release.sh/.test.sh`, `ci.yml`, `phase-lt.md`, the gate doc's three markers, `ROADMAP.md:1086-1095`; the Swift's two compile-blocking signatures verified in the vendored sources; `compose.yml:61-64` never exporting `VITE_ENABLE_C2_LINK_PROBE`; and the "only the calling app's session" guarantee traced to design §Research `:73` (PRIMARY, developer.apple.com) rather than the SDK header. **The lesson to carry, now demonstrated five times: a fix is not evidence that the defect is gone** — the census gates meant to prove the plan's OWN edits sound were themselves computed against the wrong tree and the wrong ordering.

**REV 6** — 2026-09-02: **antagonist DELTA pass 5 folded** (a fifth verification pass, over REV 5's own fixes). Two findings: (1) Task 8 step 2's census red proof said "delete the leader-strip and re-run: the wrapped hit disappears" without naming the TREE the probe runs against — true at the pre-1.75b baseline, a guaranteed no-op at the PR head, because the leader strip changes exactly one count corpus-wide (`Concept2LinkProbe.tsx`'s wrapped `posts nothing and carries no client id`) and Task 4 rewrites that very file, so dropping the strip at the head changes nothing. Step 2 now runs both probes explicitly against `/tmp/pr175b-base` (the detached pre-1.75b worktree step 3b creates), with that worktree's creation pulled forward into step 2 so the order is buildable and step 3b reuses it rather than recreating it; the Swift-fixture red proof is unchanged. (2) Task 9's own pass-count bullet and the PR Record's risk line still read "THREE DELTA passes … folded at REV 2, REV 3 and REV 4" after REV 5 had already folded a fourth — corrected to FIVE, folded at REV 2–6, with a sentence added noting the count is re-stated at every fold and must be grepped before the PR opens. Three further items were mechanical drift, all HELD as findable but none new ground: `eslint.config.js:86-89` had drifted to `:89-90` (Task 2 step 5's `no-restricted-imports` citation); `You.tsx:19-20`'s probe gate reads `import.meta.env.DEV || import.meta.env.VITE_ENABLE_C2_LINK_PROBE === "1"` — an OR, corrected where Task 5's screenshots bullet said "and"; two stale step cross-references (Task 5's screenshots argument has no numbered steps, so "step 6" is now "Task 5's final checkbox"; the Self-review's "T2 step 7" pointed at the per-file-coverage step, not the mutation table it describes, corrected to "T2 step 8"); and observation 10's `c2-link-probe` grep list was missing its own file's prose hit (`Concept2LinkProbe.tsx:22`). Pass ledger: `.claude/agents/antagonist-ledger.md`, entry `2026-09-02 — Wave E PR1.75b native plan (DELTA pass 5, verifying pass 4's fixes)`. **Attacked and held:** all three `describeStatus` orderings re-run in Node (correct green/green, the old reorder green on re-read, the bottom-move red on both); the ROADMAP `:1120-1127`/`:1128` boundary verbatim; the four ephemeral-precondition sites, with a NO now reachable; the fold at 120/24 words; every mutation table's target committed before its probe; and gate (a)'s pass value of `1`, counted against a real Sources-phase member (`grep -c 'App/AppDelegate\.swift$'` in `App.SwiftFileList` → `1`). ~40 `file:line` citations re-read at this head; the eslint drift above was the one that moved.

**REV 5** — 2026-09-02: **antagonist DELTA pass 4 folded** (a fourth verification pass over REV 4's own fixes). Three of the five items were REVISE and all three were gate-shape rather than new ground: (1) Task 4 step 9's `describeStatus` re-read mutation named the wrong destination — moving the `statusError` check only below `status === null` still returns `unreadable` on the re-read path (measured 2026-09-02 in Node: `statusError` is still checked before `!status.available`), so the test stayed GREEN and would have been logged as biting when it was not; the row now names the destination that actually bites, below `!status.linked` and immediately above the final `linked (...)` return. (2) Task 8 step 4's ROADMAP Status-block citation (`:1120-1128`) included the first line of the NEXT bullet — `ROADMAP.md:1128` is the PR2 row, not part of the Status block being replaced; corrected to `:1120-1127` with the boundary stated explicitly so a future edit does not re-absorb it. (3) The walk card told the operator in check (a) that the sheet "should ask you to log in even if Safari already has a Concept2 session," but no earlier step ever signs Safari into Concept2 — so on the fresh phone the card describes, being asked to log in is exactly what a NON-ephemeral, broken session would also produce, proving nothing. Added a Safari sign-in precondition to "Before you start," turned the bullet into an explicit YES/NO **RECORD** with a stated FAIL reading, and carried the same line into the §6 report contents and into Task 7's fail rows (a NO is now a named (a) FAIL, not a footnote). Two further fixes rode the same pass: (4) the same finding noted the PR fold's third bullet oversold this behaviour as a "named outcome" a rower sees, when walk case (d) itself says the `abandoned` outcome does NOT render on the card — reworded to what the walk actually observes (cancel and decline each get a named outcome; a reload frees the app to relink), fold re-counted at 120 words above the fold, longest bullet unchanged at 24; (5) Task 2 step 6's `webauth-contract` red proof said "against the committed tree" while the tree it reads (`WebAuthPlugin.swift`, `webAuth.ts`, `linkFlow.ts`) is not a committed whole until Task 4 step 8 — its two probes are deferred to run there, alongside Task 4 step 9's own table, so the Self-review's "every mutation probe runs AFTER the commit carrying the code it targets" is actually true rather than aspirational. Pass ledger: `.claude/agents/antagonist-ledger.md`, entry `2026-09-02 — Wave E PR1.75b native plan (DELTA pass 4, verifying pass 3's fixes)`. **Attacked and held, no new ground:** the busy test's Node simulation; the emptied-`dist/` build→sync→list sequence; `census.sh`'s exit 0 and both e2e greps; `ios-google-client-id.sh`'s five cases; migrations running at boot; and an attack on check (c) — an existing Concept2 grant does NOT suppress the consent screen (the 08-31 crossconnect authorized user 2211 on the same client, and D3 on 09-02 still rendered the authorization prompt).

**REV 4** — 2026-09-02: **antagonist DELTA pass 3 folded** (a second verification pass, over REV 3's own fixes, and it found the same defect classes one layer up). One BLOCKING test defect: Task 2's `busy` test could not pass on CORRECT code, let alone die on the mutant — `release(...)` fired one microtask after `await startLink()`, while the first attempt was still inside `await res.json()`, so `WebAuth.start` had not been called and the release landed on a resolver that did not exist yet; `await first` then hung, and so did the third `await startLink()`, which was waiting on a fresh never-resolved promise from the same one-shot `release` variable. It is now arm-detection (`releases` array + `vi.waitFor(() => expect(releases).toHaveLength(n))`), simulated in Node 26 before shipping: the old form hangs, the new one passes. One BLOCKING instruction defect: `cap sync` itself needs `dist/client`, which is gitignored, so REV 3's "`cap sync` before `xcodebuild`" fix was one link short — the order is now **`pnpm build` → `cap sync` → `xcodebuild -list` → build**, in T1 step 9 and T5 alike, with a note that the generated tree cannot pollute the census. Plus: a mutation instruction that was not valid syntax (`try {}` with no `catch` is a `SyntaxError`) rewritten, and its death corrected from "it throws" to the ASSERTION it actually fails, because `void readStatus()` in an effect never surfaces a rejection to the test; a `grep … finds nothing` sentence corrected to its real output in both places it appears (`design.spec.ts:2017`, an unrelated PM5 BLE-name comment) plus the second grep that IS empty; the `unreadable` test retitled to what it proves and a RE-READ sibling added, because the mount test alone cannot tell a correct check order from a swapped one; T3's typecheck moved into T4 (the tree deliberately does not compile between the deletion and the rewrite); `mockApi`'s JSDoc reasoning led with the cross-test reason; `census.sh` given a final `exit 0`; a `capacitor.config.ts` line number corrected to `:6`; and T7 given the missing "checks (a)-(c) FAILED" row. Pass ledger: `.claude/agents/antagonist-ledger.md`, entry `2026-09-02 — Wave E PR1.75b native plan (DELTA pass 3, verifying pass 2's fixes)`. **The vetted ground is now closed and includes**, on top of REV 3's list: the storyboard subclass form (`customModule="App" customModuleProvider="target"` is the correct replacement for the current `customModule="Capacitor"`), the `capacitorDidLoad()` seam (an empty `open func` at `CAPBridgeViewController.swift:164`, called at `:53` after the bridge is assigned), `registerPluginInstance` being declared on `CAPBridgeProtocol.swift:80` so `bridge?.registerPluginInstance(...)` compiles, the walk report's shape, `state` being non-load-bearing, the dist-grep seam, and all of Task 3's deletion ranges.

**REV 3** — 2026-09-02: **antagonist DELTA pass 2 folded** (a verification pass over REV 2's own fixes, and it broke four of them). Two gates could not have gone red: the `SwiftCompile` log grep asserted a count of `1` that a real build never prints (4 cold, 0 warm) and is replaced by `App.SwiftFileList`, the compiler's own Sources-phase input list (T1 step 9); the `webauth-contract` reject-code regex stopped at the backslash of a Swift `\(interpolation)`, saw 12 of 14 lines, and stayed green through a deliberate typo — fixed form plus a length assertion so a skipped line fails instead of shrinking the expectation (T2 step 6). Two more could not be run as written: `xcodebuild` ran before the `cap sync` that generates its gitignored inputs, so it failed `The file "public" couldn't be opened` (order reversed, and gate (b)'s expected output corrected to EMPTY); and the census's "diff against an expected file" had no mechanically buildable expected file, so it is now a BASE-vs-HEAD diff of the same script (T8 step 3b). Plus: the lifetime table's clear-sites clause corrected (the four pre-claim returns must NOT clear) and a per-process caveat added for `UIApplicationSceneManifest`; the crash-recovery producer retagged INFERENCE; `mockApi` made factory-based so a `Response` body is never read twice; a `readStatus` failure path on the probe (`unreadable`, not a stale line); `pnpm e2e` labelled required-but-BLIND with what actually proves each arm (RF26); and the PR fold counted down to 119 words. Pass ledger: `.claude/agents/antagonist-ledger.md`, entry `2026-09-02 — Wave E PR1.75b native plan (DELTA pass 2, verifying pass 1's fixes)`.

**REV 2** — 2026-09-02: **antagonist DELTA pass 1 folded.** Seven findings applied in the tasks where the code lives: a per-attempt `UUID` token so a superseded session's completion cannot resolve the next session's call (T1, and the design's §2 table); the `assertionFailure` anchor fallback removed because the walk build is Debug and it would TRAP (T1); the `shouldOverrideLoad` comment corrected — Capacitor can CANCEL a main-frame decision, and a WebContent crash is a second producer (T1) — **the crash half retagged INFERENCE at REV 3**; a `networkError` union member for the throws nobody designed (T2); a committed Swift↔TS↔plist literal census (T2 step 6); two deterministic pbxproj gates — **both replaced at REV 3**: the `SwiftCompile` count could never print its own pass value, and the `cap sync` diff's expected output was wrong (T1 step 9); the census normaliser fixed for Swift `///`, and its two judgement-call pass conditions turned into diffed counts — **the diff's other operand replaced at REV 3**, because a hand-transcribed expected file is not an artifact (T8). Plus the walk card in bash, the `ios-release.test.sh` heredoc anchor, and the expected-warning list. Pass ledger: `.claude/agents/antagonist-ledger.md`, entry `2026-09-02 — Wave E PR1.75b native plan (DELTA pass 1)`.

**REV 1** — written 2026-09-02 against design rev 5.1 at worktree head `94b83c84` (branch `wave-e-pr175b-native`, base main `138dbe8c`, PR1.75a #269 merged in). Every `file:line` below was read in **this** worktree at that head. Implements ONLY **PR1.75b** as scoped in design §0; nothing here touches `app/server/` or `app/drizzle/`.

**Goal:** Give the phone a way to finish a Concept2 link. A local Swift `ASWebAuthenticationSession` plugin opens Concept2's consent page in a session only this app can receive the callback from, hands the callback back to JS in a promise, and a new `linkFlow` adapter mints (declaring `linkClient: "webauth-1"`), parses the callback, and posts `POST /api/concept2/exchange`. PR1.5's `Browser.open` + `browserFinished` return arm is retired as a census. Everything stays dark behind `C2_LINK_ENABLED`; the only surface that can reach any of it is the dev-only probe card behind `VITE_ENABLE_C2_LINK_PROBE`.

**Architecture:** (design §2 lifetime table, §3, §4) A `WebAuthPlugin` (`CAPPlugin, CAPBridgedPlugin`, `jsName "WebAuth"`) registered from a `MyViewController` subclass of `CAPBridgeViewController` holds the ONLY authority on "one link session per app process" — `activeSession`/`activeCall` in Swift, so a WebView reload that destroys every JS value cannot start a second sheet. The plugin sets `presentationContextProvider` to itself (returning the bridge's window, refusing `noWindow` rather than synthesising an anchor), sets `prefersEphemeralWebBrowserSession` before `start()` (a CONTROL against RFC 9700 §4.5 code injection on a shared phone, not a preference), and maps the SDK's three error codes onto typed outcomes. `src/native/webAuth.ts` is the `registerPlugin` mirror; `src/adapters/linkFlow.ts` is the one place the platform conditional lives — native takes the plugin, web takes `openExternalUrl` (a full-page navigation whose outcome is learned on the fresh mount, never via a return hook). With that, PR1.5's `onBrowserFinished`/`onNativeBrowserFinished`/`useReturnToApp` have zero consumers and are removed; `@capacitor/browser` and `openExternalUrl` stay, because PR2's read-only "View on Concept2" link-out is their consumer.

**Tech Stack:** Swift 5 (`SWIFT_VERSION = 5.0`, `project.pbxproj:324,345`), `IPHONEOS_DEPLOYMENT_TARGET = 15.0` (`project.pbxproj:239,296,314,336`), AuthenticationServices (iOS 12.0+; `presentationContextProvider`/`prefersEphemeralWebBrowserSession` iOS 13.0+, `canStart` iOS 13.4+ — all under our 15.0 floor), Capacitor 8 (`@capacitor/core` `^8.5.0`, `@capacitor/ios` `^8.5.0`), SPM only (no Podfile: `XCLocalSwiftPackageReference "CapApp-SPM"`, `project.pbxproj:373-378`). Client: React 19 + Vite, Vitest 4 `client` project (jsdom). pnpm only, ESM only. Node 26 (`export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` first, per the agent briefing).

**Spec path:** `docs/superpowers/specs/2026-09-02-concept2-pr175-app-bind-design.md` (rev 5.1, APPROVED — James, 2026-09-02; D1/D2 approved, D3 PASS). Parent: `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`; ruling: `docs/superpowers/plans/2026-09-01-concept2-pr15-gate.md` §6. House shape copied from `docs/superpowers/plans/2026-09-02-concept2-pr175a-server.md`.

## Global Constraints

Each line below is quoted from the design (§ named) or from the standing rules (CLAUDE.md / `.claude/agent-briefing.md`), not invented here.

- **Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b` (branch `wave-e-pr175b-native`). `git rev-parse --show-toplevel` before EVERY commit and confirm it prints that path (CLAUDE.md SDLC). Every shell write uses an absolute worktree path (RF20). Before relying on hooks: `pnpm install` at the worktree root AND in `app/`, then verify a deliberate lint error is blocked (CLAUDE.md SDLC). **Never write to `/Users/james/projects/github/jamesawesome/Ergomatic`.**
- **Scope gate (design §0, verbatim):** "**Gate: zero files under `app/server/`, zero migrations.**" Mechanical check before the PR: `git diff main...HEAD --stat -- app/server app/drizzle` prints nothing; `gh pr view <n> --json files --jq '.files[].path' | grep -E "^app/(server|drizzle)/"` is empty. Paste both.
- **Risk class (design §0, verbatim):** "**PR1.75b — native + client (not TRIAD).**" **Antagonist: DELTA pass on THIS plan, before implementation** (design §0: "Antagonist: DELTA pass on the plan (a new mechanism + a retirement)"). **PM: scoped ~10-min gate** (design §0: "census empty, walk record complete, fold count"). **The walk runs BEFORE the PR opens** (design §0, verbatim): "two of its outputs (Info.plist necessity, `state` echo) can change 1.75b's own code."
- **RF1 — `pnpm e2e` IS REQUIRED.** This diff touches `app/src/` (`adapters/linkFlow.ts`, `adapters/externalBrowser.ts`, `monitor/Concept2LinkProbe.tsx`, deletions under `api/`). The agent briefing's gate table is not negotiable on this row. `pnpm screenshots` is argued in Task 5's final checkbox.
- **TDD + self-mutation (CLAUDE.md RF21/RF22, TESTING.md §13):** failing test first, every task. Every NEW assertion gets a mutation probe run against a COMMITTED tree — commit the real change BEFORE probing, and run `git status` before any `git checkout`/`git restore`. Reports record the mutation and the exact failure text.
- **The Swift half has NO automated instrument (RF19), and the plan says so rather than pretending otherwise.** There is no XCTest target in `App.xcodeproj` (`xcodebuild -list -project App.xcodeproj` → `Targets: App`, one target, run 2026-09-02). `src/native/**` is `v8 ignore`d (`vitest.config.ts:48`) and `pnpm e2e` runs on web, where `isNative()` is always false. **The only instrument that can catch a `WebAuthPlugin.swift` defect is the device walk (Task 6), and the walk therefore carries a case for every branch of that file.** Per RF19: "For any new platform-sourced input, ask which instrument would catch it if it were wrong — and if the answer is none, build the instrument in the same change."
- **Every Apple-behaviour comment in the Swift quotes a NAMED source with its attribute (SDK header line, class documentation, the vendored Capacitor sources by file:line, or a SECONDARY forum post — each labelled)** (RF16's second corollary: "A citation is only as load-bearing as the line you actually quoted"). The primary SDK header read this session is `/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS.sdk/System/Cryptexes/OS/System/Library/Frameworks/AuthenticationServices.framework/Headers/ASWebAuthenticationSession.h`; each comment cites its exact source inline — a header line number, a documentation page, a vendored Capacitor `file:line`, or a labelled SECONDARY post.
- **Platform conditionals live ONLY in `src/platform.ts`, `src/api.ts`, `src/native/`, `src/adapters/`** — lint-enforced by `eslint.config.js:80-135` (`files: ["src/**/*.{ts,tsx}"]`, `ignores` lists exactly those paths plus the two monitor transports and `*.test.*`). `linkFlow.ts` lives in `src/adapters/` for this reason; `Concept2LinkProbe.tsx` must never import `../platform` or `../native/*`.
- **Secrets:** never log, serialize, or return a token, a `code`, or `C2_CLIENT_SECRET`. The `linkFlow` state-mismatch log line records THAT a mismatch happened, never the two values.
- **No em-dashes in user-facing strings** (house style). The probe card's copy is dev-facing but still follows it.
- **Test invocation (two footguns, CLAUDE.md + briefing):** `pnpm test --project client -- <pattern>` SILENTLY RUNS THE FULL SUITE, and a bare `vitest run` collides Node 26's webStorage with jsdom. For ONE client file use exactly:
  `cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b/app && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>`
  Read BOTH summary lines ("Test Files" and "Tests") — a file that fails to load collects zero tests and still reads green on one of them.
- **Typed-lint ratchet:** no new suppressions.
- **Records:** anything with a life after merge goes in ROADMAP, a ledger, DEVIATIONS or the spec at the moment it is found (RF14), never only in the PR body.
- **Commit before `pnpm ios:build`.** `scripts/ios-version.sh:12-13` runs `agvtool new-marketing-version` / `new-version -all`, which REWRITES `App.xcodeproj/project.pbxproj` and `App/Info.plist` with tag-derived stamps. Version stamps are never committed (memory: ios-activation-facts). Sequence, always: commit the real iOS change → build → `git diff` shows ONLY `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`/`CFBundleShortVersionString`/`CFBundleVersion` → `git restore` those two files (which restores to the committed state, INCLUDING your work). Doing it in the other order destroys uncommitted work (RF22, verbatim class).

## Plan deviations / observations (RF10 — the design against the code as read)

1. **BLOCKING-CLASS: the design's `abandoned` hook does not exist. `load()` is called ONCE, at plugin registration, and a WebView reload never calls it again.** Design §2's lifetime table says the in-flight claim is cleared by "plugin `load()` on a fresh document over a live session". Measured against the vendored Capacitor 8 sources in this worktree: `load()` is invoked only from `CapacitorBridge.registerPluginInstance(_:)` → `pluginInstance.load(on: self)` (`app/node_modules/@capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift:348-365`, calling `CAPPlugin+LoadInstance.swift:10-19`), and `registerPluginInstance` is called once from `capacitorDidLoad()` at view-controller construction (`CAPBridgeViewController.swift:48-53`). What a navigation DOES do is `bridge?.reset()` (`WebViewDelegationHandler.swift:45-48`, `didStartProvisionalNavigation`), whose whole body is `storedCalls.removeAll()` + `removeAllPluginListeners()` (`CapacitorBridge.swift:295-298`) — it never touches a plugin instance's own fields and never re-runs `load()`. **Consequence if the design were implemented literally:** a reload mid-session leaves `activeSession`/`activeCall` set forever, every later `start()` rejects `busy` permanently, and the sheet outlives its receiver — the exact failure the clause exists to prevent. **This plan uses the hook that DOES fire: `CAPPlugin.shouldOverrideLoad(_:)`** (`CAPPlugin.h:34-40`, default returns `nil` at `CAPPlugin.m:170-172`), which `WebViewDelegationHandler.swift:67-93` calls for EVERY navigation-policy decision, including a main-frame reload, before the navigation commits. Our override tears down a live session, rejects the pending call `abandoned`, and returns `nil` so navigation behaviour is unchanged. Task 1 implements this; Task 6 walks it (case d); Task 8 corrects the design's §2 row.
2. **The design's typed-outcome union has no member for "the plugin rejected for a reason not in the enum".** Design §4 lists `cancelled | noContext | contextInvalid | noWindow | busy | abandoned | declined | malformed | server_error`. Three real rejections fall outside it: `canStart` false, `start()` returning `false`, and a non-`ASWebAuthenticationSessionErrorDomain` `NSError` in the completion handler. Mapping any of those onto `cancelled` would silently swallow a real failure. This plan adds `pluginError { code, message }` and `mintFailed { status, error }` / `updateRequired` / `exchangeFailed { status, error }` for the two server hops the design describes in prose but does not name as union members. Named here rather than invented silently.
3. **TS union members are camelCase in this repo, so `server_error` is spelled `serverError`.** The design writes the union with one snake_case member among eight camelCase ones. Wire values (`body.error`: `wrong_surface`, `invalid_state`, `principal_mismatch`, `expired`, `c2_error`, `already_linked_elsewhere`, `ambiguous_auth`, `update_required`) keep their snake_case exactly, because those are the server's strings (`routes/concept2.ts:438,445,455,470,477,496` for the exchange's own strings; `:239` for `update_required`; `:203,326` for `ambiguous_auth`).
4. **The retirement census resolves to REMOVE, and the one sentence the design demands can be written.** Greps run in this worktree at `94b83c84` (Task 3 step 1 repeats them): `useReturnToApp` has exactly one production consumer, `Concept2LinkProbe.tsx:3,43`; `onBrowserFinished` has exactly one, `useReturnToApp.ts:7,201`; `onNativeBrowserFinished` has exactly one, `adapters/externalBrowser.ts:84`. After Task 4 repoints the probe, all three are zero-consumer. **The sentence:** *PR2's link-out opens `/profile/{c2_user_id}/log/{result_id}` at Concept2, a READ of a row Ergomatic already uploaded. It changes no Ergomatic state, and any Concept2-side edit is picked up by the next status read, never by a return hook.* — grounded in the comment at `routes/concept2.ts:533-537`, which records PR2's link-out as a read (the route serves `c2UserId` at `:538`, never a `result_id`).
5. **`registerWebAppLifecycleListener` becomes production-orphaned by that removal, and it is KEPT, with the reason.** Its only importer is `useReturnToApp.ts:4,228`. It is not part of the browser-return arm: it is the raw Page Visibility primitive, deliberately exported with no consumer at all by Phase LL Minor 9 (`adapters/appLifecycle.ts:42-55`, whose own text says it "still implements the raw Page Visibility mapping and stays exported and directly tested" — written 2026-08-22, nine days before `useReturnToApp` existed). Deleting it reverses a Phase LL ruling and touches the monitor's lifecycle adapter, which is outside this PR's risk model. Its direct tests in `adapters/appLifecycle.test.ts` keep it covered. Recorded in the census table with this reasoning so it is a decision, not an oversight (RF5).
6. **The 1.75a census's expected count for `"posts nothing and carries no client id"` was WRONG, and the reason is the exact one the PM named.** 1.75a's Task 9 table says "expected 0 · (only the PM ledger carries it, outside scope)". The phrase is in `app/src/monitor/Concept2LinkProbe.tsx:8-9`, wrapped across a JSDoc line break as `posts nothing and\n * carries no client id`. A line-based `grep -F` cannot see it, **and neither can a whitespace-only normalisation** — `tr -s '[:space:]' ' '` leaves the ` * ` continuation marker inside the phrase. Task 8's census therefore strips comment leaders (`*`, `//`, `--`, `>`) per line BEFORE collapsing whitespace; measured 2026-09-02, that form finds the hit and the whitespace-only form does not. The script and its red proof are in Task 8.
7. **`ios-release.sh:104` derives `GOOGLE_IOS_CLIENT_ID` from `CFBundleURLTypes` index 0, and this PR adds a second URL type.** `reversed="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes:0:CFBundleURLSchemes:0' "$PLIST")"`. Today index 0 is the GoogleSignIn entry (`Info.plist:21-31`). If a later edit puts the Concept2 entry first, the release derives `haus.waffle.ergomatic.apps.googleusercontent.com`, exports it, and every native Google sign-in fails `jwtVerify`'s audience check (`auth/nativeVerify.ts:14-18`) — silently, in a shipped build. Per CLAUDE.md "a seam gap gates the PR that creates it", Task 1 appends the new entry at index 1 AND replaces the index-based derivation with a name-based one in an extracted `scripts/ios-google-client-id.sh`, gated by a new case in `scripts/ios-release.test.sh` (which CI already runs: `.github/workflows/ci.yml:169-172`).
8. **`SITE_URL` is NOT load-bearing for the native walk, and the walk card says so instead of implying it.** `originCheck` (`auth/middleware.ts:41-62`) short-circuits every MUTATING request that carries a bearer (`:50-53`) before it ever looks at `Origin`, and there is no CORS middleware in `app.ts` at all — native requests ride `URLSession`, not the WebView's fetch, so CORS is not in play (design §Research, the Capacitor networking line). `SITE_URL` affects only the WEB redirect URI (`index.ts:138`) and the allowed-origin set. It is still set on the walk so the web callback is coherent if the operator opens it, and the card states that it is coherence, not a requirement.
9. **The repo-root `.env` holding the log-dev credentials lives in the MAIN checkout only.** `ls /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b/.env` → absent; `/Users/james/projects/github/jamesawesome/Ergomatic/.env` exists and holds exactly three keys, `LOGBOOK_API_KEY_DEV`, `LOGBOOK_CLIENT_ID_DEV`, `LOGBOOK_CLIENT_SECRET_DEV` (key names read 2026-09-02; values never read, never echoed). The walk card names that absolute path rather than "the repo root", because a worktree makes "the repo" ambiguous (memory: say-which-directory).
10. **The probe card's `className="c2-link-probe"` has NO CSS rule anywhere** (`grep -rn c2-link-probe app/src` → only `You.tsx:12` prose, `Concept2LinkProbe.tsx:22` prose, `Concept2LinkProbe.tsx:54-55`, and its test). Nothing to reconcile under RF5 when the card is rewritten; the class stays as a stable hook and the `data-c2-link-probe` attribute stays byte-identical because `dist-grep.sh:127`'s eighth needle is that exact string.
11. **`GET /api/concept2/link` answers `{available:false}` with HTTP 200 when the flag is off** (`routes/concept2.ts:518-523`) — the matrix's one non-403 row. The probe's status readout must distinguish "not available" from "not linked", or a walk operator reads a flag-off server as an unlinked account.
12. **The design's walk bullet says "the app built with `ERGOMATIC_API_BASE=https://<tunnel-host>`"; the mechanism is `package.json:29`**, which maps `ERGOMATIC_API_BASE` → `VITE_API_BASE` (default `https://ergomatic.waffle.haus`) and `GOOGLE_IOS_CLIENT_ID` → `VITE_GOOGLE_IOS_CLIENT_ID` (default EMPTY, which builds a bundle whose native Google sign-in is silently dead — CLAUDE.md's own warning). The walk card exports both.
13. **`ASWebAuthenticationPresentationContextProviding` carries `NS_SWIFT_UI_ACTOR` (SDK header:114), i.e. `@MainActor` in Swift.** This plan does NOT annotate the conformance, matching the shipping precedent already in this repo's `node_modules` (`@capgo/capacitor-social-login@8.4.4`, `ios/Sources/SocialLoginPlugin/SocialLoginPlugin.swift:1021-1025`: a plain `public func presentationAnchor(for:)` on a `CAPPlugin` subclass) and because `SWIFT_VERSION = 5.0` applies minimal concurrency checking. If the build emits an isolation diagnostic, add `@MainActor` to the method only — never to the class, whose superclass `CAPPlugin` is non-isolated.
14. **Every Capacitor `file:line` citation in this plan reads the VENDORED sources (`app/node_modules/@capacitor/ios/Capacitor/Capacitor/*.swift`), while the Xcode target links Ionic's BINARY framework of the same version.** `CapApp-SPM/Package.swift` depends on `https://github.com/ionic-team/capacitor-swift-pm.git` `exact: "8.5.0"`, whose own `Package.swift` is two `binaryTarget`s pointing at `Capacitor.xcframework.zip` / `Cordova.xcframework.zip` release assets (read 2026-09-02 in the resolved checkout under `~/Library/Developer/Xcode/DerivedData/App-*/SourcePackages/checkouts/capacitor-swift-pm/`). The versions match exactly (`@capacitor/ios` 8.5.0, pin `exact: "8.5.0"`), so the sources are the right ones to read — but they are a MIRROR of what compiles, not the compiled artifact. Anything that matters is therefore confirmed at runtime by the walk, not by the citation alone.

## RF27 lifetime table — every piece of state this PR adds

Design §2's table, extended for the three values 1.75b introduces. Invariants, not mechanisms.

| state | mint site | clear sites | survives WebView reload? | survives relaunch / kill? |
| --- | --- | --- | --- | --- |
| **the in-flight link claim** — INVARIANT: at most ONE link session per app PROCESS, and its authority is NATIVE. A second `start()` rejects `busy` in Swift, so the claim outlives every JS value | `WebAuthPlugin.startOnMain(_:)`, at the moment `activeSession`/`activeCall`/`activeAnchor` are assigned (before `start()`) | (a) the session's completion handler, whatever the outcome; (b) `shouldOverrideLoad` on a main-frame navigation — rejects the pending call `abandoned` and cancels the session, so no orphaned sheet outlives its receiver (observation 1: this is the hook that fires, not `load()`); (c) the two post-claim early returns in `startOnMain` (`canStart` false, `start()` false) — the four pre-claim returns (`busy`, `badRequest` ×2, `noWindow`) reject without clearing, on purpose: they hold no claim, and `busy` clearing would strand the live session it just refused | **NO** — a reload clears it, on purpose, and that is the invariant's whole point | NO (process-scoped) |
| `activeCall` (the pending `CAPPluginCall`) | same site as the claim | same three sites; **cleared BEFORE `session.cancel()` is called**, so a completion handler that fires after a cancel finds no call and is a no-op | NO | NO |
| `activeToken` (a per-attempt `UUID`) — INVARIANT: a completion handler resolves ONLY the call its own session was started for. `finish(token:…)` guards `activeToken == token`, so a superseded session's late completion is discarded by IDENTITY rather than by assuming it drains before the next `start()` — `cancel()`'s effect on a pending completion handler is undocumented (SDK header:101-104) | `startOnMain`, minted immediately before the `ASWebAuthenticationSession` initializer and captured by that session's completion closure | same three sites (`clearActive()` nils it) | NO | NO |
| `activeAnchor` (the `ASPresentationAnchor` the context provider returns) | same site, from `bridge?.viewController?.view.window`, **guarded**: nil → reject `noWindow`, never a synthesised `ASPresentationAnchor()` at claim time | same three sites | NO | NO |
| the `ASWebAuthenticationSession` object | `startOnMain`, once per call — *"start can only be called once for an ASWebAuthenticationSession instance"* (SDK header:95-96) | its completion handler, or `cancel()`. Self-retains until completion on a ≥iOS 13 deployment target (Apple's "Authenticating a User Through a Web Service" walkthrough; our floor is 15.0, `project.pbxproj:239`), so the plugin's own reference is belt-and-braces | NO | NO |
| `linkInFlight` (`src/adapters/linkFlow.ts`, module scope) | entry to `startLink` | its own `finally` | **NO** — a reload re-imports the module with the flag false; that is why it is a UX convenience and NEVER the authority | NO |
| `state` (the mint's correlation value) | returned by `POST /connect` beside `authorizeUrl` (`routes/concept2.ts:270-275`) | completion of `startLink`, every branch — it lives only in that function's scope | NO — nothing persists it; a reload re-mints | NO |

**Invariants restated:** at most one link session per app PROCESS; a pending call is resolved or rejected exactly once; no client-side state outlives the promise that holds it; nothing about a link is written to `localStorage`, the Keychain, or any store — a killed app re-mints from scratch. **Web has no in-flight guard** (design §2, unchanged): a second tab or a second tap re-mints and the first tab's callback lands on the Expired page.

**Why "per PROCESS" is true, and what would make it false.** The claim lives in one `WebAuthPlugin` instance, and there is exactly one because there is exactly one bridge view controller: `Info.plist` declares **no `UIApplicationSceneManifest`** (`grep -c UIApplicationSceneManifest app/ios/App/App/Info.plist` → `0`, run 2026-09-02), so the app is single-scene and `MyViewController.capacitorDidLoad()` runs once. **Adding multi-scene support would demote this invariant to one claim per bridge view controller** — two scenes would each register their own plugin instance, each holding its own `activeSession`, and "one link session per app process" would become false without a line of this PR's code changing. Named here so a later scene-manifest change meets the argument rather than an unexplained guarantee.

## What this builds against (PR1.75a's contract — READ ONLY, do not change)

| route | auth | success | failures this plan handles |
| --- | --- | --- | --- |
| `POST /api/concept2/connect` `{weightClass, linkClient?}` (`routes/concept2.ts:212-277`) | `requireUser`, bearer → `surface:"native"` | `200 {authorizeUrl, state}` with `redirect_uri = haus.waffle.ergomatic://oauth/callback` (`:67`) | `409 {error:"update_required"}` when a bearer mint omits `linkClient:"webauth-1"` (`:238-240`, constant at `:74`); `403 unavailable`; `400 ambiguous_auth`; `400` field-named; `401` |
| `POST /api/concept2/exchange` `{code, state}` (`routes/concept2.ts:410-509`) | `requireUser`, bearer ONLY (`:437-440`) | `200 {linked:true, c2UserId, weightClass}` (`:503-507`) | `400 wrong_surface` (cookie caller, or a web-minted state); `400 invalid_state`; `403 principal_mismatch`; `400 expired`; `502 c2_error`; `409 already_linked_elsewhere`; `403 unavailable`; `400 ambiguous_auth` |
| `GET /api/concept2/link` (`routes/concept2.ts:513-542`) | `requireUser` | `200 {available:false}` when dark, else `{available:true, linked, weightClass?, c2UserId?, needsReauth?}` | — |

The client keys on `body.error`, never on status alone (PR1's rule; 409 carries two meanings across the two routes).

---

### Task 1: The Swift plugin, its registration, and the Info.plist scheme

**Files:**
- Create: `app/ios/App/App/WebAuthPlugin.swift`
- Create: `app/ios/App/App/MyViewController.swift`
- Modify: `app/ios/App/App/Base.lproj/Main.storyboard` (`:14`)
- Modify: `app/ios/App/App.xcodeproj/project.pbxproj` (`:9-18` build files, `:20-31` file refs, `:62-76` the App group, `:154-163` the sources phase)
- Modify: `app/ios/App/App/Info.plist` (`:21-31`, `CFBundleURLTypes`)
- Create: `app/scripts/ios-google-client-id.sh`
- Modify: `app/scripts/ios-release.sh` (`:101-108`)
- Test: `app/scripts/ios-release.test.sh` (append a case; CI runs it, `.github/workflows/ci.yml:169-172`)

**Interfaces:**
- Produces: JS-visible plugin `WebAuth` with one method, `start({url: string, callbackScheme: string, ephemeral: boolean}) -> {callbackUrl: string}`.
- Rejection codes (the `code` argument of `CAPPluginCall.reject`, `CAPPluginCall.swift:45-47`): `busy`, `noWindow`, `cancelled`, `noContext`, `contextInvalid`, `abandoned`, `cannotStart`, `badRequest`, `pluginError`.
- Produces: `app/scripts/ios-google-client-id.sh <Info.plist>` → prints the forward-form iOS OAuth client id, exit 1 with a named message if absent.

- [ ] **Step 1: Failing test first — the `ios-release` derivation case.** This is the one part of Task 1 an automated gate can reach, and observation 7 is the seam it guards. Append to `app/scripts/ios-release.test.sh`, **immediately before the final `if [ "$fails" -gt 0 ]; then` summary block (`ios-release.test.sh:246`, file is 250 lines — verify the number against the current file before editing).** **Do NOT insert near the `case "$1" in` at `:212`** — that string is inside the round-9 pnpm-stub heredoc, not a dispatch, and this file has no trailing dispatch at all. (Check before trusting any shell construct's line number as a structural anchor: `grep -n "<<'" app/scripts/ios-release.test.sh`.)

```bash
# Wave E PR1.75b (2026-09-02-concept2-pr175-app-bind-design.md §0: the app
# registers `haus.waffle.ergomatic` in CFBundleURLTypes). Before this PR the
# release derived GOOGLE_IOS_CLIENT_ID from CFBundleURLTypes INDEX 0
# (ios-release.sh's old `PlistBuddy -c 'Print :CFBundleURLTypes:0:
# CFBundleURLSchemes:0'`). Adding a second URL type makes that index a
# silent trap: put the Concept2 entry first and the release exports
# `haus.waffle.ergomatic.apps.googleusercontent.com`, which fails
# jwtVerify's audience check (server/auth/nativeVerify.ts:14-18) in a
# SHIPPED build with no error at build time. The derivation is now
# name-based and lives in its own script so this test can run it for real
# (the same "run it for real" bar as the cases above), on Linux CI too --
# PlistBuddy does not exist on ubuntu-latest, which is why the new script
# greps the plist XML rather than using it.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

write_plist() { # $1 = file, $2 = "google-first" | "concept2-first"
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<plist version="1.0"><dict><key>CFBundleURLTypes</key><array>'
    if [ "$2" = "concept2-first" ]; then
      echo '<dict><key>CFBundleURLName</key><string>Concept2Link</string><key>CFBundleURLSchemes</key><array><string>haus.waffle.ergomatic</string></array></dict>'
    fi
    echo '<dict><key>CFBundleURLName</key><string>GoogleSignIn</string><key>CFBundleURLSchemes</key><array><string>com.googleusercontent.apps.896004543555-9m5cf46vdgf57dv1r68u7stad6ngi304</string></array></dict>'
    if [ "$2" = "google-first" ]; then
      echo '<dict><key>CFBundleURLName</key><string>Concept2Link</string><key>CFBundleURLSchemes</key><array><string>haus.waffle.ergomatic</string></array></dict>'
    fi
    echo '</array></dict></plist>'
  } > "$1"
}

expected="896004543555-9m5cf46vdgf57dv1r68u7stad6ngi304.apps.googleusercontent.com"

write_plist "$tmp/google-first.plist" google-first
[ "$(bash "$HERE/ios-google-client-id.sh" "$tmp/google-first.plist")" = "$expected" ]
check "google client id: derived when the Google URL type is first" $?

write_plist "$tmp/concept2-first.plist" concept2-first
[ "$(bash "$HERE/ios-google-client-id.sh" "$tmp/concept2-first.plist")" = "$expected" ]
check "google client id: derived when the Concept2 URL type is first (the index-0 trap)" $?

echo '<?xml version="1.0"?><plist version="1.0"><dict/></plist>' > "$tmp/none.plist"
out=$(bash "$HERE/ios-google-client-id.sh" "$tmp/none.plist" 2>&1); rc=$?
[ "$rc" -ne 0 ]
check "google client id: exits non-zero when no reversed scheme is present" $?
grep -q 'no com.googleusercontent.apps' <<<"$out"
check "google client id: the failure names what it looked for" $?

# The REAL committed plist still yields the real id -- the fixtures above
# could all pass against a plist shape we do not actually ship.
[ "$(bash "$HERE/ios-google-client-id.sh" "$HERE/../ios/App/App/Info.plist")" = "$expected" ]
check "google client id: the committed Info.plist still derives the real id" $?

# ios-release.sh must not carry the index-based form any more.
! grep -q 'CFBundleURLTypes:0:CFBundleURLSchemes:0' "$HERE/ios-release.sh"
check "ios-release: no longer derives the client id from URL-type index 0" $?
```

- [ ] **Step 2: Run it** — `bash /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b/app/scripts/ios-release.test.sh` → **FIVE** of the six new checks FAIL (`ios-google-client-id.sh` does not exist; the index form is still present). The sixth, "exits non-zero when no reversed scheme is present", passes vacuously — a MISSING script also exits non-zero (127); the discriminating half of that pair is the next check, which fails on the `No such file or directory` text. Record all six lines (measured 2026-09-02: `fails=5`).

- [ ] **Step 3: The derivation script.** Create `app/scripts/ios-google-client-id.sh`:

```bash
#!/usr/bin/env bash
# Wave E PR1.75b: derive the iOS OAuth client id from the reversed-client URL
# scheme committed in Info.plist (com.googleusercontent.apps.<id> <-> <id>
# .apps.googleusercontent.com). Extracted from ios-release.sh, which used to
# read CFBundleURLTypes INDEX 0 -- an assumption this PR breaks by adding a
# second URL type for `haus.waffle.ergomatic` (design §0). A wrong id here is
# not a build error: it is exported into the bundle, and every native Google
# sign-in then fails jwtVerify's audience check
# (server/auth/nativeVerify.ts:14-18) in a shipped build. So the lookup is by
# NAME, not position, and an absent scheme is a loud failure rather than a
# silently malformed id.
#
# Greps the plist XML rather than using PlistBuddy on purpose: PlistBuddy is
# macOS-only and this script is exercised by ios-release.test.sh, which CI
# runs on ubuntu-latest (.github/workflows/ci.yml:169-172).
set -Eeuo pipefail

PLIST="${1:?usage: ios-google-client-id.sh <path/to/Info.plist>}"

reversed="$(grep -o 'com\.googleusercontent\.apps\.[A-Za-z0-9._-]*' "$PLIST" | head -1 || true)"
if [ -z "$reversed" ]; then
  echo "ios-google-client-id: no com.googleusercontent.apps.* URL scheme in $PLIST" >&2
  exit 1
fi
echo "${reversed#com.googleusercontent.apps.}.apps.googleusercontent.com"
```

Then replace `app/scripts/ios-release.sh:101-108` with:

```bash
# Recover the iOS OAuth client id from the committed reversed URL scheme.
# BY NAME, not by CFBundleURLTypes index -- PR1.75b adds a second URL type
# (haus.waffle.ergomatic) and an index-based read would silently export a
# malformed id if the entries were ever reordered. See
# scripts/ios-google-client-id.sh's own header, and the cases in
# ios-release.test.sh that prove both orderings derive the same id.
if [ -z "${GOOGLE_IOS_CLIENT_ID:-}" ]; then
  GOOGLE_IOS_CLIENT_ID="$(bash "$APP_DIR/scripts/ios-google-client-id.sh" "$PLIST")"
  export GOOGLE_IOS_CLIENT_ID
  echo "ios-release: GOOGLE_IOS_CLIENT_ID derived from Info.plist"
fi
```

`chmod +x app/scripts/ios-google-client-id.sh`. Re-run the test file → all cases pass, including the three pre-existing guard cases.

- [ ] **Step 4: `Info.plist` — append the Concept2 URL type at index 1.** In `app/ios/App/App/Info.plist`, inside `CFBundleURLTypes` (`:22-31`), add a SECOND `<dict>` AFTER the existing GoogleSignIn one. Tabs, matching the file. The array becomes:

```xml
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>GoogleSignIn</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>com.googleusercontent.apps.896004543555-9m5cf46vdgf57dv1r68u7stad6ngi304</string>
			</array>
		</dict>
		<dict>
			<key>CFBundleURLName</key>
			<string>Concept2Link</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>haus.waffle.ergomatic</string>
			</array>
		</dict>
	</array>
```

  Why registered at all, given `callbackURLScheme` is passed to the initializer — SDK header:47-48, verbatim: *"The callback URL usually has a custom URL scheme. For the app to receive the callback URL, it needs to either register the custom URL scheme in its Info.plist, or set the scheme to callbackURLScheme argument in the initializer."* So it is an OR, not an AND. Design §0 registers it anyway ("one entry, zero cost, deletes a walk-burning failure mode; the walk still RECORDS whether it was needed").

  **What the registration actually does, and why it is safe — state this in the PR.** Registering `haus.waffle.ergomatic` makes the OS route an OUT-of-session `haus.waffle.ergomatic://` URL — one that arrives when no `ASWebAuthenticationSession` is waiting for it — into the app: `AppDelegate.application(_:open:options:)` (`AppDelegate.swift:36-40`) hands it to `ApplicationDelegateProxy.shared`, which is `@capacitor/app`'s bridge into the JS `appUrlOpen` event. **This app registers ZERO `appUrlOpen` listeners** (`grep -rn appUrlOpen app/src app/e2e | wc -l` → `0`, run 2026-09-02). That absence is not incidental: it is precisely what keeps RFC 8252 §7.1's shared-scheme ambiguity CLOSED for the out-of-session leg. In-session, Apple's guarantee does the work ("only the calling app's session receives the authentication callback"); out-of-session, a competing app registering the same scheme could hand us a URL we did not ask for, and the only reason that cannot become an authorization code we act on is that nothing is listening. **A future `appUrlOpen` listener silently reopens it.**

  **Therefore the census's `appUrlOpen` row (expected 0 under `app/src` — the tripwire, because a listener is JS — and exactly ONE prose hit under `app/ios`, `WebAuthPlugin.swift`'s "why not a URL scheme" rationale, which is an argument about the alternative rather than a listener) is a PERMANENT grep with that reason attached, not a one-off gate for this PR.** Task 8's table carries it, and the reason travels with the row so a later reader adding a listener meets the argument rather than an unexplained zero. A `haus.waffle.ergomatic://` URL arriving out of session is therefore silently dropped today, which is the correct behaviour and is what walk case (a) records.

- [ ] **Step 5: `WebAuthPlugin.swift`.** Create `app/ios/App/App/WebAuthPlugin.swift`:

```swift
import AuthenticationServices
import Capacitor
import UIKit
import WebKit

/// Wave E PR1.75b (docs/superpowers/specs/2026-09-02-concept2-pr175-app-bind-design.md
/// §4): the native return leg of the Concept2 link, on
/// `ASWebAuthenticationSession`.
///
/// WHY THIS AND NOT A URL SCHEME + `appUrlOpen` (design §4, "Why this over"):
/// Apple's `ASWebAuthenticationSession` CLASS DOCUMENTATION (developer.apple.com;
/// design §Research, PRIMARY -- NOT the SDK header, which does not carry this
/// sentence) is the whole reason, verbatim: "ASWebAuthenticationSession ensures
/// that only the calling app's session receives the authentication callback,
/// even when more than one app registers the same callback URL scheme." That
/// closes the RFC 8252 §7.1 shared-scheme ambiguity
/// ("multiple apps can typically register the same scheme, which makes it
/// indeterminate as to which app will receive the authorization code") for the
/// DENIAL leg. PKCE, the control RFC 8252 §8.1 would otherwise mandate, is not
/// offered by Concept2 (zero occurrences of `code_challenge` in their OAuth
/// reference); the REDEMPTION leg is closed instead by the confidential client
/// -- the secret never leaves our server.
///
/// The callback also arrives IN A PROMISE, in flow: no listener registration,
/// no readiness barrier, none of the lifetime hazards PR1.5 spent four rounds
/// on, and the OS dismisses the browser itself.
///
/// SINGLE FLIGHT IS ENFORCED HERE, IN SWIFT, ON PURPOSE (design §2's lifetime
/// table). A WebView reload destroys every JS value, so a JS-side guard could
/// not survive one; `activeSession`/`activeCall` do. `linkFlow.ts`'s own
/// `linkInFlight` is a UX convenience and is never the authority.
///
/// Every platform-behaviour claim below cites a NAMED source with its
/// attribute -- an `ASWebAuthenticationSession.h` line (iPhoneOS.sdk/.../
/// Headers/, read 2026-09-02), Apple's class documentation (PRIMARY, design
/// §Research), the vendored Capacitor sources by file:line, or a labelled
/// SECONDARY developer-forums post.
@objc(WebAuthPlugin)
public class WebAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WebAuthPlugin"
    public let jsName = "WebAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    // The in-flight link claim (design §2). All three are written and read on
    // the main thread only: `start(_:)` hops to main before touching them, the
    // completion handler hops back to main, and `shouldOverrideLoad(_:)` is a
    // `CAPPlugin` method that Capacitor calls from its `WKNavigationDelegate`
    // `decidePolicyFor` handler (`WebViewDelegationHandler.swift:67` ->
    // `:82`); `WKNavigationDelegate` is declared `WK_SWIFT_UI_ACTOR`
    // (`WebKit.framework/Headers/WKNavigationDelegate.h:69-70`), `#define`d
    // `NS_SWIFT_UI_ACTOR` at `WKFoundation.h:60` (iOS 26.5 SDK, read
    // 2026-09-02) -- WebKit, not UIKit, delivers it on the main actor.
    private var activeSession: ASWebAuthenticationSession?
    private var activeCall: CAPPluginCall?
    private var activeAnchor: ASPresentationAnchor?
    // Per-attempt identity. The completion closure captures its own token, so
    // `finish` can tell "my session finished" from "some earlier session's
    // completion finally arrived". See `finish(token:...)`.
    private var activeToken: UUID?

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("The plugin was released before the session could start", "pluginError")
                return
            }
            self.startOnMain(call)
        }
    }

    private func startOnMain(_ call: CAPPluginCall) {
        // One session per app PROCESS. Rejecting here rather than queueing is
        // deliberate: a second sheet would present over the first and there is
        // no correct answer for which call receives the callback.
        //
        // THIS RETURN AND THE THREE BELOW IT MUST NOT CALL `clearActive()`.
        // They run BEFORE the claim is taken, so they hold nothing to clear --
        // and here specifically, clearing would strand the LIVE session this
        // very call was just refused in favour of: the sheet would still be up
        // with its own completion handler pending, but the plugin would have
        // forgotten the call to resolve. Only the two POST-claim returns
        // (`canStart`, `start()`) clear. See the plan's RF27 lifetime table,
        // clear-site (c).
        if activeSession != nil {
            call.reject("A link session is already in flight", "busy")
            return
        }

        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("start requires a valid `url`", "badRequest")
            return
        }
        // SDK header:66 -- "callbackURLScheme the custom URL scheme that the
        // app expects in the callback URL." It is the BARE scheme: an Apple
        // Systems Engineer on developer forums thread 679251 (SECONDARY)
        // states "A scheme should not include special characters such as ':'
        // or '/'", i.e. "haus.waffle.ergomatic", never
        // "haus.waffle.ergomatic://". The caller supplies it
        // (adapters/linkFlow.ts's LINK_CALLBACK_SCHEME) so the one place the
        // scheme is spelled is beside the one place the redirect_uri is
        // (server/routes/concept2.ts:67).
        guard let scheme = call.getString("callbackScheme"), !scheme.isEmpty,
              !scheme.contains(":"), !scheme.contains("/") else {
            call.reject("start requires a bare `callbackScheme` with no ':' or '/'", "badRequest")
            return
        }

        // NEVER a synthesised anchor. Passing a bare `ASPresentationAnchor()`
        // is exactly what produces error code 3 opaquely later (SDK header:
        // 27-28 -- "The presentation context returned was not elligible to
        // show the authentication UI. For iOS, validate that the UIWindow is
        // in a foreground scene."), so the honest failure is refused up front
        // with a code that says which thing was missing.
        guard let window = bridge?.viewController?.view.window else {
            call.reject("No window to present the authentication session from", "noWindow")
            return
        }

        // One token per attempt, captured by THIS session's completion closure.
        let token = UUID()
        let session = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: scheme
        ) { [weak self] callbackURL, error in
            DispatchQueue.main.async {
                self?.finish(token: token, callbackURL: callbackURL, error: error)
            }
        }
        // The string initializer is `API_DEPRECATED("Use initWithURL:callback:
        // completionHandler: instead", ios(12.0, API_TO_BE_DEPRECATED), ...)`
        // (SDK header:69) -- Apple's "unspecified future release" sentinel, a
        // warning with no removal version. Its replacement takes an
        // `ASWebAuthenticationSessionCallback`, which is
        // `API_AVAILABLE(ios(17.4), ...)` (SDK header:71) -- above this
        // target's `IPHONEOS_DEPLOYMENT_TARGET = 15.0`
        // (project.pbxproj:314,336). An `#available(iOS 17.4, *)` branch onto
        // `.customScheme` is recorded as optional polish, not owed here.

        // SDK header:73-77 -- "A provider must be set prior to calling -start,
        // otherwise the authorization view cannot be displayed." The property
        // is declared `weak`, so the plugin instance must stay alive; it does,
        // because the bridge retains every registered plugin
        // (CapacitorBridge.swift:348-365 stores it in `plugins`).
        session.presentationContextProvider = self

        // `ephemeral: true` is a CONTROL, not a preference (design §4). SDK
        // header:79-82 -- "Ephemeral web browser sessions do not not share
        // cookies or other browsing data with a user's normal browser session.
        // This value is NO by default. Setting this property after calling
        // -[ASWebAuthenticationSession start] has no effect." Hence: set
        // before `start()`, below. Non-ephemeral would share Safari's
        // persistent cookies, so on a shared phone the next link could
        // silently complete against whoever last logged into Concept2 in
        // Safari, with no visible login -- the mirror image of the account
        // injection this whole PR closes on the Ergomatic side. It also
        // removes the sharing consent alert the class documentation describes
        // (SDK header:50-53), since there is nothing to share.
        session.prefersEphemeralWebBrowserSession = call.getBool("ephemeral", false)

        // Claim BEFORE starting: `canStart`/`start()` can both fail, and those
        // two failure paths -- the ONLY two below this line, and the only two
        // in this function that clear -- release the claim again, so no path
        // can leave a claim without a session.
        activeAnchor = window
        activeSession = session
        activeCall = call
        activeToken = token

        // SDK header:89-92 -- "Returns whether the session can be successfully
        // started. This property returns the same value as calling -start, but
        // without the side effect of actually starting the session."
        // `API_AVAILABLE(ios(13.4), ...)`, under our 15.0 floor, so no
        // `#available` guard is needed.
        guard session.canStart else {
            clearActive()
            call.reject("The system will not start an authentication session right now", "cannotStart")
            return
        }
        // SDK header:94-99 -- "start can only be called once for an
        // ASWebAuthenticationSession instance. This also means calling start
        // on a canceled session will fail. @result Returns YES if the session
        // starts successfully."
        guard session.start() else {
            clearActive()
            call.reject("The authentication session failed to start", "cannotStart")
            return
        }
    }

    private func finish(token: UUID, callbackURL: URL?, error: Error?) {
        // A completion from a superseded session is discarded by TOKEN
        // IDENTITY, not by assuming it drains before the next `start()` --
        // `cancel()`'s effect on the completion handler is undocumented (SDK
        // header:101-104). Without the token this guard reads "is there ANY
        // pending call", which an abandoned session's late completion would
        // satisfy by resolving the NEXT session's call.
        guard activeToken == token, let call = activeCall else { return }
        clearActive()

        if let error = error {
            let ns = error as NSError
            if ns.domain == ASWebAuthenticationSessionErrorDomain,
               let code = ASWebAuthenticationSessionError.Code(rawValue: ns.code) {
                switch code {
                case .canceledLogin:
                    // SDK header:22-24 -- "The user has canceled login by
                    // cancelling the alert asking for permission to log in to
                    // this app, or by dismissing the view controller for
                    // loading the authentication webpage." ONE code for both,
                    // so a dismissed OS consent alert and a tapped Cancel on
                    // the page are indistinguishable here BY DESIGN. Never
                    // reported as anything narrower than "cancelled".
                    call.reject("The rower dismissed the authentication session", "cancelled")
                case .presentationContextNotProvided:
                    // SDK header:25-26 -- "A valid presentationContextProvider
                    // was not found when -start was called."
                    call.reject("No presentation context was provided", "noContext")
                case .presentationContextInvalid:
                    // SDK header:27-28. Real on iPad, where
                    // TARGETED_DEVICE_FAMILY = "1,2" (project.pbxproj:325,346)
                    // means a window can legitimately be in a background scene.
                    call.reject("The presentation context cannot show the authentication UI", "contextInvalid")
                @unknown default:
                    call.reject("Authentication session failed with an unknown code \(ns.code)", "pluginError")
                }
            } else {
                // Deliberately NOT folded into `cancelled`: an unrecognised
                // failure reported as a user cancellation is a swallowed bug.
                call.reject("Authentication session failed: \(ns.domain) \(ns.code)", "pluginError")
            }
            return
        }

        guard let callbackURL = callbackURL else {
            call.reject("The authentication session completed with neither a callback URL nor an error", "pluginError")
            return
        }
        call.resolve(["callbackUrl": callbackURL.absoluteString])
    }

    /// The WebView is about to navigate. On a MAIN-FRAME navigation with a
    /// live session, the session is cancelled and its call rejected
    /// `abandoned`.
    ///
    /// A main-frame navigation decision usually means this document is about
    /// to be replaced. Capacitor can still CANCEL it
    /// (`WebViewDelegationHandler.swift:108-115` hands top-level external URLs
    /// to `UIApplication.shared.open` and answers `.cancel`), in which case we
    /// abandon a session whose receiver survives. Deliberately over-broad: the
    /// alternative is guessing which decisions commit, and no supported path
    /// navigates this WebView while a sheet is up.
    ///
    /// The other producer, beyond a Safari-inspector reload: a WebContent
    /// process crash. `webViewWebContentProcessDidTerminate`
    /// (`WebViewDelegationHandler.swift:158-162`) does `bridge?.reset()` then
    /// `webView.reload()` -- that much is PRIMARY, read in the vendored
    /// source. **That the reload then re-enters `decidePolicyFor` with a
    /// MAIN-FRAME `targetFrame` is INFERENCE, not measured:** after a
    /// WebContent termination the frame tree has been destroyed, and nothing
    /// in WebKit's documentation says what `targetFrame` carries on the
    /// recovery load (a `nil` target frame fails this guard's
    /// `?.isMainFrame == true` and the claim would NOT be released). So the
    /// crash path is a PLAUSIBLE second producer, not a proven one; the
    /// reload path is the one that gates. Walk case (d)'s optional variant
    /// exists to measure it.
    ///
    /// ORDERING CAVEAT: `bridge.plugins` is an unordered `[String:
    /// CapacitorPlugin]` Dictionary, iterated at
    /// `WebViewDelegationHandler.swift:77-92`, and the FIRST plugin returning
    /// a non-nil answer short-circuits the loop -- so another plugin
    /// overriding `shouldOverrideLoad` could pre-empt ours in an order we do
    /// not control. Zero iOS plugins in `node_modules` override it today
    /// (measured 2026-09-02: the only Swift hit is Capacitor's own handler,
    /// plus the `CAPPlugin.h`/`.m` declaration). Ours returns `nil`
    /// unconditionally, so it never pre-empts anyone else's.
    ///
    /// WHY THIS HOOK AND NOT `load()` (plan observation 1, measured against
    /// the vendored Capacitor 8 sources in this repo): `load()` runs ONCE, from
    /// `CapacitorBridge.registerPluginInstance(_:)`
    /// (CapacitorBridge.swift:348-365 -> CAPPlugin+LoadInstance.swift:10-19),
    /// which `MyViewController.capacitorDidLoad()` calls at construction
    /// (CAPBridgeViewController.swift:48-53). A reload never re-runs it; what
    /// a reload does run is `bridge?.reset()`
    /// (WebViewDelegationHandler.swift:45-48), whose whole body is
    /// `storedCalls.removeAll()` + `removeAllPluginListeners()`
    /// (CapacitorBridge.swift:295-298) and which never touches a plugin
    /// instance's own fields. Without this override, a reload mid-session
    /// would leave the claim set forever: every later `start()` would reject
    /// `busy` and the sheet would outlive its receiver.
    ///
    /// Returns `nil` unconditionally, which is the documented "defer to the
    /// default Capacitor policy" answer (CAPPlugin.h:34-40) -- this override
    /// observes, it never changes what the WebView loads.
    @objc public override func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        if navigationAction.targetFrame?.isMainFrame == true, activeSession != nil {
            abandonActiveSession()
        }
        return nil
    }

    private func abandonActiveSession() {
        let call = activeCall
        let session = activeSession
        // Cleared FIRST, which also nils `activeToken`, so this session's own
        // completion -- whenever `cancel()` decides to deliver it -- fails
        // `finish`'s token check and resolves nothing (see `finish`).
        clearActive()
        session?.cancel()
        call?.reject("The web view reloaded while a link session was in flight", "abandoned")
    }

    private func clearActive() {
        activeSession = nil
        activeCall = nil
        activeAnchor = nil
        activeToken = nil
    }
}

extension WebAuthPlugin: ASWebAuthenticationPresentationContextProviding {
    /// SDK header:118-121 -- "Return the ASPresentationAnchor in the closest
    /// proximity to where a user interacted with your app to trigger
    /// authentication."
    ///
    /// The anchor is captured in `startOnMain(_:)`, which REFUSES with
    /// `noWindow` when the bridge has no window, so `activeAnchor` is non-nil
    /// for the whole lifetime of any session that can call this back. The
    /// fallbacks exist only because the return type is non-optional.
    ///
    /// NO `assertionFailure` HERE. The walk build is a Debug build -- the
    /// `debug.xcconfig` at `app/ios/debug.xcconfig` is the base configuration
    /// for both Debug configs (`project.pbxproj:187,308`) and Xcode's Run
    /// action uses them -- so an `assertionFailure` would TRAP the app on the
    /// one build this whole plan exists to walk, turning a cosmetic
    /// last-resort into a crash.
    ///
    /// The bare `ASPresentationAnchor()` is the last resort the `noWindow`
    /// guard exists to prevent (it is what produces the opaque
    /// `presentationContextInvalid`, SDK header:27-28). It is only reachable
    /// if the window vanished between `start()` and presentation; the live
    /// bridge window is tried first so that case still has a chance of
    /// presenting rather than failing opaquely.
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return activeAnchor ?? bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
```

- [ ] **Step 6: `MyViewController.swift`.** Create `app/ios/App/App/MyViewController.swift`:

```swift
import Capacitor
import UIKit

/// Wave E PR1.75b: the vendor recipe for a local Capacitor plugin
/// (capacitorjs.com/docs/ios/custom-code) -- a `CAPBridgeViewController`
/// subclass that registers the instance in `capacitorDidLoad()`. Reached
/// because `Base.lproj/Main.storyboard`'s only view controller now names this
/// class instead of `CAPBridgeViewController` itself.
///
/// `capacitorDidLoad()` is the documented seam: it is `open` and its own doc
/// comment says "This is called before the webview has been added to the view
/// hierarchy" (CAPBridgeViewController.swift:158-165), and it runs AFTER the
/// bridge is constructed (`:48-53`), so `bridge` is non-nil here and
/// `registerPluginInstance` can export the plugin's JS shim before the page
/// loads (CapacitorBridge.swift:348-365 ends in `JSExport.exportJS`).
class MyViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(WebAuthPlugin())
    }
}
```

- [ ] **Step 7: Storyboard.** In `app/ios/App/App/Base.lproj/Main.storyboard`, replace line 14 exactly:

```xml
                <viewController id="BYZ-38-t0r" customClass="CAPBridgeViewController" customModule="Capacitor" sceneMemberID="viewController"/>
```

with

```xml
                <viewController id="BYZ-38-t0r" customClass="MyViewController" customModule="App" customModuleProvider="target" sceneMemberID="viewController"/>
```

  `customModule="App"` is the app target's own module: `PRODUCT_NAME = "$(TARGET_NAME)"` and `name = App` (`project.pbxproj:92,322,343`), and `customModuleProvider="target"` is what tells Interface Builder to look in the target rather than a framework.

- [ ] **Step 8: `project.pbxproj` — four entries, fresh 24-hex ids.** SPM project, no Podfile, so a new Swift file needs a manual reference (design §Research: "manual, conflict-prone, named as a cost"). Ids below were chosen to collide with no existing prefix in the file (existing: `2FAD`, `4D22`, `5037`, `504E`, `50B2`, `958D`, `D4C1`).

  (a) In `/* Begin PBXBuildFile section */` (`:9-18`), after the `AppDelegate.swift in Sources` line at `:13`:

```
		E2A1B0022C5D4F0100AA1102 /* WebAuthPlugin.swift in Sources */ = {isa = PBXBuildFile; fileRef = E2A1B0012C5D4F0100AA1101 /* WebAuthPlugin.swift */; };
		E2A1B0042C5D4F0100AA1104 /* MyViewController.swift in Sources */ = {isa = PBXBuildFile; fileRef = E2A1B0032C5D4F0100AA1103 /* MyViewController.swift */; };
```

  (b) In `/* Begin PBXFileReference section */` (`:20-31`), after the `AppDelegate.swift` line at `:24`:

```
		E2A1B0012C5D4F0100AA1101 /* WebAuthPlugin.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = WebAuthPlugin.swift; sourceTree = "<group>"; };
		E2A1B0032C5D4F0100AA1103 /* MyViewController.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = MyViewController.swift; sourceTree = "<group>"; };
```

  (c) In the `504EC3061FED79650016851F /* App */` group's `children` (`:62-76`), after `504EC3071FED79650016851F /* AppDelegate.swift */,` at `:66`:

```
				E2A1B0032C5D4F0100AA1103 /* MyViewController.swift */,
				E2A1B0012C5D4F0100AA1101 /* WebAuthPlugin.swift */,
```

  (d) In `504EC3001FED79650016851F /* Sources */`'s `files` (`:154-163`), after `504EC3081FED79650016851F /* AppDelegate.swift in Sources */,` at `:159`:

```
				E2A1B0042C5D4F0100AA1104 /* MyViewController.swift in Sources */,
				E2A1B0022C5D4F0100AA1102 /* WebAuthPlugin.swift in Sources */,
```

- [ ] **Step 9: `pnpm build` FIRST, then `cap sync`, then parse, then compile — the order is load-bearing, and BOTH prerequisites are invisible to anyone reading the compile command.**

  **(i) `pnpm build`, then `npx cap sync ios`, from `app/`, BEFORE any `xcodebuild` command.** Both are prerequisites of the compile gate and neither is discoverable by reading it. `cap sync` copies `webDir: "dist/client"` (`capacitor.config.ts:6`) and exits 1 with `Could not find the web assets directory: ./dist/client` in a worktree that has never built (measured 2026-09-02); `xcodebuild` then fails `error: The file "public" couldn't be opened`, because `app/ios/App/App/public/` and `config.xml` are gitignored (`app/ios/.gitignore:4,13`) and are what `cap sync` writes. Reading the `xcodebuild` command reveals neither hop; only running each in a worktree that has never built or synced does.

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b/app
pnpm build
npx cap sync ios
```

  **The census (Task 8) is unaffected by the generated tree.** `cap sync` writes `app/ios/App/App/public/` and `config.xml`, and the census's `find` matches only `*.ts *.tsx *.swift *.md *.plist *.sql` — the generated `public/` tree has ZERO files with any of those extensions (measured 2026-09-02: 74 files, extensions `css html js png woff woff2`), so a synced worktree and a clean one produce the same census output and the base-vs-head diff is not polluted by having run this step.

  **Gate (b) — `cap sync` does not fight the manual pbxproj edit.** The Capacitor CLI is the other writer of this directory, and the claim that it leaves our four entries alone is currently a READING of `@capacitor/cli/dist/ios/update.js` (it writes `Package.swift`, `capacitor.config.json` and the web assets; it never writes `project.pbxproj`, `Main.storyboard` or `Info.plist`). Turn it into a measured fact for THIS repo, immediately after the sync:

```
git -C /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b diff --stat -- app/ios
```

  → **expected output: EMPTY.** Not "only `capacitor.config.json` and `public/`" — those two cannot appear in a `git diff` at all, because both are gitignored (`app/ios/.gitignore:4,12,13`) and untracked. Every path `git diff` can print here is a TRACKED iOS file, and the only tracked ones `cap sync` could reach are the four this step edits by hand. **Any output at all means the CLI rewrote something we wrote: STOP and re-plan rather than committing.** Paste the (empty) output either way.

  **(ii) The project file still parses.** From `app/ios/App`:

```
timeout 600 xcodebuild -list -project App.xcodeproj
```

  → must still print `Targets: App` and a `Schemes:` block containing `App` (measured shape at `94b83c84`, 2026-09-02: one target, schemes `App` plus the SPM package schemes). A malformed pbxproj fails here with a parse error rather than silently.

  **(iii) The real compile gate**, from `app/ios/App`, into a named derived-data directory (gate (a) reads an artifact inside it, so it must not go to the shared default):

```
DD=/tmp/pr175b-dd
timeout 1800 xcodebuild -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath "$DD" build CODE_SIGNING_ALLOWED=NO 2>&1 | tee /tmp/pr175b-build.log | tail -15
```

  → `** BUILD SUCCEEDED **`. Simulator destination on purpose: it needs no provisioning profile, and `AuthenticationServices` is present there. Paste the last 15 lines into the task report. **If the build reports an actor-isolation diagnostic on `presentationAnchor(for:)`, apply observation 13's remedy (annotate the METHOD `@MainActor`, never the class) and say so in the report.**

  **Gate (a) — TARGET MEMBERSHIP, not just compilation.** `BUILD SUCCEEDED` does not prove either file is in the App target's Sources phase: omit `MyViewController.swift` from step 8(d) and the project still builds fine, ships a storyboard naming a class that is not in the binary, and the app opens to a blank screen on the phone. The deterministic check reads the compiler's own input list:

```
FL="$DD/Build/Intermediates.noindex/App.build/Debug-iphonesimulator/App.build/Objects-normal/arm64/App.SwiftFileList"
grep -c 'App/WebAuthPlugin\.swift$' "$FL"
grep -c 'App/MyViewController\.swift$' "$FL"
```

  → each must print exactly `1`. `App.SwiftFileList` is the compiler's own input list for the App target's Sources phase, written by `WriteAuxiliaryFile`. `0` = not in the Sources phase (step 8(a)/(d) wrong or missing); `2` = a duplicate build-file entry. Paste both numbers.

  **Deliberately NOT a `SwiftCompile` log grep** (which is what REV 1 and REV 2 of this plan specified): measured 2026-09-02 on a cold build, a genuine member counts **4** there — two log line forms × two architectures, because `generic/platform=iOS Simulator` builds arm64 AND x86_64 — and **0** on any warm re-run, so `= 1` can never be right. A gate whose pass value is a count of build-log lines is a heuristic wearing a number; the file list reflects the pbxproj rather than the build's incremental state, which is the thing this gate is actually asserting about.

- [ ] **Step 10: Mutation probes (after commit).** Commit first (`git rev-parse --show-toplevel` check, then Step 11), then run each and restore with an explicit `git status` check (RF22):
  - Replace the whole body of `ios-google-client-id.sh`'s `grep -o` with the old index-0 PlistBuddy form → the "Concept2 URL type is first" case FAILS. Record the exact line.
  - Delete the `!scheme.contains(":")` guard → no automated test bites (there is none for Swift). **Record that explicitly** rather than inventing a probe: this is RF19's "which instrument would catch it" answer, and it is why walk case (a) exists.
  - Remove the new `<dict>` from `Info.plist` → the "committed Info.plist still derives the real id" case still PASSES (it must: that case guards the Google entry, not ours). Record it as a NON-bite so the report does not overclaim what the test covers (RF26).

- [ ] **Step 11: Commit** `feat(c2): WebAuthPlugin + MyViewController + the Concept2 URL type (PR1.75b)`. Before it: `git rev-parse --show-toplevel` prints the worktree. Include `scripts/ios-google-client-id.sh`, the `ios-release.sh` change and the test case in this commit — they are the seam this Info.plist edit opens.

### Task 2: The JS mirror and the `linkFlow` adapter

**Files:**
- Create: `app/src/native/webAuth.ts`
- Create: `app/src/adapters/linkFlow.ts`
- Test: `app/src/adapters/linkFlow.test.ts` (new, `client` project)
- Test: `app/scripts/webauth-contract.test.ts` (new, `unit` project — the Swift↔TS↔plist literal census, step 6)

**Interfaces:**

```ts
// src/native/webAuth.ts
export interface WebAuthStartOptions { url: string; callbackScheme: string; ephemeral: boolean }
export interface WebAuthStartResult { callbackUrl: string }
export interface WebAuthPlugin { start(options: WebAuthStartOptions): Promise<WebAuthStartResult> }
export const WebAuth: WebAuthPlugin

// src/adapters/linkFlow.ts
export const LINK_CALLBACK_SCHEME = "haus.waffle.ergomatic"
export const LINK_CLIENT = "webauth-1"
export type WeightClass = "H" | "L"
export type LinkOutcome = /* the 17-member union below */
export function startLink(input: { weightClass: WeightClass }): Promise<LinkOutcome>
```

- [ ] **Step 1: Failing tests first.** Create `app/src/adapters/linkFlow.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

// Wave E PR1.75b (2026-09-02-concept2-pr175-app-bind-design.md §4 and its
// §Testing "Adapter `linkFlow`" bullet). Same `vi.doMock("../platform")` +
// `vi.resetModules()` idiom `externalBrowser.test.ts`/`appLifecycle.test.ts`
// already establish for a platform branch. The plugin is mocked AT THE SEAM
// (`../native/webAuth`), never below it: `src/native/**` is coverage-exempt
// and unreachable off-device, so the only honest thing to assert here is what
// this adapter SENDS to the plugin and what it does with each answer. The
// plugin's own behaviour is walk-verified (Task 6), and this file's header
// says so rather than implying otherwise.

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("../platform");
  vi.doUnmock("../api");
  vi.doUnmock("../native/webAuth");
  vi.doUnmock("./externalBrowser");
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Mints, then answers `exchange`. **Both are FACTORIES, invoked per request,
 * and that is load-bearing rather than stylistic.**
 *
 * The reason is CROSS-TEST first: `MINT_OK` is ONE module-scope constant and
 * every test in this file passes it to `mockApi`. A `Response` body can be read
 * exactly once, so a single shared `Response` object would be consumed by the
 * first test to run and throw `Body is unusable: Body has already been read` in
 * all the others — a whole-file failure whose message names nothing about the
 * assertion that broke.
 *
 * It also matters WITHIN the busy test, which mints twice: with a shared
 * `Response`, the third call's `res.json()` throws, `startLink` catches it and
 * returns `{kind:"networkError"}`, `WebAuth.start` is never called, and
 * `vi.waitFor(() => expect(releases).toHaveLength(2))` fails — so the
 * `linkInFlight` mutation that assertion exists to kill would look like a false
 * alarm. A fresh `Response` per request is what makes both assertions mean what
 * their titles say.
 */
function mockApi(mint: () => Response, exchange?: () => Response) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const api = vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (path === "/api/concept2/connect") return mint();
    if (path === "/api/concept2/exchange") {
      if (!exchange) throw new Error("exchange called but no response was staged");
      return exchange();
    }
    throw new Error(`unexpected api path ${path}`);
  });
  vi.doMock("../api", () => ({ api }));
  return { api, calls };
}

function mockPlugin(start: ReturnType<typeof vi.fn>) {
  vi.doMock("../native/webAuth", () => ({ WebAuth: { start } }));
}

const MINT_OK = () =>
  jsonResponse(200, {
    authorizeUrl: "https://log-dev.concept2.com/oauth/authorize?client_id=1&state=abc",
    state: "abc",
  });

describe("startLink on native", () => {
  it("mints with linkClient webauth-1, opens an EPHEMERAL session on the bare scheme, exchanges {code, state}, and reports the link", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const { calls } = mockApi(MINT_OK, () =>
      jsonResponse(200, { linked: true, c2UserId: 2211, weightClass: "H" }),
    );
    const start = vi.fn(async () => ({
      callbackUrl: "haus.waffle.ergomatic://oauth/callback?code=CODE1&state=abc",
    }));
    mockPlugin(start);
    vi.resetModules();
    const { startLink, LINK_CALLBACK_SCHEME, LINK_CLIENT } = await import("./linkFlow");

    const outcome = await startLink({ weightClass: "H" });

    expect(JSON.parse(String(calls[0]!.init!.body))).toStrictEqual({
      weightClass: "H",
      linkClient: LINK_CLIENT,
    });
    expect(start).toHaveBeenCalledExactlyOnceWith({
      url: "https://log-dev.concept2.com/oauth/authorize?client_id=1&state=abc",
      callbackScheme: LINK_CALLBACK_SCHEME,
      ephemeral: true,
    });
    expect(LINK_CALLBACK_SCHEME).toBe("haus.waffle.ergomatic");
    expect(JSON.parse(String(calls[1]!.init!.body))).toStrictEqual({
      code: "CODE1",
      state: "abc",
    });
    expect(outcome).toStrictEqual({
      kind: "linked",
      c2UserId: 2211,
      weightClass: "H",
      stateEchoed: true,
    });
  });

  it("exchanges the MINT's state, not the callback's, when the callback omits state (the echo-independence case)", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const { calls } = mockApi(MINT_OK, () =>
      jsonResponse(200, { linked: true, c2UserId: 2211, weightClass: "L" }),
    );
    mockPlugin(
      vi.fn(async () => ({
        callbackUrl: "haus.waffle.ergomatic://oauth/callback?code=CODE2",
      })),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    const outcome = await startLink({ weightClass: "L" });

    expect(JSON.parse(String(calls[1]!.init!.body))).toStrictEqual({
      code: "CODE2",
      state: "abc",
    });
    expect(outcome).toStrictEqual({
      kind: "linked",
      c2UserId: 2211,
      weightClass: "L",
      stateEchoed: false,
    });
  });

  it("refuses to exchange when the callback carries a DIFFERENT state, and says nothing about the two values", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const { api } = mockApi(MINT_OK);
    mockPlugin(
      vi.fn(async () => ({
        callbackUrl: "haus.waffle.ergomatic://oauth/callback?code=CODE3&state=NOTABC",
      })),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    const outcome = await startLink({ weightClass: "H" });

    expect(outcome).toStrictEqual({ kind: "stateMismatch" });
    expect(api).toHaveBeenCalledExactlyOnceWith(
      "/api/concept2/connect",
      expect.anything(),
    );
    const logged = String(error.mock.calls[0]?.[0] ?? "");
    expect(logged).toContain("[linkFlow]");
    expect(logged).not.toContain("NOTABC");
    expect(logged).not.toContain("abc");
  });

  it("reports `declined` and never exchanges when Concept2 returns error=access_denied", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const { api } = mockApi(MINT_OK);
    mockPlugin(
      vi.fn(async () => ({
        callbackUrl: "haus.waffle.ergomatic://oauth/callback?error=access_denied&state=abc",
      })),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "declined",
      stateEchoed: true,
    });
    expect(api).toHaveBeenCalledOnce();
  });

  it("reports `malformed` (never `cancelled`) for a callback with neither a code nor a recognised error", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    mockApi(MINT_OK);
    mockPlugin(
      vi.fn(async () => ({
        callbackUrl: "haus.waffle.ergomatic://oauth/callback?error=server_error",
      })),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "malformed",
      stateEchoed: false,
    });
  });

  it.each([
    ["cancelled", "cancelled"],
    ["busy", "busy"],
    ["abandoned", "abandoned"],
    ["noWindow", "noWindow"],
    ["noContext", "noContext"],
    ["contextInvalid", "contextInvalid"],
  ])("maps the plugin's `%s` rejection onto the same typed outcome", async (code, kind) => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    mockApi(MINT_OK);
    mockPlugin(
      vi.fn(async () => {
        const err = new Error("rejected") as Error & { code: string };
        err.code = code;
        throw err;
      }),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({ kind });
  });

  it("does NOT fold an unrecognised plugin rejection into `cancelled`", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    mockApi(MINT_OK);
    mockPlugin(
      vi.fn(async () => {
        const err = new Error("the system will not start one") as Error & { code: string };
        err.code = "cannotStart";
        throw err;
      }),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "pluginError",
      code: "cannotStart",
      message: "the system will not start one",
    });
  });

  it("reports `updateRequired` on the mint's 409 and never opens a session", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    mockApi(() => jsonResponse(409, { error: "update_required" }));
    const start = vi.fn();
    mockPlugin(start);
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({ kind: "updateRequired" });
    expect(start).not.toHaveBeenCalled();
  });

  it("passes the exchange's typed error through so a caller can key on body.error", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    mockApi(MINT_OK, () => jsonResponse(403, { error: "principal_mismatch" }));
    mockPlugin(
      vi.fn(async () => ({
        callbackUrl: "haus.waffle.ergomatic://oauth/callback?code=CODE4&state=abc",
      })),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "exchangeFailed",
      status: 403,
      error: "principal_mismatch",
      stateEchoed: true,
    });
  });

  it("reports `serverError` for a non-2xx whose body is not {error} JSON (an old image's Express 404 HTML mid-deploy)", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    mockApi(
      MINT_OK,
      () =>
        new Response("<!DOCTYPE html><p>Cannot POST /api/concept2/exchange</p>", {
          status: 404,
          headers: { "Content-Type": "text/html" },
        }),
    );
    mockPlugin(
      vi.fn(async () => ({
        callbackUrl: "haus.waffle.ergomatic://oauth/callback?code=CODE5&state=abc",
      })),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "serverError",
      status: 404,
      stateEchoed: true,
    });
  });

  it("reports `networkError` when the mint request itself throws, and RELEASES the guard so the next tap works", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    // The tunnel drops: `api()` rejects rather than answering. Without the
    // catch this escapes `startLink` as a rejected promise and the probe card
    // shows nothing; without the `finally`, the guard stays set forever.
    let thrownYet = false;
    const api = vi.fn(async (path: string) => {
      if (!thrownYet) {
        thrownYet = true;
        throw new Error("Load failed");
      }
      if (path === "/api/concept2/connect") return MINT_OK();
      return jsonResponse(200, { linked: true, c2UserId: 2211, weightClass: "H" });
    });
    vi.doMock("../api", () => ({ api }));
    const start = vi.fn(async () => ({
      callbackUrl: "haus.waffle.ergomatic://oauth/callback?code=CODE6&state=abc",
    }));
    mockPlugin(start);
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "networkError",
      message: "Load failed",
    });
    expect(start).not.toHaveBeenCalled();

    // The guard released: the next tap gets past `linkInFlight` and completes.
    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "linked",
      c2UserId: 2211,
      weightClass: "H",
      stateEchoed: true,
    });
  });

  it("refuses a SECOND concurrent call with `busy` without minting again (the UX guard; the plugin is the authority)", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const { api } = mockApi(MINT_OK, () =>
      jsonResponse(200, { linked: true, c2UserId: 1, weightClass: "H" }),
    );
    // ONE RESOLVER PER PLUGIN CALL. Every `WebAuth.start()` returns a fresh
    // never-resolved promise, so a single `release` variable cannot release the
    // first session AND the third one -- the third `await startLink()` would
    // hang on a resolver nobody ever calls.
    const releases: ((r: { callbackUrl: string }) => void)[] = [];
    mockPlugin(
      vi.fn(
        () =>
          new Promise<{ callbackUrl: string }>((resolve) => {
            releases.push(resolve);
          }),
      ),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    const first = startLink({ weightClass: "H" });
    const second = await startLink({ weightClass: "H" });

    expect(second).toStrictEqual({ kind: "busy" });
    expect(api).toHaveBeenCalledOnce();

    // `await startLink()` above yields ONE microtask; the first attempt is
    // still inside `await res.json()`, which settles on a LATER task, so a
    // release fired here lands on a resolver that does not exist yet and is
    // dropped silently -- `await first` then never settles (measured, Node 26).
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases[0]!({
      callbackUrl: "haus.waffle.ergomatic://oauth/callback?code=C&state=abc",
    });
    await first;

    // And the guard RELEASES: a third call after the first settles mints again.
    // The wait is on the SECOND resolver being armed, which is the observable
    // that the third attempt got past `linkInFlight` and reached the plugin.
    const third = startLink({ weightClass: "H" });
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect(api.mock.calls.filter((c) => c[0] === "/api/concept2/connect")).toHaveLength(2);
    releases[1]!({
      callbackUrl: "haus.waffle.ergomatic://oauth/callback?code=C2&state=abc",
    });
    await third;
  });
});

describe("startLink on web", () => {
  it("mints WITHOUT a linkClient declaration and hands off to a full-page navigation", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const { calls } = mockApi(MINT_OK);
    const openExternalUrl = vi.fn();
    vi.doMock("./externalBrowser", () => ({ openExternalUrl }));
    const start = vi.fn();
    mockPlugin(start);
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    const outcome = await startLink({ weightClass: "L" });

    expect(JSON.parse(String(calls[0]!.init!.body))).toStrictEqual({ weightClass: "L" });
    expect(openExternalUrl).toHaveBeenCalledExactlyOnceWith(
      "https://log-dev.concept2.com/oauth/authorize?client_id=1&state=abc",
    );
    expect(start).not.toHaveBeenCalled();
    expect(outcome).toStrictEqual({ kind: "navigating" });
  });

  it("reports a failed mint with its status and typed error, and navigates nowhere", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    mockApi(() => jsonResponse(403, { error: "unavailable" }));
    const openExternalUrl = vi.fn();
    vi.doMock("./externalBrowser", () => ({ openExternalUrl }));
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "mintFailed",
      status: 403,
      error: "unavailable",
    });
    expect(openExternalUrl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it** → red (`./linkFlow` does not exist; typecheck fails first).

- [ ] **Step 3: `src/native/webAuth.ts`.**

```ts
/* v8 ignore start -- thin plugin wrapper; the real implementation is Swift and
 * is proven on device by the PR1.75b walk
 * (docs/superpowers/plans/2026-09-02-concept2-pr175b-walk.md), the same
 * coverage-exemption reasoning as this directory's other files
 * (`keepAwake.ts`, `appLifecycle.ts`, `externalBrowser.ts`, `signin.ts`). */
import { registerPlugin } from "@capacitor/core";

/** Options for `WebAuth.start`. Mirrors `WebAuthPlugin.startOnMain(_:)`'s
 *  three `call.get*` reads exactly (`app/ios/App/App/WebAuthPlugin.swift`).
 *  `callbackScheme` is the BARE scheme, never with `://` -- the Swift side
 *  rejects `badRequest` if it carries `:` or `/`. */
export interface WebAuthStartOptions {
  url: string;
  callbackScheme: string;
  /** `prefersEphemeralWebBrowserSession`. Always `true` for the Concept2
   *  link: design §4 treats it as a CONTROL against RFC 9700 §4.5 code
   *  injection on a shared phone, not a UX preference. */
  ephemeral: boolean;
}

export interface WebAuthStartResult {
  /** The absolute callback URL, e.g.
   *  `haus.waffle.ergomatic://oauth/callback?code=...&state=...`. */
  callbackUrl: string;
}

/**
 * Rejections carry a `code` on the thrown error (Capacitor turns
 * `call.reject(message, code)` into one). The Swift side's full set:
 * `busy` | `noWindow` | `cancelled` | `noContext` | `contextInvalid` |
 * `abandoned` | `cannotStart` | `badRequest` | `pluginError`.
 * `adapters/linkFlow.ts` is the only reader and maps every one of them; an
 * unrecognised code becomes `pluginError` there rather than being folded into
 * `cancelled`.
 */
export interface WebAuthPlugin {
  start(options: WebAuthStartOptions): Promise<WebAuthStartResult>;
}

export const WebAuth = registerPlugin<WebAuthPlugin>("WebAuth");
/* v8 ignore stop */
```

- [ ] **Step 4: `src/adapters/linkFlow.ts`.**

```ts
// Wave E PR1.75b (2026-09-02-concept2-pr175-app-bind-design.md §3-§4): the ONE
// place the Concept2 link's platform conditional lives. Native opens an
// `ASWebAuthenticationSession` through the local `WebAuth` plugin and finishes
// the link itself; web hands off to a full-page navigation and learns the
// outcome on the fresh mount after Concept2 redirects to our own callback page
// -- never through a return hook. That asymmetry is the whole reason PR1.5's
// `useReturnToApp` return arm (its modal-dismiss signal included) is retired
// in this PR: with the callback arriving in a promise on native and the SPA
// unloading on web, nothing is left for a second return mechanism to do, and
// "two mechanisms for one return must not survive on one surface" (design §4).
//
// Native-first idiom, same as `appLifecycle.ts`/`externalBrowser.ts`:
// `isNative()` picks the arm and the native arm reaches its plugin ONLY through
// a dynamic `import()` inside that branch, so `src/native/webAuth.ts` (and the
// Capacitor plugin registration it performs at module scope) never executes in
// a web session.

import { api } from "../api";
import { isNative } from "../platform";
import { openExternalUrl } from "./externalBrowser";

/** RFC 8252 §7.1's reverse-domain scheme of the bundle id
 *  `haus.waffle.ergomatic` (`app/ios/App/App.xcodeproj/project.pbxproj`'s
 *  PRODUCT_BUNDLE_IDENTIFIER). The BARE scheme -- Apple's own guidance is that
 *  a scheme "should not include special characters such as ':' or '/'". Must
 *  equal the scheme half of the server's `NATIVE_REDIRECT_URI`
 *  (`server/routes/concept2.ts:67`, `haus.waffle.ergomatic://oauth/callback`);
 *  they are two spellings of one registration at Concept2. */
export const LINK_CALLBACK_SCHEME = "haus.waffle.ergomatic";

/** Design §3: a bearer mint must DECLARE it can receive the native redirect.
 *  A capability, not a version -- it only ever narrows. Must equal
 *  `NATIVE_LINK_CLIENT` (`server/routes/concept2.ts:74`); a build that omits
 *  it is answered `409 {error:"update_required"}` and issued nothing, which is
 *  what makes flipping `C2_LINK_ENABLED` safe against an installed build that
 *  predates the `WebAuth` plugin. */
export const LINK_CLIENT = "webauth-1";

export type WeightClass = "H" | "L";

/**
 * Every way a link attempt can end. Design §4 names nine; this union adds
 * `linked`/`navigating` (the two successes), `updateRequired`/`mintFailed`/
 * `exchangeFailed` (the two server hops the design describes in prose), and
 * `pluginError` (plan observation 2 -- `cannotStart`, a failed `start()`, or a
 * foreign `NSError` have no other home, and folding them into `cancelled`
 * would report a real failure as a user's decision).
 *
 * `networkError` is the TRANSPORT's member. Every other member names a failure
 * somebody designed; this one names the failures nobody designed -- `api()`'s
 * own `fetch` rejecting, `res.json()` on a truncated body, `new URL()` on a
 * callback string that is not a URL. Without it a thrown request escapes
 * `startLink` as a rejected promise and the walk operator taps the button and
 * sees NOTHING, on a walk conducted over a cloudflared quick tunnel where a
 * dropped request is a normal event.
 *
 * `stateEchoed` rides every outcome derived from a parsed callback because it
 * is a MEASUREMENT the walk owes (design exit criterion 4): whether Concept2
 * echoes `state` on a private-use-scheme redirect is UNMEASURED, and nothing
 * here depends on it -- the exchange always sends the MINT's `state`.
 */
export type LinkOutcome =
  | { kind: "linked"; c2UserId: number; weightClass: WeightClass; stateEchoed: boolean }
  | { kind: "navigating" }
  | { kind: "declined"; stateEchoed: boolean }
  | { kind: "malformed"; stateEchoed: boolean }
  | { kind: "stateMismatch" }
  | { kind: "exchangeFailed"; status: number; error: string; stateEchoed: boolean }
  | { kind: "serverError"; status: number; stateEchoed: boolean }
  | { kind: "mintFailed"; status: number; error: string | null }
  | { kind: "updateRequired" }
  | { kind: "busy" }
  | { kind: "cancelled" }
  | { kind: "abandoned" }
  | { kind: "noWindow" }
  | { kind: "noContext" }
  | { kind: "contextInvalid" }
  | { kind: "pluginError"; code: string; message: string }
  | { kind: "networkError"; message: string };

// UX convenience ONLY, and the comment says so because the distinction is the
// design's (§2 lifetime table): the AUTHORITY on "one link session per app
// process" is `WebAuthPlugin`'s `activeSession`, in Swift, because a WebView
// reload destroys this module and everything in it. This flag exists so a
// double-tap in one document does not mint twice.
let linkInFlight = false;

async function readError(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const error = (body as { error: unknown }).error;
      return typeof error === "string" ? error : null;
    }
    return null;
  } catch {
    // Not JSON at all: an old server image's Express 404 HTML during a rolling
    // deploy is the named case (design §4).
    return null;
  }
}

function pluginRejection(err: unknown): LinkOutcome {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  const message = err instanceof Error ? err.message : String(err);
  switch (code) {
    case "cancelled":
      return { kind: "cancelled" };
    case "abandoned":
      return { kind: "abandoned" };
    case "busy":
      return { kind: "busy" };
    case "noWindow":
      return { kind: "noWindow" };
    case "noContext":
      return { kind: "noContext" };
    case "contextInvalid":
      return { kind: "contextInvalid" };
    default:
      return { kind: "pluginError", code: code === "" ? "unknown" : code, message };
  }
}

async function completeNative(
  authorizeUrl: string,
  state: string,
): Promise<LinkOutcome> {
  const { WebAuth } = await import("../native/webAuth");
  let callbackUrl: string;
  try {
    const result = await WebAuth.start({
      url: authorizeUrl,
      callbackScheme: LINK_CALLBACK_SCHEME,
      ephemeral: true,
    });
    callbackUrl = result.callbackUrl;
  } catch (err) {
    return pluginRejection(err);
  }

  // `searchParams` decodes `+` as a SPACE (WHATWG application/x-www-form-
  // urlencoded), so if Concept2 ever emits an unencoded `+` inside a `code`
  // the exchange fails as `502 c2_error` -> `exchangeFailed` rather than
  // silently linking the wrong thing -- symmetric with Express's own query
  // parser on the web callback, and the walk would surface it.
  const params = new URL(callbackUrl).searchParams;
  const code = params.get("code");
  const returnedState = params.get("state");
  const stateEchoed = returnedState !== null;

  if (code === null) {
    // The rower declined at Concept2's own screen: a SUCCESS callback with no
    // code. Not an error, and the attempt is left to expire rather than being
    // consumed.
    if (params.get("error") === "access_denied") return { kind: "declined", stateEchoed };
    // Anything else with no code is `malformed`, never `cancelled`: a
    // cancellation is something the OS tells us about, and calling this one
    // would hide a callback shape we do not understand.
    return { kind: "malformed", stateEchoed };
  }

  // Defence in depth, not a control (design §4). `state` is undocumented as a
  // pass-through at Concept2 and UNMEASURED on a private-use redirect, so when
  // it is absent this check is a deliberate no-op. The log records THAT a
  // mismatch happened; printing either value would put a live correlation
  // secret in the console.
  if (returnedState !== null && returnedState !== state) {
    console.error(
      "[linkFlow] the callback carried a state that does not match this attempt's; refusing to exchange",
    );
    return { kind: "stateMismatch" };
  }

  // Always the MINT's `state` (design §3: mint returns it explicitly so the
  // app never depends on an echo).
  const res = await api("/api/concept2/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, state }),
  });
  if (res.ok) {
    const body = (await res.json()) as {
      linked: boolean;
      c2UserId: number;
      weightClass: WeightClass;
    };
    return {
      kind: "linked",
      c2UserId: body.c2UserId,
      weightClass: body.weightClass,
      stateEchoed,
    };
  }
  const error = await readError(res);
  if (error === null) return { kind: "serverError", status: res.status, stateEchoed };
  return { kind: "exchangeFailed", status: res.status, error, stateEchoed };
}

/**
 * Starts a Concept2 link. Mints an attempt, then finishes it on this surface.
 *
 * Native: the whole flow completes inside this promise. Web: resolves
 * `navigating` once the full-page navigation is handed off; the SPA is
 * unloading and the outcome is read from `GET /api/concept2/link` on the next
 * mount.
 */
export async function startLink({
  weightClass,
}: {
  weightClass: WeightClass;
}): Promise<LinkOutcome> {
  if (linkInFlight) return { kind: "busy" };
  linkInFlight = true;
  try {
    const native = isNative();
    const res = await api("/api/concept2/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The declaration is sent only where it means something. The server
      // reads it only when it derived `surface === "native"` from the bearer
      // (`routes/concept2.ts:238-240`), so a cookie caller asserting a native
      // capability would be a claim about a surface it is not on.
      body: JSON.stringify(native ? { weightClass, linkClient: LINK_CLIENT } : { weightClass }),
    });
    if (!res.ok) {
      const error = await readError(res);
      if (res.status === 409 && error === "update_required") return { kind: "updateRequired" };
      return { kind: "mintFailed", status: res.status, error };
    }
    const { authorizeUrl, state } = (await res.json()) as {
      authorizeUrl: string;
      state: string;
    };
    if (!native) {
      await openExternalUrl(authorizeUrl);
      return { kind: "navigating" };
    }
    return await completeNative(authorizeUrl, state);
  } catch (err) {
    // The transport's own member. `api()`'s fetch can reject outright (a
    // cloudflared tunnel dropping mid-walk is the named case), `res.json()`
    // can throw on a truncated body, and `new URL(callbackUrl)` throws on a
    // callback string that is not a URL. Every one of those would otherwise
    // escape as a rejected promise and the caller -- the probe card, on a
    // device, with no console -- would show nothing at all.
    return { kind: "networkError", message: err instanceof Error ? err.message : String(err) };
  } finally {
    // In the `finally`, not the catch: the guard must release on EVERY exit,
    // or one thrown request wedges the surface until the document reloads.
    linkInFlight = false;
  }
}
```

**The `browserFinished` and `appUrlOpen` rows (Task 8 step 3's census table) are literal counts under `app/src`; new prose anywhere in this plan — including Task 7's fold edits to this file and to `WebAuthPlugin.swift` — must not reintroduce either token.** Task 3 step 3's replacement header is safe because `onBrowserFinished` is capital-B and does not match. **Separately: replacement/new prose must not introduce any of the four RF5 tokens (`onBrowserFinished`, `onNativeBrowserFinished`, `useReturnToApp`, `ReturnToAppStatus`) beyond the five lines the sweep names; Task 4 step 4's sweep is the check.**

- [ ] **Step 5: Run** → green. **Run `pnpm format` (Prettier) over `linkFlow.ts`/`linkFlow.test.ts` FIRST** — the prescribed blocks above are written for readability, not to printWidth (measured 2026-09-02: both warn under `prettier --check`; pure re-wrapping, no literal or census phrase moves). The pre-commit hook would rewrite them anyway; running it first keeps the diff you review equal to the diff you commit. Then `pnpm lint` (the `no-restricted-imports` boundary must accept `linkFlow.ts`'s `../platform` and `../native/webAuth` — `eslint.config.js:89-90` exempts `src/native/**` and `src/adapters/**`; if it complains, the file is in the wrong directory, not the rule).
- [ ] **Step 6: The JS↔Swift contract census — a COMMITTED gate, not a one-off grep.** The plugin's wire contract is four string literals agreeing across four files that no compiler checks together: Swift's `call.get*` keys, Swift's `reject` codes, the plugin's `jsName`, and the callback scheme. A typo in any of them is invisible until a device walk. Justified by RF19 (CLAUDE.md): the JS↔Swift string contract has no other instrument — `src/native/**` is coverage-excluded, there is no XCTest target, and e2e runs on web — so the census is the only gate that can see it. Create `app/scripts/webauth-contract.test.ts` — `scripts/**/*.test.ts` is in the `unit` project (`vitest.config.ts:10-14`), so CI runs it on every push, in `node` where `fs` works:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";

// Wave E PR1.75b. The `WebAuth` plugin's contract is four sets of STRING
// LITERALS spread across Swift, TS and a plist, and nothing in the toolchain
// compares them: `registerPlugin<T>(name)` is generic over a name it never
// checks, `call.getString("url")` is a dictionary lookup, and a mistyped
// reject code silently becomes `pluginError`. Every one of those failures is
// invisible until someone is standing at a phone. This file is the only gate
// that can see them, so it reads the real sources rather than a fixture.
//
// Reading `server/routes/concept2.ts` here is a READ, not a write: the PR's
// scope gate is "zero files CHANGED under app/server/" (design §0), and the
// scheme literal has to be checked against the authority that issues the
// redirect or the check is a mirror.

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, "..", p), "utf8");

const swift = read("ios/App/App/WebAuthPlugin.swift");
const webAuth = read("src/native/webAuth.ts");
const linkFlow = read("src/adapters/linkFlow.ts");
const routes = read("server/routes/concept2.ts");
const plist = read("ios/App/App/Info.plist");
const js = webAuth + linkFlow;

function matchAll(source: string, re: RegExp): string[] {
  return [...source.matchAll(re)].map((m) => m[1]!);
}

/** Every `call.reject(message, "code")` code, taken as the LAST quoted string
 *  on a line containing `.reject(` -- messages carry `\(interpolation)` and
 *  backticks, so a single whole-call regex is not robust.
 *
 *  The `\\.` alternative in the string body is what makes it robust: a Swift
 *  `\(interpolation)` contains a backslash, and the naive `[^"\\]*` form stops
 *  dead at it, so the whole quoted string is invisible and the LINE yields
 *  nothing. Measured 2026-09-02: that form saw 12 of the 14 `.reject(` lines,
 *  and the two it could not see were exactly the two the comment above names
 *  as its reason for existing. */
function rejectCodes(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => line.includes(".reject("))
    .map((line) => {
      const quoted = matchAll(line, /"((?:[^"\\]|\\.)*)"/g);
      return quoted[quoted.length - 1] ?? "";
    })
    .filter((code) => /^[A-Za-z][A-Za-z0-9]*$/.test(code));
}

describe("WebAuth plugin contract (Swift <-> TS <-> plist)", () => {
  it("every option key the Swift reads is named on the JS side", () => {
    const keys = matchAll(swift, /call\.get(?:String|Bool)\("([^"]+)"/g);
    expect(keys.length).toBeGreaterThan(0);
    expect([...new Set(keys)].sort()).toStrictEqual([
      "callbackScheme",
      "ephemeral",
      "url",
    ]);
    for (const key of keys) expect(js).toContain(key);
  });

  it("every rejection code the Swift can emit is named on the JS side", () => {
    const codes = rejectCodes(swift);
    // Every `.reject(` line must have yielded a code. Without this, a regex
    // that silently skips a line shrinks the set instead of failing (measured
    // 2026-09-02: the `[^"\\]*` form saw 12 of 14 lines and stayed green
    // through a deliberate typo on an interpolated one).
    expect(codes).toHaveLength(
      swift.split("\n").filter((l) => l.includes(".reject(")).length,
    );
    // The nine of design §4 + plan observation 2. Pinned as an INDEPENDENT
    // literal list, not derived from the file, so deleting a reject arm in
    // Swift fails here instead of quietly shrinking the expectation.
    expect([...new Set(codes)].sort()).toStrictEqual([
      "abandoned",
      "badRequest",
      "busy",
      "cancelled",
      "cannotStart",
      "contextInvalid",
      "noContext",
      "noWindow",
      "pluginError",
    ]);
    for (const code of codes) expect(js).toContain(code);
  });

  it("the plugin's Swift jsName is the name `registerPlugin` asks for", () => {
    const jsName = /let jsName = "([^"]+)"/.exec(swift)?.[1];
    const registered = /registerPlugin<[^>]*>\("([^"]+)"\)/.exec(webAuth)?.[1];
    expect(jsName).toBe("WebAuth");
    expect(registered).toBe(jsName);
  });

  it("the callback scheme is one registration spelled in three places", () => {
    const scheme = /LINK_CALLBACK_SCHEME = "([^"]+)"/.exec(linkFlow)?.[1];
    const nativeRedirect = /NATIVE_REDIRECT_URI = "([^"]+)"/.exec(routes)?.[1];
    expect(scheme).toBe("haus.waffle.ergomatic");
    // The scheme half of the server's redirect_uri, which is what Concept2
    // has registered and what the session filters callbacks on.
    expect(nativeRedirect?.split("://")[0]).toBe(scheme);
    // And the OS's own registration, so a rename cannot leave the plist behind.
    expect(plist).toContain(`<string>${String(scheme)}</string>`);
  });
});
```

  Run it: `cd .../app && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit scripts/webauth-contract.test.ts` → 4 passed. **Red proof (RF21) — TWO probes, because this test now makes two claims. DO NOT RUN THEM HERE:** `WebAuthPlugin.swift`, `webAuth.ts` and `linkFlow.ts` are not yet a COMMITTED tree at this point in the plan — that commit is Task 4 step 8 — and reverting a mutation against files nothing has committed is exactly what RF22 exists to prevent. **Run these two probes after Task 4 step 8's commit, alongside Task 4 step 9's mutation table**, where they are duplicated as a pointer:
  - **The census sees an INTERPOLATED line.** Rename the `@unknown default` arm's code — the `call.reject("Authentication session failed with an unknown code \(ns.code)", "pluginError")` line, chosen precisely because its message carries a Swift interpolation — to `"typoCode"`. The codes test must fail on the sorted-array comparison, and the `jsName`/scheme tests must still pass (so the failure is specific, not a blanket break). **This is the probe REV 2's red proof could not run:** with the old `/"([^"\\]*)"/g` the regex stopped at the interpolation's backslash, this line yielded nothing, the set silently shrank by one entry it already contained, and the assertion stayed GREEN through the typo (measured 2026-09-02).
  - **The length assertion bites.** With the code restored, revert the regex alone to `/"([^"\\]*)"/g` → `expect(codes).toHaveLength(...)` fails `12 !== 14`, naming the two lines the regex cannot see. Restore.

  Restore after `git status` each time (RF22). Record both exact failure texts. **Do this at Task 4 step 9, not here** (REV 5, antagonist pass 4).

- [ ] **Step 7: Per-file coverage (RF2).** `pnpm test:coverage`, then read `app/coverage/`'s HTML row for `src/adapters/linkFlow.ts`; state the number and the source you read. `src/native/webAuth.ts` is excluded by `vitest.config.ts:48`.
- [ ] **Step 8: Mutation probes (after Task 4's commit — this file and the probe commit together, see the commit-shape note in Self-review).** Each run against the committed tree, restored with an explicit `git status` first (RF22):

| mutation | test that must die |
| --- | --- |
| `ephemeral: true` → `ephemeral: false` | "mints with linkClient webauth-1, opens an EPHEMERAL session…" |
| `callbackScheme: LINK_CALLBACK_SCHEME` → `` `${LINK_CALLBACK_SCHEME}://` `` | same test (the exact-argument assertion) |
| exchange body `state` → `returnedState ?? state` | "exchanges the MINT's state, not the callback's…" (the callback omits it, so this yields `null`) |
| delete the `returnedState !== state` refusal | "refuses to exchange when the callback carries a DIFFERENT state…" |
| `access_denied` branch → return `{kind:"cancelled"}` | "reports `declined` and never exchanges…" |
| `default:` in `pluginRejection` → `return { kind: "cancelled" }` | "does NOT fold an unrecognised plugin rejection into `cancelled`" |
| `readError` catch → `return "unknown"` | "reports `serverError` for a non-2xx whose body is not {error} JSON" |
| drop `linkClient` from the native mint body | "mints with linkClient webauth-1…" |
| ADD `linkClient` to the web mint body | "mints WITHOUT a linkClient declaration…" |
| delete the `linkInFlight` guard | "refuses a SECOND concurrent call with `busy`…" |
| **delete the `finally` block entirely** (no other change — not "move the assignment", which is the variant that reads as equivalent and is not: moving it into the success path leaves an assignment the compiler and the reader can both still see, and a probe should remove the invariant, not relocate it) | BOTH of these, and BOTH are recorded: the busy test dies on **`await vi.waitFor(() => expect(releases).toHaveLength(2))`** (the third attempt returns `busy` immediately, never reaches the plugin, so no second resolver is ever armed — the wait times out naming `expected [ … ] to have a length of 2 but got 1`, and the `toHaveLength(2)` mint assertion below it is never reached), AND the `networkError` test's second-tap assertion. Two independent tests dying on one deleted block is what proves the guard releases on the THROWING exit as well as the settling one — one victim alone would leave the other path ungated |
| remove the `catch` that returns `networkError` (leave `try`/`finally`) | "reports `networkError` when the mint request itself throws…" — the test THROWS instead of failing an assertion (`Load failed` escapes `startLink`); record that exact text, it is the whole point of the member |

  Record each mutation and the exact failure text.

### Task 3: Retire PR1.5's browser-return arm (the census)

**Files:**
- Modify: `app/src/adapters/externalBrowser.ts` (remove `onBrowserFinished`, `:62-88`; rewrite the header, `:1-31`)
- Modify: `app/src/adapters/externalBrowser.test.ts` (remove the `onBrowserFinished` describe, `:65-101`)
- Modify: `app/src/native/externalBrowser.ts` (remove `onNativeBrowserFinished`, `:23-55`)
- Delete: `app/src/api/useReturnToApp.ts`, `app/src/api/useReturnToApp.test.tsx`
- Modify: `app/src/adapters/appLifecycle.ts` (`:42-55` — one sentence, see step 4)

- [ ] **Step 1: Run the census NOW and paste it into the task report** (it is the evidence the removal rests on, and it must be re-run at this head, not copied from this plan):

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b/app && \
for s in onBrowserFinished onNativeBrowserFinished useReturnToApp openExternalUrl openNativeExternalUrl registerWebAppLifecycleListener "@capacitor/browser"; do \
  echo "=== $s ==="; grep -rn --fixed-strings "$s" src e2e | grep -v "\.test\." ; done
```

  Expected, measured at `94b83c84` on 2026-09-02 (production files only — test files excluded above on purpose, since a test is not a consumer):

| symbol | production consumers TODAY | fate | why |
| --- | --- | --- | --- |
| `onBrowserFinished` (`adapters/externalBrowser.ts:79-88`) | `api/useReturnToApp.ts:7,201` — one | **REMOVED** | its only consumer goes with it |
| `onNativeBrowserFinished` (`native/externalBrowser.ts:48-55`) | `adapters/externalBrowser.ts:84` — one | **REMOVED** | same |
| `useReturnToApp` (`api/useReturnToApp.ts:99`) | `monitor/Concept2LinkProbe.tsx:3,43` — one, and Task 4 repoints it | **REMOVED**, with its test file | zero consumers after Task 4; keeping it is a second return mechanism on a surface that no longer has a return to notice |
| `openExternalUrl` (`adapters/externalBrowser.ts:53-60`) | `monitor/Concept2LinkProbe.tsx:2,62` — repointed by Task 4 | **STAYS**, now consumed by `adapters/linkFlow.ts`'s web arm | design §4's web arm is exactly this call |
| `openNativeExternalUrl` (`native/externalBrowser.ts:19-21`) | `adapters/externalBrowser.ts:56` | **STAYS** | it is `openExternalUrl`'s native arm |
| `@capacitor/browser` (dependency, `package.json:38`) | `native/externalBrowser.ts:5` | **STAYS** | design §4, verbatim: "PR2's 'View on Concept2' link-out is its consumer" |
| `registerWebAppLifecycleListener` (`adapters/appLifecycle.ts:70-80`) | `api/useReturnToApp.ts:4,228` — becomes zero | **STAYS**, deliberately (plan observation 5) | it is the raw Page Visibility primitive, exported with no consumer at all by Phase LL Minor 9 nine days before `useReturnToApp` existed (`appLifecycle.ts:42-55`); its own direct tests keep it covered; deleting it reverses a Phase LL ruling in a PR whose risk model is the Concept2 link |

  **The one sentence the design demands (design §0: "plus one sentence on why PR2's link-out needs no return signal — if that sentence cannot be written the arm stays"):** *PR2's link-out opens `/profile/{c2_user_id}/log/{result_id}` at Concept2, a READ of a row Ergomatic already uploaded. It changes no Ergomatic state, and any Concept2-side edit is picked up by the next status read, never by a return hook.* Grounded in the comment at `server/routes/concept2.ts:533-537`, which records PR2's link-out as a read (the route serves `c2UserId` at `:538`, never a `result_id`). **If the census run in this step disagrees with the table above — any additional production consumer — STOP: the arm stays, record the two-mechanism note in `adapters/externalBrowser.ts`'s header instead, and say so in the task report (design §4).**

- [ ] **Step 2: Failing-test-first is a DELETION here, so the check is inverted and stated.** Deletions have no new assertion to write; what must not silently rot is the surviving half. Before deleting anything, run `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/adapters/externalBrowser.test.ts` and record the current pass count; after the edits, the two `openExternalUrl` cases (`:29-63`) must still pass unchanged, and `Test Files` must read 1 passed (not 0 — a file that fails to load reads green on the other summary line).

- [ ] **Step 3: `adapters/externalBrowser.ts`.** Delete `onBrowserFinished` (`:62-88`) and the `import { isNative }`-adjacent prose about it. Replace the header comment (`:1-31`) with:

```ts
// Wave E PR1.5, narrowed at PR1.75b: opens an external URL for the rower.
// `adapters/linkFlow.ts`'s WEB arm is the consumer today (a full-page
// navigation to Concept2's consent screen, whose outcome is read from
// `GET /api/concept2/link` on the next mount); PR2's read-only "View on
// Concept2" link-out is the next one, and it is why `@capacitor/browser`
// stays a dependency.
//
// **`onBrowserFinished`/`onNativeBrowserFinished` were REMOVED at PR1.75b**
// (2026-09-02-concept2-pr175-app-bind-design.md §4): with the native link on
// `ASWebAuthenticationSession`, the callback arrives in a promise and the OS
// dismisses the browser itself, so the modal-dismiss signal had no consumer
// left. `api/useReturnToApp.ts` went with it. Two mechanisms for one return
// must not survive on one surface.
//
// Same native-first idiom as `appLifecycle.ts`/`keepAwake.ts`: `isNative()`
// picks the arm, and the native arm reaches its Capacitor plugin only through
// a dynamic `import()` inside that branch. **Narrowed claim, PR1.5 fix round 2
// (P2ii): `@capacitor/browser` being absent from a flag-off `dist/client` is
// because that build has no reachable consumer of the native branch, not
// because the dynamic import folds it out by itself.** The runtime-guarded
// `import()` below emits its own lazy CHUNK that IS present in `dist/client`
// whenever a consumer is compiled in; it is simply never LOADED by a web
// session, since `isNative()` is `false` there (RF12: `pnpm dist:grep`'s
// needles prove the absence of unreachable dev-only code; a legitimately
// SHIPPED, merely-unloaded chunk is a different claim and is not what that
// gate checks).
//
// WEB ARM: plain navigation. NATIVE ARM, PRIMARY
// (https://capacitorjs.com/docs/apis/browser): "On iOS, this uses
// SFSafariViewController." -- quoted verbatim in
// `src/native/externalBrowser.ts`'s own doc comment.
```

  And trim `openExternalUrl`'s own doc comment (`:36-52`) so its "that return is noticed by `useReturnToApp.ts`'s composed `resume`/`browserFinished` signal" sentence is replaced by: *"On native this is used only for read-only link-outs; the Concept2 link itself does not go through here (see `adapters/linkFlow.ts`)."*

- [ ] **Step 4: `native/externalBrowser.ts`, `adapters/externalBrowser.test.ts`, `appLifecycle.ts`.**
  - Delete `onNativeBrowserFinished` (`:23-55`) and update the file's remaining doc comment so its P1a narrative does not describe a function that no longer exists.
  - Delete the `describe("onBrowserFinished", ...)` block and its preamble comment (`externalBrowser.test.ts:65-101`), plus `vi.doUnmock("../native/externalBrowser")`'s justification if it becomes stale (it does not — `openExternalUrl`'s native case still mocks it).
  - `adapters/appLifecycle.ts:50-55`: the sentence "`registerWebAppLifecycleListener` still implements the raw Page Visibility mapping and stays exported and directly tested" is still TRUE and stays, but append: *"PR1.75b removed its last importer (`api/useReturnToApp.ts`); it remains exported as the raw primitive, exactly as Minor 9 left it, with `appLifecycle.test.ts` as its direct cover."* Without that sentence the next reader finds a zero-consumer export and cannot tell whether it is a leftover.
  - Delete `app/src/api/useReturnToApp.ts` and `app/src/api/useReturnToApp.test.tsx` (`git rm`).

  **The tree does not compile between this deletion and Task 4 step 3** — the probe still imports `useReturnToApp` at `Concept2LinkProbe.tsx:3,43`. That is expected, and it is why these land as ONE commit: **do not run `pnpm typecheck` here.** The RF5 sweep and the whole-project typecheck/lint/client run move to Task 4, as one combined pass over the finished T2+T3+T4 state (Task 4 step 4 below).

- [ ] **Step 5: Commit** with Task 4 (they are one behavioural change: the probe cannot compile without both). See the Self-review commit-shape note.

### Task 4: The probe's real-link button

**Files:**
- Modify: `app/src/monitor/Concept2LinkProbe.tsx` (full rewrite)
- Modify: `app/src/monitor/Concept2LinkProbe.test.tsx` (full rewrite)
- Verify (no change expected): `app/scripts/dist-grep.sh:103-113,127`, `app/scripts/ios-release.sh:42-45`, `app/src/You.tsx:19-23,97-101`

- [ ] **Step 1: Failing tests first.** Replace `app/src/monitor/Concept2LinkProbe.test.tsx` in full:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Wave E PR1.75b: this component IS the dist-grep-gated dev harness card
// (`docs/superpowers/plans/2026-09-02-concept2-pr175b-walk.md` carries the
// on-device walk; neither the walk nor the RF12 build-with/without-the-flag
// red proof is a unit-test concern). Its three jobs: it still carries the
// dist-grep needle, the button reaches `startLink`, and every outcome the
// walk has to READ reaches the screen -- including whether the callback
// carried `state`, which is one of the two measurements the walk owes
// (design exit criterion 4).

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("../adapters/linkFlow");
  vi.doUnmock("../api");
});

// `_path` is DECLARED but unused, and both halves of that are load-bearing.
// Declared: `vi.fn(async () => …)` types the mock's calls as `[]`, so the
// re-read test's `api.mock.calls.filter((c) => c[0] === "/api/concept2/link")`
// fails `TS2493: Tuple type '[]' of length '0' has no element at index '0'`
// (measured 2026-09-02 by placing this block at its real path and running
// `pnpm typecheck`). Underscore-prefixed: unprefixed, it fails
// `noUnusedParameters` and `@typescript-eslint/no-unused-vars`.
function mockLink(status: unknown, startLink = vi.fn()) {
  const api = vi.fn(
    async (_path: string) =>
      new Response(JSON.stringify(status), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.doMock("../api", () => ({ api }));
  vi.doMock("../adapters/linkFlow", () => ({ startLink }));
  return { api, startLink };
}

describe("Concept2LinkProbe", () => {
  it("carries the dist-grep needle as a data attribute", async () => {
    mockLink({ available: true, linked: false });
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);

    expect(document.querySelector("[data-c2-link-probe]")).toHaveAttribute(
      "data-c2-link-probe",
      "C2 link probe (dev harness)",
    );
  });

  it("reads the link status on mount and distinguishes a flag-off server from an unlinked account", async () => {
    mockLink({ available: false });
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);

    expect(await screen.findByText(/Link status: not available/i)).toBeInTheDocument();
    expect(screen.queryByText(/not linked/i)).not.toBeInTheDocument();
  });

  it("shows the linked account when the server says linked", async () => {
    mockLink({ available: true, linked: true, weightClass: "H", c2UserId: 2211 });
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);

    expect(await screen.findByText(/Link status: linked/i)).toBeInTheDocument();
    expect(screen.getByText(/2211/)).toBeInTheDocument();
  });

  it("says the status is UNREADABLE when the MOUNT read throws, instead of a perpetual `reading...` line", async () => {
    // The walk runs over a cloudflared quick tunnel; a dropped request is a
    // normal event there, and the failure mode this guards is an operator
    // reading a status line that describes a moment before the request that
    // never answered.
    const api = vi.fn(() => Promise.reject(new Error("Load failed")));
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);

    expect(
      await screen.findByText(/Link status: unreadable \(the request failed\)/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/reading\.\.\./i)).not.toBeInTheDocument();
  });

  it("flips a GOOD status line to unreadable when a RE-READ throws, instead of leaving the stale line", async () => {
    // The mount test above can only ever reach the `status === null` state, so
    // it cannot tell a correct check order from a swapped one. This is the
    // STALE half of the same guard: the first read succeeded, so `status` is
    // non-null, and a swapped order would fall straight through to `not
    // linked` — an operator reading a server state that stopped being true one
    // failed request ago. Reached through the button, which is the only path a
    // walk operator has.
    const api = vi
      .fn<(path: string) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ available: true, linked: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockRejectedValue(new Error("Load failed"));
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    await userEvent.click(screen.getByRole("button", { name: /re-read link status/i }));

    expect(
      await screen.findByText(/Link status: unreadable \(the request failed\)/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Link status: not linked/i)).not.toBeInTheDocument();
  });

  it("tapping Start real link calls startLink with weight class H (the card offers no selector)", async () => {
    const startLink = vi.fn(async () => ({ kind: "cancelled" }) as const);
    mockLink({ available: true, linked: false }, startLink);
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    await userEvent.click(screen.getByRole("button", { name: /start real link/i }));

    expect(startLink).toHaveBeenCalledExactlyOnceWith({ weightClass: "H" });
  });

  it("reports a successful link AND whether the callback carried state (the walk's own measurement)", async () => {
    const startLink = vi.fn(async () =>
      ({ kind: "linked", c2UserId: 2211, weightClass: "H", stateEchoed: false }) as const,
    );
    mockLink({ available: true, linked: false }, startLink);
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    await userEvent.click(screen.getByRole("button", { name: /start real link/i }));

    expect(await screen.findByText(/Last outcome: linked/i)).toBeInTheDocument();
    expect(screen.getByText(/Callback carried state: no/i)).toBeInTheDocument();
  });

  it("shows `yes` when the callback DID carry state", async () => {
    const startLink = vi.fn(async () =>
      ({ kind: "declined", stateEchoed: true }) as const,
    );
    mockLink({ available: true, linked: false }, startLink);
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    await userEvent.click(screen.getByRole("button", { name: /start real link/i }));

    expect(await screen.findByText(/Last outcome: declined/i)).toBeInTheDocument();
    expect(screen.getByText(/Callback carried state: yes/i)).toBeInTheDocument();
  });

  it("shows `n/a` for an outcome that never parsed a callback", async () => {
    const startLink = vi.fn(async () => ({ kind: "cancelled" }) as const);
    mockLink({ available: true, linked: false }, startLink);
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    await userEvent.click(screen.getByRole("button", { name: /start real link/i }));

    expect(await screen.findByText(/Last outcome: cancelled/i)).toBeInTheDocument();
    expect(screen.getByText(/Callback carried state: n\/a/i)).toBeInTheDocument();
  });

  it("re-reads the link status after a successful link, so the card cannot claim linked while the server disagrees", async () => {
    const startLink = vi.fn(async () =>
      ({ kind: "linked", c2UserId: 2211, weightClass: "H", stateEchoed: true }) as const,
    );
    const { api } = mockLink({ available: true, linked: false }, startLink);
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    await userEvent.click(screen.getByRole("button", { name: /start real link/i }));

    await waitFor(() => {
      expect(api.mock.calls.filter((c) => c[0] === "/api/concept2/link")).toHaveLength(2);
    });
  });

  it("disables the button while a link is in flight", async () => {
    let release: (o: { kind: "cancelled" }) => void = () => undefined;
    const startLink = vi.fn(
      () => new Promise<{ kind: "cancelled" }>((resolve) => { release = resolve; }),
    );
    mockLink({ available: true, linked: false }, startLink);
    vi.resetModules();
    const { default: Concept2LinkProbe } = await import("./Concept2LinkProbe");
    render(<Concept2LinkProbe />);
    await screen.findByText(/Link status: not linked/i);

    const button = screen.getByRole("button", { name: /start real link/i });
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());

    release({ kind: "cancelled" });
    await waitFor(() => expect(button).toBeEnabled());
    expect(startLink).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it** → red.

- [ ] **Step 3: The component.** Replace `app/src/monitor/Concept2LinkProbe.tsx` in full:

```tsx
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { startLink, type LinkOutcome } from "../adapters/linkFlow";

/**
 * Wave E PR1.75b: a dev-only card that runs a REAL Concept2 link against
 * `log-dev.concept2.com`, on device, through the same `adapters/linkFlow.ts`
 * PR2's card will use.
 *
 * **This is a real link now.** Its PR1.5 ancestor was the opposite -- it
 * opened `https://log-dev.concept2.com` in `SFSafariViewController` purely to
 * watch a return signal fire, posted nothing, and carried no client id or
 * state. That card and the `useReturnToApp` hook it exercised are both gone
 * (design §4's retirement): with `ASWebAuthenticationSession` the callback
 * arrives in a promise, so there is no return signal left to instrument.
 * A tap here mints an attempt, opens Concept2's consent screen in an
 * ephemeral session, and posts `POST /api/concept2/exchange`. On a walk build
 * pointed at a dev server with `C2_LINK_ENABLED=1`, completing it writes a
 * real `concept2_links` row.
 *
 * WHY IT EXISTS: nothing in this repo's own gates can reach the Swift plugin.
 * There is no XCTest target, `src/native/**` is coverage-exempt
 * (`vitest.config.ts:48`), and `pnpm e2e` runs on web where `isNative()` is
 * always false (RF19). This card plus the walk
 * (`docs/superpowers/plans/2026-09-02-concept2-pr175b-walk.md`) is the whole
 * instrument.
 *
 * READING THE TWO LINES TOGETHER. `Last outcome: cancelled` beside
 * `Link status: linked` is NOT a cancellation: it means the mint
 * authenticated by COOKIE, so the server derived `surface: "web"` and issued
 * the WEB `redirect_uri` (`routes/concept2.ts:67` vs the native constant).
 * Concept2 then redirected to our https callback INSIDE the sheet, which
 * completed the link server-side, and the rower dismissed a page the session
 * was never going to hand back -- hence `cancelled`. Record it if it appears;
 * it is direct evidence about the design's UNMEASURED "can a native request
 * carry a cookie" premise (design §1). On the walk this card was built for,
 * the web-callback path above cannot actually complete: the tunnel's
 * `https://<TUNNEL>/api/concept2/callback` is never registered at Concept2,
 * so an in-sheet web redirect would show D3's error page rather than
 * finishing. The server's `auth_via` log lines are the authority on what
 * actually happened if this pairing appears.
 *
 * `Link status` also distinguishes a FLAG-OFF server from an unlinked
 * account: `GET /api/concept2/link` answers `{available:false}` with HTTP 200
 * (`routes/concept2.ts:518-523`), so `describeStatus` names that case
 * explicitly rather than letting it read as "not linked". It names a THIRD
 * case for the same reason: when the read itself throws, the line says
 * `unreadable`, because a walk over a quick tunnel drops requests and a stale
 * status line is how an operator records a server state nobody observed.
 *
 * Build-time flag gated (`VITE_ENABLE_C2_LINK_PROBE`), same shape as
 * `AppRoutes.tsx`'s `VITE_ENABLE_FAKE_MONITOR` seam: mounted behind a dynamic
 * `import()` guarded by a build-time-folded condition (`You.tsx:19-23`), so
 * this card and its distinctive `data-c2-link-probe` literal are ABSENT from a
 * production build with the flag unset -- `dist-grep.sh:127`'s eighth needle
 * is that exact string, and `ios-release.sh:42-45` refuses to run at all while
 * the flag is exported.
 */
interface LinkStatus {
  available: boolean;
  linked?: boolean;
  weightClass?: "H" | "L";
  c2UserId?: number;
  needsReauth?: boolean;
}

/** `n/a` for the outcomes that never parsed a callback (a plugin rejection, a
 *  refused mint, the web arm's navigation hand-off). Whether Concept2 echoes
 *  `state` on a private-use-scheme redirect is UNMEASURED and nothing depends
 *  on it -- this readout is how the walk measures it. */
function stateEchoLabel(outcome: LinkOutcome | null): string {
  if (outcome === null) return "n/a";
  return "stateEchoed" in outcome ? (outcome.stateEchoed ? "yes" : "no") : "n/a";
}

function describeStatus(status: LinkStatus | null, statusError: boolean): string {
  // Checked BEFORE the null case: a failed read leaves `status` null, and
  // `reading...` on a request that already failed is a line that never
  // resolves and never says why.
  if (statusError) return "unreadable (the request failed)";
  if (status === null) return "reading...";
  // `{available:false}` comes back with HTTP 200 (routes/concept2.ts:518-523),
  // so a flag-off server would otherwise read exactly like an unlinked one.
  if (!status.available) return "not available (C2_LINK_ENABLED is off)";
  if (!status.linked) return "not linked";
  return `linked (C2 user ${String(status.c2UserId)}, ${String(status.weightClass)})`;
}

export default function Concept2LinkProbe() {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [outcome, setOutcome] = useState<LinkOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  // `.then`/`.catch` rather than `async`/`await`, and NOT stylistic: the mount
  // effect below calls this, and `react-hooks/set-state-in-effect`
  // (`eslint.config.js:35`) rejects an effect that reaches a `setState`
  // synchronously -- which an `async` function's pre-`await` body is. This is
  // the repo's own established mount-fetch idiom (`WorkoutDetail.tsx:52`,
  // `void f().then(cb)`); every `setState` here runs in a callback.
  //
  // Same reason `linkFlow` has a `networkError` member: on a walk over a
  // cloudflared quick tunnel a dropped request is normal, and a silently
  // stale status line is how an operator misreads the whole check. Without
  // this `.catch` the rejection escapes, the card keeps whatever
  // `Link status:` text it already had -- `not linked` from before a link
  // that DID succeed, or `reading...` forever on the mount read -- and the
  // operator records a server state nobody observed.
  const readStatus = useCallback(
    () =>
      api("/api/concept2/link")
        .then((res) => res.json())
        .then((s) => {
          setStatus(s as LinkStatus);
          setStatusError(false);
        })
        .catch(() => {
          setStatusError(true);
        }),
    [],
  );

  useEffect(() => {
    void readStatus();
  }, [readStatus]);

  async function onStart(): Promise<void> {
    setBusy(true);
    try {
      const result = await startLink({ weightClass: "H" });
      setOutcome(result);
      // The card never infers its own status from an outcome: it re-reads the
      // server. An outcome saying `linked` while `GET /link` disagrees is
      // exactly the kind of thing this card exists to show a walk operator.
      await readStatus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="c2-link-probe"
      data-c2-link-probe="C2 link probe (dev harness)"
    >
      <h2 className="section-heading">C2 LINK PROBE (DEV HARNESS)</h2>
      <p>{`Link status: ${describeStatus(status, statusError)}`}</p>
      <button
        type="button"
        className="button-outline"
        disabled={busy}
        onClick={() => void onStart()}
      >
        {busy ? "Linking..." : "Start real link (log-dev)"}
      </button>
      <p>{`Last outcome: ${outcome === null ? "none yet" : outcome.kind}`}</p>
      <p>{`Callback carried state: ${stateEchoLabel(outcome)}`}</p>
      <button type="button" className="button-outline" onClick={() => void readStatus()}>
        Re-read link status
      </button>
    </section>
  );
}
```

**This doc comment's `useReturnToApp` mention is one of the five lines Task 4 step 4's RF5 sweep names as prescribed; replacement/new prose here must not introduce any of the four RF5 tokens (`onBrowserFinished`, `onNativeBrowserFinished`, `useReturnToApp`, `ReturnToAppStatus`) beyond those five lines.**

- [ ] **Step 4: The combined T2+T3+T4 sweep and gates — this is the FIRST point at which the tree compiles**, because Task 3's deletion and this task's rewrite are two halves of one change (Task 3 step 4's note). Task 3's old steps 5-6 live here, run once over the finished state rather than twice over a broken one:
  - **Run `pnpm format` (Prettier) over the new/changed files FIRST** — the prescribed blocks are written for readability, not to printWidth (measured 2026-09-02: `linkFlow.test.ts`, `linkFlow.ts`, `Concept2LinkProbe.test.tsx`, `Concept2LinkProbe.tsx` all warn under `prettier --check`; pure re-wrapping, no literal or census phrase moves). The pre-commit hook would rewrite them anyway; running it first keeps the diff you review equal to the diff you commit.
  - Run this file's tests → green.
  - **RF5 sweep:** `grep -rn --fixed-strings -e onBrowserFinished -e onNativeBrowserFinished -e useReturnToApp -e ReturnToAppStatus app/src app/e2e` → the ONLY surviving hits are the FIVE lines the plan itself prescribes, across four files: Task 2 step 4's `linkFlow.ts` header (the `useReturnToApp` return-arm mention); Task 3 step 3's `externalBrowser.ts` replacement header, two lines (the `onBrowserFinished`/`onNativeBrowserFinished` mention and the `api/useReturnToApp.ts` mention); Task 3 step 4's `appLifecycle.ts` appended sentence (the `api/useReturnToApp.ts` mention); and Task 4 step 3's `Concept2LinkProbe.tsx` doc comment (the retired `useReturnToApp` hook mention). Any other hit is dead prose or a dead import: fix it here. Also `grep -rn "return-to-app\|returnToApp" app/src app/e2e`. **Replacement/new prose at any of these sites, or anywhere else in this plan, must not introduce any of the four RF5 tokens (`onBrowserFinished`, `onNativeBrowserFinished`, `useReturnToApp`, `ReturnToAppStatus`) beyond these five lines; this sweep is the check.**
  - `pnpm typecheck && pnpm lint && pnpm format:check` → green (the whole-project typecheck is the one the pre-commit hook will run, and this is the first state that can pass it).
  - `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client` → green. The client suite loses `useReturnToApp.test.tsx`'s files/tests and gains this file's; **record the before/after counts from BOTH summary lines** ("Test Files" and "Tests"), the before figure being the one taken in Task 3 step 2.
- [ ] **Step 5: `You.tsx` needs no change** — verify by reading `:19-23,97-101`: it lazy-imports the default export behind the same flag, which is unchanged. `You.test.tsx:13` already mocks the module to `() => null`, so the new `api` call cannot leak into that suite; confirm by running `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/You.test.tsx`.
- [ ] **Step 6: `dist-grep` still proves absence** — `pnpm build && pnpm dist:grep` → `dist-grep: OK — none of the 8 dev-only markers found in dist/client.` **Then the RF12 red proof** (this is the needle whose fold this PR could break, so its green is not trusted until it has been made red at this head): `VITE_ENABLE_C2_LINK_PROBE=1 pnpm build && pnpm dist:grep` → `dist-grep: FOUND dev-only reference "C2 link probe (dev harness)"` and a non-zero exit. Then rebuild without the flag and confirm OK again. Paste all three lines.
- [ ] **Step 7: `ios-release.sh`'s refusal is unchanged** — `VITE_ENABLE_C2_LINK_PROBE=1 GIT_DIR=/nonexistent bash scripts/ios-release.sh` exits 1 naming the flag (already covered by `ios-release.test.sh` case 1, re-run in Task 1).
- [ ] **Step 8: Commit** Tasks 2+3+4 as ONE commit: `feat(c2): the native link flow — WebAuth mirror, linkFlow adapter, the PR1.5 return-arm retirement, the probe's real link (PR1.75b)`. They cannot be split, because the whole-project pre-commit typecheck rejects every intermediate state (the probe references `linkFlow` before it exists; `useReturnToApp` has no consumer only after the probe is rewritten). `git rev-parse --show-toplevel` first.
- [ ] **Step 9: Mutation probes** for Task 2's table AND this task's:

| mutation | test that must die |
| --- | --- |
| `describeStatus`'s `!status.available` branch → fall through to `not linked` | "distinguishes a flag-off server from an unlinked account" |
| `stateEchoLabel` → always `"n/a"` | "reports a successful link AND whether the callback carried state" |
| `stateEchoLabel`'s `stateEchoed ? "yes" : "no"` → inverted | both echo tests |
| delete the second `readStatus()` in `onStart` | "re-reads the link status after a successful link" |
| `disabled={busy}` → `disabled={false}` | "disables the button while a link is in flight" |
| `weightClass: "H"` → `"L"` | "tapping Start real link calls startLink with weight class H (the card offers no selector)" |
| **delete `readStatus`'s `.catch(…)` clause**, leaving the two `.then`s (the chain is still valid — this is a one-clause deletion, not the whole wrapper) | "says the status is UNREADABLE when the MOUNT read throws…" — and it dies on the **ASSERTION**, not by throwing: `Unable to find an element with the text: /Link status: unreadable \(the request failed\)/i`. The effect calls `void readStatus()`, so the rejection is never surfaced to the test; it becomes a floating rejected promise while `findByText` times out. Measured 2026-09-02 against the prescribed blocks placed at their real paths: **both** `unreadable` tests fail (the Tests line reads 2 failed, 9 passed, of 11) and vitest additionally prints `Unhandled Rejection · Error: Load failed` twice. Record the assertion text and both unhandled rejections — that pair is what separates this row from the one below, which produces the same two failures with NO unhandled rejection |
| **`describeStatus`'s `statusError` check moved to the BOTTOM — below `!status.linked`, immediately above the final `linked (...)` return** (not merely below `status === null`: measured 2026-09-02 in Node, that weaker reordering still returns `unreadable` on the re-read path, because `statusError` is still checked before `!status.available`, and the re-read test stays GREEN) | **BOTH `unreadable` tests, and this is the added re-read test's biting mutation.** Mount path: `status` is null, so the line reads `reading...` forever instead of naming the failure. Re-read path: `status` is the non-null `{available:true, linked:false}` from the good mount read, so the swapped order falls straight through to `not linked` and the stale line survives the failed re-read — which is exactly the defect that test exists to catch. Separate from the row above because dropping the catch and mis-ordering the checks are two different defects with one symptom; **re-measured 2026-09-02 against the placed blocks and still biting after the `.then`/`.catch` rewrite** (the Tests line reads 2 failed, 9 passed, of 11; same assertion text; and — unlike the row above — NO unhandled rejection, because the `.catch` is still there swallowing the throw) |

  **Also run here — deferred from Task 2 step 6** (REV 5, antagonist pass 4: that step's tree is not a committed whole until THIS commit): the `webauth-contract.test.ts` red proof's two probes. (1) Rename the `@unknown default` arm's rejection code in `WebAuthPlugin.swift` to `"typoCode"` — the sorted-codes test must fail while the `jsName`/scheme tests stay green (this is the probe REV 2 could not run: the old `/"([^"\\]*)"/g` regex stopped at the Swift interpolation's backslash and stayed green through the same typo). (2) With the code restored, revert the regex alone to `/"([^"\\]*)"/g` — `expect(codes).toHaveLength(...)` fails `12 !== 14`. Restore both after `git status` (RF22); record both exact failure texts.

### Task 5: Pre-walk gates

Everything CI will run, run BEFORE the walk, so the walk is performed against a build that already passes. (The walk can still change the code — that is what Task 7 is for — and these gates are re-run there.)

- [ ] `pnpm lint && pnpm format:check && pnpm typecheck` → green.
- [ ] `pnpm test` (all three projects; Docker up for `integration`) → green. **Read BOTH summary lines** and record the file/test counts before and after this PR (the client project loses `useReturnToApp.test.tsx`).
- [ ] `pnpm test:coverage` → read the PER-FILE rows (RF2, TESTING.md §10) for `src/adapters/linkFlow.ts`, `src/adapters/externalBrowser.ts` and `src/monitor/Concept2LinkProbe.tsx`; the HTML report under `app/coverage/` is authoritative — say which source you read. `src/native/webAuth.ts` and the Swift are excluded/unreachable and that is stated, not glossed.
- [ ] **`pnpm e2e` — REQUIRED, and REQUIRED-BUT-BLIND, which is stated rather than glossed.** Required as a regression gate on the `useReturnToApp` deletion, NOT as coverage of this PR's new code: `grep -rn -i concept2 app/e2e` finds one hit, an unrelated comment about the PM5's BLE advertising name (`design.spec.ts:2017`); `grep -rn -E "returnToApp|browserFinished|linkFlow|c2-link" app/e2e` is empty. **No e2e spec exercises any of this PR's code.** The probe is the only consumer of `linkFlow`, and it is compiled out of the stack's bundle. What proves the web arm is `linkFlow.test.ts`'s `describe("startLink on web")` cases; what proves the native arm is the walk. Say this in the PR body rather than letting a green e2e badge carry a claim it cannot support (RF26). Note also that it rebuilds the per-worktree compose stack unconditionally and leaves it up; the teardown at phase close is `docker compose -p <this worktree's ergomatic-NNNNN name> down -v`.
- [ ] `pnpm build && pnpm dist:grep` (Task 4 step 6 already did this with its red proof; re-run clean here).
- [ ] **Xcode compile gate** (Task 1 step 9's commands), re-run at this head **in the same order — `pnpm build`, then `npx cap sync ios`, then `xcodebuild -list`, then the build.** Both are prerequisites of the compile gate and neither is discoverable by reading it: `cap sync` copies `webDir: "dist/client"` (`capacitor.config.ts:6`) and exits 1 with `Could not find the web assets directory: ./dist/client` in a worktree that has never built (measured 2026-09-02); `xcodebuild` then fails `error: The file "public" couldn't be opened`, because `app/ios/App/App/public/` and `config.xml` are gitignored (`app/ios/.gitignore:4,13`) and are what `cap sync` writes. (The `pnpm build` above already satisfies the first hop when this list is run in order.) Then: **gate (b)**, `git diff --stat -- app/ios` → **EMPTY** (the two generated paths are untracked and cannot appear; any output means a tracked iOS file moved → STOP); then the build into `-derivedDataPath /tmp/pr175b-dd`; then **gate (a)**, the two `grep -c` counts against `…/App.build/Objects-normal/arm64/App.SwiftFileList`, each of which must read `1` (compilation alone does not prove target membership; a missing `MyViewController.swift` builds fine and boots to a blank screen). **Not the `SwiftCompile` log grep** — measured 2026-09-02, a genuine member counts 4 there on a cold build and 0 on a warm one, so `= 1` is unreachable, and this re-run is warm by construction.
- [ ] **Scope gate:** `git diff main...HEAD --stat -- app/server app/drizzle` prints nothing.
- [ ] **`pnpm screenshots` — argued, not run.** The committed screenshots capture rower-facing screens; the only visual change in this PR is inside `Concept2LinkProbe`, which is gated behind `VITE_ENABLE_C2_LINK_PROBE` or `import.meta.env.DEV` (`You.tsx:19-20`) and is therefore absent from the compose stack's production bundle that `screenshots.sh` captures. **No screen a rower can reach changes layout, so no capture is owed** (memory: no-screenshots-for-copy). Verify the claim rather than asserting it: after `pnpm e2e`, `git status docs/screenshots` shows no diff. State this in the PR body with the verification.

### Task 6: The device walk — runs BEFORE the PR opens

**Files:**
- Create: `docs/superpowers/plans/2026-09-02-concept2-pr175b-walk.md` (the card)
- Create (during the walk): `docs/monitor/sessions/walk-2026-09-0X-c2-native/README.md` (the report; substitute the real date)

**Why it is a gate, not a courtesy (RF19, verbatim class):** the Swift plugin's every branch — the ephemeral session, the context provider, `busy`, `abandoned`, the three SDK error codes, the Info.plist question, the `state` echo — sits ABOVE the transport seam every instrument in this repo can reach. `src/native/**` is `v8 ignore`d, there is no XCTest target, and e2e runs on web. **If this walk does not run, nothing has tested `WebAuthPlugin.swift` at all.**

- [ ] **Step 1: Write the card.** Create `docs/superpowers/plans/2026-09-02-concept2-pr175b-walk.md` with the content below, verbatim. **Every command in it must be run or read against the code that serves it before it reaches James (RF13).** The evidence for each is cited in this plan's observations 8, 9 and 12 and in the notes under the card.

````markdown
# PR1.75b — the native Concept2 link, on device (walk card)

**What this proves:** that a real Concept2 consent, completed on the phone,
comes back into the app and writes a link. Nothing in this repo's own gates
can reach that code: the plugin is Swift with no test target, `src/native/**`
is coverage-exempt, and `pnpm e2e` runs on web. This card is the whole
instrument.

**No erg. No rowing budget.** About 20 minutes, most of it setup.

> **Run every block below in `bash`** — type `bash`, paste, and `exit` when
> you are done with that terminal. These are bash snippets (`set -a`,
> `export FOO=...`, `VAR=value cmd`) and this machine's default shell is
> **fish**, which rejects all three forms. Nothing here is fish-compatible and
> nothing here should be translated on the fly.

## Before you start

You need: the phone on the same machine's Xcode, `cloudflared`
(`brew install cloudflared`), Docker for the dev Postgres, and the log-dev
Concept2 credentials that live in **`/Users/james/projects/github/jamesawesome/Ergomatic/.env`**
(the MAIN checkout -- the worktree has no `.env`). That file holds
`LOGBOOK_CLIENT_ID_DEV` and `LOGBOOK_CLIENT_SECRET_DEV`. **Never echo them,
never paste them into a report.**

Confirm in the log-dev portal (Profile -> Edit Profile -> Applications ->
your app -> Callback endpoints) that BOTH rows still exist:
`https://<anything>/api/concept2/callback` and
`haus.waffle.ergomatic://oauth/callback`. The second was added 2026-09-02 and
the desk pre-check (design §GO/NO-GO, D3 PASS) confirmed the authorization
server honours it.

On the **PHONE**, open Safari, go to `https://log-dev.concept2.com`, sign in,
and confirm you are signed in. This is the precondition for the ephemeral
check in (a): without an existing Safari session, being asked to log in
proves nothing.

All commands below run from **`/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b`**
unless a block says otherwise.

## 1. Postgres

CLAUDE.md's long-lived `erg-dev-pg` dev container may already hold host port
5433 -- check first: `docker ps --filter publish=5433`. If it is taken, either
reuse that container (point `DATABASE_URL` at it below; this walk's migrations
apply at server boot) or pick a free port with `-p 5434:5432` and adjust every
`DATABASE_URL` in this card to match.

```
docker run --rm -d --name erg-walk-pg -p 5433:5432 -e POSTGRES_PASSWORD=dev postgres:18.4
```

## 2. The tunnel

In its own terminal:

```
cloudflared tunnel --url http://localhost:8080
```

It prints a line like `https://something-random.trycloudflare.com`. **That is
`<TUNNEL>` for the rest of this card.** Leave it running. HTTPS matters: the
app's `Info.plist` carries no `NSAppTransportSecurity` key, and every request
goes through native `URLSession` (`CapacitorHttp` is enabled in
`capacitor.config.ts:7-11`), so a plain `http://` LAN address is blocked by
App Transport Security. The tunnel host needs no Concept2 registration -- the
native leg's `redirect_uri` is the app scheme, not a URL.

## 3. The API server

In its own terminal, from `app/`. Read the two Concept2 values out of the main
checkout's `.env` without printing them:

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b/app
set -a; . /Users/james/projects/github/jamesawesome/Ergomatic/.env; set +a
export GOOGLE_IOS_CLIENT_ID="$(bash scripts/ios-google-client-id.sh ios/App/App/Info.plist)"
DATABASE_URL=postgres://postgres:dev@localhost:5433/postgres \
C2_LINK_ENABLED=1 \
C2_BASE_URL=https://log-dev.concept2.com \
C2_CLIENT_ID="$LOGBOOK_CLIENT_ID_DEV" \
C2_CLIENT_SECRET="$LOGBOOK_CLIENT_SECRET_DEV" \
AUTH_VIA_LOG=1 \
SITE_URL=https://<TUNNEL> \
ALLOWED_EMAILS=james@jamestheaweso.me \
pnpm dev:server
```

It should print `ergomatic api listening on :8080`.

**You WILL see `WARNING: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not fully set
— sign-in is DISABLED (auth routes will 503)` (`server/index.ts:76`), and it
is expected.** That disables the WEB sign-in route only. Native sign-in — the
one the phone uses — gates on `GOOGLE_IOS_CLIENT_ID` alone
(`server/index.ts:79-83` builds `nativeVerifier` from it, and
`server/auth/routes.ts:101-104` is the route that 503s without it), and step 3
exports it. Ignore this warning.

**The only warning that stops the walk is `WARNING: C2_LINK_ENABLED=1 but
C2_CLIENT_ID / C2_CLIENT_SECRET not fully set — Concept2 linking is DISABLED`
(`server/index.ts:126`).** If that appears the credentials did not load --
stop here, the whole walk is unrunnable.

`SITE_URL` is set for coherence, not necessity: native requests carry a bearer
and skip the origin check entirely (`server/auth/middleware.ts:50-53`), and
there is no CORS middleware. It only controls the WEB callback's redirect.

`AUTH_VIA_LOG=1` turns on the credential instrument this walk exists to read
(`server/auth/middleware.ts:113-124`) -- one JSON line per authenticated
request with `authVia`, `bearerPresent`, `cookiePresent` and `path`, never a
token value.

## 4. The build

In a third terminal, from `app/`:

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b/app
export VITE_ENABLE_C2_LINK_PROBE=1
export GOOGLE_IOS_CLIENT_ID="$(bash scripts/ios-google-client-id.sh ios/App/App/Info.plist)"
ERGOMATIC_API_BASE=https://<TUNNEL> pnpm ios:build
pnpm ios:open
```

`pnpm ios:build`'s last step, `scripts/ios-version.sh:12-13`, stamps
tag-derived version numbers into the Xcode project -- **watch for
`ios-version: stamped <VERSION> (<BUILD>)` in the output; that line is the
success signal.** It rewrites two TRACKED files, `App.xcodeproj/project.pbxproj`
and `App/Info.plist` -- expected, and restored in §7 before anything is
committed.

`ERGOMATIC_API_BASE` becomes `VITE_API_BASE` (`package.json:29`);
`GOOGLE_IOS_CLIENT_ID` becomes `VITE_GOOGLE_IOS_CLIENT_ID`, and it **defaults
to empty** if you skip it, which builds a bundle whose Google sign-in is
silently dead. Then Run to the phone from Xcode.

**Do NOT release this build.** `pnpm ios:release` refuses outright while
`VITE_ENABLE_C2_LINK_PROBE` is exported (`scripts/ios-release.sh:42-45`), and
the last step of this card unsets it anyway.

## 5. The five checks

Sign in on the phone first (Google), then go to the **You** tab and scroll to
the bottom for **C2 LINK PROBE (DEV HARNESS)** -- it sits second from the
bottom, above the diagnostics row. If the card is not there the build did not
carry the flag -- stop and re-check step 4.

**How to read the card's three lines.**

- `Link status: not available (C2_LINK_ENABLED is off)` is NOT the same as
  `not linked`. The server answers `{available:false}` with HTTP 200 when the
  flag is off, so the card names that case separately; if you see it, the
  server in step 3 did not get `C2_LINK_ENABLED=1`.
- **`Last outcome: cancelled` together with `Link status: linked` is a
  RESULT, not a cancellation.** It means the mint authenticated by COOKIE, so
  the server issued the WEB redirect, Concept2 redirected to our https
  callback inside the sheet, the link completed server-side, and you dismissed
  a page the session was never going to hand back. **Record it** -- it is
  direct evidence on the "can a native request carry a cookie" question this
  walk exists to answer, and the `auth_via` lines in check (e) will show it
  too. **On THIS walk the web-callback explanation cannot occur** (the
  tunnel's `https://<TUNNEL>/api/concept2/callback` is not registered at
  Concept2, so an in-sheet web redirect would show D3's error page instead);
  the `auth_via` lines in check (e) are the authority on what actually
  happened if you see this pairing.
- `Last outcome: networkError` means the request never reached the server at
  all -- almost always the cloudflared tunnel. Restart the tunnel, rebuild
  with the new `<TUNNEL>` host, and start the check again.
- **`Link status: unreadable (the request failed)` means the STATUS read
  itself failed** -- the card is telling you it does not know, rather than
  showing you a line from before the request that never answered. Same cause
  as `networkError`, same fix: the tunnel. **Never record a status while this
  is on screen**; tap **Re-read link status** until it says something else.

**(a) A real link.** The card should read `Link status: not linked`. Tap
**Start real link (log-dev)**.

- A sheet slides up showing Concept2's sign-in page. **RECORD: did the sheet
  ask you to log in again**, despite the Safari session you established
  above? YES = `prefersEphemeralWebBrowserSession` is in effect. NO = the
  sheet inherited Safari's cookies and the control is not working -- that is
  a FAIL, not a nicety.
- **RECORD: did any OS modal appear first**, asking permission to use
  Concept2's sign-in ("wants to use concept2.com to sign in")? Yes/no, and
  screenshot it if it does.
- Log in and approve. The sheet should dismiss ITSELF.
- **RECORD** what the card now reads: `Last outcome:`, `Callback carried
  state:` (this is the `state`-echo measurement), and `Link status:`. A PASS
  is `Last outcome: linked` and `Link status: linked (C2 user NNNN, H)`.
- **RECORD: did anything escape the session?** If the app visibly re-launched,
  flashed, or reloaded when the callback arrived, the URL went through the
  OS's URL-type routing rather than the session. It should not. This is the
  Info.plist-necessity observation.
- Photograph the card.

**(b) Cancel.** Tap **Start real link**, then dismiss the sheet with its own
Cancel/X. (An already-linked account can re-link -- `POST /connect` has no
already-linked refusal, `routes/concept2.ts:212-277`.)

- **RECORD:** `Last outcome: cancelled`, and `Callback carried state: n/a`.
- **RECORD** that the attempt survives: tap **Start real link** again and
  confirm a NEW sheet opens (a second mint succeeding is the observable). In
  the server terminal you should see a second `POST /api/concept2/connect`
  and NO `/api/concept2/exchange` between them.

**(c) Decline at Concept2.** Start a link, log in if asked, then use
Concept2's own **Deny**/**Cancel** on the consent screen.

- **RECORD:** `Last outcome: declined`, and that the server log shows no
  `exchange` request.

**(d) Reload mid-session.** Tap **Start real link**, and with the sheet OPEN,
reload the web view: attach Safari on the Mac (Develop -> your phone -> the
Ergomatic web view) and press its reload button.

This works because the build you just ran from Xcode is a **Debug** build:
`app/ios/debug.xcconfig` sets `CAPACITOR_DEBUG = true` and is the base
configuration for both Debug configs (`project.pbxproj:187,308`), which is
what makes `WKWebView.isInspectable` true. **A Release/TestFlight build cannot
be inspected at all** and this check is impossible on one
(`docs/history/phase-lt.md:185-190` is the phase that learned it the hard way).

- **PASS CRITERION: a FRESH `Start real link` works after the reload.** That
  is the whole observable. Tap it and confirm a new sheet opens; in the server
  terminal you should see a new `POST /api/concept2/connect`.
- **Do NOT expect to see the `abandoned` outcome on the card.** The rejection
  lands in a document that is being destroyed, so nothing renders it — the
  card comes back reading `Last outcome: none yet` (fresh document). The
  rejection's job is to release the native claim, and "a fresh link works" is
  how you observe that it did.
- **STOP condition:** the sheet lingers with no receiver, or every later tap
  does nothing / the card shows `Last outcome: busy`. That is the claim
  leaking — the `abandoned` path failing — and it is Task 7's named STOP.
- **Optional second producer, and it MEASURES AN INFERENCE:** a WebContent
  process termination makes Capacitor call `bridge?.reset()` +
  `webView.reload()` (`WebViewDelegationHandler.swift:158-162`, read in the
  source). Whether that recovery reload re-enters the policy decision with a
  MAIN-FRAME target frame — which is what the plugin's guard needs to release
  the claim — is UNVERIFIED. This variant is the only thing that can settle
  it. Force a termination from Safari's inspector (Develop -> the web view ->
  the process/Timelines menu, or just leave a heavy page thrashing until iOS
  kills it) with the sheet open, and record the same pass criterion: does a
  fresh `Start real link` work afterwards, or does the card read `busy`?
  **`busy` here is NOT a walk failure** — it falsifies an inference the plan
  already labelled as one, and belongs in the report as a finding. Skip it if
  it does not reproduce in a couple of minutes; the reload case is the one
  that gates.

**(e) The credential readings.** In the server terminal, copy EVERY
`{"event":"auth_via",...}` line produced during the whole walk into the
report. For each, note `authVia`, `bearerPresent`, `cookiePresent`. Also copy
any `{"event":"auth_disagreement",...}` line (there should be none).

## 6. Write the report

`docs/monitor/sessions/walk-2026-09-0X-c2-native/README.md` (use today's
date), containing:

- Build: the git SHA, the marketing/build version Xcode showed, the tunnel
  host, `C2_LINK_ENABLED=1`, `C2_BASE_URL=https://log-dev.concept2.com`.
- A PASS/FAIL line per check (a)-(e).
- The two design-mandated measurements, as their own headings:
  **`state` echoed on the private-use callback: YES / NO**, and
  **Info.plist entry needed (i.e. anything escaped the session): YES / NO**.
- The OS-modal observation from (a).
- **The ephemeral-session RECORD from (a):** did the sheet ask you to log in
  again despite the Safari session you established under "Before you start"
  (YES/NO), and its PASS/FAIL reading (YES = `prefersEphemeralWebBrowserSession`
  in effect and PASS; NO = a FAIL).
- **Optional (d) variant:** attempted YES/NO; if attempted, does a fresh link
  work after a WebContent termination? YES/NO.
- The pasted `auth_via` lines (and any `auth_disagreement` line, per (e)), and
  the conclusion they support about whether a native request can ever carry a
  cookie -- which is the evidence the app-wide disagreement REFUSAL is waiting
  on (design §1; promotion is a stated follow-up, not this PR).
- The photographs.

## 7. Afterwards

```
unset VITE_ENABLE_C2_LINK_PROBE
docker rm -f erg-walk-pg
```

Stop `cloudflared` and the dev server. The phone build is disposable; the next
real TestFlight build goes out through the normal `pnpm ios:release`.

**Restore the two stamped files before committing anything.** Step 4's build
ran `agvtool` and rewrote two tracked files with version stamps:

```
git -C /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b diff --stat -- app/ios
```

That must show ONLY `project.pbxproj` and `Info.plist` (the four version
keys). Then:

```
git -C /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b restore app/ios/App/App.xcodeproj/project.pbxproj app/ios/App/App/Info.plist
```

Never commit version stamps (Global Constraint).
````

- [ ] **Step 2: RF13 pre-flight — run or read every command in the card before James sees it.** Specifically: `bash app/scripts/ios-google-client-id.sh app/ios/App/App/Info.plist` prints the real forward-form id; `docker run ... postgres:18.4` matches CLAUDE.md's own dev-DB line; the server env line is checked against `server/index.ts:24,63,110-148` and `server/auth/middleware.ts:113-124`; the build line against `app/package.json:29`; `pnpm ios:open` against `package.json:30`; the release refusal against `scripts/ios-release.sh:42-45`. Record in the task report which of these you RAN and which you READ.
- [ ] **Step 3: Run the walk with James**, under the operator contract (one question, then stop and wait — memory: hardware-session-pacing). The `/hardware-walk` skill's conductor protocol applies even though there is no erg.
- [ ] **Step 4: Commit the card and the report** (`docs(c2): PR1.75b device walk card and report`), after the §7 restore: `git status --short -- app/ios` must read empty first. The report is committed even if a check FAILS — a failed walk is a result.

### Task 7: Fold the walk's findings

Design §0, verbatim: "two of its outputs (Info.plist necessity, `state` echo) can change 1.75b's own code." This task is that fold, and it is a numbered task so that "nothing changed" is a recorded decision rather than a silence.

**Replacement prose must not introduce any census phrase — in particular `appUrlOpen` and `browserFinished` (the census rows count literals); step 6b's diff is the check.** Both edits below rewrite prose in files the census corpus scans (`linkFlow.ts`, `WebAuthPlugin.swift`); write the measurement, not a sentence that happens to spell either token.

- [ ] **`state` echoed = NO (the expected case):** nothing changes; `linkFlow.ts`'s mismatch check stays as documented defence-in-depth. Record the measurement in `linkFlow.ts`'s comment on that check ("MEASURED on device, <date>: the private-use callback carried / did not carry `state`") — replacing the UNMEASURED wording, not appending to it (CLAUDE.md: replace superseded claims).
- [ ] **`state` echoed = YES:** the check becomes a real control; upgrade its comment from "defence in depth" to a measured control and say so in the PR body. No code change is needed — it already refuses.
- [ ] **Info.plist entry needed = NO (nothing escaped the session):** keep the entry (design §0 decided that in advance) and record the measurement in `Info.plist`'s neighbouring comment position — the plist has no comments, so record it in the PR body and in `docs/design/DEVIATIONS.md` only if a row there describes URL types (check: `grep -n "CFBundleURLTypes\|URL scheme" docs/design/DEVIATIONS.md`).
- [ ] **Info.plist entry needed = YES (something escaped):** this contradicts Apple's calling-app guarantee and is a STOP, not a fold — the `abandoned`/`busy` model assumes the callback cannot arrive out-of-band. Write it up, do not open the PR, and take it to a fresh antagonist pass.
- [ ] **Any OS modal appeared with `ephemeral: true`:** record it against the design's own note that the suppression claim is UNSOURCED and is an observation, not a design input. No code change.
- [ ] **Check (d) failed:** the `shouldOverrideLoad` hook is wrong; STOP and re-plan Task 1 step 5 rather than patching.
- [ ] **The optional (d) variant ran:** replace the `INFERENCE, not measured` paragraph in `WebAuthPlugin.swift`'s `shouldOverrideLoad` comment (the "MAIN-FRAME `targetFrame`" clause) with the measurement, whichever outcome it found — replacing the paragraph in place, never appending a contradiction beneath it (CLAUDE.md). **Did not attempt it:** the paragraph stays as written, and the PR body says explicitly that it was not measured this walk.
- [ ] **`auth_via` shows `cookiePresent: true` on any native request:** the design's UNMEASURED premise resolved the surprising way. Record it in the PR body AND as a ROADMAP line under the C2 register row (RF14) — promoting the app-wide refusal is still out of scope, but the evidence must not live only in a PR body.
- [ ] **Any of (a)–(c) FAILED:** the PR does not open; write the report, and take the failing branch to a fresh antagonist pass. **(b) failing specifically means the completion handler is not clearing the claim, which is Task 1 step 5, not a fold** — a `busy` on the retry after a cancel says `finish` ran without reaching `clearActive()`, and that is a plugin defect to re-plan rather than a finding to record. **A NO on (a)'s ephemeral RECORD is also an (a) FAIL, not a nicety noted in passing:** `prefersEphemeralWebBrowserSession` failing to suppress Safari's cookies is the mirror image of the account-injection risk this whole PR exists to close, on a shared phone.
- [ ] Re-run Task 5's gates on whatever changed; commit as `fix(c2): fold the PR1.75b walk findings` (or record "no code change" explicitly in the task report if nothing moved).

### Task 8: Reconciliation — the census and the records

**Files (code comments, already written in Tasks 1-4 — this step VERIFIES):** `app/src/adapters/externalBrowser.ts`, `app/src/native/externalBrowser.ts`, `app/src/adapters/appLifecycle.ts`, `app/src/monitor/Concept2LinkProbe.tsx`.
**Files (records):** `ROADMAP.md`, `docs/superpowers/specs/2026-09-02-concept2-pr175-app-bind-design.md`, `docs/superpowers/plans/2026-09-01-concept2-pr15-gate.md`, `docs/superpowers/plans/2026-09-01-concept2-pr15-native-link.md`, `docs/superpowers/plans/2026-09-01-concept2-pr15-walk.md`.

Root markdown is NOT Prettier-formatted (CLAUDE.md "Hooks"): wrap `ROADMAP.md` edits by hand to the surrounding width; never run `prettier --write` on it.

- [ ] **Step 1: The census script.** Create it in the scratchpad (NOT committed — it is a gate you run, and its output is the artifact):

```bash
#!/usr/bin/env bash
# PR1.75b phrase census. Normalises COMMENT LEADERS as well as whitespace:
# the PM's finding on 1.75a was that a line grep misses a phrase wrapped
# across comment lines, and `tr -s '[:space:]' ' '` alone is NOT enough --
# it leaves the ` * ` JSDoc continuation marker sitting inside the phrase
# (measured 2026-09-02 against Concept2LinkProbe.tsx:8-9).
set -uo pipefail
cd "$1" || exit 1
PHRASES=(
"correlates, not binds" "No redirect_kind column" "not yet added here"
"deliberately unauthenticated" "unauthenticated BY DESIGN"
"sequential-replace guarantee" "best-effort and RACEABLE"
"delete/delete/insert" "one live attempt per user" "none built yet"
"no migration exists yet" "appUrlOpen" "browserFinished"
"never a real link" "posts nothing and carries no client id"
)
# The leader alternation must cover every comment syntax this script's own
# `find` reaches -- including Swift `///`, which `(\*|//|--|>)` strips to a
# leading `/`. `/{2,}` and `*+/?` are the fixed forms; `#` is here for the
# shell/YAML files the corpus can pick up.
norm() { sed -E 's@^[[:space:]]*(\*+/?|/\*+|/{2,}|-{2,}|>|#)[[:space:]]*@@' "$1" | tr -s '[:space:]' ' '; }
for p in "${PHRASES[@]}"; do
  echo "=== $p ==="
  while IFS= read -r -d '' f; do
    n=$(norm "$f" | grep -o -F -- "$p" | wc -l | tr -d ' ')
    [ "$n" != "0" ] && printf '  %s  %s\n' "$n" "$f"
  done < <(find app/server app/src app/ios docs/superpowers/specs docs/superpowers/plans docs/design/handoffs -type f \
    \( -name '*.ts' -o -name '*.tsx' -o -name '*.swift' -o -name '*.md' -o -name '*.plist' -o -name '*.sql' \) -print0 2>/dev/null
    printf 'ROADMAP.md\0')
done
# The loop's last statement is `[ "$n" != "0" ] && printf ...`, which leaves
# status 1 whenever the final file has no hit -- i.e. on nearly every SUCCESSFUL
# run. Without this the script "fails" on success, and any caller that checks
# `$?` (or a `set -e` wrapper) would read a clean census as an error.
exit 0
```

- [ ] **Step 2: Prove the census can go red (RF21).** The whole point of this script over 1.75a's is the comment-leader strip, so that is what gets probed:
  - **Both probes run against `/tmp/pr175b-base`, the detached pre-1.75b worktree step 3b creates — not against the PR head.** Run step 3b's `git worktree add --detach /tmp/pr175b-base 94b83c84` first (pulled forward from step 3b for exactly this reason; step 3b reuses this same worktree rather than recreating it). Measured 2026-09-02: corpus-wide the leader strip changes exactly ONE count, `app/src/monitor/Concept2LinkProbe.tsx`'s wrapped `posts nothing and carries no client id`, and Task 4 rewrites that file — so at the PR head dropping the strip changes nothing and the probe cannot go red.
  - Baseline: `bash census.sh /tmp/pr175b-base` reports `1 app/src/monitor/Concept2LinkProbe.tsx` for both `never a real link` AND `posts nothing and carries no client id`.
  - **Replace the whole function with `norm() { tr -s '[:space:]' ' ' < "$1"; }`** — deleting the `sed -E` clause alone leaves `norm() { | tr … }`, a bash syntax error that exits 2 with NO output, in which case every hit "disappears" and the probe reads red for the wrong reason (measured 2026-09-02). Re-run against `/tmp/pr175b-base`: the `posts nothing and carries no client id` hit for `Concept2LinkProbe.tsx` must DISAPPEAR **while the `never a real link` hit for the same file SURVIVES** — the survivor is what distinguishes a real red proof from a script that failed to run. Restore, record both outputs.
  - **Second red proof, in Swift, because this PR is what puts a `///`-commented Swift file into the census corpus.** The corpus's `find` already matches `-name '*.swift'`, and `WebAuthPlugin.swift` is 200-odd lines of `///` doc comments. **`norm` lives INSIDE `census.sh` and is not on your `PATH` — and this machine's default shell is fish, which rejects `norm() { ...; }` outright. So before the block below: type `bash`, then paste the `norm()` definition from step 1 into that shell, then paste the block.** Run `norm()` against a two-line fixture in each syntax and record the four numbers:

```bash
printf '/// posts nothing and\n/// carries no client id\n' > /tmp/fixture.swift
printf ' * posts nothing and\n * carries no client id\n' > /tmp/fixture.ts
for f in /tmp/fixture.swift /tmp/fixture.ts; do
  norm "$f" | grep -o -F -- "posts nothing and carries no client id" | wc -l
done
```

  Measured 2026-09-02: the OLD alternation `(\*|//|--|>)` returns **0** for the Swift fixture and **1** for the TS one — it strips two of the three slashes and leaves a `/` inside the phrase; the fixed `(\*+/?|/\*+|/{2,}|-{2,}|>|#)` returns **1** for both. A normaliser is run against a fixture in EVERY comment syntax its own `find` will reach, not only the syntax that motivated it.

- [ ] **Step 3: Run the census at the PR head and reconcile against this table.** Baseline measured 2026-09-02 at `94b83c84`; ledgers (`.claude/agents/*-ledger.md`) and `docs/history/` are outside the scope by construction (records nobody edits), and this plan's own file is expected to hit every phrase it quotes.

| phrase | expected after 1.75b | accounted residuals |
| --- | --- | --- |
| `correlates, not binds` | 0 under `app/`; docs only | design ×1, parent spec ×1, gate doc ×2 (under the 1.75a supersession marker), 1.75a plan ×4 (merged-plan history) |
| `No redirect_kind column` | 0 under `app/` | design ×1, gate doc ×1, 1.75a plan ×3, PR1 plan ×1 |
| `not yet added here` | 0 under `app/` | design ×1, 1.75a plan ×3 |
| `deliberately unauthenticated` | 0 under `app/` | design ×1, 1.75a plan ×6 |
| `unauthenticated BY DESIGN` | 0 under `app/` | design ×1, gate doc ×1, 1.75a plan ×2 |
| `sequential-replace guarantee` | 0 under `app/` | design ×1, 1.75a plan ×3 |
| `best-effort and RACEABLE` | 0 under `app/` | design ×1, 1.75a plan ×3 |
| `delete/delete/insert` | 0 under `app/` | design ×1, 1.75a plan ×4 |
| `one live attempt per user` | unchanged by this PR (server-side) | `schema.ts` ×1, `schema.integration.test.ts` ×1, `routes/concept2.integration.test.ts` ×2, design ×3, parent spec ×1, gate doc ×4, PR1.5 plan ×1, 1.75a plan ×12, ROADMAP ×3 — **pass condition is the base-vs-head census DIFF carrying no line for this phrase** (step 6b, the run after the record edits — not step 3b, which is preliminary); a judgement call nobody can re-run is not a gate |
| `none built yet` | 0 under `app/` | design ×1, 1.75a plan ×3 |
| `no migration exists yet` | 0 under `app/` | design ×1, 1.75a plan ×3 |
| `appUrlOpen` | **0 under `app/src` — that is the tripwire (a listener is JS). Exactly ONE prose hit under `app/ios`: `WebAuthPlugin.swift`'s "why not a URL scheme" rationale, an argument about the alternative, not a listener. A PERMANENT row, not a one-off gate for this PR.** | design ×2 ("Why this over…"), parent spec ×8 (the Branch-B contingency the design keeps on record), gate doc ×5 (under the marker), PR1.5 plan ×1, 1.75a plan ×7, ROADMAP ×3 (step 4's replacement Status block adds one — "…NOT a URL scheme + `appUrlOpen`"), **`app/ios` ×1 (this PR's own `WebAuthPlugin.swift` doc comment, Task 1 step 5 — the one permitted new hit)**. **Why it stays forever:** zero `appUrlOpen` LISTENERS is what keeps RFC 8252 §7.1 CLOSED for the OUT-of-session leg now that `haus.waffle.ergomatic` is registered in `Info.plist` (Task 1 step 4); a doc-comment mention of the word is not a listener. In-session, Apple's calling-app guarantee does the work; out-of-session, nothing listening is the whole control. A future listener silently reopens it, so the `app/src` half of this row is the tripwire. Pass condition is the base-vs-head census diff carrying no NEW line for this phrase beyond the one `app/ios` hit and the one ROADMAP hit named above (step 6b) |
| `browserFinished` | **0 under `app/src`** (was 52: `native/externalBrowser.ts` ×3, `adapters/externalBrowser.ts` ×1 + test ×1, `useReturnToApp.ts` ×14 + test ×33). **The row is a literal count under `app/src`; new prose anywhere in this plan — including Task 7's fold edits, and including the neighbouring `appUrlOpen` row's own tripwire — must not reintroduce either token; `onBrowserFinished` is capital-B and does not match.** | design ×2, parent spec ×4, gate doc ×2, PR1.5 plan ×4 (step 5 adds `…pr15-native-link.md`'s HISTORICAL note), PR1.5 walk ×8 (step 5 adds `…pr15-walk.md`'s HISTORICAL note), 1.75a plan ×3, ROADMAP ×2 (step 4's replacement Status block adds one) — all historical narration of PR1.5, each named in the PR Record; **pass condition is the base-vs-head census diff carrying only the intended `app/src` removals plus these three residual lines steps 4-5 add** (step 6b, run AFTER those edits land — NOT step 3b, whose diff predates them) |
| `never a real link` | **0 under `app/src`** (was 1: `Concept2LinkProbe.tsx:6`) | design ×1, 1.75a plan ×3 |
| `posts nothing and carries no client id` | **0 under `app/src`** (was 1: `Concept2LinkProbe.tsx:8-9`, wrapped — see step 2) | design ×1, 1.75a plan ×2, PM ledger (out of scope) |

  Any hit not in this table is a defect in this task: fix it, or add it with its reason before the PR opens.

- [ ] **Step 3b: The pass condition is a BASE-vs-HEAD DIFF, not a reading and not a hand-built expectation.** Two of the rows above used to say "no hit pairs the phrase with best-effort/raceable" and "no hit describes it as a LIVE mechanism". Those are judgement calls: nobody can re-run them, two readers can disagree, and a green they produce is decoration (RF21).

  **And the fix REV 2 reached for — "diff against an expected file built from the table" — is not a fix.** The table's residual cells name document NICKNAMES ("gate doc ×2", "1.75a plan ×4"), not paths, so no expected file can be built mechanically from it; transcribing one by hand puts the judgement straight back in, one typo away from a green. **A prose table is not an artifact.** Diff two runs of the SAME script instead — one at the pre-1.75b baseline, one at the PR head — so the only thing being compared is machine output:

```bash
# 1. The baseline: a detached worktree at the pre-1.75b head, NOT a stash and
#    NOT a checkout of this branch (both would move the tree you are working
#    in). `94b83c84` is where this plan's own measurements were taken.
# ALREADY CREATED at step 2 (its red proof runs against this same worktree,
# pulled forward for that reason) -- skip this `worktree add` if it exists,
# and reuse the tree rather than recreating it.
git -C /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b \
  worktree add --detach /tmp/pr175b-base 94b83c84
bash /path/to/census.sh /tmp/pr175b-base > /tmp/census-base.txt

# 2. The PR head, same script, same phrase list.
bash /path/to/census.sh /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b > /tmp/census-head.txt

# 3. This run. Paths are relative to each root, so the two files are directly
#    comparable.
diff /tmp/census-base.txt /tmp/census-head.txt
```

  **The ONLY lines this diff may carry are:**
  - the removals this PR intends — `browserFinished`, `never a real link`, and `posts nothing and carries no client id` losing their hits under `app/src`;
  - new hits in **this plan's own file** (`docs/superpowers/plans/2026-09-02-concept2-pr175b-native.md`) and **the walk card** (`…-pr175b-walk.md`), which quote the phrases by construction;
  - the one new `appUrlOpen` prose hit this PR itself adds under `app/ios` — `WebAuthPlugin.swift`'s "why not a URL scheme" doc-comment rationale (Task 1 step 5), an argument about the alternative, not a listener, so it does not reopen the `app/src` tripwire;
  - and nothing else. **Any other moved count is a defect in this task**: fix it, or add it to the table with its reason before the PR opens.

  **This run is PRELIMINARY, not the gate — it predates steps 4-6, which each add one more `browserFinished` line to a record document (see the table's `browserFinished` row). Do NOT remove the `/tmp/pr175b-base` worktree yet**: Step 6b re-runs this exact diff, against the same baseline, after step 6's edits have landed, and THAT run — not this one — is the pass condition.

  Paste this preliminary diff into the PR Record alongside Step 6b's final one. A count that moved is a fact; "does this sentence describe a live mechanism?" is an opinion, and the two are not interchangeable.

  (`git stash list` before you start — it MUST be empty of your work; never `git stash`, the stack is shared with other sessions, per the briefing.)

  **Plus exactly ONE recorded human read, and it is recorded as a read.** The counts cannot tell whether a surviving `browserFinished` sentence narrates history or asserts a live mechanism. So: read the surviving `browserFinished` and `one live attempt per user` hits once, and write into the PR Record a single line naming the files read, the date, and the verdict — e.g. *"Read 2026-09-0X: all 25 surviving `browserFinished` hits (the table's post-edit sum) are past-tense narration of PR1.5; the ROADMAP hit was made past-tense by step 4."* That line is a human judgement with a name and a date on it, which is honest; a table row claiming it as a pass condition was not.

- [ ] **Step 4: `ROADMAP.md` — the PR1.75 row (`:1096-1127`), tick it and give the per-clause disposition (design exit criterion 8).** Change `- [ ] **PR1.75 …` to `- [x] **PR1.75 …`, and REPLACE the existing "Status 2026-09-02" block (`:1120-1127`; `:1128` is the PR2 row — `- [ ] **PR2 — the rower-facing surface…` — do not touch it) with a hand-wrapped block of this shape (fill the merge SHA and the walk date at merge time):

  > **Status 2026-09-0X: COMPLETE across two PRs. Per-clause disposition of this row:** the `surface` column migration + enforcement at both routes — DONE (1.75a, #269, migration 0021); the surface predicate's own authority (`req.authVia`, bearer wins, both-present rule, disagreement test) — DONE (1.75a); per-surface redirect URIs — DONE (1.75a); the authenticated native exchange — DONE across both (`POST /api/concept2/exchange` at 1.75a; the device return that reaches it at 1.75b, on `ASWebAuthenticationSession`, NOT a URL scheme + `appUrlOpen`); an authenticated web callback — DONE (1.75a); Concept2's approval of the native `redirect_uri` — log-dev DONE 2026-09-02, **live portal STILL OWED**; dual-route identity tests — DONE (1.75a); `UNIQUE(user_id)` + one atomic upsert at mint — DONE (1.75a); `ALLOWED_EMAILS`-as-revocation — explicitly NOT bundled, still a separate admission-model question. **PR1.5's `Browser.open` + `browserFinished` return arm was RETIRED at 1.75b** (the callback now arrives in a promise); `@capacitor/browser` stays for PR2's read-only link-out. Device walk: `docs/monitor/sessions/walk-2026-09-0X-c2-native/`. **Still owed after both PRs: the `C2_LINK_ENABLED` flag flip, live-portal registration of the native redirect, PR2's surface + its Gate 0 identity-copy amendment, and promotion of the app-wide auth-disagreement refusal (now that 1.75b's walk has measured the premise).**

  Also, in the PR1.5 row (`:1086-1095`), append one hand-wrapped sentence so its `browserFinished` narration cannot be read as current: *"(That return seam was retired at PR1.75b — see below — once the native link moved to `ASWebAuthenticationSession`.)"*

- [ ] **Step 5: The gate doc and the PR1.5 plan.** In `docs/superpowers/plans/2026-09-01-concept2-pr15-gate.md`, extend each of the three existing supersession markers (`:672`, `:967`, `:1075`) with one sentence — **edit them in place, never append a contradiction beneath** (CLAUDE.md): *"**COMPLETED 2026-09-0X by PR1.75b (#NNN):** the native return is BUILT on `ASWebAuthenticationSession` and walked on device; option (g)'s code-side precondition is now met in full. The activation gate itself stays closed on the flag flip, live-portal registration and PR2."* And add a dated note at the top of `docs/superpowers/plans/2026-09-01-concept2-pr15-native-link.md` and `…-pr15-walk.md`: *"**HISTORICAL — 2026-09-0X:** the `Browser.open` + `browserFinished` return arm this plan built was retired at PR1.75b (`2026-09-02-concept2-pr175b-native.md`, Task 3's census). Kept as the record of what was built and why."*
- [ ] **Step 6: The design spec — correct §2's `abandoned` row (plan observation 1).** The lifetime table's third row says the claim is cleared by "plugin `load()` on a fresh document". Replace that clause in place with: *"AND `shouldOverrideLoad(_:)` on a main-frame navigation rejects the pending call `abandoned` and cancels the session, so no orphaned sheet outlives its receiver (`load()` runs only at registration and a reload never re-runs it — corrected at plan time against `CapacitorBridge.swift:295-298,348-365` and `WebViewDelegationHandler.swift:45-48,67-93`)."* A design a later reader trusts must not describe a hook that does not fire.
- [ ] **Step 6b: Re-run step 3b's diff now — THIS run, not step 3b's, is the gate.** Steps 4-6 above are record edits, and three of them add a `browserFinished` line that step 3b's preliminary diff necessarily missed: `ROADMAP.md`'s replacement Status block (step 4, 1→2), and the two PR1.5 documents' new HISTORICAL notes (step 5, `…pr15-native-link.md` 3→4 and `…pr15-walk.md` 7→8). **The same ROADMAP block also adds one `appUrlOpen` line** (step 4, 2→3 — the PERMANENT row's own quoted "…NOT a URL scheme + `appUrlOpen`" residual, not a new tripwire hit). Re-generate the head side and diff again against the SAME `/tmp/pr175b-base` baseline (do not recreate it):

```bash
bash /path/to/census.sh /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b > /tmp/census-head.txt
diff /tmp/census-base.txt /tmp/census-head.txt

git -C /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175b \
  worktree remove /tmp/pr175b-base   # this one IS ours to remove: we made it
```

  **Permitted lines: step 3b's list, PLUS** the three `browserFinished` occurrences named above and the one `appUrlOpen` occurrence in ROADMAP's replacement Status block (step 4, 2→3) — the past-tense narration the Step 3b human read already covers, plus the PERMANENT row's own stated residual. Any other moved count is still a defect: fix it, or add it to the table with its reason before the PR opens. Paste THIS diff into the PR Record as the pass condition; step 3b's earlier run is kept alongside it only as the preliminary check.
- [ ] **Step 7:** `pnpm lint && pnpm typecheck && pnpm format:check` (comments/docs change class), then commit `docs(c2): reconcile the return-arm retirement, ROADMAP PR1.75 disposition, gate doc and design §2 (PR1.75b)`.

### Task 9: The PR

- [ ] **SDLC checks, in order:** `git rev-parse --show-toplevel` prints the worktree; `git status` on the MAIN checkout (`/Users/james/projects/github/jamesawesome/Ergomatic`) shows no stray writes from this work — **three things were already there before this plan began and are NOT ours: modified `app/ios/App/App.xcodeproj/project.pbxproj` and `app/ios/App/App/Info.plist` (version stamps), and an untracked `.pnpm-store/` directory. Report all three as pre-existing; touch none of them.** The WORKTREE's own `git status --short -- app/ios` must be empty too (the main checkout's stamped pair is pre-existing and unrelated; Task 6 step 4 already gated the walk's own restore). Anything else in that output is a stray write and gets fixed while this branch still exists (CLAUDE.md phase teardown); `git merge origin/main` on the branch (agent-briefing pre-ready checklist), gates green on the merged tree; push; open the PR; wait for a CI run to EXIST and go green (an empty check rollup is not green).
- [x] **Antagonist DELTA passes — ELEVEN, all RUN 2026-09-02, BEFORE implementation, folded at REV 2–12.** Pass 1: seven findings, all applied in the task owning the code. **Pass 2 was a VERIFICATION pass over pass 1's own fixes, and it broke four of them** — two gates that could not go red (the `SwiftCompile` count, the reject-code regex) and two that could not be run as written (`xcodebuild` ordered before the `cap sync` that generates its inputs; a census diff with no mechanically buildable expected file). **Pass 3 verified pass 2's fixes and broke two more, both the SAME CLASSES one layer up:** the `busy` test could not go green on correct code (a resolver armed below two awaits, released from above them — it hung, so its `finally`-deletion probe would have been logged as biting against a test that could never pass), and `cap sync` itself needs the gitignored `dist/client`, so pass 2's reordering fix was one link short of the first command whose inputs are all tracked. It also caught a mutation instruction that is not valid syntax, and a "grep finds nothing" sentence whose own cited command returns a line. **Pass 4 verified pass 3's fixes and found three REVISE items, all gate-shape, not new ground (REV 5):** a `describeStatus` re-read mutation that named a destination which did not actually bite; a ROADMAP citation range that absorbed the next bullet's line; and a walk precondition that assumed a Safari sign-in state no earlier step created, so the escape question it gated could not discriminate an ephemeral session from a broken one. **Pass 5 verified pass 4's fixes and found two (REV 6):** a census red proof that named its mutation but not the TREE it runs against — at the PR head the probe is a guaranteed no-op, because the leader-strip changes exactly one count corpus-wide and Task 4 rewrites that file — and this very bullet's own pass count, stale at every fold. **Pass 6 verified pass 5's fixes and found four REVISE items, a locator nit and an attribution nit (REV 7):** two census expected-count rows (`browserFinished`, the PERMANENT `appUrlOpen` row) were measured against the pre-PR tree rather than the plan's OWN prescribed post-change source, and the plan's own `linkFlow.ts` and `WebAuthPlugin.swift` code blocks each carried the very literal their row expected at zero; the base-vs-head census diff (step 3b) was ordered BEFORE the record edits (steps 4-6) that add three permitted `browserFinished` lines, so a new Step 6b re-runs it after them as the actual gate; and the `norm()` mutation instruction could silently break the tool itself (a bash syntax error, exit 2, zero output) rather than genuinely probe the leader-strip, now fixed with a required survivor. **Pass 7 verified pass 6's fixes and found three REVISE items (REV 8):** the PERMANENT `appUrlOpen` row's own ROADMAP residual was under-counted by one (the phrase also lives inside step 4's own prescribed Status-block text); the walk card's `pnpm ios:build` rewrites two tracked iOS files with version stamps and had no restore step of its own; and the optional (d) variant had no report bullet and no fold row, so a measurement taken on the walk would have left an `INFERENCE, not measured` claim standing in shipped code. **Pass 8 verified pass 7's fixes and found two REVISE items (REV 9):** Task 1 step 2's failing-test-first count, which could not have been true before it was measured — five of the six new checks fail, not six, because an "exits non-zero" assertion passes vacuously against a script that does not exist yet (a missing file also exits non-zero); and pass 7's own SDK-header citation fix, which widened the rule in the Global Constraints but left the prescribed `WebAuthPlugin.swift` header still asserting the un-widened absolute the code below it violates twice. Plus a nit (`git status --short -- app/ios`) and a guard on Task 7's fold edits, whose replacement prose must not reintroduce a census phrase. **Pass 9 verified pass 8's fixes and found one REVISE item (REV 10):** pass 8's own citation-rule fix widened the header where it is USED (four categories) but not where it is ARGUED (the Global Constraint, still three), and the uncited universal it exists to catch was still live below the header — the `shouldOverrideLoad` comment cited neither WebKit nor Capacitor for its main-thread claim and named the wrong framework; corrected with `WK_SWIFT_UI_ACTOR` (`WebKit.framework/Headers/WKNavigationDelegate.h:69-70` -> `WKFoundation.h:60`) and the Constraint brought to the same four categories. Plus two nits: `pnpm format` now runs before `typecheck`/`lint`/`format:check` at Task 2 step 5 and Task 4 step 4 (measured: four of six prescribed blocks fail `prettier --check` as written); and Task 4 step 4's RF5 sweep now names its three surviving hit lines exactly (Task 3 step 3's `externalBrowser.ts` header, two lines, and Task 3 step 4's `appLifecycle.ts` appended sentence, one line) instead of "may be the two narrative sentences." **Pass 10 verified pass 9's fixes and found one REVISE item (REV 11):** pass 9's own fix undercounted the RF5 sweep's surviving hits at three when the plan's own prescribed text carries five across four files — Task 2 step 4's `linkFlow.ts` header and Task 4 step 3's `Concept2LinkProbe.tsx` doc comment each carry `useReturnToApp` too, outside the two files pass 9 re-checked — settled by extracting every prescribed `app/src` fence to files and running the sweep verbatim (5 lines, not 3); the sweep now names all five by provenance, and a guard sentence is added at Task 2 step 4 and Task 4 step 3 so new prose at either site cannot silently reintroduce a token beyond the five the sweep names. Plus two nits: every plan-internal line citation in the REV history paragraphs and in Task 9 is now cited by provenance (Task/step/symbol) rather than by the plan's own line number, which moves at every fold; and Task 2 step 6's `webauth-contract` census now cites RF19 (CLAUDE.md) by name as the reason it is the only instrument for the JS↔Swift string contract. **Pass 11 verified pass 10's fixes and found three REVISE items and a nit (REV 12), all from the one check ten passes never ran — placing the six prescribed TS/TSX blocks at their REAL paths and running the REPO's `pnpm typecheck` and `pnpm lint`, not only `prettier --check`:** the probe test's `mockLink` mock declared zero parameters, so a sibling test's `api.mock.calls.filter((c) => c[0] === …)` failed `TS2493`; the probe component's `useCallback(async …)` + `useEffect(() => void readStatus())` failed `react-hooks/set-state-in-effect`, fixed to the repo's own `void f().then(cb)` mount-fetch idiom and its dependent mutation row rewritten for the new shape; and Task 1 step 4's `appUrlOpen` rationale paragraph still argued the pre-pass-6 expectation the table had already corrected. **The lesson to carry, now demonstrated ten times: a fix is not evidence that the defect is gone.** Pass 1's fixes were unmeasured and pass 2 measured them; pass 2's fixes were unmeasured and pass 3 measured those; pass 3's fixes were unmeasured and pass 4 measured those; pass 4's fixes were unmeasured and pass 5 measured those; pass 5's fixes were unmeasured and pass 6 measured those; pass 6's fixes were unmeasured and pass 7 measured those; pass 7's fixes were unmeasured and pass 8 measured those; pass 8's fixes were unmeasured and pass 9 measured those; pass 9's fixes were unmeasured and pass 10 measured those; pass 10's fixes were measured against the plan's own tools and pass 11 measured them against the repo's. All eleven ledger entries landed in `.claude/agents/antagonist-ledger.md`. Its HELD list is this plan's vetted ground: all fifteen `ASWebAuthenticationSession.h` quotes verbatim and line-exact, every `project.pbxproj` anchor exact (`objectVersion = 60`, no synchronized groups — manual refs are required, not optional), `cap update ios` never writing `project.pbxproj`/`Main.storyboard`/`Info.plist`, and the whole retirement census reproduced to the occurrence (`browserFinished` = 52 under `src`). **What the pass attacked, recorded because a skip must be spoken:** (1) the Swift plugin's lifetimes — three fields, one clear path, and a hook (`shouldOverrideLoad`) this plan SUBSTITUTED for the design's own (`load()`), which is a mechanism the anchor pass never saw; (2) the WebView-reload path itself, which is a new failure mode with no automated instrument; (3) the tunnel-based walk as an evidence-producing procedure (does it actually measure the `state` echo and the escape question, or only appear to?); (4) the census tool — whether comment-leader normalisation is sufficient, and whether the expected-count table's "pass conditions" are checkable rather than judgement calls. **Not in scope for the delta:** the server contract, the identity ladders, the stored shape — all attacked at the TRIAD pass and unchanged here. **This count is re-stated at every fold — grep it before opening the PR.**
- [ ] **Scope gate (mechanical):** `gh pr view <n> --json files --jq '.files[].path' | grep -E "^app/(server|drizzle)/"` → empty; paste the empty result in the Record.
- [ ] **PR body.** Above the fold: the PM's fold VERBATIM if the scoped gate has produced one; otherwise this draft, which is written to the countable form (≤ ~120 words above the fold, ≤ ~25 per bullet — count, do not feel):

> This PR gives the phone a way to finish a Concept2 link.
>
> - A small Swift plugin opens Concept2's consent page in a session only this app can receive the answer from, handed back in a promise.
> - The rower always sees which Concept2 account they are linking: the session is ephemeral, never reusing Safari's login.
> - Cancel and decline each produce their own named outcome; a mid-flight reload frees the app to relink.
> - PR1.5's return-to-app detection is gone: with the answer in a promise, a second return mechanism has nothing to notice.
> - Tester impact: none. Everything stays dark behind `C2_LINK_ENABLED`, and the only way in is a dev-only card.
> - Verified on a real phone against log-dev, because nothing in CI reaches Swift.

  **Counted, not felt (CLAUDE.md's countable form): 120 words above the fold, longest bullet 24.** Re-count if you change a word — the fold is a gate the PM checks with `wc`, and REV 2's draft was 125.

Then the collapsed block:

```html
<details><summary>Record (for agents and audits)</summary>

- **Head:** `<sha>` (reconciled against `gh pr diff --name-only` at this head; every claim below describes this head).
- **Scope gate:** `gh pr view <n> --json files --jq '.files[].path' | grep -E "^app/(server|drizzle)/"` → (empty). `pnpm e2e` WAS run (RF1: this diff touches `app/src/`); `pnpm screenshots` was NOT, with the reason and its `git status docs/screenshots` verification.
- **Risk class:** not TRIAD. Antagonist: ELEVEN DELTA passes on the plan, all run 2026-09-02 — pass 1's four new-ground items and their verdicts, pass 2's verification of pass 1's fixes (four of which did not hold; see REV 3), pass 3's verification of pass 2's (two of which did not hold, one a test that could not go green on correct code; see REV 4), pass 4's verification of pass 3's (three REVISE items, all gate-shape; see REV 5), pass 5's verification of pass 4's (two: a census red proof that could not fire at the PR head, and this bullet's own stale pass count; see REV 6), pass 6's verification of pass 5's (four REVISE items — two census expected-count rows falsified by the plan's own prescribed source, a base-vs-head diff ordered before the record edits it must judge, and a mutation that could break the tool rather than bite it — plus a locator and an attribution nit; see REV 7), pass 7's verification of pass 6's (three REVISE items — the PERMANENT `appUrlOpen` row's own ROADMAP residual under-counted by one, the walk card's `pnpm ios:build` rewriting two tracked iOS files with no restore step, and the optional (d) variant carrying no report bullet or fold row; see REV 8), pass 8's verification of pass 7's (two REVISE items — a failing-test-first count that could not have been true before it was measured, and pass 7's own SDK-header citation fix that widened the rule but never reached the code it governs; see REV 9), and pass 9's verification of pass 8's (one REVISE item — pass 8's own citation-rule fix widened the header where it is used but not where it is argued, leaving the `shouldOverrideLoad` main-actor-delivery claim uncited; see REV 10), and pass 10's verification of pass 9's (one REVISE item — pass 9's own fix undercounted the RF5 sweep's surviving hits at three when the plan's own prescribed text carries five across four files, two of them outside the files pass 9 re-checked; see REV 11), and pass 11's verification of pass 10's (three REVISE items and a nit — the first pass to place the prescribed TS/TSX blocks at their real paths and run the repo's own `typecheck` and `lint` over them, which found a mock arity that could not compile and a mount effect that could not lint; see REV 12). This count is re-stated at every fold — grep it before opening the PR. PM: scoped gate (census empty, walk record complete, fold count). **Walk ran BEFORE this PR opened**, per design §0.
- **Device walk:** `docs/monitor/sessions/walk-2026-09-0X-c2-native/` — the five checks, the two mandated measurements (`state` echoed y/n, Info.plist needed y/n), the OS-modal observation, and every `auth_via` line with its `authVia`/`bearerPresent`/`cookiePresent`.
- **Instrument honesty (RF19):** there is no XCTest target, `src/native/**` is `v8 ignore`d, and e2e runs on web — so `WebAuthPlugin.swift` is proven ONLY by the walk, and this PR says so rather than implying CI covered it. The `xcodebuild` gate proves it compiles and that both files are in the App target's Sources phase (`App.SwiftFileList`), nothing more.
- **`pnpm e2e` is required-but-blind (RF26):** required as a regression gate on the `useReturnToApp` deletion, NOT as coverage of this PR's new code: `grep -rn -i concept2 app/e2e` finds one hit, an unrelated comment about the PM5's BLE advertising name (`design.spec.ts:2017`); `grep -rn -E "returnToApp|browserFinished|linkFlow|c2-link" app/e2e` is empty. **No e2e spec exercises any of this PR's code.** The probe is the only consumer of `linkFlow`, and it is compiled out of the stack's bundle. What proves the web arm is `linkFlow.test.ts`'s `describe("startLink on web")` cases; what proves the native arm is the walk. Said here rather than letting a green e2e badge carry a claim it cannot support.
- **Retirement census (Task 3):** the grep, its production-consumer table with each symbol's fate, the one sentence on why PR2's link-out needs no return signal, and the two deliberate KEEPs (`@capacitor/browser`, `registerWebAppLifecycleListener`) with their reasons.
- **Phrase census (Task 8):** the script, its red proof (dropping the comment-leader strip hides a real hit), the full output, and the per-phrase table with every residual named and owned.
- **Mutation log** (every probe run against the committed tree; RF21/RF22): one row per probe in Tasks 1/2/4 — `file | mutation | test that died | exact failure text | restored (git status clean)` — including the two recorded NON-bites in Task 1 step 10, which are listed as non-bites rather than dressed up.
- **Plan deviations / observations 1-13**, in particular **#1** (the design's `abandoned` hook does not fire; `shouldOverrideLoad` substituted, design §2 corrected in Task 8), **#6** (the 1.75a census's expected count for one phrase was wrong, and why), and **#7** (`ios-release.sh`'s index-0 client-id derivation, hardened in the same PR because this Info.plist edit is what opens it).
- **Coverage, per file (RF2):** rows for `src/adapters/linkFlow.ts`, `src/adapters/externalBrowser.ts`, `src/monitor/Concept2LinkProbe.tsx`; source named (HTML report).
- **`dist:grep`:** the OK line, plus the RF12 red proof at this head (flag set → FOUND + non-zero; flag unset → OK).
- **Records updated:** ROADMAP PR1.75 row (ticked, per-clause disposition, still-owed line) and the PR1.5 row's retirement sentence; gate doc's three supersession markers extended in place; PR1.5 plan + walk card marked HISTORICAL; design §2's `abandoned` row corrected.
- **Still owed after this PR:** the `C2_LINK_ENABLED` flag flip, live-portal registration of the native `redirect_uri`, PR2's surface + its Gate 0 identity-copy amendment, and promotion of the app-wide auth-disagreement refusal (the walk has now measured its premise).

</details>
```

- [ ] After James's review round(s): re-review signal only when fixes + internal review + push + a green CI run that EXISTS are ALL done ("PR #n is ready for your re-review", as its own sentence). Never merge; James merges.
- [ ] **Release recommendation to post at merge:** "not needed" — nothing tester-visible (flag off; the only surface is dev-flag-gated and `ios-release.sh` refuses to ship it). PR2 re-checks the reserved version at its own merge.
- [ ] **Agent-config check at merge (non-fast-path):** propose either "no change needed" or a CLAUDE.md/ledger line. The candidate this plan already surfaces: **observation 1's class — a design that names a vendor lifecycle hook without checking that the hook fires in the case it is chosen for.** It is RF16's second corollary aimed at a MECHANISM rather than a document ("the citation was real; the argument needed an attribute of it that was never checked"), and it cost nothing here only because the plan-writing pass read the vendored sources. The controller decides whether that is a new recurring-failure entry or an antagonist-ledger line.
  - **A second candidate, from pass 11:** CLAUDE.md's `pnpm exec vitest run --project client <file>` footgun is REAL and its mechanism is the dropped `NODE_OPTIONS=--no-experimental-webstorage` (pass 11's "STALE" diagnosis was wrong — corrected at #277's PM gate; 1582 false failures measured without the prefix) — the Commands bullet is corrected in this PR.

## Self-review notes

- **Design coverage:** §0's PR shape, the scope gate, the walk-before-the-PR rule and the antagonist DELTA ✓ (Global Constraints, T6, T9); §2's lifetime table extended and its one wrong row corrected ✓ (the RF27 table, T8 step 6); §3's `linkClient` capability and explicit `state` ✓ (T2); §4's plugin — typed outcomes, `canStart`, no synthesised anchor, the string initializer with the bare scheme, `ephemeral: true` as a control, the `appUrlOpen` rationale, the retirement census ✓ (T1, T2, T3); §Testing's adapter bullet, every case with a biting mutation ✓ (T2 step 8); §Testing's device-walk bullet with its HOST, the WebView-reload case and the `AUTH_VIA_LOG` instrument ✓ (T6); exit criteria 4 (native flow end to end, both measurements recorded), 6(a) (both redirects confirmed at log-dev before the walk) and 8 (the ROADMAP per-clause disposition) ✓ (T6, T8); §Plan reconciliation's rulings are all server-side and unaffected. D3's PASS is already recorded at `94b83c84`.
- **Type consistency:** `LinkOutcome`, `WeightClass`, `LINK_CALLBACK_SCHEME`, `LINK_CLIENT`, `WebAuthStartOptions`, `WebAuthStartResult`, `stateEchoed`, and the nine Swift rejection codes are spelled identically in T1, T2 and T4.
- **Commit shape:** T1 alone (iOS + the release-script seam); T2+T3+T4 as ONE commit (the whole-project pre-commit typecheck rejects every intermediate state — stated in T4 step 8, not discovered at commit time); T6's card+report alone; T7 only if the walk moved something; T8 alone. Every mutation probe runs AFTER the commit carrying the code it targets (RF22).
- **What this plan deliberately does NOT do:** touch `app/server/` or `app/drizzle/` (the scope gate); add PR2's card or its copy; flip the flag; register the live-portal redirect; promote the app-wide disagreement refusal; delete `registerWebAppLifecycleListener`. Each is named as owed rather than silently skipped.
