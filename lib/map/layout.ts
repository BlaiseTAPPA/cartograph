import dagre, { type EdgeLabel, type GraphLabel, type NodeLabel } from "@dagrejs/dagre";
import type { MapView } from "./view.ts";

export type Placed = { x: number; y: number; width: number; height: number };

/**
 * Top-left positions for every node. Importers sit left of what they import.
 * Nodes and edges go in sorted, so the same view always lays out the same.
 */
export function layoutView(view: MapView): Map<string, Placed> {
  const g = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>();
  g.setGraph({ rankdir: "LR", nodesep: 14, ranksep: 64, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));

  const nodes = [...view.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height });

  // Node-level only: rows inside a panel don't change where the panel goes.
  const pairs = new Set<string>();
  for (const e of view.edges) {
    if (e.source.node === e.target.node) continue;
    const pair = `${e.source.node}\u0000${e.target.node}`;
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    g.setEdge(e.source.node, e.target.node);
  }

  dagre.layout(g);

  const placed = new Map<string, Placed>();
  for (const n of nodes) {
    const { x, y } = g.node(n.id);
    if (x === undefined || y === undefined) throw new Error(`Layout placed no position for ${n.id}`);
    placed.set(n.id, { x: x - n.width / 2, y: y - n.height / 2, width: n.width, height: n.height });
  }
  return placed;
}
