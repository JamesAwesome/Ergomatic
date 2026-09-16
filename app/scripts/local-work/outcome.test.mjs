import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  rmSync,
  writeSync,
  symlinkSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { outcomeChannel } from "./outcome.mjs";

function channel(t) {
  const root = mkdtempSync(join(tmpdir(), "ergo-outcome-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const value = outcomeChannel(join(root, "outcome.json"));
  t.after(() => value.close());
  return value;
}

test("private outcomes reject missing, malformed, oversized, contradictory or impossible verdicts", (t) => {
  for (const text of [
    "",
    "{",
    " ".repeat(1025),
    '{"exitCode":3,"verdict":""}',
    '{"exitCode":0,"verdict":"fake"}',
    '{"exitCode":0,"verdict":"memory"}',
    '{"exitCode":0,"verdict":"signal"}',
    '{"exitCode":0,"verdict":"incomplete"}',
  ]) {
    const value = channel(t);
    writeSync(value.fd, text);
    assert.throws(() => value.read(0), undefined, text);
  }
});

test("outcome channel cannot overwrite an existing file or follow a symlink", (t) => {
  const root = mkdtempSync(join(tmpdir(), "ergo-outcome-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const target = join(root, "target"),
    link = join(root, "link");
  writeFileSync(target, "sentinel");
  symlinkSync(target, link);
  assert.throws(() => outcomeChannel(target), /EEXIST/);
  assert.throws(() => outcomeChannel(link), /EEXIST/);
  assert.equal(readFileSync(target, "utf8"), "sentinel");
});
