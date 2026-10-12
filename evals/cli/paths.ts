// Usage: pnpm eval:paths <run-id> [--splice <path>]
// The invented-path check, run by hand on one real explanation: the "explain
// file" or "explain folder" run from LangSmith, checked against the messages
// its model call was handed. --splice puts a path into the answer first, to
// see the check catch it.
import "../../lib/script-env.ts";
import { Client } from "langsmith";
import { checkPaths, pathScore } from "../../ai/invented-paths.ts";
import { outputString } from "../example.ts";

const args = process.argv.slice(2);
const spliceIndex = args.indexOf("--splice");
const splice = spliceIndex === -1 ? null : args[spliceIndex + 1];
const runId = args.find((a, i) => !a.startsWith("--") && i !== spliceIndex + 1);
if (!runId || (spliceIndex !== -1 && !splice)) {
  console.error("Usage: pnpm eval:paths <run-id> [--splice <path>]");
  process.exit(1);
}

const client = new Client();
const run = await client.readRun(runId, { loadChildRuns: true });
if (run.name !== "explain file" && run.name !== "explain folder") {
  console.error(`Run ${runId} is "${run.name}", not an explain file or explain folder run.`);
  process.exit(1);
}
const llm = run.child_runs?.find((c) => c.run_type === "llm");
if (!llm) {
  console.error(`Run ${runId} was answered from the cache, so it holds no model call to check against. Use the run that wrote the answer.`);
  process.exit(1);
}

// The messages exactly as the model call recorded them.
const messages: unknown = llm.inputs.messages;
if (!Array.isArray(messages)) throw new Error(`The model call under ${runId} recorded no messages.`);
const shown = messages.map((m: unknown) => {
  const content = typeof m === "object" && m !== null && "content" in m ? m.content : null;
  if (typeof content !== "string") throw new Error(`A message under ${runId} has no text content.`);
  return content;
});

const original = outputString(run.outputs, "body");
if (original === null) throw new Error(`Run ${runId} has no answer body.`);
// After the first paragraph, as a sentence the model might have written.
const answer =
  splice === null
    ? original
    : original.replace(/\n\n|$/, (end) => ` It also relies on \`${splice}\`.${end}`);

const check = checkPaths(answer, shown);
console.log(`${run.name}: ${outputString(run.inputs, "subject") ?? "?"}${splice ? `  (spliced in \`${splice}\`)` : ""}`);
for (const p of check.named) console.log(`  ${check.invented.includes(p) ? "INVENTED" : "shown   "}  ${p}`);
if (check.named.length === 0) console.log("  names no paths");
console.log(`score ${pathScore(check)}: ${check.invented.length} of ${check.named.length} named paths were never shown`);
