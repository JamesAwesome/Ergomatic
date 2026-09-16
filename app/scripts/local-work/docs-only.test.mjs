import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  classifyStagedDocs,
  stagedInstructionChecks,
  parseRawChanges,
} from "./docs-only.mjs";

function fixture(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ergo-docs-only-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => {
    const out = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(out.status, 0, out.stderr);
    return out.stdout.trim();
  };
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  write("README.md", "baseline");
  write("app/code.ts", "export {};");
  write(".claude/skills/example/SKILL.md", "instruction");
  write(".agents/skills/example/SKILL.md", "pointer");
  git("add", ".");
  git("commit", "-m", "baseline");
  return { root, git, write };
}

test("plain staged root/docs/agent prose is exempt; empty staging is not", (t) => {
  const f = fixture(t);
  assert.equal(classifyStagedDocs(f.root).docsOnly, false);
  for (const file of [
    "README.md",
    "docs/space ü.md",
    ".claude/notes.md",
    ".agents/notes.md",
  ]) {
    f.write(file, "changed prose");
    f.git("add", file);
  }
  assert.equal(classifyStagedDocs(f.root).docsOnly, true);
  stagedInstructionChecks(f.root);
});

for (const name of [
  "app/code.ts",
  "package.json",
  "pnpm-lock.yaml",
  ".husky/pre-push",
  "app/ios/Test.swift",
  "docs/run.sh",
])
  test(`staged relevant input ${name} keeps full checks`, (t) => {
    const f = fixture(t);
    f.write(name, "change");
    f.git("add", name);
    assert.equal(classifyStagedDocs(f.root).docsOnly, false);
  });

test("unstaged and untracked relevant input prevents a docs exemption", (t) => {
  const f = fixture(t);
  f.write("README.md", "changed");
  f.git("add", "README.md");
  f.write("app/code.ts", "broken");
  assert.equal(classifyStagedDocs(f.root).docsOnly, false);
  f.write("app/code.ts", "export {};");
  f.write("app/new.ts", "new source");
  assert.equal(classifyStagedDocs(f.root).docsOnly, false);
});

test("executable, shebang, symlink, rename and deletion markdown stay on full path", (t) => {
  const f = fixture(t);
  f.write("docs/executable.md", "plain");
  fs.chmodSync(path.join(f.root, "docs/executable.md"), 0o755);
  f.git("add", "docs/executable.md");
  assert.equal(classifyStagedDocs(f.root).docsOnly, false);
  f.git("reset", "--", "docs/executable.md");
  fs.unlinkSync(path.join(f.root, "docs/executable.md"));
  f.write("docs/shebang.md", "#!/bin/sh\necho execute");
  f.git("add", "docs/shebang.md");
  assert.equal(classifyStagedDocs(f.root).docsOnly, false);
  f.git("reset", "--", "docs/shebang.md");
  fs.unlinkSync(path.join(f.root, "docs/shebang.md"));
  fs.symlinkSync("../README.md", path.join(f.root, "docs/link.md"));
  f.git("add", "docs/link.md");
  assert.equal(classifyStagedDocs(f.root).docsOnly, false);
  f.git("reset", "--", "docs/link.md");
  fs.unlinkSync(path.join(f.root, "docs/link.md"));
  f.git("mv", "README.md", "RENAMED.md");
  assert.equal(classifyStagedDocs(f.root).docsOnly, false);
  f.git("mv", "RENAMED.md", "README.md");
  f.git("rm", "README.md");
  assert.equal(classifyStagedDocs(f.root).docsOnly, false);
});

test("lightweight checks inspect staged blobs, not a repaired unstaged copy", (t) => {
  const f = fixture(t);
  f.write("README.md", "<<<<<<< branch\nconflict");
  f.git("add", "README.md");
  f.write("README.md", "repaired only in worktree");
  assert.equal(classifyStagedDocs(f.root).docsOnly, true);
  assert.throws(() => stagedInstructionChecks(f.root), /conflict/);
});

test("staged skill names include symlink entries and refuse missing parity", (t) => {
  const f = fixture(t);
  f.write(".agents/skills/new/SKILL.md", "new");
  f.git("add", ".agents");
  assert.throws(() => stagedInstructionChecks(f.root), /parity/);
  fs.symlinkSync(
    "../../.agents/skills/new",
    path.join(f.root, ".claude/skills/new"),
  );
  f.git("add", ".claude");
  stagedInstructionChecks(f.root);
});

test("malformed raw paths refuse and an unmerged documentation index retains full checks", (t) => {
  for (const value of [
    ":100644 100644 a b M\0README.md",
    ":100644 100644 a b M\0\0",
    ":100644 100644 a b R100\0README.md\0",
    "garbage\0README.md\0",
    ":100644 100644 a b M\0../README.md\0",
  ])
    assert.throws(() => parseRawChanges(value));
  const f = fixture(t);
  f.git("checkout", "-b", "other");
  f.write("README.md", "other change");
  f.git("add", ".");
  f.git("commit", "-m", "other");
  f.git("checkout", "main");
  f.write("README.md", "main change");
  f.git("add", ".");
  f.git("commit", "-m", "main");
  assert.equal(spawnSync("git", ["merge", "other"], { cwd: f.root }).status, 1);
  assert.equal(classifyStagedDocs(f.root).docsOnly, false);
});
