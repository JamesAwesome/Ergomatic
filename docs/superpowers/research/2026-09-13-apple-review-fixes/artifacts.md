# Evidence artifacts

The implementation logs preserve successful gates, deciding red/mutant runs, and labelled harness/setup failures. A failed invocation is not a product failure unless its report identifies the deciding assertion. All auth/runtime inputs here are synthetic; no Apple private-key file, live provider session, or host environment was collected.

| Archive | SHA-256 |
| --- | --- |
| `implementation-logs.tar.gz` | `ddba896843913779bff04e62b41ba6ab99abff2853008f540cb7e0db23fa6fc1` |
| `coverage-html.tar.gz` | `dda5e20b23878bbea286955c4a773816aa3030482e4cda110e32ef5b3dfd681e` |
| `runtime-logs.tar.gz` | `64ecb1efb26a59ca265cfd700e5d0740f091258c81d4b0453da00ed864c6126d` |

Run from the repository root to extract into a new temporary directory and verify every member against its committed manifest:

```sh
artifact_dir="$(pwd)/docs/superpowers/research/2026-09-13-apple-review-fixes"
scratch_dir="$(mktemp -d)"
cd "$scratch_dir"
tar -xzf "$artifact_dir/implementation-logs.tar.gz"
shasum -a 256 -c "$artifact_dir/implementation-log-sha256.txt"
tar -xzf "$artifact_dir/coverage-html.tar.gz"
shasum -a 256 -c "$artifact_dir/coverage-html-sha256.txt"
tar -xzf "$artifact_dir/runtime-logs.tar.gz"
shasum -a 256 -c "$artifact_dir/runtime-log-sha256.txt"
```

The extraction block was executed verbatim in a fresh temporary directory: all **458 members** verified (64 implementation logs, 368 HTML assets and 26 browser/final runtime artifacts).

Open `coverage/index.html` in that temporary directory for the full browsable report. Implementation log names in [implementation-report.md](implementation-report.md) resolve in the extraction directory. The original on-disk paths in commands are historical run locations, not additional required downloads. [Final results and coverage analysis](final-validation/) and [browser reports/captures](browser/report.md) are stored plainly beside this page; raw runtime log and served-asset references resolve after extraction, preserving original whitespace and bytes; the [database archive](db-cost/README.md) has its own extraction manifest and measured fixtures.

The old injected Release receipt is preserved as historical branch coverage only. The deciding native receipts are `native-production-default-release-red.log`, `native-production-default-release-green.log`, `native-production-default-debug-green.log`, and the getter-restoration mutant logs, all described in the implementation report. No physical-device log collection or actual provider authorization is claimed.
