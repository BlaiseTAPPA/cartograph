"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { rerunAnalysis } from "../app/(workspace)/actions";
import type { AnalysisStatus, Progress } from "@/lib/progress";
import { STAGES } from "@/lib/progress";
import { useProgress } from "@/lib/supabase-browser";
import { StatusMark } from "./status-mark";

/**
 * The stages a run moves through, named as they happen. Subscribed for as long
 * as the page is open, so a re-run started here, or from another tab, shows up
 * without a reload.
 */
export function AnalysisProgress({
  analysisId,
  snapshot,
  staleAtRead,
}: {
  analysisId: string;
  snapshot: Progress;
  /** Unfinished and unmoved for minutes when the server read it. */
  staleAtRead: boolean;
}) {
  const progress = useProgress(analysisId, snapshot, true);
  // Anything published since the read means it is moving again.
  const stale = staleAtRead && progress.at === snapshot.at;
  const current = progress.stage === null ? -1 : STAGES.indexOf(progress.stage);

  // Completion arrives on the channel; the map is server-rendered from the
  // stored rows, so the page is rendered again rather than fetched here.
  const router = useRouter();
  const completedLive = progress.status === "complete" && snapshot.status !== "complete";
  useEffect(() => {
    if (completedLive) router.refresh();
  }, [completedLive, router]);

  return (
    <div className="flex flex-col gap-3 px-3 py-3 text-xs">
      <ol aria-label="Stages" className="flex flex-col">
        {STAGES.map((stage, i) => {
          const state = stageState(progress.status, i, current);
          return (
            <li key={stage} className="flex h-6 items-center gap-2">
              <StatusMark status={state} />
              <span className={`w-12 ${state === "queued" ? "text-muted" : ""}`}>{stage}</span>
              {i === current && progress.status === "parsing" && (
                <span className="min-w-0 truncate text-muted" title={progress.message ?? undefined}>
                  {progress.message}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <Outcome progress={progress} stale={stale} />

      {(progress.status === "complete" || progress.status === "failed" || stale) && (
        <RerunButton analysisId={analysisId} />
      )}
    </div>
  );
}

/** A stage is done, under way, waiting or where it stopped. */
function stageState(status: AnalysisStatus, index: number, current: number): AnalysisStatus {
  if (status === "complete") return "complete";
  if (status === "queued" || index > current) return "queued";
  if (index < current) return "complete";
  return status === "failed" ? "failed" : "parsing";
}

function Outcome({ progress, stale }: { progress: Progress; stale: boolean }) {
  if (stale) {
    return (
      <p role="status">
        Stale. No progress for over five minutes
        {progress.stage && <> during <span className="font-mono">{progress.stage}</span></>}; the run has
        stopped without finishing.
      </p>
    );
  }
  switch (progress.status) {
    case "queued":
      return <p className="text-muted">Queued.</p>;
    case "parsing":
      return null;
    case "complete":
      return <p role="status">Complete. {progress.message}</p>;
    case "failed":
      return (
        <p role="alert">
          Failed{progress.stage && <> during <span className="font-mono">{progress.stage}</span></>}.{" "}
          {progress.message}
        </p>
      );
  }
}

export function RerunButton({ analysisId }: { analysisId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(await rerunAnalysis(analysisId));
          })
        }
        className="h-7 rounded-sm border border-line bg-raised px-3 text-[11px] hover:border-accent disabled:opacity-60"
      >
        {pending ? "Re-queueing…" : "Run again"}
      </button>
      {error && (
        <span role="alert" className="text-[11px]">
          {error}
        </span>
      )}
    </div>
  );
}
