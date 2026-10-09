// Usage: node --env-file=.env.local pipeline/cli/analyse.ts <github-url> --org <org_id> [--rerun]
// Runs the whole pipeline from a terminal, writing to the database exactly as
// the app will. --rerun re-queues an existing analysis instead of stopping.
import { requeueAnalysis, runAnalysis, startAnalysis } from "../run.ts";

const args = process.argv.slice(2);
const orgIndex = args.indexOf("--org");
const orgId = orgIndex === -1 ? null : args[orgIndex + 1];
const rerun = args.includes("--rerun");
const positional = args.filter((a, i) => !a.startsWith("--") && i !== orgIndex + 1);
const url = positional.length === 1 ? positional[0] : null;

if (!url || !orgId) {
  console.error("Usage: node --env-file=.env.local pipeline/cli/analyse.ts <github-url> --org <org_id> [--rerun]");
  process.exit(1);
}

const { analysisId, created } = await startAnalysis(orgId, url);
console.log(`${created ? "created" : "existing"} analysis ${analysisId}`);

if (!created) {
  if (!rerun) {
    console.log("already analysed; pass --rerun to analyse it again");
    process.exit(0);
  }
  if (!(await requeueAnalysis(orgId, analysisId))) {
    console.error("still running, not re-queued");
    process.exit(1);
  }
}

const started = performance.now();
try {
  await runAnalysis(analysisId);
  console.log(`complete in ${Math.round(performance.now() - started)} ms`);
} catch (cause) {
  console.error(`failed: ${cause instanceof Error ? cause.message : String(cause)}`);
  process.exit(1);
}
