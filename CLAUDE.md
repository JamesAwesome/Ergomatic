# Ergomatic

Mobile-first rowing (erg) workout tracker/planner around The Erg Book model.
Roadmap: `ROADMAP.md` (phases + standing rules). Design reference: `docs/design/`
(high-fidelity; 44px hit targets and WCAG AA are hard requirements).

## Layout

- `app/` — the deployable: `src/` (React 19 + Vite client), `server/` (Express 5 API),
  `domain/` (pure Erg Book logic — no framework imports allowed)
- Root `package.json` exists only to host husky hooks. Run `pnpm install` at root
  AND in `app/`.
- `app/pnpm-workspace.yaml` is auto-generated pnpm config (`allowBuilds` for esbuild,
  plus other keys pnpm adds during installs) and makes `app/` its own pnpm workspace
  root, so the repo-root `.npmrc` does not apply inside `app/`.

## Commands (run in `app/`)

- `pnpm dev` / `pnpm dev:server` — Vite client :5173 (proxies /api) / API :8080
- `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:coverage` (90% gate) · `pnpm build`
- Single Vitest project: `pnpm test --project unit|client|integration`
- Local dev DB: `docker run --rm -d --name erg-dev-pg -p 5433:5432 -e POSTGRES_PASSWORD=dev postgres:18.4`
  then `DATABASE_URL=postgres://postgres:dev@localhost:5433/postgres pnpm dev:server`.
  The server refuses to start without `DATABASE_URL` (no dotenv — real env only).
- Local OAuth: set `SITE_URL=http://localhost:5173` when running `dev:server`
  (redirect URI derives from it; without it Google errors redirect_uri_mismatch):
  `DATABASE_URL=... SITE_URL=http://localhost:5173 GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... ALLOWED_EMAILS=you@gmail.com pnpm dev:server`

## Rules

- **Verify current versions before adding/pinning any dependency** (`npm view <pkg> version`).
  Never trust versions from memory or other repos. TypeScript stays `~6.0.x` until
  typescript-eslint's peer range admits 7 (check `npm view typescript-eslint peerDependencies`).
- TDD: failing test first. Domain code gets the heaviest coverage.
- Hooks: pre-commit = lint-staged + typecheck; pre-push = full tests. Don't bypass with
  `--no-verify`; fix the failure.
- pnpm only. ESM only. Server imports use `.js` extensions.
- After every merge to main, post a TestFlight release recommendation
  (docs/RELEASING.md): "recommended: <reasons>" or "not needed". Versions
  come ONLY from annotated vX.Y.Z tags; API changes additive-only between
  tags.

## Commands

- iOS: `pnpm ios:build` (tag-derived version; needs `GOOGLE_IOS_CLIENT_ID` env), `pnpm ios:open` (Xcode).
