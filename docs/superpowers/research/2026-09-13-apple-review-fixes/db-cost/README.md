# Session-cleanup DBA evidence

The deciding report is [the migrated-schema measurement](cascade/report.md). [The original report](report.md) is parent-table isolation only and omits cascade cost. SQL fixtures and shell harnesses remain plain files. All 120 raw logs are preserved at their original relative paths in `raw-logs.tar.gz`, with member hashes in `raw-log-sha256.txt`.

From this directory, extract and verify:

```sh
tar -xzf raw-logs.tar.gz
shasum -a 256 -c raw-log-sha256.txt
```

Archive SHA-256: `40f11ad23ddb6106d2f76057e356cba78df4ae9a5c2937f5da409dc53d6ad9d0`. The controller extracted into a fresh temporary directory and verified every member with both SHA-256 byte comparison and the exact `shasum` command above before removing loose log files. Report references to individual `.log` files resolve after extraction. No database harness was rerun during packaging.
