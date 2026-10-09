import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { countAnalysesByStatus, listAnalyses, type AnalysisSummary } from "@/lib/analyses";
import type { AnalysisStatus } from "@/lib/progress";
import { AnalyseForm } from "../../components/analyse-form";
import { ANALYSIS_COLUMNS, AnalysisRow } from "../../components/analysis-row";
import { StatusMark } from "../../components/status-mark";

export default function WorkspacePage() {
  return (
    // Auth is a request read; it streams inside the server HTML rather than
    // waiting for the client to hydrate.
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  // Everything here comes off the verified session token. No call to Clerk.
  const { orgId, sessionClaims } = await auth();

  if (!orgId) {
    return <p className="px-3 py-2 text-xs text-muted">No active organization.</p>;
  }

  const orgName = sessionClaims?.org_name;
  if (!orgName) {
    throw new Error(
      'The session token has no org_name claim. Add {"org_name": "{{org.name}}"} under Clerk Dashboard → Sessions → Customize session token.',
    );
  }

  const [analyses, counts] = await Promise.all([listAnalyses(), countAnalysesByStatus()]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-3 text-xs">
        <h1 className="font-medium">{orgName}</h1>
        <span className="font-mono text-[11px] text-muted">{orgId}</span>
      </div>
      <AnalyseForm />
      <Summary counts={counts} />
      {analyses.length === 0 ? <EmptyState /> : <AnalysisList analyses={analyses} />}
    </div>
  );
}

// The order a run moves through, ending in either outcome.
const STATUS_ORDER: AnalysisStatus[] = ["queued", "parsing", "complete", "failed"];

// All four states always shown, zeros included, so each count sits in the
// same place whichever organization is open.
function Summary({ counts }: { counts: Record<AnalysisStatus, number> }) {
  const total = STATUS_ORDER.reduce((sum, status) => sum + counts[status], 0);
  return (
    <dl className="flex h-8 shrink-0 flex-wrap items-center gap-x-5 border-b border-line px-3 text-xs tabular-nums">
      <div className="flex items-baseline gap-1.5">
        <dt className="text-muted">Total</dt>
        <dd className="font-medium">{total}</dd>
      </div>
      {STATUS_ORDER.map((status) => (
        <div
          key={status}
          className={`flex items-center gap-1.5 ${counts[status] === 0 ? "text-muted" : ""}`}
        >
          <dt className="flex items-center gap-1.5">
            <StatusMark status={status} />
            <span className="text-muted">{status}</span>
          </dt>
          <dd>{counts[status]}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyState() {
  return (
    <div className="px-3 py-6 text-xs">
      <p>No analyses yet.</p>
      <p className="mt-1 text-muted">
        Repositories mapped by anyone in this organization are listed here.
      </p>
    </div>
  );
}

function AnalysisList({ analyses }: { analyses: AnalysisSummary[] }) {
  return (
    <div role="table" aria-label="Analyses" className="min-h-0 flex-1 overflow-y-auto text-xs">
      <div
        role="row"
        className={`${ANALYSIS_COLUMNS} sticky top-0 border-b border-line bg-surface py-1 text-[11px] text-muted`}
      >
        <span role="columnheader">Repository</span>
        <span role="columnheader">State</span>
        <span role="columnheader" className="hidden md:block">
          Commit
        </span>
        <span role="columnheader" className="hidden md:block">
          Started, UTC
        </span>
        <span role="columnheader">Finished, UTC</span>
      </div>
      <ul role="rowgroup">
        {analyses.map((analysis) => (
          <AnalysisRow key={analysis.id} analysis={analysis} />
        ))}
      </ul>
    </div>
  );
}
