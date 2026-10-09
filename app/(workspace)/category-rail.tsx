import type { FileCategory } from "@/parser/adapter";
import type { CategoryCount } from "@/lib/categories";

// Literal class names so Tailwind sees them.
export const SWATCH: Record<FileCategory, string> = {
  test: "bg-kind-test",
  story: "bg-kind-story",
  config: "bg-kind-config",
  script: "bg-kind-script",
};

// Plain rows, not buttons: clicking a category does nothing yet, and a button
// would promise that it does.
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
  return (
    <div className="flex flex-col text-xs">
      <div className="flex h-8 shrink-0 items-baseline gap-1.5 border-b border-line px-3 pt-2">
        <span className="truncate font-mono" title={title}>
          {title}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted">{subtitle}</span>
      </div>
      <ul className="py-1 tabular-nums">
        {counts.map(({ category, files }) => (
          <li
            key={category ?? "unclassified"}
            className={`flex h-6 items-center gap-2 px-3 ${files === 0 ? "text-muted" : ""}`}
          >
            {category === null ? (
              // Unclassified has no colour, so its swatch is an outline.
              <span className="size-2.5 shrink-0 rounded-sm border border-muted" aria-hidden="true" />
            ) : (
              <span className={`size-2.5 shrink-0 rounded-sm ${SWATCH[category]}`} aria-hidden="true" />
            )}
            <span className="flex-1">{category ?? "unclassified"}</span>
            <span>{files}</span>
          </li>
        ))}
      </ul>
      {skipped > 0 && (
        <p className="border-t border-line px-3 py-1.5 text-[11px] text-muted">
          {skipped} skipped, not on the map
        </p>
      )}
    </div>
  );
}
