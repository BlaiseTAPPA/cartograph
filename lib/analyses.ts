import type { Database } from "./database.types";
import { createServerSupabase } from "./supabase";

export type AnalysisStatus = Database["public"]["Enums"]["analysis_status"];

export type AnalysisSummary = {
  id: string;
  repoUrl: string;
  status: AnalysisStatus;
  commitSha: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

// No organization filter in this file, on purpose. The policy on analyses
// reads the organization off the token, so the same queries return a
// different set of rows when the active organization changes. A row from
// another organization showing up here is a policy bug, not something to
// patch with a where clause.

export async function listAnalyses(): Promise<AnalysisSummary[]> {
  const { data, error } = await createServerSupabase()
    .from("analyses")
    .select("id, status, commit_sha, error, created_at, finished_at, project:projects!inner(repo_url)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Reading analyses failed: ${error.message}`);

  return data.map((row) => ({
    id: row.id,
    repoUrl: row.project.repo_url,
    status: row.status,
    commitSha: row.commit_sha,
    error: row.error,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  }));
}

// Counted in the database rather than from the listed rows, which stop at
// 100: a total that silently caps is worse than none.
export async function countAnalysesByStatus(): Promise<Record<AnalysisStatus, number>> {
  const supabase = createServerSupabase();

  async function count(status: AnalysisStatus): Promise<number> {
    const { count, error } = await supabase
      .from("analyses")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    if (error || count === null) {
      throw new Error(`Counting ${status} analyses failed: ${error?.message ?? "no count returned"}`);
    }
    return count;
  }

  const [queued, parsing, complete, failed] = await Promise.all([
    count("queued"),
    count("parsing"),
    count("complete"),
    count("failed"),
  ]);
  return { queued, parsing, complete, failed };
}
