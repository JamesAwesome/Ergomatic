# Apple sign-in integrated evidence

Status: PASS for the recorded ordinary implementation gates, with the separate
security code review still INCOMPLETE after its platform block.

## Provenance

The integration checkout recorded here is `c8ba5f12b381d55ab8cc2ec504cbfdc56319b2ab`.
The full coverage run was made at `1ecd4a196a1a8ed7ddd94ba5748361c1f94c14e0`.
The later product-source commit `d5421946` changes only `app/src/index.css`, and
the later `c8ba5f12` commit changes `app/e2e/screenshots.spec.ts` plus the
cap-sync-generated declaration/product order in
`app/ios/App/CapApp-SPM/Package.swift`. None of those three files is an
instrumented V8 runtime source, so the HTML still covers every changed runtime
TypeScript/TSX source in the branch's configured coverage scope.

`coverage.log` records the successful full `pnpm test:coverage` run: 343 files
passed, 8,784 tests passed, and one test was skipped. Aggregate
statements/branches/functions/lines were respectively 98.26% (13,518/13,756),
96.54% (10,366/10,737), 98.98% (2,736/2,764), and 98.99%
(12,340/12,465). `coverage-initial-failed.log` is the preserved original run
whose only failures were the subsequently repaired historical migration
fixtures; `legacy-fixture-report.md` documents that correction and its
fail-then-pass evidence.

The unsigned Debug iOS Simulator compile belongs to integration source
`9f9276a91b220ea2eede4487c134a7de57f03028` plus the same accepted generated
SPM order now in the checkout. `candidate-equality.json` proves the tested
server, native, and client candidate paths equal that integration source;
`spm-sync-reconciliation.json` records that all Swift lines and existing
dependency versions survived the generated reorder. `xcode-build.log` ends
`** BUILD SUCCEEDED **`; its raw SHA-256 is
`04b73331e7e5061f0f888fe15d64e8a1d9b72030ca10b324609c3bc2429de6c8`.
The later CSS bundle passed a production build, cap sync, native privacy check,
and distribution grep, but it did not receive a second native compile.
`final-dist-sync.json` records 81/81 byte-equal files between `dist/client` and
the synced native public bundle, the corrected CSS present, and the production
bundle identity; `dist-grep-final.log` records the final ten-marker gate pass.

## Authoritative changed-source coverage

These values come from the per-file rows in the archived HTML under
`app/coverage/`, not the text reporter. Metrics are
statements/branches/functions/lines.

| Changed source                        |       Statements |         Branches |      Functions |            Lines |
| ------------------------------------- | ---------------: | ---------------: | -------------: | ---------------: |
| `app/server/app.ts`                   |     100% (31/31) |     100% (18/18) |     100% (4/4) |     100% (30/30) |
| `app/server/auth/attempts.ts`         | 91.71% (144/157) | 89.84% (115/128) |   100% (33/33) | 95.17% (138/145) |
| `app/server/auth/frontDoor.ts`        |     100% (24/24) |     100% (19/19) |     100% (6/6) |     100% (23/23) |
| `app/server/auth/frontDoorErrors.ts`  |     88.88% (8/9) |    90.9% (10/11) |     100% (3/3) |     88.88% (8/9) |
| `app/server/auth/frontDoorRoutes.ts`  | 90.62% (145/160) | 89.56% (103/115) |   100% (22/22) | 91.39% (138/151) |
| `app/server/auth/middleware.ts`       |     100% (45/45) |     100% (36/36) |     100% (7/7) |     100% (45/45) |
| `app/server/auth/providers.ts`        |   93.65% (59/63) |    93.9% (77/82) |   100% (10/10) |   96.55% (56/58) |
| `app/server/auth/routes.ts`           |   95.94% (71/74) |      90% (27/30) |     100% (7/7) |   95.89% (70/73) |
| `app/server/auth/sessions.ts`         |     100% (22/22) |       100% (6/6) |     100% (7/7) |     100% (21/21) |
| `app/server/db/schema.ts`             |   68.18% (30/44) |       100% (0/0) |  36.36% (8/22) |   68.18% (30/44) |
| `app/src/App.tsx`                     |      85% (17/20) |    58.33% (7/12) |     100% (4/4) |   82.35% (14/17) |
| `app/src/SignIn.tsx`                  |   96.77% (30/31) |   97.67% (42/43) | 92.85% (13/14) |   96.77% (30/31) |
| `app/src/You.tsx`                     |     100% (12/12) |       100% (4/4) |     100% (4/4) |     100% (12/12) |
| `app/src/adapters/authFlow.ts`        | 90.33% (271/300) | 85.43% (217/254) |   100% (36/36) | 97.65% (250/256) |
| `app/src/api/useAuthMethods.ts`       |     100% (20/20) |     100% (14/14) |     100% (6/6) |     100% (15/15) |
| `app/src/auth/AuthProviderButton.tsx` |       100% (1/1) |       100% (6/6) |     100% (1/1) |       100% (1/1) |
| `app/src/auth/LinkSignInMethod.tsx`   |     100% (10/10) |     100% (22/22) |     100% (5/5) |     100% (10/10) |
| `app/src/shell/AppRoutes.tsx`         |   95.45% (21/22) |      92% (23/25) |    87.5% (7/8) |     100% (18/18) |
| `app/src/you/SignInMethods.tsx`       |   96.87% (31/32) |   98.11% (52/53) |     100% (7/7) |   96.55% (28/29) |

The non-100 rows have these HTML line findings:

| Source                           | Uncovered executable lines                                          | Source lines with uncovered-branch markers                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/auth/attempts.ts`        | 82, 256, 266, 273, 347, 378, 478                                    | 74, 140, 175, 255, 265, 272, 332, 342, 374, 397, 428, 473, 477 (13 missed outcomes)                                                                                                                              |
| `server/auth/frontDoorErrors.ts` | 25                                                                  | 24 (1 missed outcome)                                                                                                                                                                                            |
| `server/auth/frontDoorRoutes.ts` | 48, 58, 118, 164, 183, 188, 191, 192, 252, 289, 352, 353, 354       | 43, 53, 64, 70, 115, 175, 184, 190, 228, 341, 351, 362 (12 missed outcomes)                                                                                                                                      |
| `server/auth/providers.ts`       | 110, 125                                                            | 108, 109, 120, 206, 208 (5 missed outcomes)                                                                                                                                                                      |
| `server/auth/routes.ts`          | 80, 81, 82                                                          | 75, 79, 157 (3 missed outcomes)                                                                                                                                                                                  |
| `server/db/schema.ts`            | 43, 110, 131, 174, 175, 457, 472, 516, 536, 552, 578, 699, 712, 738 | none; the file has no runtime branches                                                                                                                                                                           |
| `src/App.tsx`                    | 17, 18, 19                                                          | 16 is the sole displayed marker; the summary row records 5 missed outcomes                                                                                                                                       |
| `src/SignIn.tsx`                 | 52                                                                  | 208 (1 missed outcome)                                                                                                                                                                                           |
| `src/adapters/authFlow.ts`       | 200, 296, 373, 572, 647, 693                                        | 154, 187, 193, 194, 199, 211, 215, 217, 260, 292, 304, 305, 355, 369, 377, 386, 394, 402, 407, 413, 417, 510, 521, 534, 540, 551, 562, 568, 661, 664, 692, 700, 706; 33 displayed markers for 37 missed outcomes |
| `src/shell/AppRoutes.tsx`        | none                                                                | 47, 50 (2 missed outcomes)                                                                                                                                                                                       |
| `src/you/SignInMethods.tsx`      | 44                                                                  | 36 (1 missed outcome)                                                                                                                                                                                            |

The top-level HTML contains seven domain aggregate rows (`domain`,
`domain/concept2`, `domain/display`, `domain/generation`, `domain/monitor`,
`domain/monitor/pm5`, and `domain/stats`); every metric in every row is 100%.
Across the 40 domain source pages, all 39 pages with executable code are 100%
for all four metrics. The remaining page, `domain/stats/statsRow.ts`, contains
only type imports, interfaces, and a type alias. Its 0/0 metrics render as 0%
in the leaf HTML despite having no executable or uncovered lines.

Changed source outside the V8 report is accounted for as follows:

- `app/server/index.ts` is explicitly excluded by `vitest.config.ts`.
- `app/shared/auth.ts` is type-only and therefore has no executable V8 page.
- `app/src/native/appleAuth.ts` and `app/src/native/signin.ts` are under the
  configured `src/native/**` exclusion; their native boundary is covered by
  the contract/privacy and native build gates.
- Changed tests, E2E specs, scripts, CSS, configuration, migrations, public
  assets, Swift/native-project files, and documentation fall outside the
  configured runtime include or are test exclusions.

## Archived material

`coverage-html-1ecd4a19.tar.gz` contains the complete `app/coverage` directory:
357 regular files and 399 tar members including directories. Its exact member
list is `coverage-files.txt`.

`integrated-records-c8ba5f12.tar.gz` contains all 30 files that were directly
under `.superpowers/sdd/2026-09-13-apple-signin/integrated/` after the final
lint, format, production-bundle, sync, privacy, and distribution records became
stable. Its exact member list is `integrated-files.txt`. The archive includes
the 3.6 MB raw `xcode-build.log`; gzip reduces the complete integrated archive
to approximately 140 KB.

The source `integrated/browser/` directory is intentionally excluded from this
top-level integrated-records archive. Its 32 final files are preserved
separately in the parent-owned `browser/` directory beside this report, with
their own `SHA256SUMS`. The native DerivedData directory
`/tmp/ergomatic-apple-integrated-dd.bkncc0` is also excluded; it is ephemeral
compile output. The integrated archive retains its path, full compile log,
build settings, plist result, and built/synced privacy results. No installation,
launch, provider authorization, or device authorization was performed.

`SHA256SUMS` hashes both gzip archives. The archives were checked with
`gzip -t`, their member lists were read successfully with `tar -tzf`, and the
hash manifest was checked with `shasum -a 256 -c SHA256SUMS`.

## Recorded command inventory

Commands below are the invocations represented by the integrated logs and the
native plan/progress ledger. They run from `app/` unless the path itself says
otherwise; both `xcodebuild` commands run from `app/ios/App/`. This inventory does not invent a command for JSON records whose
producer command was not preserved.

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm test --project integration server/db/schema.integration.test.ts
pnpm build
pnpm dist:grep
pnpm exec cap sync ios
plutil -lint ios/App/App/App.entitlements ios/App/App.xcodeproj/project.pbxproj
/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -list -project App.xcodeproj
/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -scheme App -configuration Debug -destination "generic/platform=iOS Simulator" -derivedDataPath /tmp/ergomatic-apple-integrated-dd.bkncc0 build CODE_SIGNING_ALLOWED=NO
node scripts/apple-auth-privacy.test.mjs
node scripts/apple-auth-privacy.test.mjs /tmp/ergomatic-apple-integrated-dd.bkncc0/Build/Products/Debug-iphonesimulator/App.app/capacitor.config.json
```

The fixture logs expose the package-script expansion
`bash scripts/test-run.sh --project integration server/db/schema.integration.test.ts`;
the coverage log exposes `bash scripts/test-run.sh --coverage`; build, lint,
typecheck, format, and distribution logs likewise preserve their package-script
expansions. The final lint and format logs exit successfully after the CSS and
screenshot-wait tail. No full test rerun was needed for that non-runtime tail.

The separate security review remains INCOMPLETE after a platform
cybersecurity-risk block. This evidence package does not investigate, resume,
or represent that review as passed.
