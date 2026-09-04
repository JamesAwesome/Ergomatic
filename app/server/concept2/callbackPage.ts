// Wave E PR1.75a (2026-09-02-concept2-pr175-app-bind-design.md §7, Gate 0
// APPROVED 2026-09-02): ONE server template for every Concept2 callback
// page — inline CSS, system fonts, ZERO network. Mechanical layout: a mono
// status label (`CONCEPT2 LINK · <LABEL> · HTTP <n>`), one bold statement,
// one action line. Palette is the app's: ground #f6f3ec, ink #1c1a17
// (15.67:1 on ground, computed), label #5f5a50 (6.18:1), rule #d9d3c6,
// accent #b5341f (a rule only, never text), panel #fffdf8.
//
// STANDING CONSTRAINT (design §5): this HTML carries NO subresource and NO
// outbound link — the callback URL carries `code` and `state`, and the
// first external stylesheet, font, image or anchor would leak them in
// `Referer` (RFC 9700 §4.2). Every callback response ALSO sets
// `Referrer-Policy: no-referrer` (routes/concept2.ts). No page names a
// destination either, for the same reason: the 401 and 403 lines said
// "sign in … here" until the 2026-09-03 amendment (§3, ruling iii), where
// "here" was plain text pointing at nothing. Request- or DB-derived values
// reach this template ONLY through `escapeHtml` — today the Linked page's
// two identities; every other page is literal copy.
//
// The copy is the design's table VERBATIM. Changing a word here is a
// design-gate question (CLAUDE.md: a spec that changes what a rower reads
// carries a Gate 0), not a code edit.

export type CallbackPageKind =
  | "linked"
  | "alreadyLinked"
  | "expired"
  | "incomplete"
  | "notSignedIn"
  | "wrongAccount"
  | "unavailable"
  | "failed";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

interface PageSpec {
  status: number;
  label: string;
  // Already-escaped HTML for the statement and action (literals, or the
  // Linked page's escaped identities).
  statement: string;
  action: string;
}

const LITERAL_PAGES: Record<Exclude<CallbackPageKind, "linked">, PageSpec> = {
  alreadyLinked: {
    status: 409,
    label: "ALREADY LINKED",
    statement:
      "That Concept2 account is already connected to a different Ergomatic account.",
    action: "Return to the app.",
  },
  expired: {
    status: 400,
    label: "EXPIRED",
    statement: "This link has expired or was already used.",
    action: "Return to the app and start again.",
  },
  incomplete: {
    status: 400,
    label: "INCOMPLETE",
    statement: "This link is missing required parameters.",
    action: "Return to the app and start again.",
  },
  notSignedIn: {
    status: 401,
    label: "NOT SIGNED IN",
    statement: "No Ergomatic session in this browser.",
    // Gate 0 amendment §3 (ruling iii, 2026-09-03): was "Sign in to
    // Ergomatic here, …". This template emits no anchors by design (the
    // STANDING CONSTRAINT above), so "here" named a destination the page
    // could not take the rower to. No link is added; the false affordance
    // is removed.
    action:
      "Open Ergomatic in this browser and sign in, then start the link again from the app.",
  },
  wrongAccount: {
    status: 403,
    label: "WRONG ACCOUNT",
    statement: "This link was started by a different Ergomatic account.",
    // Same amendment: was "Sign in as that account here, …".
    // `you&#39;re` is the HTML ENTITY, not a literal apostrophe: `action` is
    // documented above as already-escaped HTML and `shell()` interpolates it
    // RAW, so this field carries what `escapeHtml` would have produced. Both
    // forms render as `you're`, which is what the design page draws.
    action:
      "Sign in as that account in this browser, or start a new link from the account you&#39;re using.",
  },
  unavailable: {
    status: 403,
    label: "UNAVAILABLE",
    statement: "Concept2 linking is not available right now.",
    action: "Return to the app.",
  },
  failed: {
    status: 502,
    label: "FAILED",
    statement: "Concept2 could not complete the connection.",
    action: "Return to the app and try again.",
  },
};

const STYLE = [
  "html{background:#f6f3ec;color:#1c1a17}",
  'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:17px;line-height:1.45;-webkit-text-size-adjust:100%}',
  "main{max-width:34rem;margin:12vh auto 0;padding:0 20px}",
  "section{background:#fffdf8;border:1px solid #d9d3c6;border-top:3px solid #b5341f;border-radius:2px;padding:20px 22px 22px}",
  '.status{margin:0 0 14px;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:12px;letter-spacing:.06em;color:#5f5a50}',
  "h1{margin:0 0 14px;font-size:20px;line-height:1.3;font-weight:700}",
  ".action{margin:0;padding-top:14px;border-top:1px solid #d9d3c6;color:#5f5a50}",
  "@media (orientation:landscape) and (max-height:500px){main{margin-top:4vh}}",
].join("");

function shell(spec: PageSpec): string {
  return (
    "<!doctype html>" +
    '<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="referrer" content="no-referrer">' +
    `<title>Concept2 link · ${escapeHtml(spec.label.charAt(0) + spec.label.slice(1).toLowerCase())}</title>` +
    `<style>${STYLE}</style></head><body><main><section>` +
    `<p class="status">CONCEPT2 LINK · ${spec.label} · HTTP ${spec.status}</p>` +
    `<h1>${spec.statement}</h1>` +
    `<p class="action">${spec.action}</p>` +
    "</section></main></body></html>"
  );
}

// Overloaded rather than `identities?: …` on one signature (I3, final
// review): an optional third parameter let `renderCallbackPage("linked")`
// compile and render the D2 disclosure page with both identities blank —
// the one page whose entire purpose is showing them. Splitting the "linked"
// kind into its own signature that REQUIRES `identities` makes that gap
// unrepresentable instead of relying on a test of the `?? ""` fallback.
export function renderCallbackPage(kind: Exclude<CallbackPageKind, "linked">): {
  status: number;
  html: string;
};
export function renderCallbackPage(
  kind: "linked",
  identities: { c2Username: string; email: string },
): { status: number; html: string };
export function renderCallbackPage(
  kind: CallbackPageKind,
  identities?: { c2Username: string; email: string },
): { status: number; html: string } {
  if (kind === "linked") {
    const c2 = escapeHtml(identities!.c2Username);
    const email = escapeHtml(identities!.email);
    const spec: PageSpec = {
      status: 200,
      label: "LINKED",
      // D2 (APPROVED): both identities, escaped — the shared-browser
      // fixation residual's only mitigation (design §Research).
      statement: `Concept2 ${c2} is now connected to Ergomatic ${email}.`,
      action: "Return to the app.",
    };
    return { status: 200, html: shell(spec) };
  }
  const spec = LITERAL_PAGES[kind];
  return { status: spec.status, html: shell(spec) };
}
