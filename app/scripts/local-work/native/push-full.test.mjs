import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const wrapper = fileURLToPath(new URL("../../push-full.mjs", import.meta.url));
const reader = new URL("../push-input.mjs", import.meta.url).href;
const repo = fileURLToPath(new URL("../../../../", import.meta.url));

test("real Git/Husky consumes full consent once; following normal push stays related", (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ergo-full-hook-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const work = path.join(root, "work"),
    remote = path.join(root, "remote.git"),
    witness = path.join(root, "witness");
  fs.mkdirSync(work);
  const env = { ...process.env };
  delete env.HUSKY;
  delete env.ERGOMATIC_FULL_PUSH_FD;
  const git = (...args) => {
    const out = spawnSync("git", args, {
      cwd: work,
      env,
      encoding: "utf8",
      timeout: 5000,
    });
    assert.equal(out.status, 0, out.stderr);
    return out.stdout.trim();
  };
  git("init", "--bare", remote);
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("commit", "--allow-empty", "-m", "fixture");
  git("remote", "add", "origin", remote);
  fs.mkdirSync(path.join(work, ".husky/_"), { recursive: true });
  for (const file of ["h", "pre-push"])
    fs.copyFileSync(
      path.join(repo, ".husky/_", file),
      path.join(work, ".husky/_", file),
    );
  fs.chmodSync(path.join(work, ".husky/_/pre-push"), 0o755);
  fs.writeFileSync(
    path.join(work, ".husky/pre-push"),
    `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(work, "hook.mjs"))}\n`,
  );
  fs.writeFileSync(
    path.join(work, "hook.mjs"),
    `import fs from 'node:fs'; import {readPushRequest} from ${JSON.stringify(reader)};
try {const request=await readPushRequest(process.cwd()); if(!request.input.startsWith('refs/heads/main ')) throw new Error('missing real refs'); fs.appendFileSync(${JSON.stringify(witness)},JSON.stringify(request)+'\\n');} catch(error){ console.error(error.message);process.exitCode=64;}`,
  );
  git("config", "core.hooksPath", ".husky/_");
  const full = (extra) =>
    spawnSync(
      process.execPath,
      [wrapper, ...extra, "--dry-run", "origin", "main"],
      {
        cwd: work,
        env,
        encoding: "utf8",
        timeout: 5000,
      },
    );
  assert.equal(full([]).status, 0);
  git("push", "--dry-run", "origin", "main");
  assert.deepEqual(
    fs
      .readFileSync(witness, "utf8")
      .trim()
      .split("\n")
      .map((row) => JSON.parse(row).full),
    [true, false],
  );
  const reused = spawnSync("git", ["push", "--dry-run", "origin", "main"], {
    cwd: work,
    env: { ...env, ERGOMATIC_FULL_PUSH_FD: "3" },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.notEqual(reused.status, 0);
  for (const bypass of ["--no-verify", "--no-ver"])
    assert.notEqual(full([bypass]).status, 0, bypass);
});
