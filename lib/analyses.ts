import { isStale, type AnalysisStatus, type Progress } from "./progress";
import { createServerSupabase } from "./supabase";

export type { AnalysisStatus };

export type AnalysisSummary = {
  id: string;
  repoUrl: string;
  commitSha: string | null;
  createdAt: string;
  finishedAt: string | null;
  /** The same snapshot the progress channel publishes, as of this read. */
  progress: Progress;
  /** Unfinished and unmoved for minutes, judged at the moment of the read. */
  stale: boolean;
};

// No organization filter in this file, on purpose. The policy on analyses
// reads the organization off the token, so the same queries return a
// different set of rows when the active organization changes. A row from
// another organization showing up here is a policy bug, not something to
// patch with a where clause.

const SUMMARY_COLUMNS =
  "id, status, stage, stage_message, stage_changed_at, commit_sha, error, created_at, finished_at, project:projects!inner(repo_url)";

type SummaryRow = {
  id: string;
  status: AnalysisStatus;
  stage: Progress["stage"];
  stage_message: string | null;
  stage_changed_at: string | null;
  commit_sha: string | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  project: { repo_url: string };
};

function toSummary(row: SummaryRow, readAt: number): AnalysisSummary {
  const at = row.stage_changed_at ?? row.created_at;
  return {
    id: row.id,
    repoUrl: row.project.repo_url,
    commitSha: row.commit_sha,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    // Built the way the trigger builds its payload, so a read and a
    // broadcast are interchangeable and the newer one simply wins.
    progress: {
      status: row.status,
      stage: row.stage,
      message: row.status === "failed" ? row.error : row.stage_message,
      at,
    },
    stale: isStale(row.status, at, readAt),
  };
}

export async function listAnalyses(): Promise<AnalysisSummary[]> {
  const { data, error } = await createServerSupabase()
    .from("analyses")
    .select(SUMMARY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Reading analyses failed: ${error.message}`);
  const readAt = Date.now();
  return data.map((row) => toSummary(row, readAt));
}

/** Null when there is no such analysis or the policy hides it. */
export async function getAnalysis(id: string): Promise<AnalysisSummary | null> {
  const { data, error } = await createServerSupabase()
    .from("analyses")
    .select(SUMMARY_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Reading the analysis failed: ${error.message}`);
  return data && toSummary(data, Date.now());
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
