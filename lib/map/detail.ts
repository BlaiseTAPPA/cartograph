// What the detail pane lists. Pure, over the file list and the edge list.

import type { Edge, EdgeKind } from "@/parser/types";
import type { MapFile, MapInputEdge } from "./view.ts";

export type Neighbours = { imports: string[]; importedBy: string[] };

const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Every file's distinct neighbours, built once. Kind is ignored, the same way
 * the parser counts fan-in and fan-out, so a list's length always equals the
 * count the parser gave that file.
 */
export function indexNeighbours(edges: readonly MapInputEdge[]): Map<string, Neighbours> {
  const imports = new Map<string, Set<string>>();
  const importedBy = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!imports.has(e.from)) imports.set(e.from, new Set());
    imports.get(e.from)?.add(e.to);
    if (!importedBy.has(e.to)) importedBy.set(e.to, new Set());
    importedBy.get(e.to)?.add(e.from);
  }
  const index = new Map<string, Neighbours>();
  for (const path of new Set([...imports.keys(), ...importedBy.keys()])) {
    index.set(path, {
      imports: [...(imports.get(path) ?? [])].sort(byPath),
      importedBy: [...(importedBy.get(path) ?? [])].sort(byPath),
    });
  }
  return index;
}

/**
 * How each file reaches each neighbour, keyed by edgeKey. A file can import
 * and require the same neighbour: one neighbour, two kinds, in the parser's
 * own kind order.
 */
export function indexEdgeKinds(edges: readonly Edge[], order: readonly EdgeKind[]): Map<string, EdgeKind[]> {
  const index = new Map<string, Set<EdgeKind>>();
  for (const e of edges) {
    const key = edgeKey(e.from, e.to);
    if (!index.has(key)) index.set(key, new Set());
    index.get(key)?.add(e.kind);
  }
  return new Map([...index].map(([key, kinds]) => [key, order.filter((k) => kinds.has(k))]));
}

export function edgeKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

/** Files something imports, most imported first. */
export function mostDependedOn<F extends MapFile>(files: readonly F[]): F[] {
  return files
    .filter((f) => f.fanIn > 0)
    .sort((a, b) => b.fanIn - a.fanIn || byPath(a.path, b.path));
}

/**
 * Files nothing imports: where reading starts. The ones that pull in the most
 * come first, since they show the most of the repository from one place.
 */
export function importedByNothing<F extends MapFile>(files: readonly F[]): F[] {
  return files
    .filter((f) => f.fanIn === 0)
    .sort((a, b) => b.fanOut - a.fanOut || byPath(a.path, b.path));
}
