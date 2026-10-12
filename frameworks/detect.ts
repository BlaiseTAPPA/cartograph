import type { FrameworkAdapter } from "../parser/adapter.ts";
import { walkRepository } from "../parser/walk.ts";
import { EXPRESS_DEPENDENCY, expressAdapter } from "./express.ts";
import { genericAdapter } from "./generic.ts";
import { NESTJS_DEPENDENCY, nestjsAdapter } from "./nestjs.ts";
import { NEXTJS_DEPENDENCY, nextjsAdapter } from "./nextjs.ts";
import { findPackages } from "./packages.ts";
import { reactAdapter } from "./react.ts";

type Detector = {
  dependency: string;
  /** `apps`: folders whose package.json declares the dependency. */
  build: (root: string, apps: string[]) => FrameworkAdapter;
};

/**
 * Fixed order, first match wins. A NestJS backend usually ships beside a
 * frontend, and Next.js always depends on React, so the more specific
 * framework is asked first. NestJS and Next.js can both run on Express, so
 * Express comes after them; an Express server beside a React client is
 * read as the server, since that's where its roles come from.
 */
const DETECTORS: readonly Detector[] = [
  {
    dependency: NESTJS_DEPENDENCY,
    build: (root, apps) =>
      nestjsAdapter(root, apps, walkRepository(root, genericAdapter).files.map((f) => f.path)),
  },
  { dependency: NEXTJS_DEPENDENCY, build: (root, apps) => nextjsAdapter(root, apps) },
  { dependency: EXPRESS_DEPENDENCY, build: (_root, apps) => expressAdapter(apps) },
  { dependency: "react", build: () => reactAdapter },
];

/**
 * The adapter for whatever a package.json in the repository declares. A
 * repository matching nothing gets the generic adapter: generic roles, no routes.
 */
export function detectAdapter(root: string): FrameworkAdapter {
  const packages = findPackages(root);
  for (const detector of DETECTORS) {
    const apps = packages.filter((p) => p.dependencies.has(detector.dependency)).map((p) => p.dir);
    if (apps.length > 0) return detector.build(root, apps);
  }
  return genericAdapter;
}
