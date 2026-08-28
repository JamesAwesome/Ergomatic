> **Archived 2026-08-28** from `ROADMAP.md` (lines 65-80 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 0 — Scaffold & tooling

**Status:** Done
**Goal:** A cloned repo where `pnpm install && pnpm test` works and bad code cannot be committed.

- [x] Verify current stable versions of everything (Node, pnpm, TypeScript, React, Vite, Express, Vitest, ESLint, husky/lint-staged) against the registries per the standing rule above
- [x] Repo layout: `app/` containing `client/` (Vite React) and `server/` (Express), shared `domain/` module space
- [x] pnpm + `only-allow pnpm`, `.npmrc`, Node version pin
- [x] TypeScript strict config, ESLint flat config (js + typescript-eslint + react-hooks + react-refresh)
- [x] Vitest three-project setup with coverage thresholds wired from the start
- [x] husky + lint-staged: pre-commit lint/typecheck (staged), pre-push full tests
- [x] GitHub Actions CI: lint → typecheck → test:coverage → build; Dependabot (weekly, grouped)
- [x] CLAUDE.md + README with dev workflow

**Exit:** CI green on a trivial client/server "hello" with one passing test in each Vitest project; hooks demonstrably block a lint failure and a test failure.
