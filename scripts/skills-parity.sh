#!/usr/bin/env bash
# Do both skill roots hold the same skills?
#
# Usage: skills-parity.sh [repo-root]
#
# WHY: Claude Code reads .claude/skills/ and Codex reads .agents/skills/, and
# neither harness looks at the other's directory. A skill present in only one
# root is invisible to half the agents working here — silently, because a
# missing skill raises no error, it is simply never offered. This repo sat in
# exactly that state until 2026-09-12, with eight vendored skills that no
# Claude Code session could see and nothing anywhere saying so.
#
# That silence is the whole reason for this check, and it is all this check
# does: the two roots hold the same names. It does not compare frontmatter
# (for the symlinked names both paths are the same inode, so that comparison
# would be cmp(x, x)), it does not police how a pair is joined, and it does
# NOT verify that a skill referenced BY another skill exists at all — the
# `wayfinder` skill names `research` and `prototype`, which this repo has
# never vendored, and no check here would notice.
set -uo pipefail

ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"

# A skill entry is a directory or a symlink to one: the vendored skills reach
# .claude/skills/ as symlinks, and `-type d` alone does not match those.
names() {
  find "$ROOT/$1/skills" -mindepth 1 -maxdepth 1 \( -type d -o -type l \) \
    -exec basename {} \; 2> /dev/null | sort
}

ONLY_CLAUDE="$(comm -23 <(names .claude) <(names .agents))"
ONLY_AGENTS="$(comm -13 <(names .claude) <(names .agents))"
COUNT="$(names .claude | grep -c .)"

# Zero is never a pass: two empty or missing roots are a broken checkout, and
# "0 skills, all in parity" would be the most misleading green available.
if [ -n "$ONLY_CLAUDE" ] || [ -n "$ONLY_AGENTS" ] || [ "$COUNT" -eq 0 ]; then
  [ -n "$ONLY_CLAUDE" ] && echo "skills-parity: in .claude/skills only, so Codex cannot see: $(echo "$ONLY_CLAUDE" | tr '\n' ' ')" >&2
  [ -n "$ONLY_AGENTS" ] && echo "skills-parity: in .agents/skills only, so Claude Code cannot see: $(echo "$ONLY_AGENTS" | tr '\n' ' ')" >&2
  [ "$COUNT" -eq 0 ] && echo "skills-parity: no skills found in .claude/skills — broken checkout?" >&2
  echo "skills-parity: add the missing entry to the other root (a symlink for a vendored skill, a pointer adapter for one of ours)" >&2
  exit 1
fi

echo "skills-parity: $COUNT skills in both roots"
