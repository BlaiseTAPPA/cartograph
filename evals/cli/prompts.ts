// Usage: pnpm eval:prompts
// The current file-explanation prompt and the retired one, as two experiments
// over the same dataset, scored the same two ways and printed side by side.
import "../../lib/script-env.ts";
import { evaluate } from "langsmith/evaluation";
import type { EvaluationResult } from "langsmith/evaluation";
import { cacheKey, throughCache } from "../../ai/cached.ts";
import { MODELS } from "../../ai/client.ts";
import { complete, EXPLAIN_FILE, fileMessage, sourceRef } from "../../ai/explain.ts";
import { checkPaths, pathComment, PATH_CHECK_KEY, pathScore } from "../../ai/invented-paths.ts";
import { EXPLAIN_DATASET, NO_CACHE, outputString, readFileExample } from "../example.ts";
import { JUDGE_MODEL, judgeSpecificity, SPECIFICITY_KEY } from "../judge.ts";
import { RETIRED_EXPLAIN_FILE, RETIRED_VERSION } from "../retired-prompt.ts";

type Version = { name: string; system: string };
const VERSIONS: Version[] = [
  { name: "current", system: EXPLAIN_FILE },
  { name: RETIRED_VERSION, system: RETIRED_EXPLAIN_FILE },
];

type EvaluatorArgs = { inputs: Record<string, unknown>; outputs: Record<string, unknown> };

/** One experiment. Both versions go through the same call, so the prompt is the only difference. */
async function run(version: Version) {
  const model = MODELS.explain;
  return evaluate(
    async (inputs: Record<string, unknown>) => {
      const { facts, source } = readFileExample(inputs);
      const answer = await throughCache(
        {
          name: "explain file",
          task: "explain-file",
          model,
          key: cacheKey(model, version.system, fileMessage(facts, sourceRef(facts))),
          subject: facts.path,
        },
        NO_CACHE,
        () => complete(model, version.system, fileMessage(facts, source)),
      );
      return { body: answer.body };
    },
    {
      data: EXPLAIN_DATASET,
      experimentPrefix: `explain-${version.name}`,
      description: `File explanation prompt: ${version.name}.`,
      metadata: { prompt: version.name, model, judge: JUDGE_MODEL },
      maxConcurrency: 4,
      evaluators: [
        ({ inputs, outputs }: EvaluatorArgs): EvaluationResult => {
          const { facts, source } = readFileExample(inputs);
          const body = outputString(outputs, "body") ?? "";
          const check = checkPaths(body, [version.system, fileMessage(facts, source)]);
          return { key: PATH_CHECK_KEY, score: pathScore(check), comment: pathComment(check) };
        },
        // The judge sees what the writer saw except the writer's instructions,
        // so it can't tell which version it is reading.
        async ({ inputs, outputs }: EvaluatorArgs): Promise<EvaluationResult> => {
          const { facts, source } = readFileExample(inputs);
          const body = outputString(outputs, "body") ?? "";
          const j = await judgeSpecificity(fileMessage(facts, source), body);
          return { key: SPECIFICITY_KEY, score: j.score, comment: j.reason };
        },
      ],
    },
  );
}

type Scores = Map<string, { paths: number | null; specificity: number | null }>;

function scoresOf(results: Awaited<ReturnType<typeof run>>): Scores {
  const out: Scores = new Map();
  for (const row of results.results) {
    const score = (key: string) => {
      const s = row.evaluationResults.results.find((r) => r.key === key)?.score;
      return typeof s === "number" ? s : null;
    };
    // A failed call has no body to score; it counts as missing, not as zero.
    const answered = outputString(row.run.outputs, "body") !== null;
    out.set(row.example.id, {
      paths: answered ? score(PATH_CHECK_KEY) : null,
      specificity: answered ? score(SPECIFICITY_KEY) : null,
    });
  }
  return out;
}

const runs: { version: Version; name: string; scores: Scores }[] = [];
for (const version of VERSIONS) {
  const results = await run(version);
  runs.push({ version, name: results.experimentName, scores: scoresOf(results) });
}

const [a, b] = runs;
const ids = [...a.scores.keys()].filter((id) => b.scores.has(id));
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const present = (s: Scores, k: "paths" | "specificity") =>
  ids.flatMap((id) => {
    const v = s.get(id)?.[k];
    return v === null || v === undefined ? [] : [v];
  });

const col = (text: string) => text.padStart(14);
console.log(`\nPrompt comparison over ${EXPLAIN_DATASET}, ${ids.length} files, written by ${MODELS.explain}`);
console.log(`${"".padEnd(26)}${col(a.version.name)}${col(b.version.name)}`);
for (const [label, key] of [
  ["only shown paths", "paths"],
  ["specificity, 1 to 5", "specificity"],
] as const) {
  const show = (s: Scores) => {
    const xs = present(s, key);
    if (xs.length === 0) return "–";
    return key === "paths" ? `${xs.filter((x) => x === 1).length}/${xs.length}` : mean(xs).toFixed(2);
  };
  console.log(`${label.padEnd(26)}${col(show(a.scores))}${col(show(b.scores))}`);
}

// Paired by file, since both versions answered the same ones: the difference
// per file says more than two averages side by side.
const pairs = ids.flatMap((id) => {
  const x = a.scores.get(id)?.specificity;
  const y = b.scores.get(id)?.specificity;
  return typeof x === "number" && typeof y === "number" ? [x - y] : [];
});
if (pairs.length > 0) {
  const better = pairs.filter((d) => d > 0).length;
  const worse = pairs.filter((d) => d < 0).length;
  const diff = mean(pairs);
  console.log(
    `\n${a.version.name} vs ${b.version.name} on specificity: ${diff >= 0 ? "+" : ""}${diff.toFixed(2)} points per file on average; better on ${better}, worse on ${worse}, tied on ${pairs.length - better - worse} of ${pairs.length}.`,
  );
}
for (const r of runs) {
  const failed = ids.filter((id) => r.scores.get(id)?.paths === null).length;
  if (failed > 0) console.log(`${r.version.name}: ${failed} calls failed and are left out of its scores; the errors are on the runs.`);
}

console.log(
  `\n"Only shown paths" is set membership and exact. Specificity is ${JUDGE_MODEL}'s opinion against a written rubric: a model judging a model. Read a gap of a few tenths as noise, and read the judge's one-line reasons on the runs before trusting a larger one.`,
);
console.log(`Experiments: ${a.name}, ${b.name}. Compare them from the ${EXPLAIN_DATASET} dataset's Experiments tab.`);
