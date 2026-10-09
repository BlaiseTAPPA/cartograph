import type { AnalysisStatus } from "@/lib/progress";

// State is told apart by shape, not hue: colour in this app is reserved for
// edge direction and file kind, and four status colours would compete with
// them once the map exists. Filled means done, half means under way, hollow
// means waiting, crossed means it stopped.
export function StatusMark({ status }: { status: AnalysisStatus }) {
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
