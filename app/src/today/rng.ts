import { RNG_RANGE, type Rng } from "../../domain/suggest.js";

/** The client's rng for the domain's `Rng` contract (spec §1.1, §2.2): one
 *  `Uint32` from the browser's CSPRNG per call. MDN: `getRandomValues()`
 *  "lets you get cryptographically strong random values", is Baseline
 *  widely available since 2015, and is "the only member of the `Crypto`
 *  interface which can be used from an insecure context" — so the web
 *  harness on plain http://localhost and the native WKWebView both have
 *  it. Not a platform conditional (a browser global on every surface), so
 *  it lives here rather than in an adapter. Never `Math.random`. Tests
 *  mock this module with a scripted queue. */
export const clientRng: Rng = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % RNG_RANGE;
};
