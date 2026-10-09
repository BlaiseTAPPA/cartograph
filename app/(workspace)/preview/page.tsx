import { countByCategory } from "@/lib/categories";
import { loadPreview, PREVIEW_SOURCE } from "@/lib/preview";
import { adapterNamed } from "@/parser/adapter";
import { CategoryRail } from "../category-rail";
import { DetailPane } from "../detail-pane";
import { MapCanvas } from "../map-canvas";
import { MapShell } from "../map-shell";
import { MapStateProvider } from "../map-state";

// The checked-in parser run, drawn through the real interface.
export default function PreviewPage() {
  const result = loadPreview();
  const counts = countByCategory(result.files, adapterNamed(result.adapter));

  return (
    // Map and pane share one selection, so both sit inside the same state.
    <MapStateProvider files={result.files} edges={result.edges} adapterName={result.adapter}>
      <MapShell
        rail={
          <CategoryRail
            title={PREVIEW_SOURCE.repo}
            subtitle={PREVIEW_SOURCE.ref}
            counts={counts}
            skipped={result.coverage.files.skipped}
          />
        }
        detail={<DetailPane repo={PREVIEW_SOURCE.repo} gitRef={PREVIEW_SOURCE.ref} coverage={result.coverage} />}
      >
        <MapCanvas />
      </MapShell>
    </MapStateProvider>
  );
}
