// Usage: node parser/cli/read.ts <result.json>
// Reads a written result through the typed reader. Exits non-zero if the file
// doesn't match the contract or disagrees with itself.
import { readResult } from "../output.ts";
import { printSummary } from "./summary.ts";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node parser/cli/read.ts <result.json>");
  process.exit(1);
}

const result = readResult(file);
printSummary(result);
console.log(`\n${file}: matches the contract (version ${result.version})`);
