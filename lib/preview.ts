import path from "node:path";
import { readResult } from "@/parser/output";
import type { ParseResult } from "@/parser/types";

// Scaffolding. A parser run over excalidraw/excalidraw at tag v0.18.0 (commit
// 817d8c5), checked in so the interface can be built without an account row,
// the database or the network. Goes once analyses are stored.
export const PREVIEW_SOURCE = {
  repo: "excalidraw/excalidraw",
  ref: "v0.18.0",
} as const;

/** Read through the parser's own typed reader, so a stale file fails loudly. */
export function loadPreview(): ParseResult {
  return readResult(path.join(process.cwd(), "data", "excalidraw-v0.18.0.json"));
}
