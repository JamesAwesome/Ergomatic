import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { git, nulPaths } from "./selection-git.mjs";

const prosePath = (file) =>
  /^(?:[^/]+\.md|(?:docs|\.claude|\.agents)\/.+\.md)$/.test(file);
const proseBlob = (text) => !text.startsWith("#!") && !text.includes("\0");

export function parseRawChanges(text) {
  if (!text) return [];
  if (!text.endsWith("\0")) throw new Error("Truncated raw diff");
  const fields = text.slice(0, -1).split("\0"),
    changes = [];
  while (fields.length) {
    const match = fields
      .shift()
      .match(/^:(\d{6}) (\d{6}) ([a-f0-9]+) ([a-f0-9]+) ([A-Z]\d*)$/);
    if (!match) throw new Error("Malformed raw diff header");
    const [, oldMode, newMode, , blob, status] = match;
    const count = /^[RC]/.test(status) ? 2 : 1;
    const paths = fields.splice(0, count);
    if (paths.length !== count) throw new Error("Missing raw diff path");
    nulPaths(paths.join("\0") + "\0");
    changes.push({ oldMode, newMode, blob, status, paths });
  }
  return changes;
}

/** False is the safe default: uncertainty never exempts app diagnostics. */
export function classifyStagedDocs(root) {
  try {
    const args = ["--raw", "-z", "--no-abbrev", "--find-renames"];
    const staged = parseRawChanges(git(root, ["diff", "--cached", ...args]));
    const unstaged = parseRawChanges(git(root, ["diff", ...args]));
    if (!staged.length)
      return { docsOnly: false, reason: "empty staging", stagedPaths: [] };
    const stagedPaths = staged.flatMap((change) => change.paths);
    const safe = (change) =>
      ["A", "M"].includes(change.status) &&
      ["000000", "100644"].includes(change.oldMode) &&
      change.newMode === "100644" &&
      change.paths.every(prosePath);
    if (!staged.every(safe) || !unstaged.every(safe))
      return {
        docsOnly: false,
        reason: "code, mode, rename, deletion or uncertain input",
        stagedPaths,
      };
    for (const change of staged)
      if (!proseBlob(git(root, ["cat-file", "blob", change.blob])))
        return {
          docsOnly: false,
          reason: "non-prose staged blob",
          stagedPaths,
        };
    const extra = [
      ...unstaged.flatMap((change) => change.paths),
      ...nulPaths(
        git(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
      ),
    ];
    for (const file of extra) {
      const stat = fs.lstatSync(path.join(root, file));
      if (
        !prosePath(file) ||
        !stat.isFile() ||
        stat.mode & 0o111 ||
        !proseBlob(fs.readFileSync(path.join(root, file), "utf8"))
      )
        return {
          docsOnly: false,
          reason: "unstaged/untracked relevant input",
          stagedPaths,
        };
    }
    return {
      docsOnly: true,
      reason: "verified plain staged documentation",
      stagedPaths,
    };
  } catch (error) {
    return {
      docsOnly: false,
      reason: `classifier uncertainty: ${error.message}`,
      stagedPaths: [],
    };
  }
}

export function stagedInstructionChecks(root) {
  const result = spawnSync(
    "git",
    [
      "grep",
      "--cached",
      "-nE",
      "^(<<<<<<<|>>>>>>>|\\|\\|\\|\\|\\|\\|\\|)([[:space:]]|$)|^=======[[:space:]]*$",
    ],
    { cwd: root, encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 },
  );
  if (result.error || ![0, 1].includes(result.status))
    throw new Error("Staged conflict-marker inspection failed");
  if (result.status === 0)
    throw new Error(`Staged conflict markers:\n${result.stdout}`);
  const paths = nulPaths(git(root, ["ls-files", "-z"]));
  const names = (prefix) =>
    [
      ...new Set(
        paths.flatMap((file) => {
          if (!file.startsWith(`${prefix}/skills/`)) return [];
          return [file.slice(`${prefix}/skills/`.length).split("/")[0]];
        }),
      ),
    ].sort();
  const claude = names(".claude"),
    agents = names(".agents");
  if (!claude.length || JSON.stringify(claude) !== JSON.stringify(agents))
    throw new Error(
      `Staged skill parity mismatch: .claude=${claude.join(",")} .agents=${agents.join(",")}`,
    );
}
