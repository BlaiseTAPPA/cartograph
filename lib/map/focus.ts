import type { Endpoint, MapEdge } from "./view.ts";

/** What stays at full strength while something is selected. */
export type Focus = {
  /** Edge id to how it relates to the selection. */
  edges: Map<string, "in" | "out" | "within">;
  /** Nodes lit as a whole: the selection's own node if it's a folded node or panel, and folded neighbours. */
  nodes: Set<string>;
  /** Rows lit individually, keyed by node then slot. */
  rows: Set<string>;
};

export const rowKey = (node: string, slot: string) => `${node}\u0000${slot}`;

function touches(selected: Endpoint, end: Endpoint): boolean {
  if (end.node !== selected.node) return false;
  // A whole node or panel is selected: any of its rows counts.
  return selected.slot === null || end.slot === selected.slot;
}

/** Arithmetic over the visible edges; nothing is fetched. */
export function focusOn(selected: Endpoint, edges: MapEdge[]): Focus {
  const focus: Focus = { edges: new Map(), nodes: new Set(), rows: new Set() };
  const light = (e: Endpoint) => {
    if (e.slot === null) focus.nodes.add(e.node);
    else focus.rows.add(rowKey(e.node, e.slot));
  };
  if (selected.slot === null) focus.nodes.add(selected.node);
  else focus.rows.add(rowKey(selected.node, selected.slot));

  for (const e of edges) {
    const fromSelected = touches(selected, e.source);
    const toSelected = touches(selected, e.target);
    if (!fromSelected && !toSelected) continue;
    focus.edges.set(e.id, fromSelected && toSelected ? "within" : toSelected ? "in" : "out");
    light(e.source);
    light(e.target);
  }
  return focus;
}
