// Usage: pnpm eval:roles
// Role accuracy: the classifier, exactly as the app calls it, over files whose
// role a convention already knows, with that role hidden.
import "../../lib/script-env.ts";
import { evaluate } from "langsmith/evaluation";
import { MODELS } from "../../ai/client.ts";
import { classifyFile } from "../../ai/explain.ts";
import { NO_CACHE, outputString, readFileExample, ROLE_DATASET } from "../example.ts";

const NONE = "none";

const results = await evaluate(
  async (inputs: Record<string, unknown>) => {
    const { facts, source } = readFileExample(inputs);
    const { role } = await classifyFile(facts, async () => source, NO_CACHE);
    return { role: role ?? NONE };
  },
  {
    data: ROLE_DATASET,
    experimentPrefix: "roles",
    description: "Classifier against convention-labelled files, role hidden.",
    metadata: { model: MODELS.classify },
    maxConcurrency: 4,
    evaluators: [
      ({ outputs, referenceOutputs }: { outputs: Record<string, unknown>; referenceOutputs?: Record<string, unknown> }) => {
        const got = outputString(outputs, "role");
        const want = outputString(referenceOutputs, "role");
        return { key: "role-correct", score: got !== null && got === want ? 1 : 0, comment: `${got} for ${want}` };
      },
    ],
  },
);

// Tallied from the rows rather than read back from LangSmith, so the number
// printed is the number of rows that ran.
const byRole = new Map<string, { right: number; total: number; answers: Map<string, number> }>();
let failed = 0;
for (const row of results.results) {
  const want = outputString(row.example.outputs, "role");
  if (want === null) throw new Error(`Example ${row.example.id} has no reference role.`);
  const tally = byRole.get(want) ?? { right: 0, total: 0, answers: new Map() };
  byRole.set(want, tally);
  tally.total++;
  const got = outputString(row.run.outputs, "role");
  if (got === null) {
    failed++;
    tally.answers.set("(failed)", (tally.answers.get("(failed)") ?? 0) + 1);
    continue;
  }
  if (got === want) tally.right++;
  else tally.answers.set(got, (tally.answers.get(got) ?? 0) + 1);
}

const right = [...byRole.values()].reduce((n, t) => n + t.right, 0);
const total = [...byRole.values()].reduce((n, t) => n + t.total, 0);
const pct = (a: number, b: number) => (b === 0 ? "–" : `${((100 * a) / b).toFixed(1)}%`);

console.log(`\nRole accuracy (${MODELS.classify}): ${right}/${total} = ${pct(right, total)}`);
for (const [role, t] of byRole) {
  const wrong = [...t.answers].map(([a, n]) => `${n}× ${a}`).join(", ");
  console.log(`  ${role.padEnd(11)} ${String(t.right).padStart(3)}/${t.total}  ${pct(t.right, t.total).padStart(6)}${wrong ? `  wrong: ${wrong}` : ""}`);
}
if (failed > 0) console.log(`${failed} calls failed and count as wrong; their errors are on the runs.`);
console.log(`Experiment: ${results.experimentName}`);
