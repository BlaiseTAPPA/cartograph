"use client";

import type { CategoryCount } from "@/lib/categories";
import type { FileCategory } from "@/parser/adapter";
import { useMapState } from "./map-state";

// Literal class names so Tailwind sees them.
export const SWATCH: Record<FileCategory, string> = {
  entry: "bg-kind-entry",
  test: "bg-kind-test",
  story: "bg-kind-story",
  config: "bg-kind-config",
  script: "bg-kind-script",
};

/** The same colours as plain values, for text. Unclassified has none. */
export function kindColour(category: FileCategory | null): string {
  return category === null ? "var(--fg)" : `var(--kind-${category})`;
}

export function CategoryRail({
  title,
  subtitle,
  counts,
  skipped,
}: {
  title: string;
  subtitle: string;
  counts: CategoryCount[];
  skipped: number;
}) {
  const { filter, toggleFilter } = useMapState();
  return (
    <div className="flex flex-col text-xs">
      <div className="flex h-8 shrink-0 items-baseline gap-1.5 border-b border-line px-3 pt-2">
        <span className="truncate font-mono" title={title}>
          {title}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted">{subtitle}</span>
      </div>
      <ul className="py-1 tabular-nums">
        {counts.map(({ category, files }) => {
          const picked = filter !== null && filter.category === category;
          return (
            <li key={category ?? "unclassified"}>
              {/* Picking one dims what isn't in it on the map; picking it
                  again clears it. Nothing is removed. */}
              <button
                type="button"
                disabled={files === 0}
                aria-pressed={picked}
                onClick={() => toggleFilter(category)}
                className={`flex h-6 w-full items-center gap-2 px-3 text-left disabled:text-muted ${picked ? "bg-accent/15" : "enabled:hover:bg-surface"}`}
              >
                {category === null ? (
                  // Unclassified has no colour, so its swatch is an outline.
                  <span className="size-2.5 shrink-0 rounded-sm border border-muted" aria-hidden="true" />
                ) : (
                  <span className={`size-2.5 shrink-0 rounded-sm ${SWATCH[category]}`} aria-hidden="true" />
                )}
                <span className="flex-1">{category ?? "unclassified"}</span>
                <span>{files}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {skipped > 0 && (
        <p className="border-t border-line px-3 py-1.5 text-[11px] text-muted">
          {skipped} skipped, not on the map
        </p>
      )}
    </div>
  );
}
