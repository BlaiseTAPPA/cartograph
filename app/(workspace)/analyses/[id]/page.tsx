import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getAnalysis, type AnalysisSummary } from "@/lib/analyses";
import { countByCategory } from "@/lib/categories";
import { splitRepo } from "@/lib/repo";
import { getStoredGraph } from "@/lib/stored-graph";
import { adapterNamed } from "@/parser/adapter";
import { AnalysisProgress, RerunButton } from "../../../../components/analysis-progress";
import { CategoryRail } from "../../../../components/category-rail";
import { DetailPane } from "../../../../components/detail-pane";
import { MapCanvas } from "../../../../components/map-canvas";
import { MapShell } from "../../../../components/map-shell";
import { MapStateProvider } from "../../../../components/map-state";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function AnalysisPage({ params }: PageProps<"/analyses/[id]">) {
  return (
    // The row is a request read; it streams inside the server HTML.
    <Suspense fallback={null}>
      <Analysis params={params} />
    </Suspense>
  );
}

async function Analysis({ params }: { params: PageProps<"/analyses/[id]">["params"] }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  // Another organization's analysis is absent from the query, not hidden
  // here: the policy makes it a 404 like one that never existed.
  const analysis = await getAnalysis(id);
  if (!analysis) notFound();

  const { owner, name } = splitRepo(analysis.repoUrl);
  // One address for an analysis: its progress while it runs, its map once
  // stored. Completion re-renders this page, which is how a run lands on its map.
  const complete = analysis.progress.status === "complete";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-3 text-xs">
        <h1 className="font-mono">
          <span className="text-muted">{owner}/</span>
          {name}
        </h1>
        {analysis.commitSha && (
          <span className="font-mono text-[11px] text-muted" title={analysis.commitSha}>
            {analysis.commitSha.slice(0, 7)}
          </span>
        )}
        {complete && (
          <div className="ml-auto">
            <RerunButton analysisId={analysis.id} />
          </div>
        )}
      </div>
      {complete ? (
        <StoredMap analysis={analysis} repo={`${owner}/${name}`} />
      ) : (
        <AnalysisProgress analysisId={analysis.id} snapshot={analysis.progress} staleAtRead={analysis.stale} />
      )}
    </div>
  );
}

async function StoredMap({ analysis, repo }: { analysis: AnalysisSummary; repo: string }) {
  const graph = await getStoredGraph(analysis.id);
  const counts = countByCategory(graph.files, adapterNamed(graph.adapter));
  const gitRef = analysis.commitSha?.slice(0, 7) ?? "";

  return (
    // Map and pane share one selection, so both sit inside the same state.
    <MapStateProvider files={graph.files} edges={graph.edges} adapterName={graph.adapter}>
      <MapShell
        rail={<CategoryRail title={repo} subtitle={gitRef} counts={counts} skipped={graph.coverage.files.skipped} />}
        detail={<DetailPane repo={repo} gitRef={gitRef} coverage={graph.coverage} />}
      >
        <MapCanvas />
      </MapShell>
    </MapStateProvider>
  );
}
