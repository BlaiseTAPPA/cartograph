import { createHash } from "node:crypto";
import { MAX_SOURCE_BYTES, type FileFacts, type Neighbour } from "../ai/explain.ts";
import { EDGE_KINDS } from "../parser/types.ts";
import { createRunSupabase } from "../pipeline/db.ts";
import { fetchFileAt, parseRepoUrl, type Repo } from "../pipeline/github.ts";

// Datasets are built from analyses already stored, so every example is a file
// the parser really read, with the neighbours it really resolved. The secret
// key bypasses the policies, so every query names the organization, as the
// analysis run's do.

export type StoredFile = {
  analysisId: string;
  repo: Repo;
  commit: string;
  path: string;
  hash: string;
  lines: number;
  role: string | null;
  roleFromModel: boolean;
  imports: Neighbour[];
  importedBy: Neighbour[];
};

const PAGE = 1000;

export async function readStoredFiles(orgId: string): Promise<StoredFile[]> {
  const supabase = createRunSupabase();
  const { data: analyses, error } = await supabase
    .from("analyses")
    .select("id, commit_sha, project:projects!inner(repo_url)")
    .eq("org_id", orgId)
    .eq("status", "complete")
    .order("id")
    .limit(100);
  if (error) throw new Error(`Reading analyses failed: ${error.message}`);

  const out: StoredFile[] = [];
  for (const analysis of analyses) {
    if (analysis.commit_sha === null) continue;
    const repo = parseRepoUrl(analysis.project.repo_url);

    type FileRow = {
      id: string;
      path: string;
      hash: string | null;
      lines: number | null;
      role: string | null;
      role_from_model: boolean;
      skip_reason: string | null;
    };
    const files: FileRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("files")
        .select("id, path, hash, lines, role, role_from_model, skip_reason")
        .eq("org_id", orgId)
        .eq("analysis_id", analysis.id)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Reading files failed: ${error.message}`);
      files.push(...data);
      if (data.length < PAGE) break;
    }

    const pathOf = new Map(files.map((f) => [f.id, f.path]));
    const imports = new Map<string, Map<string, Set<string>>>();
    const importedBy = new Map<string, Map<string, Set<string>>>();
    const add = (side: Map<string, Map<string, Set<string>>>, path: string, other: string, kind: string) => {
      if (!side.has(path)) side.set(path, new Map());
      const byOther = side.get(path);
      if (!byOther?.has(other)) byOther?.set(other, new Set());
      byOther?.get(other)?.add(kind);
    };
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("edges")
        .select("from_file_id, to_file_id, kind")
        .eq("org_id", orgId)
        .eq("analysis_id", analysis.id)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Reading edges failed: ${error.message}`);
      for (const e of data) {
        const from = pathOf.get(e.from_file_id);
        const to = pathOf.get(e.to_file_id);
        if (from === undefined || to === undefined) throw new Error(`Edge ${e.from_file_id} → ${e.to_file_id} names a file not in its analysis.`);
        add(imports, from, to, e.kind);
        add(importedBy, to, from, e.kind);
      }
      if (data.length < PAGE) break;
    }

    // The same shape lib/explain.ts hands the model: distinct neighbours in
    // path order, each with its kinds in the parser's order.
    const listed = (side: Map<string, Set<string>> | undefined): Neighbour[] =>
      [...(side ?? [])]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([path, kinds]) => ({ path, kinds: EDGE_KINDS.filter((k) => kinds.has(k)) }));

    for (const f of files) {
      if (f.skip_reason !== null || f.hash === null || f.lines === null) continue;
      out.push({
        analysisId: analysis.id,
        repo,
        commit: analysis.commit_sha,
        path: f.path,
        hash: f.hash,
        lines: f.lines,
        role: f.role,
        roleFromModel: f.role_from_model,
        imports: listed(imports.get(f.path)),
        importedBy: listed(importedBy.get(f.path)),
      });
    }
  }
  return out;
}

/** A fixed order unrelated to path or role, so a sample is the same every time and not alphabetical. */
export function sampleOrder(a: StoredFile, b: StoredFile): number {
  const key = (f: StoredFile) => createHash("sha256").update(`${f.analysisId}:${f.path}`).digest("hex");
  const ka = key(a);
  const kb = key(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/** The file as the parser read it, or why it can't be an example. */
export async function loadSource(f: StoredFile): Promise<{ source: string } | { skipped: string }> {
  const bytes = await fetchFileAt(f.repo, f.commit, f.path);
  if (bytes === null) return { skipped: `GitHub has no ${f.path} at ${f.commit.slice(0, 7)}` };
  if (createHash("sha256").update(bytes).digest("hex") !== f.hash) {
    return { skipped: `GitHub's ${f.path} isn't what the parser hashed` };
  }
  if (bytes.length > MAX_SOURCE_BYTES) return { skipped: `${f.path} is over ${MAX_SOURCE_BYTES / 1024} KB` };
  return { source: bytes.toString("utf8") };
}

/** The facts as the app hands them over. A hidden role is handed over as none identified. */
export function factsOf(f: StoredFile, hideRole: boolean): FileFacts {
  return {
    repo: `${f.repo.owner}/${f.repo.name}`,
    commit: f.commit,
    path: f.path,
    hash: f.hash,
    lines: f.lines,
    role: hideRole || f.roleFromModel ? null : f.role,
    imports: f.imports,
    importedBy: f.importedBy,
  };
}
