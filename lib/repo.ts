// Plain helpers for showing a repository row, usable from server and client.

export function splitRepo(url: string): { owner: string; name: string } {
  const [owner = "", name = ""] = url.replace(/^https:\/\/github\.com\//, "").split("/");
  return { owner, name };
}

// Fixed format and timezone, so the same row reads the same for everyone on
// the team regardless of where they are.
export function formatTime(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}
