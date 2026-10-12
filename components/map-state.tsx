"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { countByRole, type RoleCount } from "@/lib/categories";
import { edgeKey, indexEdgeKinds, indexNeighbours, type Neighbours } from "@/lib/map/detail";
import { fold, type FoldedGroup } from "@/lib/map/fold";
import { findInsights, type Insights } from "@/lib/map/insights";
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
import { ROLES, roleIn, type Framework, type Role } from "@/frameworks/taxonomy";
import { EDGE_KINDS, type Edge, type EdgeKind, type ParsedFile, type RepoFile } from "@/parser/types";

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

/** A rail role picked to stand out. null inside is "unclassified". */
export type RoleFilter = { role: Role | null } | null;

type MapState = {
  framework: Framework;
  parsed: ParsedFile[];
  fileInfo: ReadonlyMap<string, ParsedFile>;
  groups: FoldedGroup[];
  fans: ReadonlyMap<string, { fanIn: number; fanOut: number }>;
  neighbours: ReadonlyMap<string, Neighbours>;
  /** How `from` reaches `to`: import, require and so on. Empty when it doesn't. */
  kindsOf: (from: string, to: string) => readonly EdgeKind[];
  view: MapView;
  insights: Insights;
  /** Each file's role, a convention's or a model's. null is unclassified. */
  roleOf: (path: string) => Role | null;
  /** Whether a file's role was given by a model rather than a convention. */
  labelledByModel: (path: string) => boolean;
  /** Records a label a model gave just now, so the map, rail and pane show it without a reload. */
  label: (path: string, role: Role) => void;
  /** Files per role, in the rail's order. */
  counts: RoleCount[];
  filter: RoleFilter;
  /** Picks a role, or clears it when it's already the one picked. */
  toggleFilter: (role: Role | null) => void;
  /** True for every file when no category is picked. */
  matches: (path: string) => boolean;
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
  framework,
  labelledByModel,
  children,
}: {
  files: RepoFile[];
  edges: Edge[];
  framework: Framework;
  labelledByModel: string[];
  children: ReactNode;
}) {
  // As stored. The fold and the layout read this, never the labels, so a new
  // label recolours a row and moves nothing.
  const stored = useMemo(() => files.flatMap((f) => (f.status === "parsed" ? [f] : [])), [files]);
  const [labels, setLabels] = useState<ReadonlyMap<string, Role>>(() => new Map());
  const parsed = useMemo(
    () => (labels.size === 0 ? stored : stored.map((f) => (labels.has(f.path) ? { ...f, role: labels.get(f.path) ?? null } : f))),
    [stored, labels],
  );
  const byModel = useMemo(() => new Set([...labelledByModel, ...labels.keys()]), [labelledByModel, labels]);
  const counts = useMemo(() => countByRole(parsed, framework), [parsed, framework]);
  const fileInfo = useMemo(() => new Map(parsed.map((f) => [f.path, f])), [parsed]);
  const folding = useMemo(() => fold(stored), [stored]);
  const fans = useMemo(() => folderFans(folding.groups, edges), [folding, edges]);
  const neighbours = useMemo(() => indexNeighbours(edges), [edges]);
  const edgeKinds = useMemo(() => indexEdgeKinds(edges, EDGE_KINDS), [edges]);
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
  const [filter, setFilter] = useState<RoleFilter>(null);

  // The stored role was checked against this framework's rail when read.
  const roles = useMemo(
    () => new Map(parsed.map((f) => [f.path, f.role === null ? null : roleIn(framework, f.role)])),
    [parsed, framework],
  );
  // Facts about the edge list; computed once, nothing fetched. A file a
  // framework or tool reaches by name is never reported as imported by nothing.
  // Only a convention says that: a model's label decides nothing structural.
  const insights = useMemo(
    () =>
      findInsights(stored, neighbours, (path) => {
        const role = roles.get(path) ?? null;
        return role !== null && !byModel.has(path) && ROLES[role].reachedByName;
      }),
    [stored, neighbours, roles, byModel],
  );

  const view = useMemo(
    () => buildView(folding.groups, stored, edges, fans, openSet, offsets),
    [folding, stored, edges, fans, openSet, offsets],
  );

  const value = useMemo<MapState>(() => {
    const bumpRefit = (id: string, mode: Refit["mode"]) =>
      setRefit((prev) => ({ id, mode, seq: (prev?.seq ?? 0) + 1 }));

    return {
      framework,
      parsed,
      fileInfo,
      groups: folding.groups,
      fans,
      neighbours,
      kindsOf: (from, to) => edgeKinds.get(edgeKey(from, to)) ?? [],
      view,
      insights,
      roleOf: (path) => roles.get(path) ?? null,
      labelledByModel: (path) => byModel.has(path),
      label: (path, role) => setLabels((prev) => new Map(prev).set(path, role)),
      counts,
      filter,
      toggleFilter: (role) => setFilter((prev) => (prev !== null && prev.role === role ? null : { role })),
      matches: (path) => filter === null || (roles.get(path) ?? null) === filter.role,
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
  }, [
    framework,
    parsed,
    fileInfo,
    folding,
    fans,
    neighbours,
    edgeKinds,
    view,
    insights,
    roles,
    byModel,
    counts,
    filter,
    selected,
    hover,
    refit,
    openSet,
    groupOf,
  ]);

  return <MapStateContext.Provider value={value}>{children}</MapStateContext.Provider>;
}
