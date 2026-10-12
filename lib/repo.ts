// Plain helpers for showing a repository row, usable from server and client.
// Nothing here may move into a "use client" file: a server component importing
// a value from one gets a client reference, not the value.

// One grid for header and rows, so columns line up without a table's
// auto-sizing shifting them when content changes. Commit and start time drop
// out on narrow screens; repository, state and finish are kept.
export const ANALYSIS_COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_8rem_7.5rem] md:grid-cols-[minmax(0,1fr)_8rem_4.5rem_7.5rem_7.5rem] gap-x-4 px-3";

export function splitRepo(url: string): { owner: string; name: string } {
  const [owner = "", name = ""] = url.replace(/^https:\/\/github\.com\//, "").split("/");
  return { owner, name };
}

// Fixed format and timezone, so the same row reads the same for everyone on
// the team regardless of where they are.
export function formatTime(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}
