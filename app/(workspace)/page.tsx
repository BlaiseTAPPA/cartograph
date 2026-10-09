import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import {
  countAnalysesByStatus,
  listAnalyses,
  type AnalysisStatus,
  type AnalysisSummary,
} from "@/lib/analyses";

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

// One grid for header and rows, so columns line up without a table's
// auto-sizing shifting them when content changes. Commit and start time drop
// out on narrow screens; repository, state and finish are kept.
const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_6rem_7.5rem] md:grid-cols-[minmax(0,1fr)_6rem_4.5rem_7.5rem_7.5rem] gap-x-4 px-3";

function AnalysisList({ analyses }: { analyses: AnalysisSummary[] }) {
  return (
    <div role="table" aria-label="Analyses" className="min-h-0 flex-1 overflow-y-auto text-xs">
      <div
        role="row"
        className={`${COLUMNS} sticky top-0 border-b border-line bg-surface py-1 text-[11px] text-muted`}
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

function AnalysisRow({ analysis }: { analysis: AnalysisSummary }) {
  const { owner, name } = splitRepo(analysis.repoUrl);
  return (
    <li role="row" className={`${COLUMNS} items-baseline border-b border-line py-1.5`}>
      <span role="cell" className="min-w-0">
        <span className="block truncate font-mono" title={analysis.repoUrl}>
          <span className="text-muted">{owner}/</span>
          {name}
        </span>
        {analysis.error && (
          <span className="mt-0.5 block text-[11px] text-muted">{analysis.error}</span>
        )}
      </span>
      <span role="cell" className="flex items-center gap-1.5 self-start pt-px">
        <StatusMark status={analysis.status} />
        <span className={analysis.status === "complete" ? "" : "text-muted"}>
          {analysis.status}
        </span>
      </span>
      <span role="cell" className="hidden font-mono text-[11px] text-muted md:block">
        {analysis.commitSha?.slice(0, 7)}
      </span>
      <span role="cell" className="hidden font-mono text-[11px] text-muted md:block">
        {formatTime(analysis.createdAt)}
      </span>
      <span role="cell" className="font-mono text-[11px] text-muted">
        {analysis.finishedAt && formatTime(analysis.finishedAt)}
      </span>
    </li>
  );
}

// State is told apart by shape, not hue: colour in this app is reserved for
// edge direction and file kind, and four status colours would compete with
// them once the map exists. Filled means done, half means under way, hollow
// means waiting, crossed means it stopped.
function StatusMark({ status }: { status: AnalysisStatus }) {
  return (
    <svg viewBox="0 0 10 10" className="size-2.5 shrink-0 text-fg" aria-hidden="true">
      {status === "complete" && <circle cx="5" cy="5" r="4" fill="currentColor" />}
      {status === "parsing" && (
        <>
          <circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" />
          <path d="M5 1.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" />
        </>
      )}
      {status === "queued" && (
        <circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" className="opacity-60" />
      )}
      {status === "failed" && (
        <>
          <circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" />
          <path d="M3.3 3.3l3.4 3.4M6.7 3.3l-3.4 3.4" stroke="currentColor" />
        </>
      )}
    </svg>
  );
}

function splitRepo(url: string): { owner: string; name: string } {
  const [owner = "", name = ""] = url.replace(/^https:\/\/github\.com\//, "").split("/");
  return { owner, name };
}

// Fixed format and timezone, so the same row reads the same for everyone on
// the team regardless of where they are.
function formatTime(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}
