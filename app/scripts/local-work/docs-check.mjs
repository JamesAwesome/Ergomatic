import path from "node:path";
import { classifyStagedDocs, stagedInstructionChecks } from "./docs-only.mjs";

try {
  const root = path.dirname(process.cwd());
  if (
    process.argv.includes("--require-docs") &&
    !classifyStagedDocs(root).docsOnly
  )
    throw new Error(
      "Documentation exemption changed before validation; commit refused",
    );
  stagedInstructionChecks(root);
  console.log("pre-commit: staged conflict markers and skill parity checked");
} catch (error) {
  console.error(`pre-commit: ${error.message}`);
  process.exitCode = 2;
}
