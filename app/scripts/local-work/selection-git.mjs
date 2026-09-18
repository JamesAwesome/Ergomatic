import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { unionIdentities } from "./selection.mjs";

export function git(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Git ${args[0]} failed: ${result.error?.message ?? result.stderr.trim()}`,
    );
  return result.stdout;
}

export function nulPaths(text) {
  if (text === "") return [];
  if (!text.endsWith("\0")) throw new Error("Truncated NUL-delimited paths");
  const paths = text.slice(0, -1).split("\0");
  if (
    paths.some((p) => !p || path.isAbsolute(p) || p.split("/").includes(".."))
  )
    throw new Error("Malformed repository-relative path");
  return paths;
}

export function resolveBase(root, base) {
  if (!base || base.startsWith("-") || /[\0\r\n]/.test(base))
    throw new Error("Invalid related base");
  const sha = git(root, ["rev-parse", "--verify", `${base}^{commit}`]).trim();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha))
    throw new Error("Invalid base object");
  // Native related discovery needs history; a shallow boundary is not evidence
  // that the base-to-HEAD dependency set is complete.
  if (git(root, ["rev-parse", "--is-shallow-repository"]).trim() !== "false")
    throw new Error("Related selection requires complete Git history");
  return sha;
}

export function changedSourcePaths(root, base) {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(base))
    throw new Error("Related discovery requires a pinned base object");
  // Disable rename folding so both the old and new dependency endpoints are
  // present. NUL framing preserves Git filenames rather than its quoted display.
  const diff = ["diff", "--no-renames", "--name-only", "-z"];
  return [
    ...new Set([
      ...nulPaths(git(root, [...diff, `${base}...HEAD`, "--"])),
      ...nulPaths(git(root, [...diff, "--cached", "--"])),
      ...nulPaths(git(root, [...diff, "--"])),
      ...nulPaths(
        git(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
      ),
    ]),
  ].sort();
}

export function requireRelatedInputs(paths) {
  const global = paths.filter((file) =>
    /^(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|pnpm-(?:lock|workspace)\.yaml|yarn\.lock|bun\.lockb?|\.npmrc|(?:vite|vitest)\.config\.[^/]+|tsconfig(?:\.[^/]+)?\.json)$/.test(
      path.basename(file),
    ),
  );
  if (global.length)
    throw new Error(
      `Global test input changed: ${global.map((file) => JSON.stringify(file)).join(", ")}; related dependency selection is uncertain; request explicit full verification`,
    );
}

export function snapshotSource(root, additionalFiles = []) {
  const head = git(root, ["rev-parse", "--verify", "HEAD"]).trim();
  const index = git(root, ["ls-files", "--stage", "-z"]);
  const files = [
    ...new Set([
      ...nulPaths(
        git(root, [
          "ls-files",
          "--cached",
          "--others",
          "--exclude-standard",
          "-z",
        ]),
      ),
      ...additionalFiles,
    ]),
  ].sort();
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const frame = (value) => {
    const bytes = Buffer.from(value);
    hash.update(`${bytes.length}:`);
    hash.update(bytes);
  };
  const frameFile = (name, size) => {
    hash.update(`${size}:`);
    const fd = fs.openSync(name, "r");
    let total = 0;
    try {
      for (let count; (count = fs.readSync(fd, buffer)) > 0;) {
        hash.update(buffer.subarray(0, count));
        total += count;
      }
      if (total !== size)
        throw new Error("Source file changed during fingerprinting");
    } finally {
      fs.closeSync(fd);
    }
  };
  frame(head);
  frame(index);
  for (const file of files) {
    frame(file);
    try {
      const name = path.join(root, file),
        stat = fs.lstatSync(name);
      frame(String(stat.mode));
      if (stat.isSymbolicLink()) frame(fs.readlinkSync(name));
      else if (stat.isFile()) frameFile(name, stat.size);
      else throw new Error(`Unsupported source entry: ${file}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      frame("deleted");
    }
  }
  return { head, fingerprint: hash.digest("hex") };
}

export function requireSameSource(before, after) {
  if (before.head !== after.head || before.fingerprint !== after.fingerprint)
    throw new Error(
      "Source/index/configuration changed; selection evidence is stale",
    );
}

export function readPushInput(root, text, head = "HEAD") {
  if (text === "") return { kind: "no-updates", objects: [] };
  if (!text.endsWith("\n") || text.includes("\0"))
    throw new Error("Malformed push input");
  const objects = [];
  const tree = git(root, ["rev-parse", "--verify", `${head}^{tree}`]).trim();
  for (const line of text.slice(0, -1).split("\n")) {
    const match = line.match(
      /^(\S+) ([a-f0-9]{40}|[a-f0-9]{64}) (refs\/\S+) ([a-f0-9]{40}|[a-f0-9]{64})$/,
    );
    if (!match) throw new Error("Malformed push ref/object record");
    const [, localRef, oid] = match;
    if (/^0+$/.test(oid)) {
      if (localRef !== "(delete)") throw new Error("Malformed deletion ref");
      continue;
    }
    if (localRef === "(delete)") throw new Error("Malformed live ref");
    git(root, ["rev-parse", "--verify", `${oid}^{commit}`]);
    if (git(root, ["rev-parse", "--verify", `${oid}^{tree}`]).trim() !== tree)
      throw new Error(
        "Pushed tree differs from checked HEAD; validate that checkout explicitly",
      );
    objects.push(oid);
  }
  return {
    kind: objects.length ? "head" : "deletion-only",
    objects: [...new Set(objects)].sort(),
  };
}

function testFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return testFiles(file);
    return entry.isFile() && /\.test\.tsx?$/.test(entry.name)
      ? [fs.realpathSync(file)]
      : [];
  });
}

export function mandatoryIdentities(app) {
  const scripts = testFiles(path.join(app, "scripts"));
  // Same producer predicate as the prior hook; independent census gates remain.
  const client = testFiles(path.join(app, "src")).filter((file) =>
    /"node:fs|from "fs"|test\/captures"/.test(fs.readFileSync(file, "utf8")),
  );
  if (!scripts.length || !client.length)
    throw new Error(
      "Empty mandatory population; use explicit full verification after diagnosis",
    );
  return unionIdentities(
    scripts.map((file) => ({ project: "unit", file })),
    client.map((file) => ({ project: "client", file })),
  );
}
