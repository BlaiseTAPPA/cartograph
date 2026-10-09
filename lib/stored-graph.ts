import { fanCounts } from "@/parser/graph";
import { readCoverage } from "@/parser/output";
import { EDGE_KINDS, SKIP_REASONS, type Coverage, type Edge, type RepoFile } from "@/parser/types";
import { createServerSupabase } from "./supabase";

export type StoredGraph = {
  files: RepoFile[];
  edges: Edge[];
  coverage: Coverage;
  adapter: string;
};

// PostgREST caps a response at 1000 rows. Pages are read until one comes back
// short, ordered by id so no row is skipped or read twice between pages.
const PAGE = 1000;

/**
 * A completed analysis read back into the shapes the parser wrote, so
 * everything built against parser output draws stored rows unchanged. No
 * organization filter: the policies decide which analysis is readable.
 * Anything stored that doesn't match the contract throws rather than drawing
 * a partial graph.
 */
export async function getStoredGraph(analysisId: string): Promise<StoredGraph> {
  const supabase = createServerSupabase();

  const { data: analysis, error } = await supabase
    .from("analyses")
    .select("status, coverage, adapter")
    .eq("id", analysisId)
    .single();
  if (error) throw new Error(`Reading the analysis failed: ${error.message}`);
  if (analysis.status !== "complete" || analysis.coverage === null || analysis.adapter === null) {
    throw new Error(`Analysis ${analysisId} has no stored graph: it is ${analysis.status}.`);
  }

  type FileRow = { id: string; path: string; module: string; skip_reason: string | null; lines: number | null; hash: string | null };
  const fileRows: FileRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("files")
      .select("id, path, module, skip_reason, lines, hash")
      .eq("analysis_id", analysisId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Reading files failed: ${error.message}`);
    fileRows.push(...data);
    if (data.length < PAGE) break;
  }

  const pathById = new Map(fileRows.map((f) => [f.id, f.path]));
  const edges: Edge[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("edges")
      .select("from_file_id, to_file_id, kind")
      .eq("analysis_id", analysisId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Reading edges failed: ${error.message}`);
    for (const row of data) {
      const fromPath = pathById.get(row.from_file_id);
      const toPath = pathById.get(row.to_file_id);
      const kind = EDGE_KINDS.find((k) => k === row.kind);
      if (!fromPath || !toPath) throw new Error(`Stored edge ${row.from_file_id} → ${row.to_file_id} names a file that wasn't read.`);
      if (!kind) throw new Error(`Stored edge has kind "${row.kind}", which the parser never writes.`);
      edges.push({ from: fromPath, to: toPath, kind });
    }
    if (data.length < PAGE) break;
  }

  // Fan counts are arithmetic over the edge list, so they're recomputed rather
  // than stored where they could disagree with it.
  const fan = fanCounts(
    fileRows.filter((f) => f.skip_reason === null).map((f) => f.path),
    edges,
  );
  const files: RepoFile[] = fileRows
    .map((f): RepoFile => {
      if (f.skip_reason !== null) {
        const reason = SKIP_REASONS.find((r) => r === f.skip_reason);
        if (!reason) throw new Error(`${f.path} is stored as skipped for "${f.skip_reason}", which isn't a skip reason.`);
        return { status: "skipped", path: f.path, module: f.module, reason };
      }
      if (f.lines === null || f.hash === null) throw new Error(`${f.path} is stored as parsed without its line count or hash.`);
      const counts = fan.get(f.path) ?? { fanIn: 0, fanOut: 0 };
      return { status: "parsed", path: f.path, module: f.module, lines: f.lines, hash: f.hash, ...counts };
    })
    // A stable order, so the map lays out the same on every load.
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const coverage = readCoverage(analysis.coverage);
  if (coverage.files.found !== files.length) {
    throw new Error(`Coverage counts ${coverage.files.found} files but ${files.length} are stored.`);
  }
  return { files, edges, coverage, adapter: analysis.adapter };
}
