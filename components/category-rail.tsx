"use client";

import { ROLES, type Role, type Tier } from "@/frameworks/taxonomy";
import { useMapState } from "./map-state";

// Literal class names so Tailwind sees them. Colour is by tier: what a file
// is shows in its name, how far from the surface it sits shows in its colour.
const TIER_SWATCH: Record<Tier, string> = {
  surface: "bg-tier-surface",
  layer: "bg-tier-layer",
  plumbing: "bg-tier-plumbing",
  support: "bg-muted",
};

export function roleSwatch(role: Role): string {
  return TIER_SWATCH[ROLES[role].tier];
}

/** The same colours as plain values, for text. Unclassified has none. */
export function roleColour(role: Role | null): string {
  if (role === null) return "var(--fg)";
  const tier = ROLES[role].tier;
  return tier === "support" ? "var(--fg-muted)" : `var(--tier-${tier})`;
}

export function roleLabel(role: Role | null): string {
  return role === null ? "Unclassified" : ROLES[role].label;
}

export function CategoryRail({
  title,
  subtitle,
  skipped,
}: {
  title: string;
  subtitle: string;
  skipped: number;
}) {
  // From the map state, so a label given in this session is counted at once.
  const { filter, toggleFilter, counts } = useMapState();
  return (
    <div className="flex flex-col text-xs">
      <div className="flex h-8 shrink-0 items-baseline gap-1.5 border-b border-line px-3 pt-2">
        <span className="truncate font-mono" title={title}>
          {title}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted">{subtitle}</span>
      </div>
      <ul className="py-1 tabular-nums">
        {counts.map(({ role, files }) => {
          const picked = filter !== null && filter.role === role;
          return (
            <li key={role ?? "unclassified"}>
              {/* Picking one dims what isn't in it on the map; picking it
                  again clears it. Nothing is removed. */}
              <button
                type="button"
                disabled={files === 0}
                aria-pressed={picked}
                onClick={() => toggleFilter(role)}
                className={`flex h-6 w-full items-center gap-2 px-3 text-left disabled:text-muted ${picked ? "bg-accent/15" : "enabled:hover:bg-surface"}`}
              >
                {role === null ? (
                  // Unclassified has no colour, so its swatch is an outline.
                  <span className="size-2.5 shrink-0 rounded-sm border border-muted" aria-hidden="true" />
                ) : (
                  <span className={`size-2.5 shrink-0 rounded-sm ${roleSwatch(role)}`} aria-hidden="true" />
                )}
                <span className="flex-1">{roleLabel(role)}</span>
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
