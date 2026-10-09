import type { Edge } from "./types.ts";

export function dedupeEdges(edges: readonly Edge[]): Edge[] {
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const edge of edges) {
    const key = `${edge.from}\0${edge.to}\0${edge.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(edge);
  }
  return out;
}

/**
 * Fan-in is how many distinct files point at a file; fan-out how many distinct
 * files it points at. Kind is ignored: importing and re-exporting the same file
 * is still one neighbour.
 */
export function fanCounts(
  paths: readonly string[],
  edges: readonly Edge[],
): Map<string, { fanIn: number; fanOut: number }> {
  const pairs = new Set<string>();
  const counts = new Map(paths.map((p) => [p, { fanIn: 0, fanOut: 0 }]));
  for (const edge of edges) {
    const key = `${edge.from}\0${edge.to}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    const from = counts.get(edge.from);
    const to = counts.get(edge.to);
    if (from) from.fanOut += 1;
    if (to) to.fanIn += 1;
  }
  return counts;
}
