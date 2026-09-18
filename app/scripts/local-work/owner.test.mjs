import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { acquireOwner, inspectOwner, recoverOwner } from "./owner.mjs";

function fixture(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ergo-owner-")),
  );
  // Fixtures have one directory level. Unknown nesting must fail cleanup.
  t.after(() => {
    for (const name of fs.readdirSync(root)) {
      const entry = path.join(root, name);
      if (fs.lstatSync(entry).isDirectory()) {
        for (const filename of fs.readdirSync(entry)) {
          fs.unlinkSync(path.join(entry, filename));
        }
        fs.rmdirSync(entry);
      } else fs.unlinkSync(entry);
    }
    fs.rmdirSync(root);
  });
  return root;
}

function metadata(root, patch = {}) {
  return {
    id: randomUUID(),
    uid: process.getuid(),
    commonDir: root,
    worktree: root,
    pid: process.pid,
    start: "Tue Sep 15 10:00:00 2026",
    phase: "preflight",
    ...patch,
  };
}

function refused(action) {
  assert.throws(action, { code: "RESOURCE_REFUSED", exitCode: 75 });
}

function ownerFile(root) {
  return path.join(root, "owner", "owner.json");
}

function child(source, ...args) {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", source, ...args],
    {
      encoding: "utf8",
      timeout: 5000,
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  return result;
}

test("one generation excludes another and releases only after private metadata is published", (t) => {
  const root = fixture(t);
  assert.deepEqual(inspectOwner(root), { status: "free" });
  const record = metadata(root);
  const owner = acquireOwner(root, record);
  assert.equal(owner.id, record.id);
  assert.equal(inspectOwner(root).status, "occupied");
  assert.deepEqual(inspectOwner(root).metadata, record);
  assert.equal(fs.statSync(path.join(root, "owner")).mode & 0o777, 0o700);
  assert.equal(fs.statSync(ownerFile(root)).mode & 0o777, 0o600);
  refused(() => acquireOwner(root, metadata(root)));
  owner.update({ phase: "test", child: { pid: 123, start: "observed start" } });
  assert.equal(inspectOwner(root).metadata.phase, "test");
  assert.deepEqual(inspectOwner(root).metadata.child, {
    pid: 123,
    start: "observed start",
  });
  owner.release();
  assert.deepEqual(inspectOwner(root), { status: "free" });
  assert.deepEqual(fs.readdirSync(root), []);
});

test("a released handle cannot update or release its successor", (t) => {
  const root = fixture(t);
  const previous = acquireOwner(root, metadata(root));
  previous.release();
  const current = acquireOwner(root, metadata(root));
  refused(() => previous.release());
  refused(() => previous.update({ phase: "wrong" }));
  assert.equal(inspectOwner(root).metadata.id, current.id);
});

test("a refused independent contender cannot block the incumbent's update", async (t) => {
  const root = fixture(t);
  const owner = acquireOwner(root, metadata(root));
  const ready = path.join(root, "ready");
  const release = path.join(root, "release");
  const moduleUrl = new URL("./owner.mjs", import.meta.url).href;
  const contender = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import fs from 'node:fs';
    import { acquireOwner } from ${JSON.stringify(moduleUrl)};
    const mkdir = fs.mkdirSync;
    fs.mkdirSync = (name, options) => {
      const result = mkdir(name, options);
      if (name === ${JSON.stringify(path.join(root, "maintenance"))}) {
        fs.writeFileSync(${JSON.stringify(ready)}, 'holding');
        const deadline = Date.now() + 5000;
        while (!fs.existsSync(${JSON.stringify(release)})) {
          if (Date.now() >= deadline) process.exit(86);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        }
      }
      return result;
    };
    try {
      acquireOwner(${JSON.stringify(root)}, ${JSON.stringify(metadata(root))});
      process.exit(99);
    } catch (error) {
      if (error.exitCode !== 75) throw error;
      fs.writeFileSync(${JSON.stringify(ready)}, 'refused');
    }
  `,
    ],
    { stdio: "inherit" },
  );
  const exited = once(contender, "exit");
  try {
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(ready)) {
      assert.ok(Date.now() < deadline, "contender must reach acquisition");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    owner.update({ phase: "still-running" });
    assert.equal(inspectOwner(root).metadata.phase, "still-running");
    owner.release();
  } finally {
    fs.writeFileSync(release, "release");
    assert.deepEqual(await exited, [0, null]);
  }
  assert.equal(fs.readFileSync(ready, "utf8"), "refused");
  assert.deepEqual(inspectOwner(root), { status: "free" });
});

for (const contents of [null, "", "{", "null", "{}", "[]"]) {
  test(`an existing ${JSON.stringify(contents)} owner record is unknown and cannot be acquired or recovered`, (t) => {
    const root = fixture(t);
    fs.mkdirSync(path.join(root, "owner"), { mode: 0o700 });
    if (contents !== null)
      fs.writeFileSync(ownerFile(root), contents, { mode: 0o600 });
    assert.equal(inspectOwner(root).status, "unknown");
    refused(() => acquireOwner(root, metadata(root)));
    let called = false;
    refused(() =>
      recoverOwner(root, randomUUID(), () => {
        called = true;
        return true;
      }),
    );
    assert.equal(called, false);
    assert.equal(fs.existsSync(path.join(root, "owner")), true);
  });
}

for (const target of ["root", "owner", "metadata"]) {
  test(`a substituted ${target} symlink is refused without modifying its target`, (t) => {
    const root = fixture(t);
    const outside = fixture(t);
    const record = metadata(root);
    const owner = acquireOwner(root, record);
    let coordinationRoot = root;
    if (target === "root") {
      coordinationRoot = path.join(outside, "link");
      fs.symlinkSync(root, coordinationRoot);
    } else if (target === "owner") {
      fs.renameSync(path.join(root, "owner"), path.join(outside, "saved"));
      fs.symlinkSync(path.join(outside, "saved"), path.join(root, "owner"));
    } else {
      fs.renameSync(ownerFile(root), path.join(outside, "saved.json"));
      fs.symlinkSync(path.join(outside, "saved.json"), ownerFile(root));
    }
    assert.equal(inspectOwner(coordinationRoot).status, "unknown");
    refused(() => acquireOwner(coordinationRoot, metadata(root)));
    refused(() => recoverOwner(coordinationRoot, owner.id, () => true));
    if (target !== "root") refused(() => owner.release());
    const saved =
      target === "root"
        ? ownerFile(root)
        : target === "owner"
          ? path.join(outside, "saved", "owner.json")
          : path.join(outside, "saved.json");
    assert.deepEqual(JSON.parse(fs.readFileSync(saved, "utf8")), record);
  });
}

test("foreign UID metadata and nonprivate metadata cannot authorize recovery", (t) => {
  const root = fixture(t);
  const owner = acquireOwner(root, metadata(root));
  const record = JSON.parse(fs.readFileSync(ownerFile(root), "utf8"));
  fs.writeFileSync(
    ownerFile(root),
    JSON.stringify({ ...record, uid: process.getuid() + 1 }),
  );
  assert.equal(inspectOwner(root).status, "unknown");
  refused(() => owner.release());
  refused(() => recoverOwner(root, owner.id, () => true));
  fs.writeFileSync(ownerFile(root), JSON.stringify(record));
  fs.chmodSync(ownerFile(root), 0o644);
  assert.equal(inspectOwner(root).status, "unknown");
  refused(() => recoverOwner(root, owner.id, () => true));
});

test("immutable owner identity cannot be changed through an update", (t) => {
  const root = fixture(t);
  const record = metadata(root);
  const owner = acquireOwner(root, record);
  for (const patch of [
    { id: randomUUID() },
    { uid: record.uid + 1 },
    { pid: record.pid + 1 },
    { start: "different" },
    { commonDir: "/different" },
    { worktree: "/different" },
    { phase: "" },
  ]) {
    refused(() => owner.update(patch));
    assert.deepEqual(inspectOwner(root).metadata, record);
  }
});

test("maintenance blocks acquisition, updates, release and a second recovery", (t) => {
  const root = fixture(t);
  const owner = acquireOwner(root, metadata(root));
  fs.mkdirSync(path.join(root, "maintenance"), { mode: 0o700 });
  assert.equal(inspectOwner(root).status, "unknown");
  refused(() => acquireOwner(root, metadata(root)));
  refused(() => owner.update({ phase: "test" }));
  refused(() => owner.release());
  refused(() => recoverOwner(root, owner.id, () => true));
  assert.equal(fs.existsSync(ownerFile(root)), true);
  assert.equal(fs.existsSync(path.join(root, "maintenance")), true);
});

test("an abandoned maintenance barrier with no owner cannot create a reservation", (t) => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, "maintenance"), { mode: 0o700 });
  refused(() => acquireOwner(root, metadata(root)));
  assert.deepEqual(fs.readdirSync(root), ["maintenance"]);
  assert.equal(inspectOwner(root).status, "unknown");
});

test("a barrier appearing during reservation leaves unpublished ownership blocked", (t) => {
  const root = fixture(t);
  const mkdir = fs.mkdirSync;
  t.mock.method(fs, "mkdirSync", (filename, options) => {
    if (filename === path.join(root, "owner"))
      mkdir(path.join(root, "maintenance"), { mode: 0o700 });
    return mkdir(filename, options);
  });
  refused(() => acquireOwner(root, metadata(root)));
  assert.deepEqual(fs.readdirSync(path.join(root, "owner")), []);
  assert.equal(fs.existsSync(path.join(root, "maintenance")), true);
  fs.rmdirSync(path.join(root, "maintenance"));
  assert.equal(inspectOwner(root).status, "unknown");
  let proofCalled = false;
  refused(() =>
    recoverOwner(root, randomUUID(), () => {
      proofCalled = true;
      return true;
    }),
  );
  assert.equal(proofCalled, false);
  assert.deepEqual(fs.readdirSync(path.join(root, "owner")), []);
});

test("a delayed acquirer loses to a generation published before its reservation", (t) => {
  const root = fixture(t);
  const winner = metadata(root);
  const moduleUrl = new URL("./owner.mjs", import.meta.url).href;
  const mkdir = fs.mkdirSync;
  let intervened = false;
  t.mock.method(fs, "mkdirSync", (filename, options) => {
    if (filename === path.join(root, "owner")) {
      intervened = true;
      const result = child(
        `
        import { acquireOwner } from ${JSON.stringify(moduleUrl)};
        const owner = acquireOwner(process.argv[1], JSON.parse(process.argv[2]));
        owner.update({ phase: 'winner-running' });
      `,
        root,
        JSON.stringify(winner),
      );
      assert.equal(result.status, 0, result.stderr);
    }
    return mkdir(filename, options);
  });
  refused(() => acquireOwner(root, metadata(root)));
  assert.equal(intervened, true);
  assert.equal(inspectOwner(root).metadata.id, winner.id);
  assert.equal(inspectOwner(root).metadata.phase, "winner-running");
  assert.equal(fs.existsSync(path.join(root, "maintenance")), false);
});

test("recovery refuses the wrong generation and an unproven live owner", (t) => {
  const root = fixture(t);
  const owner = acquireOwner(root, metadata(root));
  let called = false;
  refused(() =>
    recoverOwner(root, randomUUID(), () => {
      called = true;
      return true;
    }),
  );
  assert.equal(called, false);
  refused(() => recoverOwner(root, owner.id, () => false));
  assert.equal(inspectOwner(root).metadata.id, owner.id);
  assert.equal(fs.existsSync(path.join(root, "maintenance")), false);
});

test("recovery holds the barrier across proof and deletion against independent processes", (t) => {
  const root = fixture(t);
  const owner = acquireOwner(root, metadata(root));
  const moduleUrl = new URL("./owner.mjs", import.meta.url).href;
  assert.equal(
    recoverOwner(root, owner.id, (record) => {
      assert.equal(record.id, owner.id);
      const contender = child(
        `
      import { acquireOwner, recoverOwner } from ${JSON.stringify(moduleUrl)};
      import assert from 'node:assert/strict';
      const [root, json, generation] = process.argv.slice(1);
      const record = JSON.parse(json);
      let proofCalled = false;
      for (const action of [() => recoverOwner(root, generation, () => { proofCalled = true; return false; }), () => acquireOwner(root, record)]) {
        try { action(); process.exit(1); } catch (error) { if (error.exitCode !== 75) throw error; }
        assert.equal(proofCalled, false, 'competing recoverer must never reach proof');
      }
    `,
        root,
        JSON.stringify(metadata(root)),
        owner.id,
      );
      assert.equal(contender.status, 0, contender.stderr);
      refused(() => owner.release());
      return true;
    }),
    true,
  );
  assert.deepEqual(inspectOwner(root), { status: "free" });
  const next = acquireOwner(root, metadata(root));
  refused(() => owner.release());
  assert.equal(inspectOwner(root).metadata.id, next.id);
});

test("failed or asynchronous proof never removes ownership", (t) => {
  const root = fixture(t);
  const owner = acquireOwner(root, metadata(root));
  let asyncCalled = false;
  refused(() =>
    recoverOwner(root, owner.id, async () => {
      asyncCalled = true;
      return true;
    }),
  );
  assert.equal(asyncCalled, false);
  for (const proof of [
    () => Promise.resolve(true),
    () => ({ then() {} }),
    () => "true",
    () => {
      throw new Error("proof unavailable");
    },
  ]) {
    refused(() => recoverOwner(root, owner.id, proof));
    assert.equal(inspectOwner(root).metadata.id, owner.id);
  }
});

test("proof cannot authorize a record replaced during that proof", (t) => {
  const root = fixture(t);
  const owner = acquireOwner(root, metadata(root));
  const successor = metadata(root);
  refused(() =>
    recoverOwner(root, owner.id, () => {
      fs.writeFileSync(ownerFile(root), JSON.stringify(successor));
      return true;
    }),
  );
  assert.equal(inspectOwner(root).metadata.id, successor.id);
});

test("an unexpected owner entry is preserved instead of recursively deleted", (t) => {
  const root = fixture(t);
  const owner = acquireOwner(root, metadata(root));
  fs.writeFileSync(path.join(root, "owner", "unexpected"), "preserve");
  refused(() => owner.release());
  refused(() => recoverOwner(root, owner.id, () => true));
  assert.equal(
    fs.readFileSync(path.join(root, "owner", "unexpected"), "utf8"),
    "preserve",
  );
  assert.equal(fs.existsSync(ownerFile(root)), true);
});

test("a recovery process that exits during proof leaves a diagnosis-only barrier", (t) => {
  const root = fixture(t);
  const owner = acquireOwner(root, metadata(root));
  const moduleUrl = new URL("./owner.mjs", import.meta.url).href;
  const crashed = child(
    `
    import { recoverOwner } from ${JSON.stringify(moduleUrl)};
    recoverOwner(process.argv[1], process.argv[2], () => process.exit(23));
  `,
    root,
    owner.id,
  );
  assert.equal(crashed.status, 23);
  assert.equal(inspectOwner(root).status, "unknown");
  refused(() => acquireOwner(root, metadata(root)));
  refused(() => recoverOwner(root, owner.id, () => true));
  assert.equal(fs.existsSync(ownerFile(root)), true);
});

test("a non-Error proof failure is still a refusal and retains the exact owner", (t) => {
  const root = fixture(t);
  const owner = acquireOwner(root, metadata(root));
  refused(() =>
    recoverOwner(root, owner.id, () => {
      throw null;
    }),
  );
  assert.equal(inspectOwner(root).metadata.id, owner.id);
});

test("a rejected promise returned by a non-async proof is refused without an unhandled rejection", (t) => {
  const root = fixture(t);
  const owner = acquireOwner(root, metadata(root));
  const moduleUrl = new URL("./owner.mjs", import.meta.url).href;
  const result = child(
    `
    import { recoverOwner } from ${JSON.stringify(moduleUrl)};
    process.on('unhandledRejection', () => process.exit(42));
    try {
      recoverOwner(process.argv[1], process.argv[2], () => Promise.reject(new Error('not proof')));
      process.exit(1);
    } catch (error) { if (error.exitCode !== 75) throw error; }
  `,
    root,
    owner.id,
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(inspectOwner(root).metadata.id, owner.id);
});

test("a contender at owner directory creation is refused before metadata publication", (t) => {
  const root = fixture(t);
  const originalMkdir = fs.mkdirSync;
  const moduleUrl = new URL("./owner.mjs", import.meta.url).href;
  let reached = false;
  t.mock.method(fs, "mkdirSync", (filename, options) => {
    const result = originalMkdir(filename, options);
    if (filename === path.join(root, "owner")) {
      reached = true;
      const contender = child(
        `
        import { acquireOwner, inspectOwner, recoverOwner } from ${JSON.stringify(moduleUrl)};
        import assert from 'node:assert/strict';
        const root = process.argv[1];
        if (inspectOwner(root).status !== 'unknown') process.exit(2);
        let proofCalled = false;
        for (const action of [
          () => acquireOwner(root, JSON.parse(process.argv[2])),
          () => recoverOwner(root, JSON.parse(process.argv[2]).id, () => { proofCalled = true; return true; }),
        ]) {
          try { action(); process.exit(3); }
          catch (error) { if (error.exitCode !== 75) throw error; }
        }
        assert.equal(proofCalled, false);
      `,
        root,
        JSON.stringify(metadata(root)),
      );
      assert.equal(contender.status, 0, contender.stderr);
    }
    return result;
  });
  const owner = acquireOwner(root, metadata(root));
  assert.equal(reached, true);
  assert.equal(inspectOwner(root).metadata.id, owner.id);
});

test("atomic updates retain complete previous metadata and exclude recovery until publication finishes", (t) => {
  const root = fixture(t);
  const owner = acquireOwner(root, metadata(root));
  const originalRename = fs.renameSync;
  const moduleUrl = new URL("./owner.mjs", import.meta.url).href;
  let reached = false;
  t.mock.method(fs, "renameSync", (from, to) => {
    reached = true;
    assert.equal(
      JSON.parse(fs.readFileSync(ownerFile(root), "utf8")).phase,
      "preflight",
    );
    const contender = child(
      `
      import { acquireOwner, recoverOwner } from ${JSON.stringify(moduleUrl)};
      const [root, json, id] = process.argv.slice(1);
      for (const action of [() => acquireOwner(root, JSON.parse(json)), () => recoverOwner(root, id, () => true)]) {
        try { action(); process.exit(1); } catch (error) { if (error.exitCode !== 75) throw error; }
      }
    `,
      root,
      JSON.stringify(metadata(root)),
      owner.id,
    );
    assert.equal(contender.status, 0, contender.stderr);
    originalRename(from, to);
  });
  owner.update({ phase: "running" });
  assert.equal(reached, true);
  assert.equal(inspectOwner(root).metadata.phase, "running");
  assert.deepEqual(fs.readdirSync(path.join(root, "owner")), ["owner.json"]);
});

test("invalid acquisition metadata cannot leave a new owner or maintenance barrier", (t) => {
  const root = fixture(t);
  for (const record of [
    null,
    {},
    metadata(root, { id: "../escape" }),
    metadata(root, { uid: process.getuid() + 1 }),
    metadata(root, { pid: 0 }),
    metadata(root, { start: " " }),
    metadata(root, { phase: "" }),
    metadata(root, { commonDir: "relative" }),
    metadata(root, { worktree: `${root}/..` }),
  ]) {
    refused(() => acquireOwner(root, record));
    assert.deepEqual(inspectOwner(root), { status: "free" });
    assert.deepEqual(fs.readdirSync(root), []);
  }
});

test("unsafe root permissions and hard-linked metadata stay blocked", (t) => {
  const root = fixture(t);
  fs.chmodSync(root, 0o755);
  refused(() => acquireOwner(root, metadata(root)));
  assert.equal(inspectOwner(root).status, "unknown");
  fs.chmodSync(root, 0o700);
  const owner = acquireOwner(root, metadata(root));
  fs.linkSync(ownerFile(root), path.join(root, "linked.json"));
  assert.equal(inspectOwner(root).status, "unknown");
  refused(() => owner.update({ phase: "running" }));
  refused(() => owner.release());
  refused(() => recoverOwner(root, owner.id, () => true));
  assert.equal(fs.existsSync(path.join(root, "linked.json")), true);
});

test("partial publication failures retain the owner for diagnosis", (t) => {
  const root = fixture(t);
  const originalWrite = fs.writeFileSync;
  t.mock.method(fs, "writeFileSync", (filename, contents, ...rest) => {
    if (typeof filename === "number") {
      originalWrite(filename, "{");
      throw Object.assign(new Error("no room"), { code: "ENOSPC" });
    }
    return originalWrite(filename, contents, ...rest);
  });
  refused(() => acquireOwner(root, metadata(root)));
  assert.equal(inspectOwner(root).status, "unknown");
  assert.equal(fs.existsSync(path.join(root, "owner")), true);
  refused(() => acquireOwner(root, metadata(root)));
});

for (const target of ["root", "owner", "metadata"]) {
  test(`foreign filesystem UID on ${target} blocks mutation despite same-user JSON`, (t) => {
    const root = fixture(t);
    const owner = acquireOwner(root, metadata(root));
    const filename =
      target === "root"
        ? root
        : target === "owner"
          ? path.join(root, "owner")
          : ownerFile(root);
    const originalStat = fs.lstatSync;
    // A non-root test cannot chown a file to another user. Substitute only
    // the OS stat UID; every pathname, file operation and JSON byte is real.
    const statMock = t.mock.method(fs, "lstatSync", (location, ...args) => {
      const stat = originalStat(location, ...args);
      return location === filename
        ? Object.assign(Object.create(stat), { uid: process.getuid() + 1 })
        : stat;
    });
    try {
      assert.equal(inspectOwner(root).status, "unknown");
      refused(() => acquireOwner(root, metadata(root)));
      refused(() => owner.update({ phase: "wrong" }));
      refused(() => owner.release());
      let called = false;
      refused(() =>
        recoverOwner(root, owner.id, () => {
          called = true;
          return true;
        }),
      );
      assert.equal(called, false);
    } finally {
      statMock.mock.restore();
    }
    assert.equal(inspectOwner(root).metadata.id, owner.id);
    assert.equal(inspectOwner(root).metadata.phase, "preflight");
  });
}
