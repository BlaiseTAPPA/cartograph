"use client";

import "@xyflow/react/dist/base.css";
import {
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getViewportForBounds,
  useReactFlow,
  useStore,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { focusOn, rowKey, type Focus } from "@/lib/map/focus";
import { layoutView } from "@/lib/map/layout";
import {
  MORE_SLOT,
  PANEL_HEADER_HEIGHT,
  ROW_HEIGHT,
  type Endpoint,
  type FoldedNode,
  type PanelNode,
  WINDOW_ROWS,
} from "@/lib/map/view";
import { kindColour, SWATCH } from "./category-rail";
import { useMapState } from "./map-state";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 1.5;
const FIT_PADDING = 0.06;
const DIM = 0.2;

// Hovering a file in the detail pane outlines where it is on the map.
const HOVER_RING = "outline outline-1 -outline-offset-1 outline-accent";

/**
 * With a rail category picked, how many of a node's files are in it. null when
 * nothing is picked. `hidden` counts the matches behind a panel's window.
 */
type Matched = { files: number; hidden: number } | null;
type Shared = { focus: Focus | null; matched: Matched };
type FoldedFlowNode = FlowNode<{ view: FoldedNode } & Shared, "folded">;
type PanelFlowNode = FlowNode<{ view: PanelNode } & Shared, "panel">;

// Handle ids by row position, not path: paths can hold characters that don't
// belong in a DOM attribute.
const rowHandle = (side: "in" | "out" | "inr", index: number | "more") => `${side}:${index}`;

// Invisible: the edges show where things connect; nothing is dragged to connect.
const HANDLE = "!size-px !min-h-0 !min-w-0 !border-0 !bg-transparent";

function FoldedNodeView({ data }: NodeProps<FoldedFlowNode>) {
  const { open, setHover, mapHovered, filter } = useMapState();
  const { view, focus, matched } = data;
  const endpoint: Endpoint = { node: view.id, slot: null };
  const hovered = mapHovered(endpoint);
  const lit = hovered || ((!focus || focus.nodes.has(view.id)) && (matched === null || matched.files > 0));
  return (
    // A div acting as a button: a real <button> can't hold the handles' divs.
    <div
      role="button"
      tabIndex={0}
      onClick={() => open(view.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") open(view.id);
      }}
      title={`${view.id}\n${view.files} files, in ${view.fanIn}, out ${view.fanOut}`}
      onMouseEnter={() => setHover({ from: "map", endpoint })}
      onMouseLeave={() => setHover(null)}
      style={{ width: view.width, height: view.height, opacity: lit ? 1 : DIM }}
      className={`flex items-center justify-between gap-2 rounded-sm border border-line bg-raised px-2.5 text-[11px] hover:border-muted ${hovered ? HOVER_RING : ""}`}
    >
      <Handle type="target" position={Position.Left} id="in" isConnectable={false} className={HANDLE} />
      <span className="font-mono">{view.label}</span>
      {matched === null || filter === null ? (
        <span className="text-muted tabular-nums">{view.files}</span>
      ) : (
        <span className="tabular-nums" title={`${matched.files} of ${view.files} files match`}>
          <span style={{ color: kindColour(filter.category) }}>{matched.files}</span>
          <span className="text-muted">/{view.files}</span>
        </span>
      )}
      <Handle type="source" position={Position.Right} id="out" isConnectable={false} className={HANDLE} />
    </div>
  );
}

// Fan-in and fan-out in the colours of the edges they count: what arrives is
// green with its arrow coming in, what leaves is amber with its arrow going out.
function Fans({ fanIn, fanOut }: { fanIn: number; fanOut: number }) {
  return (
    <span className="flex shrink-0 gap-1.5 tabular-nums" title={`imported by ${fanIn}, imports ${fanOut}`}>
      <span style={{ color: "var(--edge-in)" }}>←{fanIn}</span>
      <span style={{ color: "var(--edge-out)" }}>{fanOut}→</span>
    </span>
  );
}

function RowHandles({ index }: { index: number | "more" }) {
  return (
    <>
      <Handle type="target" position={Position.Left} id={rowHandle("in", index)} isConnectable={false} className={HANDLE} />
      <Handle type="source" position={Position.Right} id={rowHandle("out", index)} isConnectable={false} className={HANDLE} />
      {/* Edges between two rows of the same panel arrive on the right, so they
          curve outside the box instead of cutting back across it. */}
      <Handle type="target" position={Position.Right} id={rowHandle("inr", index)} isConnectable={false} className={HANDLE} />
    </>
  );
}

function PanelNodeView({ data }: NodeProps<PanelFlowNode>) {
  const { close, select, scroll, adapter, selected, setHover, mapHovered, filter, matches } = useMapState();
  // Wheel deltas arrive in pixels, often a few at a time from a trackpad.
  // They add up here and the window moves a row per row-height scrolled.
  const wheel = useRef(0);
  const { view, focus, matched } = data;
  const panelSelected = selected?.node === view.id && selected.slot === null;
  const rowLit = (slot: string) =>
    !focus || panelSelected || focus.rows.has(rowKey(view.id, slot)) || mapHovered({ node: view.id, slot });
  const anyLit =
    (!focus || panelSelected || view.rows.some((r) => rowLit(r.path)) || rowLit(MORE_SLOT)) &&
    (matched === null || matched.files > 0);

  return (
    // Nothing inside lit: the whole box dims, border included. Otherwise the
    // box stays and each row dims on its own.
    <div
      style={{ width: view.width, height: view.height, opacity: anyLit ? 1 : DIM }}
      className={`flex flex-col rounded-sm border bg-raised text-[11px] ${panelSelected ? "border-accent" : "border-line"}`}
    >
      <button
        type="button"
        onClick={() => close(view.id)}
        title={`Close ${view.id}`}
        style={{ height: PANEL_HEADER_HEIGHT }}
        className="flex shrink-0 flex-col justify-center gap-0.5 border-b border-line px-2.5 text-left hover:bg-surface"
      >
        <span className="flex items-baseline gap-2">
          <span className="truncate font-mono font-medium">{view.label}</span>
          <span className="shrink-0 text-muted tabular-nums">{view.files} files</span>
        </span>
        <span className="flex items-baseline justify-between gap-2">
          <Fans fanIn={view.fanIn} fanOut={view.fanOut} />
          {matched !== null && filter !== null && (
            <span className="tabular-nums" style={{ color: kindColour(filter.category) }}>
              {matched.files} matched
            </span>
          )}
        </span>
      </button>
      {/* nowheel: the wheel scrolls the rows here instead of zooming the map. */}
      <ul
        className={`py-0.5 ${view.hidden > 0 ? "nowheel" : ""}`}
        onWheel={(e) => {
          if (view.hidden === 0) return;
          // Firefox reports a mouse wheel in lines (about 3 a notch), other
          // browsers in pixels. A line is taken as one row, a page as a window.
          const unit =
            e.deltaMode === WheelEvent.DOM_DELTA_LINE
              ? ROW_HEIGHT
              : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
                ? ROW_HEIGHT * WINDOW_ROWS
                : 1;
          wheel.current += e.deltaY * unit;
          const rows = Math.trunc(wheel.current / ROW_HEIGHT);
          if (rows === 0) return;
          wheel.current -= rows * ROW_HEIGHT;
          scroll(view.id, rows, view.files);
        }}
      >
        {view.rows.map((row, i) => {
          const category = adapter.categorize(row.path);
          const isSelected = selected?.node === view.id && selected.slot === row.path;
          const endpoint: Endpoint = { node: view.id, slot: row.path };
          return (
            <li
              key={row.path}
              style={{ height: ROW_HEIGHT, opacity: !anyLit || (rowLit(row.path) && matches(row.path)) ? 1 : DIM }}
              className={`relative flex cursor-default items-center gap-1.5 px-2.5 ${isSelected ? "bg-accent/15" : "hover:bg-surface"} ${mapHovered(endpoint) ? HOVER_RING : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => select(endpoint)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") select(endpoint);
              }}
              onMouseEnter={() => setHover({ from: "map", endpoint })}
              onMouseLeave={() => setHover(null)}
              title={row.path}
            >
              <RowHandles index={i} />
              {category === null ? (
                <span className="size-2 shrink-0" aria-hidden="true" />
              ) : (
                <span className={`size-2 shrink-0 rounded-sm ${SWATCH[category]}`} aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate font-mono">{row.label}</span>
              <Fans fanIn={row.fanIn} fanOut={row.fanOut} />
            </li>
          );
        })}
        {view.hidden > 0 && (
          <li
            style={{
              height: ROW_HEIGHT,
              opacity: !anyLit || (rowLit(MORE_SLOT) && (matched === null || matched.hidden > 0)) ? 1 : DIM,
            }}
            className={`relative flex items-center justify-end px-2.5 text-muted tabular-nums ${mapHovered({ node: view.id, slot: MORE_SLOT }) ? HOVER_RING : ""}`}
            onMouseEnter={() => setHover({ from: "map", endpoint: { node: view.id, slot: MORE_SLOT } })}
            onMouseLeave={() => setHover(null)}
          >
            {/* Still the endpoint for every row outside the window. */}
            <RowHandles index="more" />
            <span>
              {view.offset + 1}–{view.offset + view.rows.length} of {view.files}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}

const nodeTypes = { folded: FoldedNodeView, panel: PanelNodeView };

const EDGE_COLOUR = { in: "var(--edge-in)", out: "var(--edge-out)", within: "var(--fg)" } as const;

function MapInner() {
  const { view, selected, select, refit, filter, matches, groups } = useMapState();
  const placed = useMemo(() => layoutView(view), [view]);

  // Per node, how many files the picked category matches, and how many of
  // those sit behind a panel's window.
  const matchedBy = useMemo(() => {
    const m = new Map<string, NonNullable<Matched>>();
    if (filter === null) return m;
    for (const g of groups) {
      const node = view.nodes.find((n) => n.id === g.dir);
      const shown = new Set(node?.kind === "panel" ? node.rows.map((r) => r.path) : []);
      const hits = g.files.filter(matches);
      m.set(g.dir, { files: hits.length, hidden: node?.kind === "panel" ? hits.filter((p) => !shown.has(p)).length : 0 });
    }
    return m;
  }, [filter, groups, view, matches]);
  const focus = useMemo(() => (selected ? focusOn(selected, view.edges) : null), [selected, view]);

  const { getViewport, setViewport } = useReactFlow();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  // The last refit already applied. The layout also changes on scroll and
  // close, and none of those may move the view: only a refit request does, once.
  const fitted = useRef(0);

  // Runs after the render that carries the new layout, so it fits the state
  // after the change, never the one before it. It may only zoom out.
  useEffect(() => {
    if (!refit || refit.seq === fitted.current || width === 0 || height === 0) return;
    const panel = placed.get(refit.id);
    if (!panel) return;
    fitted.current = refit.seq;
    const current = getViewport();
    if (refit.mode === "open") {
      const all = [...placed.values()];
      const minX = Math.min(...all.map((p) => p.x));
      const minY = Math.min(...all.map((p) => p.y));
      const bounds = {
        x: minX,
        y: minY,
        width: Math.max(...all.map((p) => p.x + p.width)) - minX,
        height: Math.max(...all.map((p) => p.y + p.height)) - minY,
      };
      const fit = getViewportForBounds(bounds, width, height, MIN_ZOOM, MAX_ZOOM, FIT_PADDING);
      if (fit.zoom <= current.zoom) {
        void setViewport(fit);
        return;
      }
    }
    // Keep the zoom; move only if the panel isn't already fully on screen.
    const z = current.zoom;
    const left = panel.x * z + current.x;
    const top = panel.y * z + current.y;
    const visible =
      left >= 0 && top >= 0 && left + panel.width * z <= width && top + panel.height * z <= height;
    if (visible) return;
    void setViewport({
      zoom: z,
      x: width / 2 - (panel.x + panel.width / 2) * z,
      y: height / 2 - (panel.y + panel.height / 2) * z,
    });
  }, [refit, placed, width, height, getViewport, setViewport]);

  const flowNodes = useMemo(
    () =>
      view.nodes.map((n): FoldedFlowNode | PanelFlowNode => {
        const p = placed.get(n.id);
        const position = { x: p?.x ?? 0, y: p?.y ?? 0 };
        const common = {
          id: n.id,
          position,
          width: n.width,
          height: n.height,
          draggable: false,
          selectable: false,
          // React Flow turns pointer events off on a node that is neither
          // draggable nor selectable; ours handle their own clicks inside.
          style: { pointerEvents: "all" as const },
          // A press on a node is a click, never the start of a pan: a pan
          // would swallow the click if the mouse shifted a pixel.
          className: "nopan",
          // Above every edge, lit ones included: lines pass under a box, never
          // across its text.
          zIndex: 2,
        };
        const matched = filter === null ? null : (matchedBy.get(n.id) ?? { files: 0, hidden: 0 });
        return n.kind === "folded"
          ? { ...common, type: "folded", data: { view: n, focus, matched } }
          : { ...common, type: "panel", data: { view: n, focus, matched } };
      }),
    [view, placed, focus, filter, matchedBy],
  );

  const flowEdges = useMemo(() => {
    const rowIndex = new Map<string, number>();
    for (const n of view.nodes) {
      if (n.kind === "panel") n.rows.forEach((r, i) => rowIndex.set(rowKey(n.id, r.path), i));
    }
    const slotIndex = (e: Endpoint): number | "more" =>
      e.slot === MORE_SLOT ? "more" : (rowIndex.get(rowKey(e.node, e.slot ?? "")) ?? "more");

    // An edge stays with a picked category when either end holds a match.
    const endMatches = (e: Endpoint) => {
      if (filter === null) return true;
      if (e.slot === null) return (matchedBy.get(e.node)?.files ?? 0) > 0;
      if (e.slot === MORE_SLOT) return (matchedBy.get(e.node)?.hidden ?? 0) > 0;
      return matches(e.slot);
    };

    return view.edges.map((e, i): FlowEdge => {
      const within = e.source.node === e.target.node;
      const relation = focus?.edges.get(e.id);
      const kept = endMatches(e.source) || endMatches(e.target);
      const stroke = relation ? EDGE_COLOUR[relation] : "var(--fg-muted)";
      const opacity = !kept ? 0.06 : relation ? 0.9 : focus ? 0.06 : 0.35;
      return {
        id: `e${i}`,
        source: e.source.node,
        target: e.target.node,
        sourceHandle: e.source.slot === null ? "out" : rowHandle("out", slotIndex(e.source)),
        targetHandle:
          e.target.slot === null ? "in" : rowHandle(within ? "inr" : "in", slotIndex(e.target)),
        selectable: false,
        focusable: false,
        // Lit edges draw over dimmed ones, still under the nodes (zIndex 2).
        zIndex: relation && kept ? 1 : 0,
        style: { stroke, strokeOpacity: opacity, strokeWidth: 1 + Math.min(3, Math.log2(e.count)) },
      };
    });
  }, [view, focus, filter, matchedBy, matches]);

  const clear = useCallback(() => select(null), [select]);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onPaneClick={clear}
      fitView
      fitViewOptions={{ padding: FIT_PADDING, maxZoom: 1 }}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      zoomOnDoubleClick={false}
    />
  );
}

/** Reads everything from MapStateProvider, which also feeds the detail pane. */
export function MapCanvas() {
  return (
    <div className="absolute inset-0">
      <ReactFlowProvider>
        <MapInner />
      </ReactFlowProvider>
    </div>
  );
}
