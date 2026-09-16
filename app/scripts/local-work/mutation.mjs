import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { snapshotSource } from "./selection-git.mjs";

// Stryker crawls the filesystem, not Git's non-ignored population. Hash a
// conservative superset of everything it can copy, including ignored inputs.
// Only its unconditional .git/node_modules exclusions are omitted here;
// retain build/output files rather than inventing a second input allowlist.
export function snapshotMutationSource(app) {
  const root = path.dirname(app);
  const walk = (directory) =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if ([".git", "node_modules"].includes(entry.name.toLowerCase()))
        return [];
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory()))
        throw new Error(
          `Unsupported mutation input alias or special file: ${file}`,
        );
      return entry.isDirectory() ? walk(file) : [path.relative(root, file)];
    });
  return snapshotSource(root, walk(app));
}

const supportedConfig = {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: { configFile: "vitest.stryker.config.ts" },
  mutate: [
    "domain/**/*.ts",
    "server/stores/**/*.ts",
    "server/routes/**/*.ts",
    "!**/*.test.ts",
    "!**/fixtures.ts",
    "!server/stores/contracts/**",
  ],
  reporters: ["html", "clear-text", "progress"],
  coverageAnalysis: "perTest",
};

function exactPath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    /[?*\[\]{}!()\\:\x00-\x1f\x7f]/.test(value) ||
    path.isAbsolute(value) ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Mutation requires an exact app-relative file path");
  return value;
}

export function parseMutation(args) {
  const request = { all: false, files: [], testFiles: [], concurrency: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--all" && !request.all) {
      request.all = true;
      continue;
    }
    const match = arg.match(/^--(concurrency|mutate|test-file)(?:=(.*))?$/s);
    if (!match) throw new Error(`Unsupported mutation control: ${arg}`);
    const value = match[2] ?? args[++i];
    if (match[1] === "concurrency") {
      if (
        request.concurrency !== null ||
        !/^(?:[1-9]|1[0-6])$/.test(value ?? "")
      )
        throw new Error(
          "Mutation requires one explicit concurrency from 1 through 16",
        );
      request.concurrency = Number(value);
    } else {
      if (value?.startsWith("--"))
        throw new Error("Missing mutation file selector");
      const files = match[1] === "mutate" ? request.files : request.testFiles;
      files.push(exactPath(value));
    }
  }
  if (
    request.concurrency === null ||
    request.all === Boolean(request.files.length)
  )
    throw new Error(
      "Select --all or exact --mutate files, with explicit --concurrency",
    );
  request.files = [...new Set(request.files)].sort();
  request.testFiles = [...new Set(request.testFiles)].sort();
  return request;
}

function canonicalFile(app, file) {
  exactPath(file);
  const target = path.join(app, file);
  // Reject aliases as well as escapes, including a symlinked parent directory.
  if (!fs.lstatSync(target).isFile() || fs.realpathSync(target) !== target)
    throw new Error(`Mutation requires a regular canonical file: ${file}`);
  return file;
}

const inScope = (file) =>
  /^(?:domain|server\/(?:stores|routes))\/.+\.ts$/.test(file) &&
  !/\.test\.ts$/.test(file) &&
  path.basename(file) !== "fixtures.ts" &&
  !file.startsWith("server/stores/contracts/");

export function mutationFiles(directory, request) {
  const app = fs.realpathSync(directory);
  canonicalFile(app, "stryker.config.json");
  const { $schema, ...config } = JSON.parse(
    fs.readFileSync(path.join(app, "stryker.config.json"), "utf8"),
  );
  if (
    ($schema !== undefined && typeof $schema !== "string") ||
    !isDeepStrictEqual(config, supportedConfig)
  )
    throw new Error(
      "Unsupported mutation config: review its producer, scope and lifecycle before running locally",
    );
  const walk = (dir) => {
    if (!fs.existsSync(path.join(app, dir))) return [];
    if (fs.realpathSync(path.join(app, dir)) !== path.join(app, dir))
      throw new Error(`Mutation scope contains a directory alias: ${dir}`);
    return fs
      .readdirSync(path.join(app, dir), { withFileTypes: true })
      .flatMap((entry) => {
        const file = `${dir}/${entry.name}`;
        return entry.isDirectory()
          ? walk(file)
          : inScope(file)
            ? [canonicalFile(app, file)]
            : [];
      });
  };
  const files = request.all
    ? ["domain", "server/stores", "server/routes"].flatMap(walk).sort()
    : request.files.map((file) => {
        if (!inScope(file))
          throw new Error(`Outside configured mutation scope: ${file}`);
        return canonicalFile(app, file);
      });
  if (!files.length) throw new Error("Mutation selected no source files");
  const testFiles = request.testFiles.map((file) => {
    if (
      !/^(?:domain|server)\/.+\.test\.ts$/.test(file) ||
      /\.integration\.test\.ts$/.test(file)
    )
      throw new Error(`Mutation witness is not a unit test: ${file}`);
    return canonicalFile(app, file);
  });
  return { config, files, testFiles };
}
