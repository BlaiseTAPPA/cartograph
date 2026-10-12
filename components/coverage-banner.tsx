"use client";

import { useState } from "react";
import { completeness } from "@/lib/map/coverage";
import type { Coverage, UnresolvedReason } from "@/parser/types";

const REASON: Record<UnresolvedReason, string> = {
  "no-file-at-relative-path": "no file at the relative path",
  "no-file-at-alias-target": "no file where a path alias points",
  "no-file-at-base-url-path": "no file under the base URL",
  "non-literal-dynamic-import": "dynamic import of a computed path",
};

/**
 * Says the graph is partial when it is. Collapsing keeps one line that still
 * names the figure, so a partial graph can never be made to look whole.
 * Nothing is shown for a complete graph.
 */
export function CoverageBanner({ coverage }: { coverage: Coverage }) {
  const [open, setOpen] = useState(true);
  const c = completeness(coverage);
  if (!c.partial) return null;

  const headline =
    c.percent === null
      ? `Partial graph: ${c.skippedFiles} file${c.skippedFiles === 1 ? "" : "s"} skipped`
      : `Partial graph: ${c.percent}% of imports into this repository drawn as edges`;

  return (
    <div className="shrink-0 border-b border-line bg-raised text-xs">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-full items-center gap-1.5 px-3 text-left"
      >
        <span aria-hidden="true" className="w-2 text-muted">
          {open ? "▾" : "▸"}
        </span>
        <span className="font-medium tabular-nums">{headline}</span>
        {c.percent !== null && (
          <span className="text-muted tabular-nums">
            {c.drawn} of {c.intoRepository}
          </span>
        )}
      </button>
      {open && (
        <ul className="px-3 pb-1.5 pl-6.5 text-[11px] text-muted tabular-nums">
          {c.unresolvedBy.map(([reason, n]) => (
            <li key={reason}>
              {n} unresolved: {REASON[reason]}
            </li>
          ))}
          {c.offMap > 0 && <li>{c.offMap} point at files that exist but are off the map (skipped or in an ignored folder)</li>}
          {c.skippedFiles > 0 && (
            <li>
              {c.skippedFiles} file{c.skippedFiles === 1 ? "" : "s"} skipped, not on the map
            </li>
          )}
          {c.configErrors > 0 && (
            <li>
              {c.configErrors} tsconfig{c.configErrors === 1 ? "" : "s"} could not be read; imports under {c.configErrors === 1 ? "it" : "them"} may be missing
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
