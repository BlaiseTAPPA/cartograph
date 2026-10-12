import { createHash } from "node:crypto";
import type { Answer, AnswerCache } from "@/ai/cached";
import { classifyFile, explainFile, explainFolder, MAX_SOURCE_BYTES, type FileFacts, type FolderFacts, type Neighbour } from "@/ai/explain";
import type { ClassifiableRole } from "@/frameworks/taxonomy";
import { fold } from "@/lib/map/fold";
import { createRunSupabase } from "@/pipeline/db";
import { fetchFileAt, headCommit, parseRepoUrl, type Repo } from "@/pipeline/github";
import { EDGE_KINDS } from "@/parser/types";
import { getStoredGraph } from "./stored-graph";
import { createServerSupabase } from "./supabase";

// Everything the model is handed is read here, from the stored graph, through
// the policies. Writes (the cache, a model's label) go through the secret key
// for the organization on the verified session, the way the run writes.

type Analysis = { id: string; repo: Repo; commit: string };

async function readAnalysis(analysisId: string): Promise<Analysis> {
  const { data, error } = await createServerSupabase()
    .from("analyses")
    .select("id, status, commit_sha, project:projects!inner(repo_url)")
    .eq("id", analysisId)
    .maybeSingle();
  if (error) throw new Error(`Reading the analysis failed: ${error.message}`);
  if (!data) throw new Error("No such analysis in this organization.");
  if (data.status !== "complete" || data.commit_sha === null) throw new Error("This analysis has no stored map to explain.");
  return { id: data.id, repo: parseRepoUrl(data.project.repo_url), commit: data.commit_sha };
}

function cacheFor(orgId: string): AnswerCache {
  return {
    async read(key) {
      // The key picks the row; the policy decides whether it's readable.
      const { data, error } = await createServerSupabase().from("ai_cache").select("body").eq("key", key).maybeSingle();
      if (error) throw new Error(`Reading the answer cache failed: ${error.message}`);
      return data?.body ?? null;
    },
    async write({ key, task, model, body }) {
      const { error } = await createRunSupabase()
        .from("ai_cache")
        .upsert({ org_id: orgId, key, task, model, body }, { onConflict: "org_id,key", ignoreDuplicates: true });
      if (error) throw new Error(`Writing the answer cache failed: ${error.message}`);
    },
  };
}

const PAGE = 1000;

/** One side of a file's edges, grouped into distinct neighbours in path order. */
async function neighbours(fileId: string, side: "imports" | "importedBy"): Promise<Neighbour[]> {
  const supabase = createServerSupabase();
  const kinds = new Map<string, Set<string>>();
  for (let from = 0; ; from += PAGE) {
    const query =
      side === "imports"
        ? supabase.from("edges").select("id, kind, other:files!edges_to_file_id_org_id_fkey(path)").eq("from_file_id", fileId)
        : supabase.from("edges").select("id, kind, other:files!edges_from_file_id_org_id_fkey(path)").eq("to_file_id", fileId);
    const { data, error } = await query.order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`Reading neighbours failed: ${error.message}`);
    for (const row of data) {
      if (!kinds.has(row.other.path)) kinds.set(row.other.path, new Set());
      kinds.get(row.other.path)?.add(row.kind);
    }
    if (data.length < PAGE) break;
  }
  return [...kinds]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, set]) => ({ path, kinds: EDGE_KINDS.filter((k) => set.has(k)) }));
}

type StoredFile = { id: string; hash: string; lines: number; role: string | null; roleFromModel: boolean };

async function readFile(analysisId: string, path: string): Promise<StoredFile> {
  const { data, error } = await createServerSupabase()
    .from("files")
    .select("id, hash, lines, role, role_from_model, skip_reason")
    .eq("analysis_id", analysisId)
    .eq("path", path)
    .maybeSingle();
  if (error) throw new Error(`Reading ${path} failed: ${error.message}`);
  if (!data) throw new Error(`${path} isn't a file of this analysis.`);
  if (data.skip_reason !== null || data.hash === null || data.lines === null) {
    throw new Error(`${path} was skipped by the parser (${data.skip_reason}), so there is nothing read to explain.`);
  }
  return { id: data.id, hash: data.hash, lines: data.lines, role: data.role, roleFromModel: data.role_from_model };
}

/** The file as the parser read it, or a thrown reason it can't be handed over. */
function sourceLoader(analysis: Analysis, path: string, hash: string): () => Promise<string> {
  return async () => {
    const bytes = await fetchFileAt(analysis.repo, analysis.commit, path);
    if (bytes === null) throw new Error(`GitHub has no ${path} at commit ${analysis.commit.slice(0, 7)}.`);
    // The model is handed exactly what the parser hashed, or nothing.
    if (createHash("sha256").update(bytes).digest("hex") !== hash) {
      throw new Error(`GitHub's copy of ${path} at commit ${analysis.commit.slice(0, 7)} isn't what the parser read.`);
    }
    if (bytes.length > MAX_SOURCE_BYTES) {
      throw new Error(
        `${path} is ${Math.round(bytes.length / 1024)} KB, more than the ${MAX_SOURCE_BYTES / 1024} KB a question hands the model. Not explained.`,
      );
    }
    return bytes.toString("utf8");
  };
}

export type FileExplanation = {
  answer: Answer;
  /** A label given now, or null when the file has a role already or none fits. */
  label: { role: ClassifiableRole | null; cached: boolean } | { error: string } | null;
};

export async function explainStoredFile(orgId: string, analysisId: string, path: string): Promise<FileExplanation> {
  const analysis = await readAnalysis(analysisId);
  const file = await readFile(analysisId, path);
  const [imports, importedBy] = await Promise.all([neighbours(file.id, "imports"), neighbours(file.id, "importedBy")]);
  const facts: FileFacts = {
    repo: `${analysis.repo.owner}/${analysis.repo.name}`,
    commit: analysis.commit,
    path,
    hash: file.hash,
    lines: file.lines,
    role: file.roleFromModel ? null : file.role,
    imports,
    importedBy,
  };
  const cache = cacheFor(orgId);
  const load = sourceLoader(analysis, path, file.hash);

  const [answer, label] = await Promise.all([
    explainFile(facts, load, cache),
    // Only a file no convention named, and only once: a convention's role is
    // never overwritten, and neither is an earlier label.
    file.role !== null ? null : labelFile(orgId, file.id, facts, load, cache),
  ]);
  return { answer, label };
}

async function labelFile(
  orgId: string,
  fileId: string,
  facts: FileFacts,
  load: () => Promise<string>,
  cache: AnswerCache,
): Promise<FileExplanation["label"]> {
  try {
    const labelled = await classifyFile(facts, load, cache);
    if (labelled.role !== null) {
      const { error } = await createRunSupabase()
        .from("files")
        .update({ role: labelled.role, role_from_model: true })
        .eq("id", fileId)
        .eq("org_id", orgId)
        .is("role", null);
      if (error) throw new Error(`Recording the label failed: ${error.message}`);
    }
    return labelled;
  } catch (cause) {
    // The explanation stands on its own; a failed label is reported beside it.
    return { error: cause instanceof Error ? cause.message : String(cause) };
  }
}

export async function explainStoredFolder(orgId: string, analysisId: string, dir: string): Promise<Answer> {
  const analysis = await readAnalysis(analysisId);
  const graph = await getStoredGraph(analysisId);
  const parsed = graph.files.flatMap((f) => (f.status === "parsed" ? [f] : []));
  // The same fold the map draws, so the folder explained is the box clicked.
  const group = fold(parsed).groups.find((g) => g.dir === dir);
  if (!group) throw new Error(`${dir} isn't a folder on this map.`);
  const inside = new Set(group.files);
  const byPath = new Map(parsed.map((f) => [f.path, f]));

  const seen = new Set<string>();
  const incoming: { from: string; to: string }[] = [];
  const outgoing: { from: string; to: string }[] = [];
  for (const e of graph.edges) {
    const key = `${e.from}\u0000${e.to}`;
    if (seen.has(key) || inside.has(e.from) === inside.has(e.to)) continue;
    seen.add(key);
    (inside.has(e.to) ? incoming : outgoing).push({ from: e.from, to: e.to });
  }
  const order = (a: { from: string; to: string }, b: { from: string; to: string }) =>
    a.from !== b.from ? (a.from < b.from ? -1 : 1) : a.to < b.to ? -1 : a.to > b.to ? 1 : 0;

  const facts: FolderFacts = {
    repo: `${analysis.repo.owner}/${analysis.repo.name}`,
    commit: analysis.commit,
    dir,
    files: group.files.flatMap((p) => {
      const f = byPath.get(p);
      return f ? [{ path: p, role: f.role, lines: f.lines }] : [];
    }),
    incoming: incoming.sort(order),
    outgoing: outgoing.sort(order),
  };
  return explainFolder(facts, cacheFor(orgId));
}

/**
 * Whether what was analysed is still what the repository holds. A folder is
 * checked by commit only; a file also by its own content at the new commit.
 */
export type Freshness =
  | { state: "current" }
  | { state: "moved"; head: string; file: "unchanged" | "changed" | "deleted" | null };

export async function checkFreshness(analysisId: string, path: string | null): Promise<Freshness> {
  const analysis = await readAnalysis(analysisId);
  const head = await headCommit(analysis.repo);
  if (head === analysis.commit) return { state: "current" };
  if (path === null) return { state: "moved", head, file: null };

  const file = await readFile(analysisId, path);
  const bytes = await fetchFileAt(analysis.repo, head, path);
  if (bytes === null) return { state: "moved", head, file: "deleted" };
  const changed = createHash("sha256").update(bytes).digest("hex") !== file.hash;
  return { state: "moved", head, file: changed ? "changed" : "unchanged" };
}
