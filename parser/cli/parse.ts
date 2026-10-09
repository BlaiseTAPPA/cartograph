// Usage: node parser/cli/parse.ts <directory> [--out result.json]
import { parseRepository } from "../index.ts";
import { writeResult } from "../output.ts";
import { printSummary } from "./summary.ts";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const out = outIndex === -1 ? null : args[outIndex + 1];
const positional = args.filter((a, i) => !a.startsWith("--") && (outIndex === -1 || i !== outIndex + 1));
const directory = positional.length === 1 ? positional[0] : null;

if (!directory || (outIndex !== -1 && !out)) {
  console.error("Usage: node parser/cli/parse.ts <directory> [--out result.json]");
  process.exit(1);
}

const started = performance.now();
const result = parseRepository(directory);
const ms = Math.round(performance.now() - started);

printSummary(result);
console.log(`\nparsed in ${ms} ms`);

if (out) {
  writeResult(out, result);
  console.log(`wrote ${out}`);
}
