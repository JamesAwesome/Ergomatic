import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { types } from "node:util";

const identityFields = ["id", "uid", "commonDir", "worktree", "pid", "start"];

function refusal(message) {
  return Object.assign(new Error(message), {
    code: "RESOURCE_REFUSED",
    exitCode: 75,
  });
}

function requireCondition(condition, message) {
  if (!condition) throw refusal(message);
}

function sameNode(first, second) {
  return first.dev === second.dev && first.ino === second.ino;
}

function privateNode(location, directory) {
  const stat = fs.lstatSync(location);
  requireCondition(
    (directory ? stat.isDirectory() : stat.isFile()) &&
      stat.uid === process.getuid() &&
      (stat.mode & 0o077) === 0 &&
      (directory || stat.nlink === 1),
    "Coordination state must be private, owned by this user and not a symlink",
  );
  return stat;
}

function validateRoot(root) {
  requireCondition(
    typeof root === "string" && path.isAbsolute(root),
    "Coordination root must be an absolute canonical directory",
  );
  privateNode(root, true);
  requireCondition(
    fs.realpathSync(root) === root,
    "Coordination root must not contain symlink components",
  );
}

function present(location) {
  try {
    fs.lstatSync(location);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function validateMetadata(record) {
  requireCondition(
    record !== null && typeof record === "object" && !Array.isArray(record),
    "Owner metadata must be an object",
  );
  requireCondition(
    typeof record.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        record.id,
      ) &&
      record.uid === process.getuid() &&
      Number.isSafeInteger(record.pid) &&
      record.pid > 0 &&
      typeof record.start === "string" &&
      record.start.trim().length > 0 &&
      typeof record.phase === "string" &&
      record.phase.trim().length > 0 &&
      [record.commonDir, record.worktree].every(
        (value) =>
          typeof value === "string" &&
          path.isAbsolute(value) &&
          path.normalize(value) === value,
      ),
    "Owner metadata has invalid or foreign identity",
  );
}

function snapshot(root) {
  const directory = path.join(root, "owner");
  const directoryStat = privateNode(directory, true);
  const entries = fs.readdirSync(directory);
  requireCondition(
    entries.length === 1 && entries[0] === "owner.json",
    "Owner directory is incomplete or contains unknown entries",
  );
  const filename = path.join(directory, "owner.json");
  const fileStat = privateNode(filename, false);
  requireCondition(
    fileStat.size > 0 && fileStat.size <= 1024 * 1024,
    "Owner metadata is empty or oversized",
  );
  const fd = fs.openSync(
    filename,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  let raw;
  try {
    requireCondition(
      sameNode(fileStat, fs.fstatSync(fd)),
      "Owner metadata changed while opening",
    );
    raw = fs.readFileSync(fd, "utf8");
  } finally {
    fs.closeSync(fd);
  }
  const metadata = JSON.parse(raw);
  validateMetadata(metadata);
  requireCondition(
    sameNode(directoryStat, privateNode(directory, true)) &&
      sameNode(fileStat, privateNode(filename, false)),
    "Owner changed while inspecting",
  );
  return { metadata, raw, directoryStat, fileStat };
}

function matchingSnapshot(root, previous) {
  const current = snapshot(root);
  requireCondition(
    sameNode(current.directoryStat, previous.directoryStat) &&
      sameNode(current.fileStat, previous.fileStat) &&
      current.raw === previous.raw,
    "Owner generation changed",
  );
  return current;
}

function guarded(operation) {
  try {
    return operation();
  } catch (error) {
    if (error?.code === "RESOURCE_REFUSED") throw error;
    throw refusal(
      `Coordination state unavailable (${error?.code ?? "invalid record or proof"})`,
    );
  }
}

// All mutations share recovery's barrier. Synchronous execution alone does not
// exclude another process between a generation comparison and pathname removal.
// Any abandoned barrier is diagnosis-only, including one left by publication.
function withMaintenance(root, operation) {
  return guarded(() => {
    validateRoot(root);
    const barrier = path.join(root, "maintenance");
    fs.mkdirSync(barrier, { mode: 0o700 });
    const barrierStat = privateNode(barrier, true);
    const checkBarrier = () => {
      validateRoot(root);
      requireCondition(
        sameNode(barrierStat, privateNode(barrier, true)),
        "Maintenance barrier changed",
      );
    };
    try {
      return operation(checkBarrier);
    } finally {
      // Never remove a substituted barrier or unknown contents; rmdir is exact.
      checkBarrier();
      fs.rmdirSync(barrier);
    }
  });
}

function publish(root, metadata, checkCurrent) {
  validateMetadata(metadata);
  const raw = JSON.stringify(metadata);
  requireCondition(
    Buffer.byteLength(raw) <= 1024 * 1024,
    "Owner metadata is oversized",
  );
  const directory = path.join(root, "owner");
  const temporary = path.join(directory, `.metadata-${randomUUID()}`);
  checkCurrent();
  // Exclusive, non-following creation and rename publish only complete records.
  // A failed write leaves unknown state occupied for explicit diagnosis.
  const fd = fs.openSync(
    temporary,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_NOFOLLOW,
    0o600,
  );
  try {
    fs.writeFileSync(fd, raw);
  } finally {
    fs.closeSync(fd);
  }
  checkCurrent();
  fs.renameSync(temporary, path.join(directory, "owner.json"));
}

/** A maintenance barrier, including an empty abandoned one, is never free. */
export function inspectOwner(root) {
  try {
    validateRoot(root);
    requireCondition(
      !present(path.join(root, "maintenance")),
      "Maintenance barrier present; explicit diagnosis required",
    );
    if (!present(path.join(root, "owner"))) return { status: "free" };
    return { status: "occupied", metadata: snapshot(root).metadata };
  } catch (error) {
    return {
      status: "unknown",
      reason:
        error.code === "RESOURCE_REFUSED"
          ? error.message
          : "Owner state is unreadable or malformed",
    };
  }
}

/** Caller supplies a fresh UUID and already canonical common/worktree identity. */
export function acquireOwner(root, metadata) {
  return withMaintenance(root, (checkBarrier) => {
    const record = JSON.parse(JSON.stringify(metadata));
    validateMetadata(record);
    const directory = path.join(root, "owner");
    fs.mkdirSync(directory, { mode: 0o700 });
    const directoryStat = privateNode(directory, true);
    publish(root, record, () => {
      checkBarrier();
      requireCondition(
        sameNode(directoryStat, privateNode(directory, true)),
        "Owner directory changed before publication",
      );
    });
    checkBarrier();
    let released = false;
    const current = () => {
      requireCondition(!released, "Owner handle already released");
      const state = snapshot(root);
      requireCondition(
        sameNode(directoryStat, state.directoryStat) &&
          identityFields.every(
            (field) => state.metadata[field] === record[field],
          ),
        "Owner generation changed",
      );
      return state;
    };
    return Object.freeze({
      id: record.id,
      update(patch) {
        return withMaintenance(root, (check) => {
          const previous = current();
          requireCondition(
            patch !== null &&
              typeof patch === "object" &&
              !Array.isArray(patch),
            "Owner update must be an object",
          );
          const next = JSON.parse(
            JSON.stringify({ ...previous.metadata, ...patch }),
          );
          requireCondition(
            identityFields.every((field) => next[field] === record[field]),
            "Owner identity is immutable",
          );
          // During publication our own temporary file is the only extra entry.
          publish(root, next, () => {
            check();
            currentIdentity(root, previous);
          });
        });
      },
      release() {
        return withMaintenance(root, (check) => {
          const state = current();
          check();
          matchingSnapshot(root, state);
          fs.unlinkSync(path.join(directory, "owner.json"));
          fs.rmdirSync(directory);
          released = true;
        });
      },
    });
  });
}

function currentIdentity(root, previous) {
  const directory = path.join(root, "owner");
  const filename = path.join(directory, "owner.json");
  requireCondition(
    sameNode(previous.directoryStat, privateNode(directory, true)) &&
      sameNode(previous.fileStat, privateNode(filename, false)),
    "Owner generation changed before update",
  );
}

/** proveStale(record) must synchronously return literal true after identity proof. */
export function recoverOwner(root, generation, proveStale) {
  return withMaintenance(root, (checkBarrier) => {
    requireCondition(
      typeof proveStale === "function" && !types.isAsyncFunction(proveStale),
      "Recovery proof must be synchronous",
    );
    const previous = snapshot(root);
    requireCondition(
      previous.metadata.id === generation,
      "Inspected owner generation no longer matches",
    );
    const proof = proveStale(structuredClone(previous.metadata));
    // Refuse promises immediately; consume only their rejection so an invalid
    // callback cannot additionally trigger an unrelated unhandled rejection.
    if (types.isPromise(proof))
      Promise.prototype.then.call(proof, undefined, () => {});
    requireCondition(
      proof === true,
      "Owner cleanup was not synchronously proven",
    );
    checkBarrier();
    matchingSnapshot(root, previous);
    fs.unlinkSync(path.join(root, "owner", "owner.json"));
    fs.rmdirSync(path.join(root, "owner"));
    return true;
  });
}
