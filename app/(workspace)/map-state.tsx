"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { indexNeighbours, type Neighbours } from "@/lib/map/detail";
import { fold, type FoldedGroup } from "@/lib/map/fold";
import {
  buildView,
  clampOffset,
  endpointKey,
  folderFans,
  MAX_ROWS,
  orderRows,
  WINDOW_ROWS,
  type Endpoint,
  type MapView,
} from "@/lib/map/view";
import { adapterNamed, type FrameworkAdapter } from "@/parser/adapter";
import type { Edge, ParsedFile, RepoFile } from "@/parser/types";

/**
 * Hovering one side lights the other. From the pane it's a file; from the map
 * it's whatever the pointer is over, which may stand for many files.
 */
export type Hover = { from: "pane"; path: string } | { from: "map"; endpoint: Endpoint } | null;

/**
 * Asks the canvas to bring a panel into view after the render that draws it.
 * "open" may zoom out to fit everything; "reveal" only pans, for a panel that
 * was already open.
 */
export type Refit = { id: string; seq: number; mode: "open" | "reveal" };

type MapState = {
  adapter: FrameworkAdapter;
  parsed: ParsedFile[];
  fileInfo: ReadonlyMap<string, ParsedFile>;
  groups: FoldedGroup[];
  fans: ReadonlyMap<string, { fanIn: number; fanOut: number }>;
  neighbours: ReadonlyMap<string, Neighbours>;
  view: MapView;
  selected: Endpoint | null;
  hover: Hover;
  refit: Refit | null;
  open: (id: string) => void;
  close: (id: string) => void;
  select: (endpoint: Endpoint | null) => void;
  /** Selects a file wherever it is: opens its folder and scrolls its row into the window. */
  selectFile: (path: string) => void;
  /** Moves a panel's row window by whole rows. */
  scroll: (id: string, rows: number, total: number) => void;
  setHover: (hover: Hover) => void;
  /** Whether the map should light this endpoint for the current hover. */
  mapHovered: (endpoint: Endpoint) => boolean;
  /** Whether the pane should light this file for the current hover. */
  paneHovered: (path: string) => boolean;
};

const MapStateContext = createContext<MapState | null>(null);

export function useMapState(): MapState {
  const state = useContext(MapStateContext);
  if (!state) throw new Error("useMapState outside MapStateProvider");
  return state;
}

const EMPTY_NEIGHBOURS: Neighbours = { imports: [], importedBy: [] };
export const neighboursOf = (index: ReadonlyMap<string, Neighbours>, path: string) =>
  index.get(path) ?? EMPTY_NEIGHBOURS;

export function MapStateProvider({
  files,
  edges,
  adapterName,
  children,
}: {
  files: RepoFile[];
  edges: Edge[];
  adapterName: string;
  children: ReactNode;
}) {
  const adapter = useMemo(() => adapterNamed(adapterName), [adapterName]);
  const parsed = useMemo(() => files.flatMap((f) => (f.status === "parsed" ? [f] : [])), [files]);
  const fileInfo = useMemo(() => new Map(parsed.map((f) => [f.path, f])), [parsed]);
  const folding = useMemo(() => fold(parsed), [parsed]);
  const fans = useMemo(() => folderFans(folding.groups, edges), [folding, edges]);
  const neighbours = useMemo(() => indexNeighbours(edges), [edges]);
  const groupOf = useMemo(() => {
    const m = new Map<string, FoldedGroup>();
    for (const g of folding.groups) for (const f of g.files) m.set(f, g);
    return m;
  }, [folding]);

  const [openSet, setOpenSet] = useState<ReadonlySet<string>>(() => new Set());
  const [selected, setSelected] = useState<Endpoint | null>(null);
  const [offsets, setOffsets] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [refit, setRefit] = useState<Refit | null>(null);
  const [hover, setHover] = useState<Hover>(null);

  const view = useMemo(
    () => buildView(folding.groups, parsed, edges, fans, openSet, offsets),
    [folding, parsed, edges, fans, openSet, offsets],
  );

  const value = useMemo<MapState>(() => {
    const bumpRefit = (id: string, mode: Refit["mode"]) =>
      setRefit((prev) => ({ id, mode, seq: (prev?.seq ?? 0) + 1 }));

    return {
      adapter,
      parsed,
      fileInfo,
      groups: folding.groups,
      fans,
      neighbours,
      view,
      selected,
      hover,
      refit,
      open: (id) => {
        setOpenSet((prev) => new Set(prev).add(id));
        setSelected({ node: id, slot: null });
        bumpRefit(id, "open");
      },
      close: (id) => {
        setOpenSet((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        // A selection inside the closed panel no longer has anything to point at.
        setSelected((prev) => (prev?.node === id ? null : prev));
        // Reopening starts from the top again.
        setOffsets((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        setHover(null);
      },
      select: setSelected,
      selectFile: (path) => {
        const group = groupOf.get(path);
        if (!group) return;
        const wasOpen = openSet.has(group.dir);
        if (!wasOpen) setOpenSet((prev) => new Set(prev).add(group.dir));
        const ordered = orderRows(group.files, (p) => fileInfo.get(p)?.fanIn ?? 0);
        if (ordered.length > MAX_ROWS) {
          const index = ordered.indexOf(path);
          setOffsets((prev) => {
            // A closed panel has no offset left (close clears it), so this is 0.
            const current = prev.get(group.dir) ?? 0;
            if (index >= current && index < current + WINDOW_ROWS) return prev;
            // Put the row mid-window rather than at an edge, so its neighbours
            // in the ordering are in view too.
            const moved = clampOffset(index - Math.floor(WINDOW_ROWS / 2), ordered.length);
            return new Map(prev).set(group.dir, moved);
          });
        }
        setSelected({ node: group.dir, slot: path });
        setHover(null);
        bumpRefit(group.dir, wasOpen ? "reveal" : "open");
      },
      scroll: (id, rows, total) =>
        setOffsets((prev) => {
          const current = prev.get(id) ?? 0;
          const moved = clampOffset(current + rows, total);
          if (moved === current) return prev;
          return new Map(prev).set(id, moved);
        }),
      setHover,
      mapHovered: (endpoint) => {
        if (hover?.from !== "pane") return false;
        const at = view.endpointOf.get(hover.path);
        return at !== undefined && endpointKey(at) === endpointKey(endpoint);
      },
      paneHovered: (path) => {
        if (hover === null) return false;
        if (hover.from === "pane") return hover.path === path;
        const at = view.endpointOf.get(path);
        return at !== undefined && endpointKey(at) === endpointKey(hover.endpoint);
      },
    };
  }, [adapter, parsed, fileInfo, folding, fans, neighbours, view, selected, hover, refit, openSet, groupOf]);

  return <MapStateContext.Provider value={value}>{children}</MapStateContext.Provider>;
}
