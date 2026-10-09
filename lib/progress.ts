import type { Database } from "./database.types";

// What the progress channel carries, and the rules for reading it. Plain
// TypeScript with no server imports: the browser, the server and the run all
// read the same definitions.

export type AnalysisStatus = Database["public"]["Enums"]["analysis_status"];
export type Stage = Database["public"]["Enums"]["analysis_stage"];

/** The order a run moves through. */
export const STAGES: readonly Stage[] = ["fetch", "select", "parse", "store"];

// Nothing here has a queue or a timeout, so a process that stops mid-run
// leaves its row unfinished forever. An unfinished run whose progress hasn't
// moved for this long is treated as abandoned.
export const STALE_AFTER_MS = 5 * 60 * 1000;

/** One published progress event, exactly as the database trigger builds it. */
export type Progress = {
  status: AnalysisStatus;
  stage: Stage | null;
  /** The stage's message, or the error once failed. */
  message: string | null;
  /** When it moved, from the database's clock. */
  at: string | null;
};

const STATUSES: readonly AnalysisStatus[] = ["queued", "parsing", "complete", "failed"];

/** Checks a received payload. Anything off is dropped rather than shown half-read. */
export function parseProgress(value: unknown): Progress | null {
  if (typeof value !== "object" || value === null) return null;
  const v: { [key: string]: unknown } = { ...value };
  const status = STATUSES.find((s) => s === v.status);
  const stage = v.stage === null ? null : STAGES.find((s) => s === v.stage);
  if (!status || stage === undefined) return null;
  if (v.message !== null && typeof v.message !== "string") return null;
  if (v.at !== null && typeof v.at !== "string") return null;
  return { status, stage, message: v.message, at: v.at };
}

/** Whichever of two snapshots the database wrote last. */
export function newer(a: Progress, b: Progress | null): Progress {
  if (!b || b.at === null) return a;
  if (a.at === null) return b;
  return Date.parse(b.at) > Date.parse(a.at) ? b : a;
}

export function isUnfinished(status: AnalysisStatus): boolean {
  return status === "queued" || status === "parsing";
}

/** `at` is the last progress, or creation for a run that never started. */
export function isStale(status: AnalysisStatus, at: string, now: number): boolean {
  return isUnfinished(status) && now - Date.parse(at) > STALE_AFTER_MS;
}
