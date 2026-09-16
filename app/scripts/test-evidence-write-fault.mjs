// Test-only preload: fail the post-spawn receipt rename, then allow finalization.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const rename = fs.renameSync;
let receipts = 0;
fs.renameSync = function (source, target) {
  if (String(target).endsWith("/receipt.json") && ++receipts === 2)
    throw new Error("fabricated post-spawn receipt write failure");
  return rename(source, target);
};
syncBuiltinESMExports();
