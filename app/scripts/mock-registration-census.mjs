#!/usr/bin/env node
// Gate: no test helper may register TWO `vi.doMock`s for the SAME module
// path within one test's setup.
//
// Why this is a gate and not a style note. `queueMock`
// (@vitest/mocker/dist/chunk-mocker.js) registers each mock inside the
// `.then` of an async `rpc.resolveMock` call. Two registrations for one path
// are two in-flight promises with no ordering between them, so the one that
// lands in the registry LAST is the one whose RPC resolved last — not the
// one called last. `wrapDynamicImport` awaits the whole queue before the
// import, so the winner is settled but arbitrary.
//
// It bit on 2026-09-07: `mockHooksWithPreferencesError` layered an errored
// `usePreferences` over `mockHooks`'s ready one, the ready arm won under
// load, and the test that asserts NO skip write recorded one — reddening
// main after PR #344 at roughly one full `pnpm test:coverage` run in two.
//
// The shape this catches is a helper calling another helper where both mock
// the same path. Two `doMock`s of one path in DIFFERENT tests are fine:
// `vi.resetModules()` and a fresh registry stand between them.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = process.argv.slice(2).length ? process.argv.slice(2) : ["src"];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** Function bodies by name, matched with a brace counter rather than a
 *  regex — a mock helper's body is full of nested object literals. */
function functionBodies(source) {
  const bodies = new Map();
  for (const m of source.matchAll(/function\s+(\w+)\s*\([^)]*\)/g)) {
    const open = source.indexOf("{", m.index + m[0].length - 1);
    if (open < 0) continue;
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}" && --depth === 0) {
        if (!bodies.has(m[1])) bodies.set(m[1], source.slice(open, i));
        break;
      }
    }
  }
  return bodies;
}

const mockedPaths = (body) =>
  new Set([...body.matchAll(/vi\.doMock\(\s*"([^"]+)"/g)].map((m) => m[1]));

function findDoubleRegistrations(source, file = "<source>") {
  const bodies = functionBodies(source);
  const found = [];
  for (const [name, body] of bodies) {
    const own = mockedPaths(body);
    if (own.size === 0) continue;
    for (const callee of new Set(
      [...body.matchAll(/\b(\w+)\s*\(/g)].map((m) => m[1]),
    )) {
      if (callee === name || !bodies.has(callee)) continue;
      for (const path of mockedPaths(bodies.get(callee))) {
        if (own.has(path)) found.push({ file, helper: name, callee, path });
      }
    }
  }
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = ROOTS.flatMap((r) => walk(r));
  const found = files.flatMap((f) =>
    findDoubleRegistrations(readFileSync(f, "utf8"), f),
  );
  for (const f of found) {
    console.error(
      `${f.file}: ${f.helper}() calls ${f.callee}() and both vi.doMock("${f.path}") — ` +
        `the two registrations race; pass the arm as a parameter instead`,
    );
  }
  console.log(
    `mock-registration-census: ${found.length === 0 ? "OK" : `${found.length} double registration(s)`} (${files.length} files)`,
  );
  process.exit(found.length === 0 ? 0 : 1);
}
