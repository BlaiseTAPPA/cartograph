"use client";

import { useState, type ReactNode } from "react";
import { countByCategory } from "@/lib/categories";
import { importedByNothing, mostDependedOn } from "@/lib/map/detail";
import type { FileCategory } from "@/parser/adapter";
import type { Coverage, ParsedFile } from "@/parser/types";
import { SWATCH } from "./category-rail";
import { neighboursOf, useMapState } from "./map-state";

// Long enough to show the shape of a repository, short enough to scan.
const RANKED = 10;

type Tab = "structure" | "explanation";

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
      <FileStructure path={selected.slot} />
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
  const unclassified = countByCategory(parsed, adapter).find((c) => c.category === null)?.files ?? 0;

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
        {/* No adapter here knows what a route looks like, so there's no count
            to give. Absent beats approximate. */}
        <Fact label="Routes">
          <span className="text-muted">not detected without a framework</span>
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

function FileStructure({ path }: { path: string }) {
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
  direction?: "in" | "out";
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
  direction?: "in" | "out";
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
        <span className="shrink-0 font-sans">{direction === "in" ? <In n={figure} /> : <Out n={figure} />}</span>
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
