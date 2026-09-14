/// <reference types="vite/client" />

/** The build-time values this app reads off `import.meta.env`.
 *
 *  Declared so they are TYPED rather than `any` — without this,
 *  `import.meta.env.VITE_APP_VERSION` is an unsafe assignment and the
 *  typed-lint ratchet refuses it, which is the rule working: an untyped
 *  build constant is exactly the kind of thing that silently becomes
 *  `undefined` when its define is removed. */
interface ImportMetaEnv {
  /** The build's own version, defined in `vite.config.ts` from the
   *  `APP_VERSION` environment variable. `"dev"` when nothing set one.
   *  See `src/appVersion.ts` for why this is a build-time define rather
   *  than a value fetched from the server. */
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
