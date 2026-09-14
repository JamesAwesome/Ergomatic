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
 * **A `"dev"` reading in a log that came from TestFlight means the BUILD
 * PLUMBING is broken, not that the field is unused** — `Dockerfile`'s build
 * stage and `package.json`'s `ios:build` both pass `APP_VERSION`, and
 * `appVersion.test.ts` pins that a set value reaches this constant. That
 * failure mode is the whole reason this is a define rather than a literal:
 * a literal would be silently stale instead of loudly `dev`.
 */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION || "dev";
