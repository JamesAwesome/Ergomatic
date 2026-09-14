/**
 * The build's own version string, for stamping a diagnostics export.
 *
 * WHY A BUILD-TIME DEFINE AND NOT A FETCH. The server knows its version
 * (`APP_VERSION` → `GET /api/health`), but that is the SERVER's build, and
 * the case a diagnostics log most needs to name is a stale CLIENT — an old
 * bundle cached on a tester's phone talking to a current server. Asking the
 * server would report the wrong half of that pair, and would need the
 * network at the moment someone is copying a log because something is
 * already broken.
 *
 * `vite.config.ts` defines `import.meta.env.VITE_APP_VERSION` from the
 * `APP_VERSION` environment variable at build time. It is `"dev"` when
 * nothing set one, which is true of a local `pnpm dev` and is exactly what
 * we want it to say there.
 *
 * **A `"dev"` reading in a log that came from a real build means the BUILD
 * PLUMBING is broken, not that the field is unused.** Six sites have to
 * agree, and `scripts/app-version-stamp.test.sh` gates every one of them:
 * this constant, `vite.config.ts`'s define, the Dockerfile's build stage
 * (declared ABOVE `RUN pnpm build`), `package.json`'s `ios:build`,
 * `compose.yml`'s **web** service and CI's "Build web image" step. The last
 * two were missed on the first attempt — the api image got the arg and the
 * web image, which is the one that emits `dist/client`, did not, so every
 * web log would have read `dev` while `/api/health` reported the truth.
 * That failure mode is the whole reason this is a define rather than a
 * literal: a literal would be silently stale instead of loudly `dev`.
 */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION || "dev";
