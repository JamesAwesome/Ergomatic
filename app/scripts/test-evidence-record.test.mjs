import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureLogs, command, provenance } from "./test-evidence-record.mjs";

test("provenance represents unavailable source and installed versions without invented identities", (t) => {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "evidence-provenance-")));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const result = provenance({ cwd, env: { PATH: "/usr/bin:/bin" } });
  assert.equal(result.sourceIdentity.status, "unavailable");
  assert.equal(result.sha.value, undefined);
  assert.ok(result.sha.unavailable);
  assert.ok(result.trackedDiff.unavailable);
  assert.equal(result.versions.node, process.version);
  assert.equal(result.versions.vitest, null);
  assert.ok(result.unavailableVersions.vitest);
  assert.equal(result.versions.pnpm, null);
  assert.ok(result.unavailableVersions.pnpm);
});

test("provenance commands bound a stuck child and oversized output", () => {
  // The production timeout is 2 seconds. A mutant removing it must reach
  // an assertion failure after this natural exit, not leave a live child.
  const stuck = command(process.execPath, [
    "-e",
    "setTimeout(()=>process.exit(0),3000)",
  ]);
  assert.equal(stuck.value, undefined);
  assert.match(stuck.unavailable, /ETIMEDOUT/);
  const huge = command(process.execPath, [
    "-e",
    "process.stdout.write('x'.repeat(2*1024*1024))",
  ]);
  assert.equal(huge.value, undefined);
  assert.match(huge.unavailable, /ENOBUFS/);
});

test("short successful writes retain every stdout and stderr byte", async (t) => {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), "evidence-short-write-")),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const open = fs.openSync,
    write = fs.writeSync;
  const logFds = new Set(),
    writes = new Map();
  t.mock.method(fs, "openSync", (path, ...args) => {
    const fd = open(path, ...args);
    if (
      path === join(directory, "stdout.log") ||
      path === join(directory, "stderr.log")
    )
      logFds.add(fd);
    return fd;
  });
  t.mock.method(fs, "writeSync", (fd, buffer, offset, length, ...args) => {
    if (!logFds.has(fd)) return write(fd, buffer, offset, length, ...args);
    writes.set(fd, (writes.get(fd) ?? 0) + 1);
    return write(fd, buffer, offset, Math.min(length, 3), ...args);
  });
  syncBuiltinESMExports();
  const errors = [];
  let logs;
  try {
    logs = captureLogs(directory, errors);
    const stdout = "complete stdout € with a multibyte boundary\n";
    const stderr = "complete stderr 🛶 with a multibyte boundary\n";
    const child = spawn(
      process.execPath,
      [
        "-e",
        `process.stdout.write(${JSON.stringify(stdout)});process.stderr.write(${JSON.stringify(stderr)});`,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const drain = logs.attach(child);
    const status = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    await drain();
    assert.deepEqual(status, { code: 0, signal: null });
    assert.deepEqual(errors, []);
    assert.deepEqual(
      fs.readFileSync(join(directory, "stdout.log")),
      Buffer.from(stdout),
    );
    assert.deepEqual(
      fs.readFileSync(join(directory, "stderr.log")),
      Buffer.from(stderr),
    );
    assert.equal(writes.size, 2);
    assert.ok([...writes.values()].every((count) => count > 1));
  } finally {
    logs?.close();
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});
