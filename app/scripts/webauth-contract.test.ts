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
    // server answers `409 {error:"update_required"}` and issues no attempt --
    // and NO runtime test can see it: `linkFlow.test.ts` asserts the posted
    // body against the same imported constant, which agrees with itself
    // whatever it says. This is the only gate that compares the two files.
    //
    // Each `exec` runs on its OWN source on purpose: the shorter pattern also
    // matches the server's longer `NATIVE_LINK_CLIENT`, so running it over the
    // routes file would compare that file to itself.
    const client = /LINK_CLIENT = "([^"]+)"/.exec(linkFlow)?.[1];
    const server = /NATIVE_LINK_CLIENT = "([^"]+)"/.exec(routes)?.[1];
    expect(client).toBe("webauth-1");
    expect(server).toBe(client);
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
