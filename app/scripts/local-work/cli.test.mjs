import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { acquireOwner, inspectOwner } from "./owner.mjs";
import { readHost } from "./host.mjs";
import { main } from "../local-work.mjs";

function fixture(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "local-cli-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  spawnSync("git", ["init", "-q", root]);
  const app = path.join(root, "app");
  fs.mkdirSync(app);
  return { root, app };
}
const normal = () => ({ ...readHost(), pressure: { state: "normal" } });
test("public status lists exclusions and shares one canonical common-directory owner", async (t) => {
  const { root, app } = fixture(t);
  const output = [];
  assert.equal(
    await main(["status"], {
      cwd: app,
      observe: normal,
      write: (s) => output.push(s),
    }),
    0,
  );
  const state = JSON.parse(output[0]);
  assert.equal(state.status, "free");
  assert.match(
    state.exclusions.join(" "),
    /integration.*browser.*native.*watch.*install/,
  );
  assert.equal(state.commonDir, path.join(root, ".git"));
});
test("linked-worktree status resolves the same occupied owner as its primary checkout", async (t) => {
  const { root, app } = fixture(t);
  const source = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
  );
  const git = (cwd, args) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  // Reuse a read-only object store in an isolated temporary repository. No
  // authored commit, project worktree registration, or hook bypass is needed.
  const common = path.resolve(
    source,
    git(source, ["rev-parse", "--git-common-dir"]),
  );
  fs.writeFileSync(
    path.join(root, ".git/objects/info/alternates"),
    path.join(common, "objects") + "\n",
  );
  const head = git(source, ["rev-parse", "HEAD"]);
  git(root, ["update-ref", "refs/heads/fixture", head]);
  const linked = path.join(root, "linked");
  git(root, ["worktree", "add", "--no-checkout", "--detach", linked, head]);
  const output = [];
  const options = { observe: normal, write: (s) => output.push(JSON.parse(s)) };
  assert.equal(await main(["status"], { ...options, cwd: app }), 0);
  const state = output.at(-1);
  const self = normal().processes.value.find((p) => p.pid === process.pid);
  const owner = acquireOwner(state.root, {
    id: randomUUID(),
    uid: process.getuid(),
    commonDir: state.commonDir,
    worktree: root,
    pid: process.pid,
    start: self.started,
    phase: "idle",
  });
  assert.equal(await main(["status"], { ...options, cwd: linked }), 0);
  const sibling = output.at(-1);
  assert.equal(sibling.status, "occupied");
  assert.equal(sibling.metadata.id, owner.id);
  assert.equal(sibling.root, state.root);
  assert.equal(sibling.commonDir, path.join(root, ".git"));
  assert.equal(sibling.worktree, linked);
  owner.release();
});
test("warning preflight prevents build artifacts and explicit excluded full runs", async (t) => {
  const { app } = fixture(t);
  const output = [];
  for (const command of ["build", "test-full"]) {
    const code = await main(["run", command], {
      cwd: app,
      observe: () => ({ ...normal(), pressure: { state: "warning" } }),
      write: (s) => output.push(s),
    });
    assert.equal(code, 75);
  }
  assert.match(output.join("\n"), /resource-refused/);
});
test("recovery removes only a proved stale idle generation and refuses active or matching live owners", async (t) => {
  const { root, app } = fixture(t);
  const output = [];
  await main(["status"], { cwd: app, write: (s) => output.push(s) });
  const coordination = JSON.parse(output[0]).root;
  const own = normal().processes.value.find((p) => p.pid === process.pid);
  const metadata = {
    id: randomUUID(),
    uid: process.getuid(),
    commonDir: path.join(root, ".git"),
    worktree: root,
    pid: process.pid,
    start: own.started,
    phase: "idle",
  };
  const handle = acquireOwner(coordination, metadata);
  assert.equal(
    await main(["recover", metadata.id], {
      cwd: app,
      observe: normal,
      write: () => {},
    }),
    75,
  );
  handle.update({ phase: "active" });
  const absent = () => ({
    pressure: { state: "normal" },
    processes: { value: [] },
  });
  assert.equal(
    await main(["recover", metadata.id], {
      cwd: app,
      observe: absent,
      write: () => {},
    }),
    75,
  );
  handle.update({ phase: "idle" });
  assert.equal(
    await main(["recover", metadata.id], {
      cwd: app,
      observe: absent,
      write: () => {},
    }),
    0,
  );
  assert.equal(inspectOwner(coordination).status, "free");
});
