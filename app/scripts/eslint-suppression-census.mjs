import { lstat, readFile, rename, stat, writeFile } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  posix,
  relative,
  resolve,
} from "node:path";
import { ESLint } from "eslint";

function usage(message) {
  throw new Error(
    `${message}\nUsage: eslint-suppression-census [--prune] [--cwd <path>] [--suppressions-location <path>]`,
  );
}

function parseArguments(argv) {
  const options = {
    cwd: process.cwd(),
    suppressionsLocation: "eslint-suppressions.json",
    prune: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--prune") {
      options.prune = true;
      continue;
    }
    if (argument === "--cwd" || argument === "--suppressions-location") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        usage(`Missing value for ${argument}`);
      }
      if (argument === "--cwd") {
        options.cwd = value;
      } else {
        options.suppressionsLocation = value;
      }
      index += 1;
      continue;
    }
    usage(`Unknown argument: ${argument}`);
  }

  return options;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function containedPath(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot !== "" &&
    !pathFromRoot.startsWith("..") &&
    !isAbsolute(pathFromRoot)
  );
}

function canonicalKey(key) {
  return (
    key.length > 0 &&
    !key.includes("\\") &&
    !posix.isAbsolute(key) &&
    key !== "." &&
    key !== ".." &&
    !key.startsWith("../") &&
    posix.normalize(key) === key
  );
}

async function invalidReason(root, key, eslint) {
  if (!canonicalKey(key)) {
    return "not a canonical relative POSIX path";
  }

  const candidate = resolve(root, key);
  if (!containedPath(root, candidate)) {
    return "escapes the configured cwd";
  }

  let entry;
  try {
    entry = await lstat(candidate);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return "does not exist";
    }
    throw error;
  }
  if (!entry.isFile()) {
    return "is not a regular file";
  }
  if (await eslint.isPathIgnored(key)) {
    return "is ignored by ESLint";
  }
  return undefined;
}

async function atomicWrite(location, contents) {
  const original = await stat(location);
  const temporary = resolve(
    dirname(location),
    `.${basename(location)}.${process.pid}.${Date.now()}.tmp`,
  );
  await writeFile(temporary, contents, { mode: original.mode });
  await rename(temporary, location);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const cwd = resolve(options.cwd);
  const suppressionsLocation = resolve(cwd, options.suppressionsLocation);
  if (!containedPath(cwd, suppressionsLocation)) {
    throw new Error("Suppression ledger must be contained by --cwd");
  }

  const source = await readFile(suppressionsLocation, "utf8");
  const ledger = JSON.parse(source);
  if (!isPlainObject(ledger)) {
    throw new Error("Suppression ledger must be a plain JSON object");
  }

  const eslint = new ESLint({ cwd, suppressionsLocation });
  const invalid = [];
  for (const key of Object.keys(ledger)) {
    const reason = await invalidReason(cwd, key, eslint);
    if (reason) {
      invalid.push({ key, reason });
    }
  }

  if (invalid.length === 0 && !options.prune) {
    return;
  }
  if (options.prune) {
    const valid = Object.fromEntries(
      Object.entries(ledger).filter(
        ([key]) => !invalid.some((entry) => entry.key === key),
      ),
    );
    await atomicWrite(
      suppressionsLocation,
      `${JSON.stringify(valid, null, 2)}\n`,
    );
    return;
  }

  throw new Error(
    `Suppression ledger entries outside ESLint's configured population:\n${invalid
      .map(({ key, reason }) => `- ${key}: ${reason}`)
      .join("\n")}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
