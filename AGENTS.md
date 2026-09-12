# Ergomatic — Codex adapter

`CLAUDE.md` is the canonical repository instruction file. Read it completely
before doing any work and follow it as binding project guidance.

Keep every canonical `.claude/...` path unchanged. Do not copy or translate
that guidance into `.codex`, `.agents`, or differently cased directories.

Skills point in BOTH directions and neither direction is a copy. The four
Ergomatic skills are canonical in `.claude/skills/` and reach you through the
ten-line adapters in `.agents/skills/`; the skills vendored from
`mattpocock/skills` are canonical in `.agents/skills/` and reach Claude Code
through symlinks at `.claude/skills/<name>`. `scripts/skills-parity.sh` gates
that both roots hold the same names, and nothing more — it cannot tell a
symlink from a copy. So this part is on you: do not resolve the asymmetry by
flattening a pointer or a symlink into a second copy of the instructions.
