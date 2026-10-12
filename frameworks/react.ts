import type { FrameworkAdapter } from "../parser/adapter.ts";
import { ignoresDirectory, isComponent, isHook, roleOnly } from "./conventions.ts";
import { supportRole } from "./generic.ts";

/** React's naming conventions, for any file a framework didn't claim first. */
export function reactRole(path: string): "component" | "hook" | null {
  if (isComponent(path)) return "component";
  if (isHook(path)) return "hook";
  return null;
}

/** React has no routing of its own, so this adapter never emits a route. */
export const reactAdapter: FrameworkAdapter = {
  name: "react",
  ignoresDirectory,
  read: ({ path }) => roleOnly(supportRole(path) ?? reactRole(path)),
  repositoryGaps: [],
};
