# Apple prescribed-code lens — incomplete handoff

**INCOMPLETE due to the platform cybersecurity-risk block reported by the controller.** The controller stopped further review and probes and requested evidence recovery only. This is not a completed hardening verdict, a security clearance, or a final-PR review. No repository files were changed by this reviewer, no commits were made, and no agents were spawned.

Reviewed provenance: integration dispatch at `e249bf0d4128bcaa1b60c2e40b6efe7c310e8359`; server candidate `259882ba1087b6ad853159b19799b2358fbf3905`; native candidate `81ce60409d78034bf2ceb62e4b9d0cfd1a19ca8b`; client candidate `0f990a68e930f4c2dbd6ee46736405554abd18d2`. The controller's queued callback regression is `b9a3ae95`. Candidate source and supplied author receipts were read; no broad suite was rerun.

## Confirmed ordinary navigation defect — Important

Task 3, `AppContent` in `app/src/App.tsx:14–18` at client `0f990a68`, together with `destinationFor` in `app/src/adapters/authFlow.ts`.

`AppContent` navigates whenever `auth.destination` differs from `location.pathname`, and includes both values in its effect dependencies. A terminal link cancellation retains `destination = "/you"`. Ordinary navigation does not consume or clear that destination. Consequently, tapping a different tab navigates there and immediately navigates back to You. The same retained destination is produced by linked and link-error views; those siblings were read in source, not separately browser-probed.

**Executed reproduction:** compile the retained client source into an isolated `/tmp` build; serve that build from a temporary local HTTP server; intercept API reads with a synthetic signed-in rower and enabled auth options; open `/?authResult=cancelled&authPurpose=link&authProvider=apple`; await SIGN-IN METHODS; click the real LIBRARY tab. Chromium recorded:

```json
{
  "case": "cancelled-link then ordinary Library tab",
  "afterClick": "http://127.0.0.1:63539/you",
  "navigations": [
    "http://127.0.0.1:63539/library",
    "http://127.0.0.1:63539/you"
  ],
  "libraryTabActive": null
}
```

The controlled values are ordinary server-return URL fields and synthetic API fixtures; no attacker assumption is needed. This is a client navigation reproduction, not a real OAuth or database login. The second execution used a fresh Vite build of the retained candidate, rather than relying on the author's preexisting bundle. Its build log reports 335 transformed modules and successful completion.

Smallest correction: treat the auth destination as a consumed navigation request, retaining the result notice independently if needed. Add a browser regression that reaches a terminal result and then clicks an ordinary tab, asserting it stays at the requested route. Cover cancellation, success and failure through the actual App router. The current Apple browser cases stop at the terminal methods/result screen, before this defect becomes visible.

## Existing artifacts

All newly created material is under `/tmp/apple-code-lens/` except this report:

- `/tmp/apple-code-lens/navigation.cjs` — executed Chromium reproduction, custom temporary HTTP server and synthetic API read fixtures. Closes its own browser and HTTP server.
- `/tmp/apple-code-lens/navigation.json` — recorded final navigation failure above.
- `/tmp/apple-code-lens/build.mjs` — programmatic Vite build from the retained client candidate with configuration loading disabled and output/cache locations confined to `/tmp`.
- `/tmp/apple-code-lens/build.log` — successful isolated Vite build output.
- `/tmp/apple-code-lens/dist/` — generated client bundle and assets used by the final navigation reproduction.
- `/tmp/apple-code-lens/expiry.ts` — already-executed, isolated database timing probe. No standalone log/JSON file was saved for it; its output exists in this conversation's tool result. No further execution or analysis follows this handoff.
- `/tmp/apple-code-lens/package.json` — temporary ESM declaration for that script.
- `/tmp/apple-code-lens/node_modules` — symlink to the preexisting `/tmp/apple-mechanism-probes/node_modules`.
- `/tmp/apple-harden-code.md` — this incomplete handoff.

Earlier unsuccessful setup attempts are also in the conversation's tool results: the first browser invocation used `dist/index.html` instead of the actual `dist/client/index.html`; the first database script invocation lacked the temporary ESM package declaration. These were harness setup errors, not product findings. The later navigation reproduction succeeded against the isolated build and recorded the product defect.

**Resource left running when the stop arrived:** this reviewer created container `apple-code-lens-pg`, image `postgres:18.4`, loopback port `62919`, with `--rm`. Container ID returned at creation: `612f78358a2d1bfa3972c2a94fcbc558e50fa7fc722668690e28519914dbd88b`. It is an isolated synthetic fixture, not a worktree compose stack. The controller should stop this owned fixture during cleanup; no stop or further inspection was run after the evidence-recovery-only instruction.

## Questions left unfinished

- The database timing concern was not brought to a consolidated review finding, correction, or regression recommendation before review was stopped. Existing raw tool output is available to the controller; this incomplete handoff makes no completed security verdict about it.
- The remaining prescribed-code review and test-oracle census were not completed. Native runtime, real provider behavior and portal configuration were never exercised by this reviewer.
- The client author report describes a lifecycle regression as using real You sign-out. The inspected `authFlow.test.tsx` case instead invokes `result.current.abandon()` directly. The producer-to-consumer evidence claim still needs reconciliation during ordinary task review; no additional test was run here.
- Integrated checks, authoritative integrated coverage, exact-head CI and task/whole-branch reviews remain the controller's work. No old scoped coverage was promoted to an integrated PASS.

## Controller-supplied adoption correction

The controller reported that integration `app/node_modules` lacked `express-rate-limit` before the first server source commit. Its planned correction is to stage the dependency-bearing commit with `cherry-pick --no-commit`, install the frozen app lockfile, verify the worktree root, then commit with hooks. This is an adoption-command precondition, not an additional auth finding. This reviewer did not execute or verify that integration operation.
