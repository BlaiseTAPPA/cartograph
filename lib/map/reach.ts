import type { Neighbours } from "./detail.ts";

/**
 * "dependents" walks edges backwards: everything that may break if the start
 * file changes (blast radius). "dependencies" walks them forwards: everything
 * the start file needs (dependency chain).
 */
export type Direction = "dependents" | "dependencies";

/** Two steps out. Deeper returns most of a repository and stops being an answer. */
export const DEFAULT_DEPTH = 2;

export type Reached = { path: string; depth: number };

/**
 * Breadth-first from `start`, each file at the fewest steps that reach it.
 * The start file itself is not included. Sorted by depth, then path.
 */
export function walk(
  index: ReadonlyMap<string, Neighbours>,
  start: string,
  direction: Direction,
  maxDepth: number = DEFAULT_DEPTH,
): Reached[] {
  const next = (path: string) => {
    const n = index.get(path);
    if (!n) return [];
    return direction === "dependents" ? n.importedBy : n.imports;
  };
  const seen = new Set([start]);
  const reached: Reached[] = [];
  let frontier = [start];
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const following: string[] = [];
    for (const path of frontier) {
      for (const n of next(path)) {
        if (seen.has(n)) continue;
        seen.add(n);
        following.push(n);
        reached.push({ path: n, depth });
      }
    }
    frontier = following;
  }
  return reached.sort((a, b) => a.depth - b.depth || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
