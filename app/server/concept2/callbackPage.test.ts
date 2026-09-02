import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  renderCallbackPage,
  type CallbackPageKind,
} from "./callbackPage.js";

// Wave E PR1.75a (2026-09-02-concept2-pr175-app-bind-design.md §7): ONE
// server template, inline CSS, system fonts, zero network, used by every
// callback page. The copy below is the design's table VERBATIM; a wording
// change here is a design-gate question, not a test fix.
describe("renderCallbackPage", () => {
  const cases: Array<
    [Exclude<CallbackPageKind, "linked">, number, string, string, string]
  > = [
    [
      "alreadyLinked",
      409,
      "CONCEPT2 LINK · ALREADY LINKED · HTTP 409",
      "That Concept2 account is already connected to a different Ergomatic account.",
      "Return to the app.",
    ],
    [
      "expired",
      400,
      "CONCEPT2 LINK · EXPIRED · HTTP 400",
      "This link has expired or was already used.",
      "Return to the app and start again.",
    ],
    [
      "incomplete",
      400,
      "CONCEPT2 LINK · INCOMPLETE · HTTP 400",
      "This link is missing required parameters.",
      "Return to the app and start again.",
    ],
    [
      "notSignedIn",
      401,
      "CONCEPT2 LINK · NOT SIGNED IN · HTTP 401",
      "No Ergomatic session in this browser.",
      "Sign in to Ergomatic here, then start the link again from the app.",
    ],
    [
      "wrongAccount",
      403,
      "CONCEPT2 LINK · WRONG ACCOUNT · HTTP 403",
      "This link was started by a different Ergomatic account.",
      "Sign in as that account here, or start a new link from the account you're using.",
    ],
    [
      "unavailable",
      403,
      "CONCEPT2 LINK · UNAVAILABLE · HTTP 403",
      "Concept2 linking is not available right now.",
      "Return to the app.",
    ],
    [
      "failed",
      502,
      "CONCEPT2 LINK · FAILED · HTTP 502",
      "Concept2 could not complete the connection.",
      "Return to the app and try again.",
    ],
  ];

  it.each(cases)(
    "%s renders status %i, the mono label, the statement and the action line verbatim",
    (kind, status, label, statement, action) => {
      const page = renderCallbackPage(kind);
      expect(page.status).toBe(status);
      expect(page.html).toContain(label);
      expect(page.html).toContain(statement);
      // No anchors, ever (design §5) — strip tags before comparing the
      // sentence anyway, since the sentence itself carries no markup.
      expect(page.html.replace(/<[^>]+>/g, "")).toContain(action);
    },
  );

  it("linked (200) names BOTH identities (D2) in the approved sentence", () => {
    const page = renderCallbackPage("linked", {
      c2Username: "jmorelli",
      email: "james@example.test",
    });
    expect(page.status).toBe(200);
    expect(page.html).toContain("CONCEPT2 LINK · LINKED · HTTP 200");
    expect(page.html.replace(/<[^>]+>/g, "")).toContain(
      "Concept2 jmorelli is now connected to Ergomatic james@example.test.",
    );
    expect(page.html.replace(/<[^>]+>/g, "")).toContain("Return to the app.");
  });

  it("rejects linked without identities at compile time (@ts-expect-error) and throws at runtime rather than rendering empty (I3)", () => {
    // @ts-expect-error — the "linked" overload requires `identities`; only
    // the literal-kind overload may omit the second argument. This is the
    // biting mutation for I3: reverting to the old single signature with
    // `identities?: …` makes this call compile again, which makes the
    // `@ts-expect-error` directive itself unused — `pnpm typecheck` reddens
    // on "Unused '@ts-expect-error' directive" rather than this assertion.
    expect(() => renderCallbackPage("linked")).toThrow();
  });

  it("escapes both identities: a <script> username never reaches the page raw", () => {
    const page = renderCallbackPage("linked", {
      c2Username: "<script>alert(1)</script>",
      email: 'a"b&c@example.test',
    });
    expect(page.html).not.toContain("<script>alert(1)</script>");
    expect(page.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(page.html).toContain("a&quot;b&amp;c@example.test");
  });

  // Design §5: callback HTML carries NO subresource and NO outbound link,
  // ever — the first external stylesheet or anchor would leak `code`/`state`
  // in Referer. There are no anchors on any page, including "here": it is
  // plain text, not a link.
  it.each([
    "alreadyLinked",
    "expired",
    "incomplete",
    "notSignedIn",
    "wrongAccount",
    "unavailable",
    "failed",
  ] as const)("%s carries no subresource and no outbound link", (kind) => {
    const { html } = renderCallbackPage(kind);
    expect(html).not.toMatch(
      /<(link|script|img|iframe|object|embed|video|audio|source)\b/i,
    );
    expect(html).not.toMatch(/<a\b/i);
    expect(html).not.toMatch(/\bsrc=/i);
    expect(html).not.toMatch(/@import|url\(/i);
    for (const m of html.matchAll(/href="([^"]*)"/g)) {
      expect(m[1]).toMatch(/^\/(?!\/)/);
    }
  });

  it("linked carries no subresource and no outbound link", () => {
    const { html } = renderCallbackPage("linked", {
      c2Username: "u",
      email: "e@x.test",
    });
    expect(html).not.toMatch(
      /<(link|script|img|iframe|object|embed|video|audio|source)\b/i,
    );
    expect(html).not.toMatch(/<a\b/i);
    expect(html).not.toMatch(/\bsrc=/i);
    expect(html).not.toMatch(/@import|url\(/i);
    for (const m of html.matchAll(/href="([^"]*)"/g)) {
      expect(m[1]).toMatch(/^\/(?!\/)/);
    }
  });

  it("uses the approved palette and system fonts inline (no font or CSS fetch)", () => {
    const { html } = renderCallbackPage("expired");
    expect(html).toContain("#f6f3ec");
    expect(html).toContain("#1c1a17");
    expect(html).toContain("#5f5a50");
    expect(html).toContain("#d9d3c6");
    expect(html).toContain("#b5341f");
    expect(html).toContain("#fffdf8");
    expect(html).toContain("-apple-system");
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters and nothing else", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;",
    );
    expect(escapeHtml("plain.name@example.test")).toBe(
      "plain.name@example.test",
    );
  });
});
