# Changed-file HTML coverage

Raw `.log`, served HTML and CSS references resolve after extracting `runtime-logs.tar.gz` at the evidence root; [artifact instructions](../artifacts.md) preserve their exact bytes.

Source: `c7fce22337bb03b486a7c2fd074c1fb1c7f96385`; `pnpm test:coverage` passed 8,895 tests with one existing skip. Values and uncovered line/branch markers were read from the generated HTML, not the abbreviated console table. The complete HTML is in `coverage-html.tar.gz` (see [artifact instructions](../artifacts.md)). Scope is production files changed since `86ed0636`; the source JSON also lists instrumentation exclusions.

| File | Statements | Branches | Functions | Lines | Uncovered lines |
| --- | --- | --- | --- | --- | --- |
| app/server/auth/frontDoor.ts | 100% | 100% | 100% | 100% | none |
| app/server/auth/frontDoorRoutes.ts | 90.68% | 90.47% | 100% | 91.44% | 48, 58, 125, 171, 190, 195, 198, 199, 259, 296, 359, 360, 361 |
| app/src/SignIn.tsx | 96.87% | 100% | 93.33% | 96.87% | 54 |
| app/src/adapters/authFlow.ts | 88.92% | 85.31% | 100% | 95.73% | 236, 344, 421, 654, 682, 683, 684, 685, 693, 744, 791, 799, 832 |
| app/src/shell/AppRoutes.tsx | 95.45% | 89.65% | 87.5% | 100% | none |
| app/src/you/SignInMethods.tsx | 97.14% | 96.61% | 100% | 96.87% | 52 |

CSS and shared types are not instrumented by Vitest coverage. `src/native/**` is explicitly excluded; the removed wrapper and retained path have scoped client tests. Swift and native registration are outside V8 instrumentation; Debug and production-default Release XCTest receipts are separate runtime gates, not Swift percentage coverage. The shared type file is compiled by the full typecheck. The disabled CSS rule is tested through computed real-browser styles.

The implementer inspected these HTML/source gaps after the full run and found no material unresolved defect. `frontDoorRoutes.ts` misses malformed input/id guards, generic exception/store fallbacks, old-cookie replacement, an invalid stage, and some web completion/cancel paths; the changed denial JSON/email and redirect encoding branches are covered.

`authFlow.ts` misses stale generation/ownership branches at individual asynchronous boundaries, malformed/contradictory-response fallbacks, unmount/return guards, and alternate cleanup/error display branches. Its prior-operation cleanup in `start()` (682–693) is exercised by the real-browser lost-cancel/new-sign-in case outside V8's Vitest report. The `prepareLink` wait/success path is covered, but its failed-cleanup display at 791/799 is an explicit assurance gap. These defensive races/errors are not exhaustively tested. Denial retention, cancellation retry, provider eligibility, and idle route recovery have direct tests and deciding source mutations.

`SignIn.tsx:54` is confirmation Back, exercised in the browser. `SignInMethods.tsx:52` is the remaining typed-failure fallback. `AppRoutes.tsx` misses development monitor branches and a link-route render branch exercised by the browser. These cross-layer tests do not raise the HTML percentages or establish coverage of every defensive branch.
