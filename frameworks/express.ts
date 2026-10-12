// Everything this application knows about Express. Roles come from the folder
// a file sits in. Routes are never read: Express assembles them at runtime
// from routers, variables and middleware chains, so no path in the syntax is
// known to be the one a request matches.

import type { FrameworkAdapter } from "../parser/adapter.ts";
import { ignoresDirectory, roleOnly } from "./conventions.ts";
import { supportRole } from "./generic.ts";
import { nearestDir, withinDir } from "./packages.ts";

export const EXPRESS_DEPENDENCY = "express";

type ExpressRole = "router" | "controller" | "service" | "model" | "middleware" | "config";

// Singular and plural both, because real repositories use both.
const FOLDERS = new Map<string, ExpressRole>([
  ["routes", "router"],
  ["route", "router"],
  ["routers", "router"],
  ["router", "router"],
  ["controllers", "controller"],
  ["controller", "controller"],
  ["services", "service"],
  ["service", "service"],
  ["models", "model"],
  ["model", "model"],
  ["middlewares", "middleware"],
  ["middleware", "middleware"],
  ["configs", "config"],
  ["config", "config"],
]);

export function expressAdapter(appDirs: readonly string[]): FrameworkAdapter {
  return {
    name: "express",
    ignoresDirectory,
    read: ({ path }) => roleOnly(supportRole(path) ?? folderRole(appDirs, path)),
    repositoryGaps: [],
  };
}

/**
 * The role of the nearest conventional folder above the file, inside the
 * Express app it belongs to: `routes/admin/users.js` is a router. A file
 * outside every Express app gets no role from these folder names.
 */
function folderRole(appDirs: readonly string[], path: string): ExpressRole | null {
  const dir = nearestDir(appDirs, path);
  if (dir === null) return null;
  const folders = withinDir(dir, path).split("/").slice(0, -1);
  for (let i = folders.length - 1; i >= 0; i--) {
    const role = FOLDERS.get(folders[i]);
    if (role !== undefined) return role;
  }
  return null;
}
