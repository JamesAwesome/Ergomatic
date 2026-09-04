import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";

// Wave E PR1.75b. The `WebAuth` plugin's contract is four sets of STRING
// LITERALS spread across Swift, TS and a plist, and nothing in the toolchain
// compares them: `registerPlugin<T>(name)` is generic over a name it never
// checks, `call.getString("url")` is a dictionary lookup, and a mistyped
// reject code silently becomes `pluginError`. Every one of those failures is
// invisible until someone is standing at a phone. This file is the only gate
// that can see them, so it reads the real sources rather than a fixture.
//
// Reading `server/routes/concept2.ts` here is a READ, not a write: the PR's
// scope gate is "zero files CHANGED under app/server/" (design §0), and the
// scheme literal has to be checked against the authority that issues the
// redirect or the check is a mirror.

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, "..", p), "utf8");

const swift = read("ios/App/App/WebAuthPlugin.swift");
const webAuth = read("src/native/webAuth.ts");
const linkFlow = read("src/adapters/linkFlow.ts");
const routes = read("server/routes/concept2.ts");
const probe = read("src/monitor/Concept2LinkProbe.tsx");
const linkHook = read("src/api/useConcept2Link.ts");
const plist = read("ios/App/App/Info.plist");
const js = webAuth + linkFlow;

function matchAll(source: string, re: RegExp): string[] {
  return [...source.matchAll(re)].map((m) => m[1]!);
}

/** Every `call.reject(message, "code")` code, taken as the LAST quoted string
 *  on a line containing `.reject(` -- messages carry `\(interpolation)` and
 *  backticks, so a single whole-call regex is not robust.
 *
 *  The `\\.` alternative in the string body is what makes it robust: a Swift
 *  `\(interpolation)` contains a backslash, and the naive `[^"\\]*` form stops
 *  dead at it, so the whole quoted string is invisible and the LINE yields
 *  nothing. Measured 2026-09-02: that form saw 12 of the 14 `.reject(` lines,
 *  and the two it could not see were exactly the two the comment above names
 *  as its reason for existing. */
function rejectCodes(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => line.includes(".reject("))
    .map((line) => {
      const quoted = matchAll(line, /"((?:[^"\\]|\\.)*)"/g);
      return quoted[quoted.length - 1] ?? "";
    })
    .filter((code) => /^[A-Za-z][A-Za-z0-9]*$/.test(code));
}

/** The codes `adapters/linkFlow.ts` actually ACTS on, sorted and deduped: the
 *  explicit `case "x":` arms of `pluginRejection`, plus the codes its
 *  fall-through comment names as deliberately reaching `default`. Reading
 *  behaviour-bearing syntax rather than the file's whole text is the point --
 *  a doc comment listing every code makes a `toContain` check unfalsifiable. */
function handledCodes(source: string): string[] {
  const cased = matchAll(source, /case "([^"]+)":/g);
  const listed =
    /falls through to pluginError: ([^\n]+)/.exec(source)?.[1] ?? "";
  return [
    ...new Set([
      ...cased,
      ...listed
        .split(",")
        .map((code) => code.trim())
        .filter((code) => code !== ""),
    ]),
  ].sort();
}

/** Every key `GET /api/concept2/link`'s handler can emit, unioned over its
 *  three `res.json({…})` exits (flag-off, unlinked, linked). Comments are
 *  stripped FIRST and the reason is concrete: that handler's own comment
 *  contains `{c2_user_id}` and `{result_id}`, so a brace-counting or
 *  `[^{}]`-bounded read of the literal without stripping stops in the middle of
 *  a sentence. */
function linkResponseKeys(routesSource: string): string[] {
  const start = routesSource.indexOf('router.get(\n    "/api/concept2/link"');
  const end = routesSource.indexOf("router.delete(", start);
  const handler = routesSource.slice(start, end).replace(/\/\/[^\n]*/g, "");
  const keys = [...handler.matchAll(/res\.json\(\{([^{}]*)\}\)/g)].flatMap(
    (m) => matchAll(m[1]!, /(?:^|[{,])\s*([A-Za-z_$][\w$]*)\s*:/gm),
  );
  return [...new Set(keys)].sort();
}

/** The keys `Concept2LinkProbe.tsx`'s `LinkStatus` DECLARES, optional marker
 *  and all. Does NOT strip comments — the interface's own doc comment says so
 *  and tells the next person adding a field where the explanation goes. */
function linkStatusKeys(probeSource: string): string[] {
  const body = /interface LinkStatus \{([^}]*)\}/.exec(probeSource)?.[1] ?? "";
  return [...new Set(matchAll(body, /([A-Za-z_$][\w$]*)\??:/g))].sort();
}

/** The keys `src/api/useConcept2Link.ts`'s `Concept2Link` DECLARES — the
 *  PRODUCT reader's shape, as opposed to the dev probe's.
 *
 *  Comments are stripped first, block and line alike, because this interface
 *  carries a doc comment and two `//` explanations INSIDE its braces (which
 *  is right — it is product code, and the rationale belongs beside the
 *  field). Stripping is what lets it, where `linkStatusKeys` above cannot. */
function productLinkKeys(hookSource: string): string[] {
  const body =
    /export interface Concept2Link \{([^}]*)\}/.exec(hookSource)?.[1] ?? "";
  const stripped = body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  return [...new Set(matchAll(stripped, /([A-Za-z_$][\w$]*)\??:/g))].sort();
}

describe("WebAuth plugin contract (Swift <-> TS <-> plist)", () => {
  it("every option key the Swift reads is named on the JS side", () => {
    const keys = matchAll(swift, /call\.get(?:String|Bool)\("([^"]+)"/g);
    expect(keys.length).toBeGreaterThan(0);
    expect([...new Set(keys)].sort()).toStrictEqual([
      "callbackScheme",
      "ephemeral",
      "url",
    ]);
    for (const key of keys) expect(js).toContain(key);
  });

  it("the JS passes `ephemeral: true` explicitly rather than leaning on the Swift default", () => {
    // `call.getBool("ephemeral", true)` (WebAuthPlugin.swift) defaults the
    // control SAFE, so an omitted key still gets an ephemeral session. That
    // default is a backstop, not the contract: `ephemeral: true` is a control
    // against RFC 9700 §4.5 code injection on a shared phone (design §4), and
    // a control that lives only in the callee's default argument silently
    // becomes a preference the day someone edits the Swift signature. The JS
    // states it, and this pins that it does.
    expect(linkFlow).toContain("ephemeral: true");
  });

  it("every rejection code the Swift can emit is either cased explicitly in linkFlow or named in its fall-through list", () => {
    const codes = rejectCodes(swift);
    // Every `.reject(` line must have yielded a code. Without this, a regex
    // that silently skips a line shrinks the set instead of failing (measured
    // 2026-09-02: the `[^"\\]*` form saw 12 of 14 lines and stayed green
    // through a deliberate typo on an interpolated one).
    expect(codes).toHaveLength(
      swift.split("\n").filter((l) => l.includes(".reject(")).length,
    );
    // The nine of design §4 + plan observation 2. Pinned as an INDEPENDENT
    // literal list, not derived from the file, so deleting a reject arm in
    // Swift fails here instead of quietly shrinking the expectation.
    expect([...new Set(codes)].sort()).toStrictEqual([
      "abandoned",
      "badRequest",
      "busy",
      "cancelled",
      "cannotStart",
      "contextInvalid",
      "noContext",
      "noWindow",
      "pluginError",
    ]);
    // NOT `js.toContain(code)`, which was the original form and could not
    // bite: every code is mentioned in `webAuth.ts`'s doc comment listing the
    // Swift's full set, so deleting all six `case` arms from
    // `pluginRejection` left that assertion green (RF26 -- the gate proved the
    // string appeared SOMEWHERE in the source text, and was written up as
    // proving the code was handled). `handledCodes` reads the two places that
    // actually decide behaviour: an explicit `case "x":` arm, or the parsed
    // fall-through comment naming the codes that intentionally reach
    // `default`. Set equality both ways, so a Swift code nobody handles and a
    // handled code the Swift can no longer emit each fail here.
    expect(handledCodes(linkFlow)).toStrictEqual([...new Set(codes)].sort());
  });

  it("the plugin's Swift jsName is the name `registerPlugin` asks for", () => {
    const jsName = /let jsName = "([^"]+)"/.exec(swift)?.[1];
    const registered = /registerPlugin<[^>]*>\("([^"]+)"\)/.exec(webAuth)?.[1];
    expect(jsName).toBe("WebAuth");
    expect(registered).toBe(jsName);
  });

  it("the linkClient declaration is one capability spelled in two places", () => {
    // Retyping `LINK_CLIENT` breaks every native link on the device -- the
    // server answers `409 {error:"update_required"}` and issues no attempt.
    // `linkFlow.test.ts:109` pins the client-side literal, so a drift THERE
    // is caught; what no runtime test can see is a rename of the SERVER's
    // `NATIVE_LINK_CLIENT`, since nothing else compares the two files
    // (measured 2026-09-02: a server-side rename leaves `linkFlow.test.ts`
    // 24/24 green and reddens only this file).
    //
    // Each `exec` runs on its OWN source on purpose: the shorter pattern also
    // matches the server's longer `NATIVE_LINK_CLIENT`, so running it over the
    // routes file would compare that file to itself.
    const client = /LINK_CLIENT = "([^"]+)"/.exec(linkFlow)?.[1];
    const server = /NATIVE_LINK_CLIENT = "([^"]+)"/.exec(routes)?.[1];
    expect(client).toBe("webauth-1");
    expect(server).toBe(client);
  });

  it("the probe's LinkStatus interface names exactly the keys GET /api/concept2/link emits", () => {
    // `LinkStatus` is a hand copy of a response shape, in a different file from
    // the handler that produces it, and TypeScript compares the two never: the
    // probe casts `res.json()`'s `unknown` straight to the interface. A server
    // key renamed or added therefore reaches the walk as a silently `undefined`
    // field -- `linked (C2 user undefined, undefined)` -- with every suite
    // green. This is the only gate that reads both files.
    //
    // Reading `server/routes/concept2.ts` here is a READ, not a change: the
    // PR's scope gate is "zero files CHANGED under app/server/" (design §0),
    // and checking a copy against anything but its ORIGINAL is a mirror.
    const emitted = linkResponseKeys(routes);
    // Pinned as an INDEPENDENT literal list as well as compared, the same shape
    // as the reject-codes test above: without it, deleting a key from BOTH
    // files at once would keep the set equality green.
    expect(emitted).toStrictEqual([
      "available",
      "c2UserId",
      "c2Username",
      "linked",
      "logbookBaseUrl",
      "needsReauth",
    ]);
    expect(linkStatusKeys(probe)).toStrictEqual(emitted);
  });

  it("the PRODUCT hook's Concept2Link names exactly the keys GET /api/concept2/link emits", () => {
    // The sibling gate above pins the DEV PROBE's copy of this response — a
    // type no rower's screen ever reads. `normalizeLink` in
    // `src/api/useConcept2Link.ts` is the reader every rower actually gets,
    // and until this test nothing bound it to the route at all: it already
    // parsed two keys the handler did not emit, and TypeScript compares the
    // two files never (the hook casts `res.json()`'s `unknown`).
    //
    // The production symptom of the gap, and the reason this is a gate and
    // not a nicety: rename the handler's key to `c2username` and the card's
    // identity line reads `account #2211` forever while the
    // View-on-Concept2 button never renders — every suite green.
    //
    // Set equality both ways, so a key the route emits and the hook cannot
    // read, AND a key the hook parses that the route never sends, each fail
    // here. No independent literal list on this one: the sibling test above
    // already pins the emitted set as a literal, and a second copy of the
    // same six strings would go stale rather than add a check.
    expect(productLinkKeys(linkHook)).toStrictEqual(linkResponseKeys(routes));
  });

  it("the callback scheme is one registration spelled in three places", () => {
    const scheme = /LINK_CALLBACK_SCHEME = "([^"]+)"/.exec(linkFlow)?.[1];
    const nativeRedirect = /NATIVE_REDIRECT_URI = "([^"]+)"/.exec(routes)?.[1];
    expect(scheme).toBe("haus.waffle.ergomatic");
    // The scheme half of the server's redirect_uri, which is what Concept2
    // has registered and what the session filters callbacks on.
    expect(nativeRedirect?.split("://")[0]).toBe(scheme);
    // And the OS's own registration, so a rename cannot leave the plist behind.
    expect(plist).toContain(`<string>${String(scheme)}</string>`);
  });
});
