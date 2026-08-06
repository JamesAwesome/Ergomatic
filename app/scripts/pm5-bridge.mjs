// The lab's remote bridge: a dev-only, dependency-free loopback server so a
// session can be driven from a second seat while the rower rows. The lab page
// (scripts/pm5-lab.ts) POSTs every log line here and polls for commands; a
// collaborator (or a script) enqueues commands with a plain curl. Nothing in
// the app imports this; it is not product code, not built, not shipped — the
// same ceiling scripts/pm5-lab.ts itself carries.
//
//   node scripts/pm5-bridge.mjs            # port 5178, log → ./pm5-session.log
//   PM5_BRIDGE_LOG=/tmp/x.log node scripts/pm5-bridge.mjs
//
// Enqueue a command (executed by the page within ~1s):
//   curl -s localhost:5178/command -d program
//   curl -s localhost:5178/command -d dump
//
// Commands the page understands are listed in scripts/pm5-lab.ts's REMOTE
// map. `connect` is deliberately NOT among them: `requestDevice` requires a
// real user gesture, so the human at the erg always clicks that one.
import { createServer } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";

const PORT = Number(process.env.PM5_BRIDGE_PORT ?? 5178);
const LOG = process.env.PM5_BRIDGE_LOG ?? "pm5-session.log";
// The lab page is served by `vite` on 5173 (scripts/pm5-lab.ts's own header
// comment). Binding to 127.0.0.1 keeps this off the network, but any page
// open in the SAME browser can still POST here with no preflight (`text/
// plain` is a CORS "simple request") while the bridge runs — and `program()`
// is documented as destructive. Reject any request that names a different
// Origin; requests with none (curl, the documented way to enqueue a command)
// are unaffected.
const ALLOWED_ORIGIN = process.env.PM5_BRIDGE_ORIGIN ?? "http://localhost:5173";

/** Commands wait here until the page's next poll drains them. */
const queue = [];

writeFileSync(LOG, `# pm5 bridge started ${new Date().toISOString()}\n`);

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body));
  });
}

const server = createServer(async (req, res) => {
  // Loopback-only dev tool; the page is served from a different port, so the
  // browser needs CORS to talk to it at all.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const origin = req.headers.origin;
  if (origin && origin !== ALLOWED_ORIGIN) {
    res.writeHead(403).end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "POST" && url.pathname === "/log") {
    const body = await readBody(req);
    appendFileSync(LOG, `${body}\n`);
    res.writeHead(204).end();
    return;
  }

  // The page drains the queue; each command is delivered exactly once.
  if (req.method === "GET" && url.pathname === "/commands") {
    const drained = queue.splice(0, queue.length);
    if (drained.length > 0) {
      appendFileSync(LOG, `>>> dispatched: ${drained.join(", ")}\n`);
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(drained));
    return;
  }

  if (req.method === "POST" && url.pathname === "/command") {
    const cmd = (await readBody(req)).trim();
    if (cmd) queue.push(cmd);
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`queued: ${cmd}\n`);
    return;
  }

  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`ok · log=${LOG} · queued=${queue.length}\n`);
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`pm5 bridge on http://127.0.0.1:${PORT} · appending to ${LOG}`);
});
