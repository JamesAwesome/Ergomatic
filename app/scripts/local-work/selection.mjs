/** Closed local CLI: losing a selector is an error, never full-run consent. */
export function parseSelection(args, mode) {
  if (!["files", "related", "full"].includes(mode))
    throw new Error(`Unknown selection mode: ${mode}`);
  const result = {
    mode,
    projects: [],
    files: [],
    testNamePattern: null,
    maxWorkers: null,
    minWorkers: null,
    inspect: false,
    base: null,
  };
  const seen = new Set();
  const options = new Map([
    ["--project", "project"],
    ["--base", "base"],
    ["-t", "testNamePattern"],
    ["--testNamePattern", "testNamePattern"],
    ["--maxWorkers", "maxWorkers"],
    ["--max-workers", "maxWorkers"],
    ["--minWorkers", "minWorkers"],
    ["--min-workers", "minWorkers"],
  ]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== "string" || !arg || arg.includes("\0"))
      throw new Error("Empty or malformed selection argument");
    if (arg === "--list" && !result.inspect) {
      result.inspect = true;
      continue;
    }
    if (!arg.startsWith("-")) {
      result.files.push(arg);
      continue;
    }
    const equals = arg.indexOf("=");
    const key = options.get(equals < 0 ? arg : arg.slice(0, equals));
    if (!key) throw new Error(`Unsupported selection option: ${arg}`);
    const value = equals < 0 ? args[++i] : arg.slice(equals + 1);
    if (!value || value.startsWith("-") || value.includes("\0"))
      throw new Error(`Missing or malformed ${key}`);
    if (key !== "project" && seen.has(key)) throw new Error(`Duplicate ${key}`);
    seen.add(key);
    if (key === "project") {
      if (!["unit", "client", "integration"].includes(value))
        throw new Error(`Unknown project: ${value}`);
      result.projects.push(value);
    } else if (key.endsWith("Workers")) {
      if (!/^(?:[1-9]|1[0-6])$/.test(value))
        throw new Error("Worker override must be an integer from 1 through 16");
      result[key] = Number(value);
    } else result[key] = value;
  }
  result.projects = [...new Set(result.projects)].sort();
  if (!result.projects.length) throw new Error("Select an explicit project");
  if (mode === "files" ? !result.files.length : result.files.length)
    throw new Error(
      mode === "files"
        ? "Select exact test files"
        : `${mode} does not accept files`,
    );
  if (mode === "related" ? !result.base : result.base !== null)
    throw new Error("Only related selection requires --base <commit-or-ref>");
  if (result.testNamePattern !== null) {
    if (mode !== "files") throw new Error("Name filters require exact files");
    new RegExp(result.testNamePattern);
  }
  if (result.maxWorkers !== null && result.minWorkers > result.maxWorkers)
    throw new Error("Minimum workers exceeds maximum workers");
  return result;
}

export const identityKey = ({ project, file }) =>
  JSON.stringify([project, file]);

export function unionIdentities(...sets) {
  return [
    ...new Map(sets.flat().map((item) => [identityKey(item), item])).entries(),
  ]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, item]) => item);
}

export function requireExactMembership(expected, actual) {
  const keys = (values) => values.map(identityKey).sort();
  if (JSON.stringify(keys(expected)) !== JSON.stringify(keys(actual)))
    throw new Error(
      `Selection membership mismatch: expected ${JSON.stringify(expected)}, resolved ${JSON.stringify(actual)}`,
    );
}

export function batches(identities, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new Error("Invalid batch bound");
  const result = [];
  for (const item of unionIdentities(identities)) {
    const last = result.at(-1);
    if (!last || last.length === limit || last[0].project !== item.project)
      result.push([item]);
    else last.push(item);
  }
  return result;
}
