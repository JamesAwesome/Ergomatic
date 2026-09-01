// A one-line module of its own — not folded into `externalBrowser.ts` —
// purely so `externalBrowser.test.ts` can replace it with `vi.doMock`, the
// exact idiom this codebase already uses for `../platform`/`../native/*`
// (`appLifecycle.test.ts`, `monitorTransport.test.ts`). A same-module
// `vi.spyOn` on an internal call does NOT intercept it here (verified
// empirically: `openExternalUrl`'s own call to a same-file `navigateWeb`
// still ran the real, unmocked function under `vi.spyOn(mod,
// "navigateWeb")` — Vitest/Vite's ESM transform binds a same-file call to
// the local declaration, not the mutable exports object).
//
// This module's OWN implementation is tested directly and for real in
// `webNavigate.test.ts` — jsdom throws "Not implemented: navigation
// (except hash changes)" if the real `window.location.assign` runs, and a
// direct `vi.spyOn(window.location, "assign")` fails outright ("Cannot
// redefine property: assign", non-configurable), but replacing
// `window.location` itself (configurable, unlike its own `assign` method)
// with a plain object carrying a spy sidesteps both and drives the real
// call — see that test file's own header for the full account.
export function navigateWeb(url: string): void {
  window.location.assign(url);
}
