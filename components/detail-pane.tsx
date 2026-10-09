"use client";

import { useState, type ReactNode } from "react";
import { countByCategory } from "@/lib/categories";
import { importedByNothing, mostDependedOn } from "@/lib/map/detail";
import { INSIGHT_SENTENCES, type InsightFile } from "@/lib/map/insights";
import { DEFAULT_DEPTH, walk, type Direction } from "@/lib/map/reach";
import type { FileCategory } from "@/parser/adapter";
import type { Coverage, ParsedFile } from "@/parser/types";
import { SWATCH } from "./category-rail";
import { neighboursOf, useMapState } from "./map-state";

// Long enough to show the shape of a repository, short enough to scan.
const RANKED = 10;

type Tab = "structure" | "explanation";

/** Which walk is showing, and how deep. */
type WalkState = { direction: Direction; depth: number } | null;

const WALK_LABEL: Record<Direction, string> = {
  dependents: "Blast radius",
  dependencies: "Dependency chain",
};
const WALK_NOTE: Record<Direction, string> = {
  dependents: "files that may break if this one changes",
  dependencies: "files this one needs",
};
// One step is only the direct neighbours, already listed below; past three
// most of a repository comes back.
const DEPTHS = [1, 2, 3] as const;

/**
 * Fills from the map's selection, entirely from data already in the browser.
 * With nothing selected it shows the repository summary: that is its resting
 * state, not a placeholder.
 */
export function DetailPane({ repo, gitRef, coverage }: { repo: string; gitRef: string; coverage: Coverage }) {
  const { selected } = useMapState();
  // Held here, not per selection: whichever tab is open stays open as the
  // selection changes.
  const [tab, setTab] = useState<Tab>("structure");
  // Kept across selections too, so a walk can be compared file to file.
  const [walkState, setWalkState] = useState<WalkState>(null);

  if (selected === null) return <Summary repo={repo} gitRef={gitRef} coverage={coverage} />;
  if (selected.slot === null) {
    return (
      <Tabbed tab={tab} setTab={setTab} header={<FolderHeader dir={selected.node} />} what="folder">
        <FolderStructure dir={selected.node} />
      </Tabbed>
    );
  }
  return (
    <Tabbed tab={tab} setTab={setTab} header={<FileHeader path={selected.slot} />} what="file">
      <FileStructure path={selected.slot} walkState={walkState} setWalkState={setWalkState} />
    </Tabbed>
  );
}

function Tabbed({
  tab,
  setTab,
  header,
  what,
  children,
}: {
  tab: Tab;
  setTab: (tab: Tab) => void;
  header: ReactNode;
  what: "file" | "folder";
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col text-xs">
      {header}
      <div role="tablist" className="flex h-7 shrink-0 items-stretch gap-3 border-b border-line px-3 text-[11px]">
        {(["structure", "explanation"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className="-mb-px border-b border-transparent capitalize text-muted hover:text-fg aria-selected:border-accent aria-selected:text-fg"
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "structure" ? (
        children
      ) : (
        <div className="px-3 py-3">
          <p>No explanation yet.</p>
          <p className="mt-1 text-[11px] text-muted">Nothing has explained this {what} so far.</p>
        </div>
      )}
    </div>
  );
}

function Summary({ repo, gitRef, coverage }: { repo: string; gitRef: string; coverage: Coverage }) {
  const { parsed, adapter } = useMapState();
  const ranked = mostDependedOn(parsed);
  const starts = importedByNothing(parsed);
  const counts = countByCategory(parsed, adapter);
  const unclassified = counts.find((c) => c.category === null)?.files ?? 0;
  const entries = counts.find((c) => c.category === "entry")?.files ?? 0;

  return (
    <div className="text-xs">
      <div className="flex h-8 items-baseline gap-1.5 border-b border-line px-3 pt-2">
        <span className="truncate font-mono" title={repo}>
          {repo}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted">{gitRef}</span>
      </div>
      <Facts>
        <Fact label="Framework">{adapter.name === "none" ? "none detected" : adapter.name}</Fact>
        <Fact label="Files">
          {coverage.files.parsed} parsed
          {coverage.files.skipped > 0 && <span className="text-muted">, {coverage.files.skipped} skipped</span>}
        </Fact>
        <Fact label="Imports">
          {coverage.imports.seen}
          <span className="text-muted">, {coverage.imports.resolved} to a file here</span>
        </Fact>
        {/* Counted from Next.js file conventions matched by path: pages,
            layouts and route handlers, the files a framework reaches by name. */}
        <Fact label="Routes">
          {entries} <span className="text-muted">pages, layouts and handlers</span>
        </Fact>
        <Fact label="Unclassified">
          {unclassified} <span className="text-muted">files no convention identified</span>
        </Fact>
      </Facts>

      <Section title="Most depended on" note="imported by">
        <PathList paths={ranked.slice(0, RANKED)} figure={(f) => f.fanIn} direction="in" />
      </Section>
      <Section title={`Imported by nothing, ${starts.length}`} note="imports">
        <PathList paths={starts.slice(0, RANKED)} figure={(f) => f.fanOut} direction="out" />
      </Section>
      <InsightsPanel />
    </div>
  );
}

/**
 * Collapsed until asked for, and last in the summary: this explains a
 * codebase, it doesn't open by grading one. Files nothing imports lead; loops
 * and long files read closer to a verdict, so they come after.
 */
function InsightsPanel() {
  const { insights, fileInfo } = useMapState();
  const [open, setOpen] = useState(false);
  const asFiles = (list: InsightFile[]) => list.flatMap((f) => fileInfo.get(f.path) ?? []);

  return (
    <section className="border-t border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-full items-center gap-1.5 px-3 text-left text-[11px] text-muted hover:text-fg"
      >
        <span aria-hidden="true" className="w-2">
          {open ? "▾" : "▸"}
        </span>
        Insights
      </button>
      {open && (
        <div className="pb-2">
          <InsightGroup sentence={INSIGHT_SENTENCES.unimported}>
            <PathList paths={asFiles(insights.unimported)} />
          </InsightGroup>
          <InsightGroup sentence={INSIGHT_SENTENCES.cycle}>
            {insights.cycles.length === 0 ? (
              <p className="px-3 py-0.5 text-muted">None.</p>
            ) : (
              insights.cycles.map((loop) => (
                <ol key={loop.join("\u0000")} className="mb-1.5">
                  {loop.map((path) => (
                    <li key={path}>
                      <PathButton path={path} />
                    </li>
                  ))}
                  {/* The loop closes on the file it started from. */}
                  <li className="px-3 font-mono text-[11px] text-muted">
                    back to {loop[0].slice(loop[0].lastIndexOf("/") + 1)}
                  </li>
                </ol>
              ))
            )}
          </InsightGroup>
          <InsightGroup sentence={INSIGHT_SENTENCES.heavilyImported}>
            <PathList paths={asFiles(insights.heavilyImported)} figure={(f) => f.fanIn} direction="in" />
          </InsightGroup>
          <InsightGroup sentence={INSIGHT_SENTENCES.long}>
            <PathList paths={asFiles(insights.long)} figure={(f) => f.lines} direction="none" />
          </InsightGroup>
        </div>
      )}
    </section>
  );
}

function InsightGroup({ sentence, children }: { sentence: string; children: ReactNode }) {
  return (
    <div className="pt-1.5">
      <p className="px-3 pb-0.5">{sentence}</p>
      {children}
    </div>
  );
}

function FileHeader({ path }: { path: string }) {
  return (
    <div className="border-b border-line py-1.5">
      <PathButton path={path} wrap />
    </div>
  );
}

function FileStructure({
  path,
  walkState,
  setWalkState,
}: {
  path: string;
  walkState: WalkState;
  setWalkState: (w: WalkState) => void;
}) {
  const { fileInfo, neighbours, adapter } = useMapState();
  const file = fileInfo.get(path);
  const { imports, importedBy } = neighboursOf(neighbours, path);
  if (!file) return null;
  const category = adapter.categorize(path);

  return (
    <div>
      <Facts>
        <Fact label="Kind">
          <span className="inline-flex items-center gap-1.5">
            <Swatch category={category} />
            {category ?? <span className="text-muted">unclassified</span>}
          </span>
        </Fact>
        <Fact label="Lines">{file.lines}</Fact>
        <Fact label="Imports">
          <Out n={imports.length} />
        </Fact>
        <Fact label="Imported by">
          <In n={importedBy.length} />
        </Fact>
      </Facts>
      <WalkControls walkState={walkState} setWalkState={setWalkState} />
      {walkState && <WalkResult path={path} walkState={walkState} />}
      {/* Counts above are the lengths of these lists, so they always agree. */}
      <Section title={`Imports, ${imports.length}`}>
        <PathList paths={imports.flatMap((p) => fileInfo.get(p) ?? [])} />
      </Section>
      <Section title={`Imported by, ${importedBy.length}`}>
        <PathList paths={importedBy.flatMap((p) => fileInfo.get(p) ?? [])} />
      </Section>
    </div>
  );
}

function WalkControls({
  walkState,
  setWalkState,
}: {
  walkState: WalkState;
  setWalkState: (w: WalkState) => void;
}) {
  const depth = walkState?.depth ?? DEFAULT_DEPTH;
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 pb-2 text-[11px]">
      {(["dependents", "dependencies"] as const).map((direction) => {
        const on = walkState?.direction === direction;
        return (
          <button
            key={direction}
            type="button"
            aria-pressed={on}
            // Clicking the open walk again closes it.
            onClick={() => setWalkState(on ? null : { direction, depth })}
            className="h-6 rounded-sm border border-line px-2 hover:border-muted aria-pressed:border-accent aria-pressed:bg-accent/15"
          >
            {WALK_LABEL[direction]}
          </button>
        );
      })}
      {walkState && (
        <span role="group" aria-label="Depth" className="ml-auto flex items-center gap-0.5 text-muted">
          depth
          {DEPTHS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={d === walkState.depth}
              onClick={() => setWalkState({ ...walkState, depth: d })}
              className="h-6 w-5 rounded-sm tabular-nums hover:text-fg aria-pressed:bg-accent/15 aria-pressed:text-fg"
            >
              {d}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

/** Arithmetic over the edge list already in the browser: no spinner, no request. */
function WalkResult({ path, walkState }: { path: string; walkState: NonNullable<WalkState> }) {
  const { neighbours, fileInfo } = useMapState();
  const reached = walk(neighbours, path, walkState.direction, walkState.depth);
  const steps = Array.from({ length: walkState.depth }, (_, i) => i + 1);

  return (
    <Section title={`${WALK_LABEL[walkState.direction]}, ${reached.length}`} note={WALK_NOTE[walkState.direction]}>
      {reached.length === 0 ? (
        <p className="px-3 py-0.5 text-muted">None.</p>
      ) : (
        steps.map((step) => {
          const atStep = reached.filter((r) => r.depth === step).flatMap((r) => fileInfo.get(r.path) ?? []);
          if (atStep.length === 0) return null;
          return (
            <div key={step}>
              <p className="px-3 pt-1 text-[11px] text-muted tabular-nums">
                {step === 1 ? "1 step" : `${step} steps`}, {atStep.length}
              </p>
              <PathList paths={atStep} />
            </div>
          );
        })
      )}
    </Section>
  );
}

function FolderHeader({ dir }: { dir: string }) {
  return (
    <div className="flex items-baseline gap-1.5 border-b border-line px-3 py-1.5">
      <span className="min-w-0 break-all font-mono">{dir === "." ? "(root)" : `${dir}/`}</span>
      <span className="shrink-0 text-[11px] text-muted">folder</span>
    </div>
  );
}

function FolderStructure({ dir }: { dir: string }) {
  const { groups, fans, fileInfo, adapter } = useMapState();
  const group = groups.find((g) => g.dir === dir);
  if (!group) return null;
  const files = group.files.flatMap((p) => fileInfo.get(p) ?? []);
  const kinds = countByCategory(files, adapter).filter((c) => c.files > 0);
  const fan = fans.get(dir) ?? { fanIn: 0, fanOut: 0 };

  return (
    <div>
      <Facts>
        <Fact label="Files">{files.length}</Fact>
        <Fact label="Imported by">
          <In n={fan.fanIn} /> <span className="text-muted">files outside it</span>
        </Fact>
        <Fact label="Imports">
          <Out n={fan.fanOut} /> <span className="text-muted">files outside it</span>
        </Fact>
      </Facts>
      <Section title="Kinds of file">
        <ul className="tabular-nums">
          {kinds.map(({ category, files: n }) => (
            <li key={category ?? "unclassified"} className="flex h-5 items-center gap-2 px-3">
              <Swatch category={category} />
              <span className={`flex-1 ${category === null ? "text-muted" : ""}`}>{category ?? "unclassified"}</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-y-1 px-3 py-2 tabular-nums">{children}</dl>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pb-1">
      <h2 className="flex items-baseline justify-between px-3 pt-2 pb-1 text-[11px] text-muted">
        <span>{title}</span>
        {note && <span>{note}</span>}
      </h2>
      {children}
    </section>
  );
}

// The same colours and arrows the map uses for an edge's direction.
function In({ n }: { n: number }) {
  return <span className="tabular-nums" style={{ color: "var(--edge-in)" }}>←{n}</span>;
}

function Out({ n }: { n: number }) {
  return <span className="tabular-nums" style={{ color: "var(--edge-out)" }}>{n}→</span>;
}

function PathList({
  paths,
  figure,
  direction,
}: {
  paths: ParsedFile[];
  figure?: (f: ParsedFile) => number;
  direction?: "in" | "out" | "none";
}) {
  if (paths.length === 0) return <p className="px-3 py-0.5 text-muted">None.</p>;
  return (
    <ul>
      {paths.map((f) => (
        <li key={f.path}>
          <PathButton path={f.path} figure={figure?.(f)} direction={direction} />
        </li>
      ))}
    </ul>
  );
}

/**
 * A file path anywhere in the pane. Clicking moves the map's selection to it;
 * hovering lights where it sits on the map, and the map lights it back.
 */
function PathButton({
  path,
  figure,
  direction = "in",
  wrap = false,
}: {
  path: string;
  figure?: number;
  direction?: "in" | "out" | "none";
  wrap?: boolean;
}) {
  const { selectFile, setHover, paneHovered, adapter } = useMapState();
  const cut = path.lastIndexOf("/");
  const dir = cut === -1 ? "" : path.slice(0, cut + 1);
  const name = path.slice(cut + 1);
  return (
    <button
      type="button"
      onClick={() => selectFile(path)}
      onMouseEnter={() => setHover({ from: "pane", path })}
      onMouseLeave={() => setHover(null)}
      onFocus={() => setHover({ from: "pane", path })}
      onBlur={() => setHover(null)}
      title={path}
      className={`flex w-full items-center gap-1.5 px-3 text-left font-mono text-[11px] ${wrap ? "py-0.5" : "h-5"} ${paneHovered(path) ? "bg-accent/15" : "hover:bg-surface"}`}
    >
      <Swatch category={adapter.categorize(path)} />
      {wrap ? (
        <span className="min-w-0 flex-1 break-all">
          <span className="text-muted">{dir}</span>
          {name}
        </span>
      ) : (
        // The folder part gives way first, so the file name stays readable.
        <span className="flex min-w-0 flex-1">
          <span className="min-w-0 truncate text-muted">{dir}</span>
          <span className="shrink-0">{name}</span>
        </span>
      )}
      {figure !== undefined && (
        <span className="shrink-0 font-sans">
          {direction === "in" ? (
            <In n={figure} />
          ) : direction === "out" ? (
            <Out n={figure} />
          ) : (
            // Not a direction, so not a direction's colour.
            <span className="text-muted tabular-nums">{figure}</span>
          )}
        </span>
      )}
    </button>
  );
}

function Swatch({ category }: { category: FileCategory | null }) {
  // Unclassified gets an empty slot rather than a grey swatch: no colour, and
  // names still line up.
  return category === null ? (
    <span className="size-2 shrink-0" aria-hidden="true" />
  ) : (
    <span className={`size-2 shrink-0 rounded-sm ${SWATCH[category]}`} aria-hidden="true" />
  );
}
