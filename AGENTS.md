# Ergomatic — Codex adapter

`CLAUDE.md` is the canonical repository instruction file. Read it completely
before doing any work and follow it as binding project guidance.

Keep every canonical `.claude/...` path unchanged. Do not copy or translate
that guidance into `.codex`, `.agents`, or differently cased directories.
**This rule has been broken once and it is worth knowing how, because the
result looked correct.** `.codex/agents/dba.toml` was generated as an
11,893-byte fork of `.claude/agents/dba.md` with `.claude/` rewritten to
`.Codex/`. Its three "read before anything else" files did not exist at
those paths, so the agent would have started blind while the file read as
complete — and on a case-insensitive filesystem the wrong casing looks
harmless, which is why the directory being wrong matters more than the case.
The adapters are `.codex/agents/<name>.toml`, about 500 bytes, and their
whole body says to read the `.claude/` file. **Over a kilobyte means you
forked it.** (Fixed 2026-09-13.)

Skills point in BOTH directions and neither direction is a copy. The four
Ergomatic skills are canonical in `.claude/skills/` and reach you through the
ten-line adapters in `.agents/skills/`; the skills vendored from
`mattpocock/skills` are canonical in `.agents/skills/` and reach Claude Code
through symlinks at `.claude/skills/<name>`. `scripts/skills-parity.sh` gates
that both roots hold the same names, and nothing more — it cannot tell a
symlink from a copy. So this part is on you: do not resolve the asymmetry by
flattening a pointer or a symlink into a second copy of the instructions.
