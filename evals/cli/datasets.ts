// Usage: pnpm eval:datasets --org <org_id>
// Builds the two LangSmith datasets from the organization's stored analyses.
// A dataset that already exists is left alone, so every experiment on it runs
// over the same examples; delete it in LangSmith to rebuild it.
import "../../lib/script-env.ts";
import { Client } from "langsmith";
import type { ExampleCreate } from "langsmith/schemas";
import { CLASSIFIABLE_ROLES, classifiableRole } from "../../frameworks/taxonomy.ts";
import { EXPLAIN_DATASET, ROLE_DATASET } from "../example.ts";
import { factsOf, loadSource, readStoredFiles, sampleOrder, type StoredFile } from "../stored.ts";

// Enough of each role that one doesn't drown the others: components alone
// would otherwise be most of the set.
const PER_ROLE = 15;
const EXPLANATIONS = 20;

const args = process.argv.slice(2);
const orgIndex = args.indexOf("--org");
const orgId = orgIndex === -1 ? undefined : args[orgIndex + 1];
if (!orgId) {
  console.error("Usage: pnpm eval:datasets --org <org_id>");
  process.exit(1);
}

const client = new Client();
const files = await readStoredFiles(orgId);
console.log(`${files.length} parsed files across the organization's analyses`);

/** Walks candidates in order, loading source until `want` examples are made; skips are counted, not hidden. */
async function take(candidates: StoredFile[], want: number, make: (f: StoredFile, source: string) => ExampleCreate) {
  const examples: ExampleCreate[] = [];
  const skipped: string[] = [];
  for (const f of candidates) {
    if (examples.length === want) break;
    const loaded = await loadSource(f);
    if ("skipped" in loaded) skipped.push(loaded.skipped);
    else examples.push(make(f, loaded.source));
  }
  return { examples, skipped };
}

async function build(name: string, description: string, examples: ExampleCreate[], skipped: string[]) {
  for (const s of skipped) console.log(`  skipped: ${s}`);
  const dataset = await client.createDataset(name, { description });
  await client.createExamples(examples.map((e) => ({ ...e, dataset_id: dataset.id })));
  console.log(`${name}: ${examples.length} examples, ${skipped.length} files skipped`);
}

// Roles. Only files a convention labelled, and only with a role the
// classifier may answer: scoring it on roles it's forbidden to give would
// measure nothing. Those files never reach the classifier in the app, so the
// convention's label is real ground truth the model hasn't seen.
if (await client.hasDataset({ datasetName: ROLE_DATASET })) {
  console.log(`${ROLE_DATASET} exists; left as it is`);
} else {
  const all: ExampleCreate[] = [];
  const skipped: string[] = [];
  for (const role of CLASSIFIABLE_ROLES) {
    const candidates = files
      .filter((f) => !f.roleFromModel && f.role !== null && classifiableRole(f.role) === role)
      .sort(sampleOrder);
    const taken = await take(candidates, PER_ROLE, (f, source) => ({
      inputs: { facts: factsOf(f, true), source },
      outputs: { role },
      metadata: { repo: `${f.repo.owner}/${f.repo.name}`, commit: f.commit, path: f.path, role },
    }));
    console.log(`  ${role}: ${taken.examples.length} of ${candidates.length} labelled by convention`);
    all.push(...taken.examples);
    skipped.push(...taken.skipped);
  }
  await build(
    ROLE_DATASET,
    "Files a framework convention labelled with a role the classifier may give. Role hidden from the input; the convention's label is the reference.",
    all,
    skipped,
  );
}

// Explanations. Files with at least one neighbour, since the prompts are
// about a file among its neighbours, taken in turn from each analysis so one
// large repository doesn't make up the whole set.
if (await client.hasDataset({ datasetName: EXPLAIN_DATASET })) {
  console.log(`${EXPLAIN_DATASET} exists; left as it is`);
} else {
  const byAnalysis = new Map<string, StoredFile[]>();
  for (const f of files) {
    if (f.imports.length + f.importedBy.length === 0) continue;
    byAnalysis.set(f.analysisId, [...(byAnalysis.get(f.analysisId) ?? []), f]);
  }
  const queues = [...byAnalysis.values()].map((list) => list.sort(sampleOrder));
  const interleaved: StoredFile[] = [];
  for (let i = 0; queues.some((q) => i < q.length); i++) for (const q of queues) if (i < q.length) interleaved.push(q[i]);

  const taken = await take(interleaved, EXPLANATIONS, (f, source) => ({
    inputs: { facts: factsOf(f, false), source },
    metadata: { repo: `${f.repo.owner}/${f.repo.name}`, commit: f.commit, path: f.path },
  }));
  await build(
    EXPLAIN_DATASET,
    "Files with at least one neighbour, as the app hands them to the explanation prompt. No reference answers.",
    taken.examples,
    taken.skipped,
  );
}
