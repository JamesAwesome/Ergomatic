import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseSelection,
  unionIdentities,
  requireExactMembership,
  batches,
} from "./selection.mjs";

test("exact requests retain projects, whitespace paths and name filter", () => {
  assert.deepEqual(
    parseSelection(
      [
        "--project",
        "unit",
        "--project=client",
        "space ü.test.ts",
        "-t",
        "^a b$",
        "--maxWorkers=2",
        "--min-workers",
        "1",
        "--list",
      ],
      "files",
    ),
    {
      mode: "files",
      projects: ["client", "unit"],
      files: ["space ü.test.ts"],
      testNamePattern: "^a b$",
      maxWorkers: 2,
      minWorkers: 1,
      inspect: true,
      base: null,
    },
  );
});

test("a lost or malformed selector never becomes an unfiltered run", () => {
  for (const args of [
    [],
    ["--project", "unit"],
    ["a.test.ts"],
    ["--project", ""],
    ["--project", "unknown", "a.test.ts"],
    ["--project", "unit", "--", "a.test.ts"],
    ["--project", "unit", "--config=other", "a.test.ts"],
    ["--project", "unit", "--watch", "a.test.ts"],
    ["--project", "unit", "a.test.ts", "-t", ""],
    ["--project", "unit", "a.test.ts", "-t", "["],
    ["--project", "unit", "a.test.ts", "--maxWorkers", "0"],
    ["--project", "unit", "a.test.ts", "--maxWorkers=17"],
    ["--project", "unit", "a.test.ts", "--maxWorkers=2", "--minWorkers=3"],
    ["--project", "unit", "a.test.ts", "--maxWorkers=2", "--maxWorkers=1"],
    ["--project", "unit", "a.test.ts", "--base=HEAD"],
    ["--project", "unit", "\0bad.test.ts"],
  ])
    assert.throws(() => parseSelection(args, "files"), JSON.stringify(args));
});

test("full and related are explicit, project-scoped requests", () => {
  assert.equal(parseSelection(["--project", "unit"], "full").mode, "full");
  assert.equal(
    parseSelection(["--project", "client", "--base", "HEAD~1"], "related").base,
    "HEAD~1",
  );
  for (const [mode, args] of [
    ["full", []],
    ["full", ["--project", "unit", "a.test.ts"]],
    ["related", ["--project", "unit"]],
    ["related", ["--project", "unit", "--base", ""]],
    ["related", ["--project", "unit", "--base", "--all"]],
    ["bogus", ["--project", "unit", "a.test.ts"]],
  ])
    assert.throws(() => parseSelection(args, mode));
});

test("union deduplicates by both project and canonical path", () => {
  assert.deepEqual(
    unionIdentities(
      [{ project: "unit", file: "/fixture/a.test.ts" }],
      [
        { project: "unit", file: "/fixture/a.test.ts" },
        { project: "client", file: "/fixture/a.test.ts" },
      ],
    ),
    [
      { project: "client", file: "/fixture/a.test.ts" },
      { project: "unit", file: "/fixture/a.test.ts" },
    ],
  );
});

test("membership refuses widened, narrowed, duplicated and cross-project sets", () => {
  const expected = [{ project: "unit", file: "/a.test.ts" }];
  for (const actual of [
    [],
    [...expected, ...expected],
    [...expected, { project: "unit", file: "/aa.test.ts" }],
    [{ project: "client", file: "/a.test.ts" }],
  ])
    assert.throws(() => requireExactMembership(expected, actual));
  requireExactMembership(expected, [...expected]);
});

test("bounded batches partition the union without repeating or dropping identities", () => {
  const input = [
    { project: "unit", file: "/b" },
    { project: "client", file: "/b" },
    { project: "unit", file: "/a" },
    { project: "unit", file: "/c" },
  ];
  assert.deepEqual(batches(input, 2), [
    [{ project: "client", file: "/b" }],
    [
      { project: "unit", file: "/a" },
      { project: "unit", file: "/b" },
    ],
    [{ project: "unit", file: "/c" }],
  ]);
  assert.throws(() => batches(input, 0));
});
