#!/usr/bin/env bash
# Per-worktree compose scoping (Phase CL). Source this from e2e.sh /
# screenshots.sh AFTER REPO_ROOT is set. Two agent sessions running browser
# gates from different worktrees used to stomp one shared stack — one
# Postgres volume and one pinned `ergomatic-*` container set meant
# duplicate fixtures, and worse, a served bundle from the WRONG BRANCH that
# reads as ~70 phantom test failures (.claude/agent-briefing.md's
# shared-stack note documents the workaround era; this file is the fix).
#
# Every value derives deterministically from the worktree's absolute path,
# so the same checkout always reuses its own stack (E2E_KEEP=1 iteration
# still works).
#
# TWO MODULI, AND THEY ARE NOT THE SAME WIDTH — read this before trusting
# "two checkouts can never share one", which is what this comment used to
# say flatly. Names use `% 100000`; ports use `% 400`, because the port
# range is deliberately narrow (8100-8499 / 15100-15499) to stay clear of
# prod, dev-pg and the legacy shared stack. So two worktrees whose path
# hashes differ by a multiple of 400 get DISTINCT project names and
# IDENTICAL host ports. With a handful of worktrees the odds are around a
# percent, and it has not been observed here.
#
# What happens if it does: `docker compose up` cannot bind the port and
# fails outright ("port is already allocated"), so the second gate STOPS
# rather than silently serving the first worktree's bundle. The
# ~70-phantom-failure disaster above needs one SHARED PROJECT, and the name
# modulus does prevent that — the residual risk here is a confusing bind
# error, never a wrong green. If you hit it, export APP_PORT and
# POSTGRES_PORT; every assignment below is `:-` guarded for exactly that.
#
# The values:
#   - COMPOSE_PROJECT_NAME  → per-worktree project (networks, volumes —
#     including the pgdata volume, so fixtures stop bleeding across
#     sessions)
#   - ERGO_STACK            → container_name prefix (compose.yml:6,30,64,92
#     pins names; unset it and prod/deploy keep their unprefixed names —
#     docs/deploy.md's `docker exec ergomatic-postgres` runbook line stays
#     true on the host)
#   - APP_PORT / POSTGRES_PORT → host bindings (compose.yml:13,77 already
#     read these; the derived range 8100-8499 / 15100-15499 avoids the
#     prod (8082), dev-pg (5433), and legacy shared-stack (8081) ports)
#   - E2E_BASE_URL          → what playwright.config.ts points the browser
#     at (its default stays the legacy 8081 for a bare `playwright test`
#     against a hand-started stack)
#
# Explicit env always wins: every assignment below is `:-` guarded, so CI
# or a human can still pin any of these by exporting it first.
# Loud guard: sourcing this with REPO_ROOT unset/empty used to hash the
# EMPTY STRING, silently minting a phantom stack (ergomatic-67295, :8195)
# in every worktree — a project belonging to no path, reaped at the next
# scripted boot. Manual `source` calls hit this twice on 2026-08-30
# (81/81 ECONNREFUSED, and probes nearly trusted against the wrong
# bundle). Every script consumer (e2e.sh, screenshots.sh, walk-lab.sh)
# sets REPO_ROOT first, so this only fires on the mistake it names.
: "${REPO_ROOT:?stack-env.sh: set REPO_ROOT (the worktree root) before sourcing}"

STACK_HASH=$(printf %s "$REPO_ROOT" | cksum | cut -d' ' -f1)
PORT_OFFSET=$((STACK_HASH % 400))

export ERGO_STACK="${ERGO_STACK:-ergomatic-$((STACK_HASH % 100000))}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$ERGO_STACK}"
export APP_PORT="${APP_PORT:-$((8100 + PORT_OFFSET))}"
export POSTGRES_PORT="${POSTGRES_PORT:-$((15100 + PORT_OFFSET))}"
export E2E_BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:$APP_PORT}"

echo "stack: $COMPOSE_PROJECT_NAME (web :$APP_PORT, pg :$POSTGRES_PORT)"
