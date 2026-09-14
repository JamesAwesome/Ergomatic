# Apple failure-discard measurement archive

Read `report.md` for the source-pinned scope, measured results, limitations and replay commands. These are the original `/tmp/apple-dba-discard` artifacts, archived byte-for-byte with SHA256SUMS. Source and mutant snapshots are synthetic fixtures; no credentials from an Apple account were used.

For replay, restore this directory to `/tmp/apple-dba-discard`, recreate its node_modules symlink to the candidate app dependencies, and use the isolated PostgreSQL container and commands in the report. The scripts intentionally retain the original scratch and candidate paths. They create their own fixture databases; use a fresh container. No repository worktree or database should be deleted to replay them.

This is a plan-delta PASS at server candidate `259882ba`, not final integrated-PR signoff. The original migration/query measurements remain in the sibling `2026-09-13-apple-db-measurement` archive.
