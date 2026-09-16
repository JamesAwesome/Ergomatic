import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  resolveBase,
  snapshotSource,
  requireSameSource,
  readPushInput,
  mandatoryIdentities,
  changedSourcePaths,
  requireRelatedInputs,
} from "./selection-git.mjs";

function fixture(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ergo-selection-git-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  fs.writeFileSync(path.join(root, "source.txt"), "one");
  git("add", ".");
  git("commit", "-m", "one");
  return {
    root,
    git,
    write: (name, value) => {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), value);
    },
  };
}

test("base resolves once and rejects missing history and option injection", (t) => {
  const { root, git } = fixture(t);
  assert.equal(resolveBase(root, "HEAD"), git("rev-parse", "HEAD"));
  for (const base of ["", "no-such-ref", "--all", "HEAD\n", "HEAD\0"])
    assert.throws(() => resolveBase(root, base));
});

test("changed paths preserve NUL names and both rename endpoints across every Git producer", (t) => {
  const f = fixture(t);
  for (const name of [
    "committed ü.txt",
    "staged\nold.txt",
    "unstaged.txt",
    "deleted.txt",
    "package.json",
  ])
    f.write(name, name);
  f.git("add", ".");
  f.git("commit", "-m", "baseline");
  const base = f.git("rev-parse", "HEAD");
  f.git("mv", "committed ü.txt", "committed new.txt");
  f.git("mv", "package.json", "moved-manifest.txt");
  f.git("commit", "-m", "committed rename");
  f.git("mv", "staged\nold.txt", "staged new.txt");
  f.write("unstaged.txt", "changed");
  fs.unlinkSync(path.join(f.root, "deleted.txt"));
  f.write("untracked ü\nfile.txt", "new");
  const changed = changedSourcePaths(f.root, base);
  assert.deepEqual(changed, [
    "committed new.txt",
    "committed ü.txt",
    "deleted.txt",
    "moved-manifest.txt",
    "package.json",
    "staged\nold.txt",
    "staged new.txt",
    "unstaged.txt",
    "untracked ü\nfile.txt",
  ]);
  assert.throws(() => requireRelatedInputs(changed), /package.json/);
  requireRelatedInputs(["app/domain/a.ts", "docs/README.md"]);
  for (const invalid of ["HEAD", "", "--all", `${base}\n`])
    assert.throws(() => changedSourcePaths(f.root, invalid), /pinned base/);
});

test("source identity changes on staged, unstaged, renamed, deleted and untracked inputs", (t) => {
  const { root, git, write } = fixture(t);
  const before = snapshotSource(root);
  requireSameSource(before, snapshotSource(root));
  write("source.txt", "two");
  assert.throws(() => requireSameSource(before, snapshotSource(root)));
  const unstaged = snapshotSource(root);
  git("add", ".");
  assert.throws(() => requireSameSource(unstaged, snapshotSource(root)));
  git("commit", "-m", "two");
  const clean = snapshotSource(root);
  write("space ü.css", "body{}");
  assert.throws(() => requireSameSource(clean, snapshotSource(root)));
  const added = snapshotSource(root);
  fs.renameSync(path.join(root, "source.txt"), path.join(root, "renamed.txt"));
  assert.throws(() => requireSameSource(added, snapshotSource(root)));
  const renamed = snapshotSource(root);
  fs.unlinkSync(path.join(root, "renamed.txt"));
  assert.throws(() => requireSameSource(renamed, snapshotSource(root)));
});

test("actual push input validates commit trees, annotated tags and deletion-only pushes", (t) => {
  const { root, git, write } = fixture(t);
  const first = git("rev-parse", "HEAD");
  const zero = "0".repeat(40);
  const ref = (sha) => `refs/heads/main ${sha} refs/heads/main ${zero}\n`;
  assert.deepEqual(readPushInput(root, ref(first)), {
    kind: "head",
    objects: [first],
  });
  git("tag", "-a", "v1", "-m", "tag");
  const tag = git("rev-parse", "v1");
  assert.deepEqual(
    readPushInput(root, `refs/tags/v1 ${tag} refs/tags/v1 ${zero}\n`),
    { kind: "head", objects: [tag] },
  );
  assert.equal(
    readPushInput(root, `(delete) ${zero} refs/heads/old ${first}\n`).kind,
    "deletion-only",
  );
  assert.equal(readPushInput(root, "").kind, "no-updates");
  write("source.txt", "new tree");
  git("add", ".");
  git("commit", "-m", "new");
  assert.throws(() => readPushInput(root, ref(first)), /tree/);
  for (const input of [
    "broken",
    ref(first).trimEnd(),
    ref("not-sha"),
    `${ref(first)}junk\n`,
  ])
    assert.throws(() => readPushInput(root, input));
});

test("configuration, lockfiles and native inputs independently invalidate source evidence", (t) => {
  const { root, git, write } = fixture(t);
  const names = [
    "app/vitest.config.ts",
    "app/pnpm-lock.yaml",
    "app/ios/Bridge.swift",
    "app/src/index.css",
    "app/test/captures/workout.json",
  ];
  for (const name of names) write(name, "baseline");
  git("add", ".");
  git("commit", "-m", "inputs");
  const before = snapshotSource(root);
  for (const name of names) {
    write(name, "changed");
    assert.throws(
      () => requireSameSource(before, snapshotSource(root)),
      /stale/,
      name,
    );
    write(name, "baseline");
    requireSameSource(before, snapshotSource(root));
  }
});

test("mandatory populations come from actual script and file-reading client producers", (t) => {
  const { root, write } = fixture(t);
  write("app/scripts/a.test.ts", "it('a',()=>{});");
  write("app/src/space ü.test.tsx", 'import fs from "node:fs";');
  write(
    "app/src/capture.test.ts",
    'import { capture } from "../test/captures";',
  );
  write("app/src/ordinary.test.ts", "it('a',()=>{});");
  assert.deepEqual(mandatoryIdentities(path.join(root, "app")), [
    { project: "client", file: path.join(root, "app/src/capture.test.ts") },
    { project: "client", file: path.join(root, "app/src/space ü.test.tsx") },
    { project: "unit", file: path.join(root, "app/scripts/a.test.ts") },
  ]);
  fs.unlinkSync(path.join(root, "app/scripts/a.test.ts"));
  assert.throws(() => mandatoryIdentities(path.join(root, "app")), /mandatory/);
  write("app/scripts/a.test.ts", "it('a',()=>{});");
  write("app/src/space ü.test.tsx", "// no filesystem input");
  write("app/src/capture.test.ts", "// no capture input");
  assert.throws(() => mandatoryIdentities(path.join(root, "app")), /mandatory/);
});
