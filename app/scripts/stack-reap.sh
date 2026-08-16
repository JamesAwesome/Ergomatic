#!/usr/bin/env bash
# Reaps ergomatic-* compose stacks whose worktree no longer exists.
#
# stack-env.sh gives every worktree its own compose project (the Phase CL
# fix for two sessions stomping one shared stack), and e2e.sh /
# screenshots.sh deliberately leave the stack running afterward
# (E2E_KEEP=1, the local-iteration default). The unpaid half of that
# design: when a worktree is torn down after its PR merges, nothing downs
# its stack, and the project name is a hash of a path that no longer
# exists — orphaned by construction. Four stacks (twelve containers) had
# accumulated by 2026-08-16 before anyone noticed.
#
# This script closes the loop mechanically instead of by checklist: it is
# sourced at every e2e/screenshots boot, recomputes the expected project
# name for every LIVE worktree (main checkout included — `git worktree
# list` prints it first) with the SAME formula stack-env.sh uses, and
# downs any running `ergomatic-<digits>` compose project that matches no
# live worktree. Volumes go with it (`-v`): a dead worktree's pgdata is
# regenerated fixtures, not data.
#
# What it can never touch, and why:
#   - the CURRENT stack and any concurrent session's stack — their
#     worktrees are alive, so their hashes are in the protected set;
#   - prod/deploy containers — compose.yml only prefixes names when
#     ERGO_STACK is set, and prod's project name is not ergomatic-<digits>;
#   - hand-run containers like erg-dev-pg — no compose project label, and
#     the name filter requires the ergomatic-<digits> shape anyway;
#   - anything a human pinned via an explicit COMPOSE_PROJECT_NAME that
#     does not look like ergomatic-<digits>.
#
# Requires REPO_ROOT (set by the callers before sourcing, same contract as
# stack-env.sh). A docker daemon that is down makes this a no-op rather
# than a failure — the boot that follows will fail loudly on its own.

if ! docker info >/dev/null 2>&1; then
  echo "stack-reap: docker unavailable, skipping"
else
  live_projects=" "
  while IFS= read -r wt_path; do
    wt_hash=$(printf %s "$wt_path" | cksum | cut -d' ' -f1)
    live_projects="${live_projects}ergomatic-$((wt_hash % 100000)) "
  done < <(git -C "$REPO_ROOT" worktree list --porcelain | sed -n 's/^worktree //p')

  # `docker ps -a` so a stopped-but-not-removed orphan is reaped too; the
  # compose label is how compose itself tracks project membership.
  for proj in $(docker ps -a --filter "label=com.docker.compose.project" \
    --format '{{.Label "com.docker.compose.project"}}' | sort -u); do
    case "$proj" in
      ergomatic-[0-9]*) ;;
      *) continue ;;
    esac
    case "$live_projects" in
      *" $proj "*) ;; # a live worktree owns it — protected
      *)
        echo "stack-reap: downing orphaned stack $proj (no live worktree owns it)"
        docker compose -p "$proj" down -v --remove-orphans || true
        ;;
    esac
  done
fi
