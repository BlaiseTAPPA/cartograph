import type { FrameworkAdapter } from "../parser/adapter.ts";
import { ignoresDirectory, isConfig, isScript, isStory, isTest, roleOnly } from "./conventions.ts";

/**
 * Tools' own conventions only, which hold whatever the framework: test
 * runners, Storybook, config files. What a test file is comes before anything
 * a framework says, so every adapter starts here.
 */
export function supportRole(path: string): "test" | "story" | "config" | "script" | null {
  if (isTest(path)) return "test";
  if (isStory(path)) return "story";
  if (isConfig(path)) return "config";
  if (isScript(path)) return "script";
  return null;
}

/** For a repository no framework adapter matched: generic roles, no routes. */
export const genericAdapter: FrameworkAdapter = {
  name: "none",
  ignoresDirectory,
  read: ({ path }) => roleOnly(supportRole(path)),
  repositoryGaps: [],
};
