# Queued empty callback state regression

Source `b9a3ae9585513ce693feda7e12223f7bbeca6ff5`. The ROADMAP “PR1.75b leftovers” row rides the next auth callback or Xcode project PR. Its empty `?state=` case is now an independent literal in the existing native Concept2 callback test. No product behavior changed; the Xcode sorting half remains cosmetic and is explicitly not a CLI rewrite. The controller will present the row for James’s ruling rather than strike it.

The test drives the WebAuth callback producer through real `startLink`, asserting `stateMismatch`, no exchange request and no correlation values in the diagnostic. `pnpm test --project client src/adapters/linkFlow.test.ts`: 25 pass. Lint, typecheck and format check pass on the same test source, and commit hooks ran lint-staged and TypeScript. Original logs are beside this report.

After the real commit was confirmed, changing the unique deciding guard from `returnedState !== null` to truthiness made the empty-state case fail: it reached the exchange instead of refusing it. The nonempty mismatch case still passed. Restoring the committed source returned all25 tests green. `result.json` and mutant/restored logs retain exact command and outcomes. Coverage will be read from the final integrated HTML report; this test-only follow-on claims no separate runtime coverage result.
