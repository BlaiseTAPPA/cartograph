"use client";

import Link from "next/link";
import type { AnalysisSummary } from "@/lib/analyses";
import { isUnfinished } from "@/lib/progress";
import { formatTime, splitRepo } from "@/lib/repo";
import { useProgress } from "@/lib/supabase-browser";
import { StatusMark } from "./status-mark";

// One grid for header and rows, so columns line up without a table's
// auto-sizing shifting them when content changes. Commit and start time drop
// out on narrow screens; repository, state and finish are kept.
export const ANALYSIS_COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_8rem_7.5rem] md:grid-cols-[minmax(0,1fr)_8rem_4.5rem_7.5rem_7.5rem] gap-x-4 px-3";

/**
 * A row follows its run live while it is unfinished, so a second tab shows
 * the stage moving without a refresh. Finished rows don't subscribe.
 */
export function AnalysisRow({ analysis }: { analysis: AnalysisSummary }) {
  const snapshot = analysis.progress;
  const progress = useProgress(analysis.id, snapshot, isUnfinished(snapshot.status));
  // Stale as of the read; anything published since means it is moving again.
  const stale = analysis.stale && progress.at === snapshot.at;
  const { owner, name } = splitRepo(analysis.repoUrl);
  // The finish time is the moment the status moved to an outcome, which the
  // channel carries; the read's own value is used until then.
  const finishedAt =
    progress === snapshot ? analysis.finishedAt : isUnfinished(progress.status) ? null : progress.at;

  return (
    <li role="row" className={`${ANALYSIS_COLUMNS} relative items-baseline border-b border-line py-1.5 hover:bg-raised`}>
      <span role="cell" className="min-w-0">
        <Link
          href={`/analyses/${analysis.id}`}
          className="block truncate font-mono after:absolute after:inset-0"
          title={analysis.repoUrl}
        >
          <span className="text-muted">{owner}/</span>
          {name}
        </Link>
        {progress.status === "failed" && progress.message && (
          <span className="mt-0.5 block text-[11px] text-muted">{progress.message}</span>
        )}
      </span>
      <span role="cell" className="flex items-center gap-1.5 self-start pt-px">
        <StatusMark status={progress.status} />
        <span className={progress.status === "complete" ? "" : "text-muted"}>
          {stale ? "stale" : progress.status}
        </span>
        {progress.status === "parsing" && progress.stage && (
          <span className="font-mono text-[11px] text-muted">{progress.stage}</span>
        )}
      </span>
      <span role="cell" className="hidden font-mono text-[11px] text-muted md:block">
        {analysis.commitSha?.slice(0, 7)}
      </span>
      <span role="cell" className="hidden font-mono text-[11px] text-muted md:block">
        {formatTime(analysis.createdAt)}
      </span>
      <span role="cell" className="font-mono text-[11px] text-muted">
        {finishedAt && formatTime(finishedAt)}
      </span>
    </li>
  );
}
