# Ergomatic

Mobile-first tracker and planner for indoor rowing workouts, built around
The Erg Book's baseline-offset pace model. See `ROADMAP.md` for the build plan
and `CLAUDE.md` for dev workflow.

## Quick start

Requires Node 26 (`nvm use`).

    pnpm install          # root: installs git hooks
    cd app && pnpm install
    pnpm dev:server       # API on :8080
    pnpm dev              # client on :5173
