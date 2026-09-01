// A one-line module of its own — not folded into `externalBrowser.ts` —
// purely so a test can replace it with `vi.doMock`, the exact idiom this
// codebase already uses for `../platform`/`../native/*` (`appLifecycle.
// test.ts`, `monitorTransport.test.ts`). A same-module `vi.spyOn` on an
// internal call does NOT intercept it here (verified empirically:
// `openExternalUrl`'s own call to a same-file `navigateWeb` still ran the
// real, unmocked function under `vi.spyOn(mod, "navigateWeb")` — Vitest/
// Vite's ESM transform binds a same-file call to the local declaration,
// not the mutable exports object). jsdom itself cannot exercise the real
// call either way: it throws "Not implemented: navigation (except hash
// changes)" the instant `window.location.assign`/`.href` is actually
// invoked, and no existing test in this repo mocks `location.assign`/
// `.href` (checked, no precedent) — hence this dedicated, mockable seam.
export function navigateWeb(url: string): void {
  window.location.assign(url);
}
