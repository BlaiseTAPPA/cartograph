import type { ReactNode } from "react";

// The three columns every map screen uses, settled once: rail, map, detail.
// Later phases fill them; they don't move them. The detail pane is a real
// column, never an overlay, so opening it never covers the map.
export function MapShell({ rail, detail, children }: { rail: ReactNode; detail: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[11rem_minmax(0,1fr)_18rem]">
      <nav aria-label="File categories" className="min-h-0 overflow-y-auto border-r border-line bg-raised">
        {rail}
      </nav>
      <section aria-label="Map" className="relative min-h-0 min-w-0 bg-surface">
        {children}
      </section>
      <aside aria-label="Details" className="min-h-0 overflow-y-auto border-l border-line bg-raised">
        {detail}
      </aside>
    </div>
  );
}
