import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Execute the real wrapper and sourced stack scripts. Only the external
// Docker/Playwright boundary is replaced: no containers or browsers can run.
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "ergo-screenshot-guard-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin"),
    log = join(root, "calls.jsonl");
  mkdirSync(bin);
  for (const command of ["docker", "pnpm"]) {
    writeFileSync(
      join(bin, command),
      `#!${process.execPath}
const fs = require('node:fs');
fs.appendFileSync(process.env.SCREENSHOT_CALLS, JSON.stringify({command:${JSON.stringify(command)}, args:process.argv.slice(2), stable:process.env.ERGOMATIC_STABLE_RUN_ID})+'\\n');
process.exit(${command === "docker" ? "process.argv[2] === 'info' ? 1 : 0" : "Number(process.env.SCREENSHOT_EXIT || 0)"});
`,
      { mode: 0o755 },
    );
  }
  return (args, exit = 0) => {
    rmSync(log, { force: true });
    const result = spawnSync(
      "bash",
      [fileURLToPath(new URL("./screenshots.sh", import.meta.url)), ...args],
      {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          SCREENSHOT_CALLS: log,
          SCREENSHOT_EXIT: String(exit),
          E2E_KEEP: "1",
        },
        encoding: "utf8",
        timeout: 5000,
      },
    );
    assert.ifError(result.error);
    return {
      ...result,
      calls: existsSync(log)
        ? readFileSync(log, "utf8").trim().split("\n").map(JSON.parse)
        : [],
    };
  };
}

test("bare screenshots refuse before stack discovery, reaping, boot or Playwright", (t) => {
  const result = fixture(t)([]);
  assert.equal(result.status, 64);
  assert.deepEqual(result.calls, []);
  assert.match(result.stderr, /-g/);
  assert.match(result.stderr, /--all/);
});

test("missing, empty and ambiguous screenshot selectors cannot launch external work", (t) => {
  const run = fixture(t);
  for (const args of [
    ["-g"],
    ["--grep"],
    ["-g", ""],
    ["--grep="],
    ["--grep", " \t\n"],
    ["--grep=  "],
    ["--"],
    ["--", "-g", "today"],
    ["--list"],
    ["screenshots.spec.ts"],
    ["--project=chromium"],
    ["--all", "--all"],
    ["--all", "-g", "today"],
    ["-g", "today", "--grep", ".*"],
    ["-g", "today", "--project=chromium"],
  ]) {
    const result = run(args);
    assert.equal(result.status, 64, JSON.stringify(args));
    assert.deepEqual(result.calls, [], JSON.stringify(args));
  }
});

test("screenshot help is safe without Docker or Playwright", (t) => {
  const run = fixture(t);
  for (const option of ["--help", "-h"]) {
    const result = run([option]);
    assert.equal(result.status, 0);
    assert.deepEqual(result.calls, []);
    assert.match(result.stdout, /text-only/);
  }
});

test("scoped capture preserves the selector as one argument and retains the screenshot project", (t) => {
  const run = fixture(t);
  const selector = "today-freestyle|saved ü view";
  for (const args of [
    ["-g", selector],
    ["--grep", selector],
    [`--grep=${selector}`],
  ]) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      result.calls.filter((call) => call.command === "pnpm"),
      [
        {
          command: "pnpm",
          args: [
            "exec",
            "playwright",
            "test",
            "--project=screenshots",
            ...args,
          ],
          stable: "1",
        },
      ],
    );
    assert.ok(
      result.calls.some(
        (call) => call.command === "docker" && call.args.includes("up"),
      ),
    );
  }
});

test("explicit full refresh consumes --all and preserves the runner's failure", (t) => {
  const result = fixture(t)(["--all"], 23);
  assert.equal(result.status, 23);
  assert.deepEqual(
    result.calls.filter((call) => call.command === "pnpm"),
    [
      {
        command: "pnpm",
        args: ["exec", "playwright", "test", "--project=screenshots"],
        stable: "1",
      },
    ],
  );
});
