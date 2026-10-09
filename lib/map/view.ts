// What's on the canvas for a given folding and set of open folders. Pure, over
// the folding and the edge list. Nothing here is drawn; sizes are estimated
// from text length so layout never waits on the DOM.

import type { FoldedGroup } from "./fold.ts";
import { shortestUniqueLabels } from "./labels.ts";

export type MapFile = { path: string; fanIn: number; fanOut: number };
export type MapInputEdge = { from: string; to: string };

/** The slot standing in for every row outside an open panel's window. */
export const MORE_SLOT = "\u0000more";

/** Where an edge ends: a folded node (slot null) or one row of an open panel. */
export type Endpoint = { node: string; slot: string | null };

export type Row = { path: string; label: string; fanIn: number; fanOut: number };

type NodeBase = {
  id: string;
  label: string;
  files: number;
  /** Distinct files outside this folder that import something inside it. */
  fanIn: number;
  /** Distinct files outside this folder that something inside it imports. */
  fanOut: number;
  width: number;
  height: number;
};

export type FoldedNode = NodeBase & { kind: "folded" };
export type PanelNode = NodeBase & {
  kind: "panel";
  /** The rows in the window, in order. */
  rows: Row[];
  /** Index of the first row in the window, within the whole ordered list. */
  offset: number;
  /** Rows outside the window, above and below it together. */
  hidden: number;
};
export type MapNode = FoldedNode | PanelNode;

export type MapEdge = {
  id: string;
  source: Endpoint;
  target: Endpoint;
  /** How many file-to-file edges this line stands for. */
  count: number;
};

export type MapView = {
  nodes: MapNode[];
  edges: MapEdge[];
  /** Where each parsed file is drawn right now. */
  endpointOf: ReadonlyMap<string, Endpoint>;
};

export const endpointKey = (e: Endpoint) => `${e.node}\u0000${e.slot ?? ""}`;

/**
 * A panel's row order: most depended-on first, so what's cut off behind
 * "more" is the least depended-on. Path breaks ties so the order never varies.
 */
export function orderRows(paths: readonly string[], fanInOf: (path: string) => number): string[] {
  return [...paths].sort((a, b) => {
    const d = fanInOf(b) - fanInOf(a);
    return d !== 0 ? d : a < b ? -1 : a > b ? 1 : 0;
  });
}

// Geist Mono advances 0.6em; the map's text is 11px.
export const CHAR_WIDTH = 6.6;
export const ROW_HEIGHT = 20;
export const PANEL_HEADER_HEIGHT = 38;
export const MAX_ROWS = 14;
const FOLDED_MIN_HEIGHT = 28;
const FOLDED_EXTRA_HEIGHT = 64;
const PANEL_MAX_WIDTH = 340;

const text = (chars: number) => Math.ceil(chars * CHAR_WIDTH);

// The fan counts as drawn, "←6 4→", measured for width.
const fanText = (fanIn: number, fanOut: number) => `←${fanIn} ${fanOut}→`;

/** Folder-level fan-in and fan-out, counted once per folding. */
export function folderFans(groups: FoldedGroup[], edges: MapInputEdge[]) {
  const groupOf = new Map<string, string>();
  for (const g of groups) for (const f of g.files) groupOf.set(f, g.dir);
  const into = new Map<string, Set<string>>();
  const outOf = new Map<string, Set<string>>();
  for (const e of edges) {
    const from = groupOf.get(e.from);
    const to = groupOf.get(e.to);
    if (from === undefined || to === undefined || from === to) continue;
    if (!into.has(to)) into.set(to, new Set());
    into.get(to)?.add(e.from);
    if (!outOf.has(from)) outOf.set(from, new Set());
    outOf.get(from)?.add(e.to);
  }
  return new Map(
    groups.map((g) => [g.dir, { fanIn: into.get(g.dir)?.size ?? 0, fanOut: outOf.get(g.dir)?.size ?? 0 }]),
  );
}

/** How many rows a panel shows at once when it can't show them all. */
export const WINDOW_ROWS = MAX_ROWS - 1;

/** Keeps a window offset inside the list. */
export function clampOffset(offset: number, total: number): number {
  return total > MAX_ROWS ? Math.max(0, Math.min(offset, total - WINDOW_ROWS)) : 0;
}

/**
 * `offsets` is where each open panel's window starts. A panel's height never
 * depends on it, so scrolling a panel never moves anything else.
 */
export function buildView(
  groups: FoldedGroup[],
  files: MapFile[],
  edges: MapInputEdge[],
  fans: Map<string, { fanIn: number; fanOut: number }>,
  open: ReadonlySet<string>,
  offsets: ReadonlyMap<string, number>,
): MapView {
  const fileInfo = new Map(files.map((f) => [f.path, f]));
  const groupLabels = shortestUniqueLabels(groups.map((g) => g.dir));
  // Height is scaled against the busiest folder in the whole folding, not just
  // what's folded right now, so opening one folder never resizes the others.
  const maxFanIn = Math.max(1, ...[...fans.values()].map((f) => f.fanIn));

  // Which endpoint each file is drawn at right now.
  const endpointOf = new Map<string, Endpoint>();
  const nodes: MapNode[] = groups.map((g) => {
    const label = groupLabels.get(g.dir) ?? g.dir;
    const { fanIn, fanOut } = fans.get(g.dir) ?? { fanIn: 0, fanOut: 0 };
    const base = { id: g.dir, label, files: g.files.length, fanIn, fanOut };

    if (!open.has(g.dir)) {
      for (const f of g.files) endpointOf.set(f, { node: g.dir, slot: null });
      return {
        ...base,
        kind: "folded",
        // Room for "matched/total" when a rail category is picked.
        width: 22 + text(label.length + 2 + 2 * String(g.files.length).length),
        height: Math.round(FOLDED_MIN_HEIGHT + FOLDED_EXTRA_HEIGHT * Math.sqrt(fanIn / maxFanIn)),
      };
    }

    const ordered = orderRows(g.files, (p) => fileInfo.get(p)?.fanIn ?? 0);
    // Rows overflow into "more" only when there's more than one to hide; a
    // single hidden row would take the same space as showing it.
    const offset = clampOffset(offsets.get(g.dir) ?? 0, ordered.length);
    const shown = ordered.length > MAX_ROWS ? ordered.slice(offset, offset + WINDOW_ROWS) : ordered;
    const hidden = ordered.length - shown.length;
    const inWindow = new Set(shown);
    // Unique within the panel: the header carries the rest of the path.
    const rowLabels = shortestUniqueLabels(g.files);
    const rows: Row[] = shown.map((path) => ({
      path,
      label: rowLabels.get(path) ?? path,
      fanIn: fileInfo.get(path)?.fanIn ?? 0,
      fanOut: fileInfo.get(path)?.fanOut ?? 0,
    }));
    for (const r of rows) endpointOf.set(r.path, { node: g.dir, slot: r.path });
    for (const path of ordered) {
      if (!inWindow.has(path)) endpointOf.set(path, { node: g.dir, slot: MORE_SLOT });
    }

    const headerChars = Math.max(
      label.length + 2 + `${g.files.length} files`.length,
      // Second line, with room for "N matched" when a rail category is picked.
      fanText(fanIn, fanOut).length + 2 + `${g.files.length} matched`.length,
    );
    // Width from every row, not just the window, so scrolling never resizes it.
    const rowChars = Math.max(
      0,
      ...ordered.map(
        (path) =>
          (rowLabels.get(path) ?? path).length +
          1 +
          fanText(fileInfo.get(path)?.fanIn ?? 0, fileInfo.get(path)?.fanOut ?? 0).length,
      ),
    );
    return {
      ...base,
      kind: "panel",
      rows,
      offset,
      hidden,
      width: Math.min(PANEL_MAX_WIDTH, 32 + text(Math.max(headerChars, rowChars))),
      height: PANEL_HEADER_HEIGHT + ROW_HEIGHT * (rows.length + (hidden > 0 ? 1 : 0)) + 4,
    };
  });

  const key = endpointKey;
  const merged = new Map<string, MapEdge>();
  for (const e of edges) {
    const source = endpointOf.get(e.from);
    const target = endpointOf.get(e.to);
    if (!source || !target) continue;
    // Both ends inside one folded node, or both behind the same "more": there
    // is no line to draw between a thing and itself.
    if (key(source) === key(target)) continue;
    const id = `${key(source)}\u0001${key(target)}`;
    const existing = merged.get(id);
    if (existing) existing.count += 1;
    else merged.set(id, { id, source, target, count: 1 });
  }

  return {
    nodes,
    edges: [...merged.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    endpointOf,
  };
}
