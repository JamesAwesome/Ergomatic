import assert from "node:assert/strict";
import { test } from "node:test";
import { Readable } from "node:stream";
import { readBounded, parseFullRequest } from "./push-input.mjs";

test("full requests require an exact one-shot scope and head", () => {
  const head = "a".repeat(40);
  const packet = {
    version: 1,
    mode: "full",
    projects: ["unit", "client"],
    head,
  };
  assert.equal(parseFullRequest(JSON.stringify(packet), head).mode, "full");
  for (const value of [
    "",
    "full",
    "{}",
    JSON.stringify({ ...packet, projects: [] }),
    JSON.stringify({ ...packet, mode: "related" }),
    JSON.stringify({ ...packet, head: "b".repeat(40) }),
  ])
    assert.throws(() => parseFullRequest(value, head));
});

test("bounded input refuses oversize data and incomplete live streams", async () => {
  assert.equal(
    await readBounded(Readable.from(["one", "two"]), 6, 100),
    "onetwo",
  );
  await assert.rejects(
    readBounded(Readable.from(["toolong"]), 3, 100),
    /limit/,
  );
  await assert.rejects(
    readBounded(new Readable({ read() {} }), 3, 20),
    /deadline/,
  );
});
