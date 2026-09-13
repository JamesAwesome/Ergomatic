# Apple auth database measurement

This is the immutable plan-stage DBA evidence copied from `/tmp/apple-dba-plan`.
Read `report.md` for the PASS on corrected candidate `299a31d3`, the original
`82fb92cb` deadlock failure, exact commands, scales and limits. `SHA256.json`
fingerprints the archived files. All rows, credentials and bind values are
synthetic. This is separate from the later PR-stage measurement gate.

Scripts retain the absolute paths used for the actual measurement. To replay,
copy this directory to `/tmp/apple-dba-plan` on the recorded machine, restore
the indicated isolated PostgreSQL18.4 container, and supply the report's
`node_modules` symlink to an installed candidate checkout. The CREATE-database
scripts require a fresh container. They may not target a real account database.
The `original/` and `fixed/` stores are pinned snapshots, not editable product
copies. Schema/migration files are archival inputs.

The `old-boot.mjs` case additionally requires its source checkout to contain
exactly the pre-Apple server at `aefc59b7`, with both dependency roots installed;
its hardcoded path named the integration worktree before adoption. If replaying
after adoption, use a separate detached worktree at that commit and update
only the script's cwd for the replay. The archived original command/result
remain unchanged. A newer server at the old path would not be the same test.
Do not check out or restore files over ongoing work to recreate this condition.

The report's deployment and portal limits are deliberate: health200 establishes
old-server schema/boot compatibility, not Apple-only authentication. No real
Apple authorization or production latency is claimed.
