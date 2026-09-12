#!/usr/bin/env bash
# Unit tests for skills-parity.sh: a throwaway directory tree stands in for
# the repo's two skill roots, and each case asks whether the script accepts it.
#
# The invariant these tests defend: the script may only exit 0 when every
# skill name exists in BOTH roots with the same discovery frontmatter. The
# failure this guards against is silent — a skill present in one root is
# simply never offered to the other harness's agents, with no error anywhere —
# so the cases that must go RED are the point of this file, not padding.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/skills-parity.sh"
fails=0
check() { if [ "$1" = "$2" ]; then echo "ok: $3"; else echo "FAIL: $3 (want '$2' got '$1')"; fails=$((fails + 1)); fi; }

setup() {
  TMP="$(mktemp -d)"
  mkdir -p "$TMP/.claude/skills" "$TMP/.agents/skills"
}
teardown() { rm -rf "$TMP"; }

# write_skill <root> <name> [extra frontmatter line]
#
# A .agents file gets the adapter's pointer line, because that is one of the
# two shapes the gate accepts and it is the one that lets the two sides be
# separate files — which the frontmatter-drift cases below need, and which a
# symlinked pair cannot give them. write_vendored_pair covers the other shape.
write_skill() {
  mkdir -p "$TMP/$1/skills/$2"
  {
    echo "---"
    echo "name: $2"
    echo "description: does the $2 thing"
    [ -n "${3:-}" ] && echo "$3"
    echo "---"
    echo
    echo "body for $2"
    [ "$1" = ".agents" ] && echo "Read \`.claude/skills/$2/SKILL.md\` completely."
  } > "$TMP/$1/skills/$2/SKILL.md"
}

# The vendored shape: canonical in .agents with NO pointer line, reached from
# .claude by symlink. The gate must accept this and reject it being flattened.
write_vendored_pair() {
  mkdir -p "$TMP/.agents/skills/$1"
  {
    echo "---"
    echo "name: $1"
    echo "description: does the $1 thing"
    echo "---"
    echo
    echo "canonical vendored body for $1"
  } > "$TMP/.agents/skills/$1/SKILL.md"
  ln -s "../../.agents/skills/$1" "$TMP/.claude/skills/$1"
}

ask() { bash "$SCRIPT" "$TMP" > /dev/null 2>&1; echo $?; }

setup
write_skill .claude alpha
write_skill .agents alpha
check "$(ask)" 0 "matched pair passes"

write_skill .agents beta
check "$(ask)" 1 "skill only in .agents fails (Claude Code cannot see it)"

write_skill .claude beta
check "$(ask)" 0 "adding the .claude side restores parity"

write_skill .claude gamma
check "$(ask)" 1 "skill only in .claude fails (Codex cannot see it)"
rm -rf "$TMP/.claude/skills/gamma"

# A symlink is how .claude/skills reaches a vendored .agents skill; it must
# count as present, or the real repo layout would fail its own gate.
write_skill .agents delta
ln -s ../../.agents/skills/delta "$TMP/.claude/skills/delta"
check "$(ask)" 0 "a symlinked skill counts as present in both roots"

# A symlink whose target is gone reads as a skill that exists until something
# tries to open it. It must fail, not silently drop out of the set.
ln -s ../../.agents/skills/ghost "$TMP/.claude/skills/ghost"
check "$(ask)" 1 "a dangling symlink fails"
rm "$TMP/.claude/skills/ghost"
check "$(ask)" 0 "removing the dangling symlink restores parity"

# The frontmatter checks: a harness matches on these, so a pointer whose
# description has drifted from its canonical file is discoverable under the
# wrong terms — offered for the wrong jobs, or not offered at all.
write_skill .claude epsilon
write_skill .agents epsilon
check "$(ask)" 0 "epsilon pair passes before drift"
sed -i.bak 's/^description: .*/description: something else entirely/' "$TMP/.agents/skills/epsilon/SKILL.md"
check "$(ask)" 1 "a drifted description fails"
rm -f "$TMP/.agents/skills/epsilon/SKILL.md.bak"
write_skill .agents epsilon
check "$(ask)" 0 "restoring the description passes"

# disable-model-invocation decides whether an agent may invoke the skill on
# its own or only a human may. Present on one side and absent on the other is
# two different skills wearing one name.
write_skill .agents epsilon "disable-model-invocation: true"
check "$(ask)" 1 "disable-model-invocation on only one side fails"
write_skill .claude epsilon "disable-model-invocation: true"
check "$(ask)" 0 "matching disable-model-invocation passes"

# The name a harness invokes comes from frontmatter, not the folder. A
# mismatch means the skill answers to a name nothing points at.
write_skill .claude zeta
write_skill .agents zeta
sed -i.bak 's/^name: zeta/name: not-zeta/' "$TMP/.claude/skills/zeta/SKILL.md"
sed -i.bak2 's/^name: zeta/name: not-zeta/' "$TMP/.agents/skills/zeta/SKILL.md"
rm -f "$TMP/.claude/skills/zeta/SKILL.md.bak" "$TMP/.agents/skills/zeta/SKILL.md.bak2"
check "$(ask)" 1 "frontmatter name that is not the directory name fails"
write_skill .claude zeta
write_skill .agents zeta
check "$(ask)" 0 "restoring the name passes"

# AGENTS.md forbids flattening a pointer or symlink into a second copy of the
# instructions. Stating that and gating none of it is RF34, so these are the
# cases that hold the sentence up. Probe B is the flattening itself; C is the
# drift it then permits; D is the legitimate adapter shape, which must still
# pass or the four owned skills would fail their own gate.
write_vendored_pair theta
check "$(ask)" 0 "symlinked pair passes before flattening"
rm "$TMP/.claude/skills/theta"
cp -R "$TMP/.agents/skills/theta" "$TMP/.claude/skills/theta"
check "$(ask)" 1 "PROBE B: a symlink flattened into a real copy fails"
echo "entirely different body" >> "$TMP/.claude/skills/theta/SKILL.md"
check "$(ask)" 1 "PROBE C: the flattened copy's drifted body still fails"
printf 'Read `.claude/skills/theta/SKILL.md` completely.\n' >> "$TMP/.agents/skills/theta/SKILL.md"
check "$(ask)" 0 "PROBE D: a prose adapter naming the canonical path is the other legal shape"
rm -rf "$TMP/.claude/skills/theta" "$TMP/.agents/skills/theta"

# A skill name is used as a grep pattern; without -F a metacharacter makes it
# match a DIFFERENT name, and the run then reports the wrong skill as
# unpaired. Both names below are genuinely unpaired and both must be named.
write_skill .claude "a.b"
write_skill .agents "axb"
out="$(bash "$SCRIPT" "$TMP" 2>&1)"
check "$(echo "$out" | grep -c 'skills/a\.b has no')" 1 "a name with a regex metacharacter is reported as unpaired"
check "$(echo "$out" | grep -c 'skills/axb has no')" 1 "and so is the name it would have regex-matched"
rm -rf "$TMP/.claude/skills/a.b" "$TMP/.agents/skills/axb"

# A directory with no SKILL.md is not a skill; saying so beats letting the
# frontmatter reader return empty strings that happen to match each other.
mkdir -p "$TMP/.claude/skills/eta" "$TMP/.agents/skills/eta"
check "$(ask)" 1 "a skill directory with no SKILL.md fails"
teardown

# A missing root is a broken checkout, not an empty set of skills: answering
# "0 skills, all in parity" would be the most misleading green available.
setup
rm -rf "$TMP/.agents"
check "$(ask)" 1 "a missing .agents/skills root fails"
teardown

setup
rm -rf "$TMP/.claude"
check "$(ask)" 1 "a missing .claude/skills root fails"
teardown

if [ "$fails" -ne 0 ]; then echo "$fails test(s) failed"; exit 1; fi
echo "all skills-parity tests passed"
