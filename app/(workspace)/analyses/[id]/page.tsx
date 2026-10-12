import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getAnalysis, type AnalysisSummary } from "@/lib/analyses";
import { countByRole } from "@/lib/categories";
import { splitRepo } from "@/lib/repo";
import { countStoredRoutes, getStoredGraph, getStoredRoutes } from "@/lib/stored-graph";
import { RESULT_VERSION } from "@/parser/types";
import { AnalysisProgress, RerunButton } from "../../../../components/analysis-progress";
import { CategoryRail } from "../../../../components/category-rail";
import { CoverageBanner } from "../../../../components/coverage-banner";
import { DetailPane } from "../../../../components/detail-pane";
import { MapCanvas } from "../../../../components/map-canvas";
import { MapShell } from "../../../../components/map-shell";
import { MapStateProvider } from "../../../../components/map-state";
import { RouteTable } from "../../../../components/route-table";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type View = "map" | "routes";

export default function AnalysisPage({ params, searchParams }: PageProps<"/analyses/[id]">) {
  return (
    // The row is a request read; it streams inside the server HTML.
    <Suspense fallback={null}>
      <Analysis params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Analysis({
  params,
  searchParams,
}: {
  params: PageProps<"/analyses/[id]">["params"];
  searchParams: PageProps<"/analyses/[id]">["searchParams"];
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  // The view is in the address, so a route table can be linked to directly.
  const view: View = (await searchParams).view === "routes" ? "routes" : "map";

  // Another organization's analysis is absent from the query, not hidden
  // here: the policy makes it a 404 like one that never existed.
  const analysis = await getAnalysis(id);
  if (!analysis) notFound();

  const { owner, name } = splitRepo(analysis.repoUrl);
  // One address for an analysis: its progress while it runs, its map once
  // stored. Completion re-renders this page, which is how a run lands on its map.
  const complete = analysis.progress.status === "complete";
  // Stored before roles and routes were recorded. Its rows can't say what
  // its files are, and guessing now would be inventing it: it needs a re-run.
  const current = analysis.resultVersion === RESULT_VERSION;

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
        {complete && current && (
          <nav aria-label="View" className="ml-3 flex h-full items-stretch gap-3 text-[11px]">
            {(["map", "routes"] as const).map((v) => (
              <Link
                key={v}
                href={v === "map" ? `/analyses/${id}` : `/analyses/${id}?view=routes`}
                aria-current={v === view ? "page" : undefined}
                className="-mb-px flex items-center border-b border-transparent capitalize text-muted hover:text-fg aria-[current=page]:border-accent aria-[current=page]:text-fg"
              >
                {v}
              </Link>
            ))}
          </nav>
        )}
        {complete && (
          <div className="ml-auto">
            <RerunButton analysisId={analysis.id} />
          </div>
        )}
      </div>
      {!complete ? (
        <AnalysisProgress analysisId={analysis.id} snapshot={analysis.progress} staleAtRead={analysis.stale} />
      ) : !current ? (
        <div className="px-3 py-3 text-xs">
          <p>This analysis was stored before file roles and routes were recorded.</p>
          <p className="mt-1 text-[11px] text-muted">Run it again to see them; nothing is filled in after the fact.</p>
        </div>
      ) : view === "routes" ? (
        <StoredRoutes analysis={analysis} owner={owner} name={name} />
      ) : (
        <StoredMap analysis={analysis} repo={`${owner}/${name}`} />
      )}
    </div>
  );
}

async function StoredMap({ analysis, repo }: { analysis: AnalysisSummary; repo: string }) {
  const [graph, routes] = await Promise.all([getStoredGraph(analysis.id), countStoredRoutes(analysis.id)]);
  const counts = countByRole(graph.files, graph.framework);
  const gitRef = analysis.commitSha?.slice(0, 7) ?? "";

  return (
    // Map and pane share one selection, so both sit inside the same state.
    <MapStateProvider files={graph.files} edges={graph.edges} framework={graph.framework}>
      <MapShell
        rail={<CategoryRail title={repo} subtitle={gitRef} counts={counts} skipped={graph.coverage.files.skipped} />}
        detail={<DetailPane repo={repo} gitRef={gitRef} coverage={graph.coverage} routes={routes} />}
        banner={<CoverageBanner coverage={graph.coverage} />}
      >
        <MapCanvas />
      </MapShell>
    </MapStateProvider>
  );
}

async function StoredRoutes({ analysis, owner, name }: { analysis: AnalysisSummary; owner: string; name: string }) {
  const { framework, routes, gaps } = await getStoredRoutes(analysis.id);
  const source = analysis.commitSha === null ? null : { owner, name, commitSha: analysis.commitSha };
  return <RouteTable framework={framework} routes={routes} gaps={gaps} source={source} />;
}
