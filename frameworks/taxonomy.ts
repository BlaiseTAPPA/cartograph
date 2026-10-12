// The rail's vocabulary: which roles each framework names, in what order, and
// what tier each sits in. Pure data with no imports, so a browser component
// can read it without pulling a parser or a filesystem library into the bundle.

/**
 * Colour goes by tier, not by role: three hues stay legible where fifteen
 * would stop meaning anything. Support files (tests, stories, config) are
 * muted; unclassified has no colour at all.
 */
export const TIERS = ["surface", "layer", "plumbing", "support"] as const;
export type Tier = (typeof TIERS)[number];

type RoleDefinition = {
  label: string;
  tier: Tier;
  /**
   * A framework or tool reaches the file by its name or position, not through
   * an import, so nothing importing it says nothing about it.
   */
  reachedByName: boolean;
};

export const ROLES = {
  page: { label: "Page routes", tier: "surface", reachedByName: true },
  api: { label: "API endpoints", tier: "surface", reachedByName: true },
  action: { label: "Server actions", tier: "surface", reachedByName: false },
  controller: { label: "Controllers", tier: "surface", reachedByName: false },
  resolver: { label: "Resolvers", tier: "surface", reachedByName: false },
  layout: { label: "Layouts", tier: "layer", reachedByName: true },
  boundary: { label: "Loading and error", tier: "layer", reachedByName: true },
  component: { label: "Components", tier: "layer", reachedByName: false },
  hook: { label: "Hooks", tier: "layer", reachedByName: false },
  service: { label: "Services", tier: "layer", reachedByName: false },
  module: { label: "Modules", tier: "layer", reachedByName: false },
  entity: { label: "Entities", tier: "layer", reachedByName: false },
  dto: { label: "DTOs", tier: "layer", reachedByName: false },
  middleware: { label: "Middleware", tier: "plumbing", reachedByName: true },
  guard: { label: "Guards", tier: "plumbing", reachedByName: false },
  interceptor: { label: "Interceptors", tier: "plumbing", reachedByName: false },
  pipe: { label: "Pipes", tier: "plumbing", reachedByName: false },
  filter: { label: "Filters", tier: "plumbing", reachedByName: false },
  story: { label: "Stories", tier: "support", reachedByName: true },
  test: { label: "Tests", tier: "support", reachedByName: true },
  config: { label: "Config", tier: "support", reachedByName: true },
  script: { label: "Scripts", tier: "support", reachedByName: true },
} as const satisfies Record<string, RoleDefinition>;

export type Role = keyof typeof ROLES;

/**
 * Each framework's rail, in reading order: routable surfaces first, then the
 * layers behind them, then plumbing, then support. Fixed, so a repository's
 * categories always sit in the same places. Unclassified always comes last
 * and isn't listed.
 */
export const FRAMEWORKS = {
  nestjs: [
    "controller",
    "resolver",
    "service",
    "module",
    "entity",
    "dto",
    "guard",
    "interceptor",
    "pipe",
    "filter",
    "middleware",
    "test",
    "config",
    "script",
  ],
  nextjs: [
    "page",
    "api",
    "action",
    "layout",
    "boundary",
    "component",
    "hook",
    "middleware",
    "story",
    "test",
    "config",
    "script",
  ],
  react: ["component", "hook", "story", "test", "config", "script"],
  none: ["story", "test", "config", "script"],
} as const satisfies Record<string, readonly Role[]>;

export type Framework = keyof typeof FRAMEWORKS;

const FRAMEWORK_NAMES: readonly Framework[] = ["nestjs", "nextjs", "react", "none"];

/** The framework a stored name refers to, or null when it names none of them. */
export function frameworkNamed(name: string): Framework | null {
  return FRAMEWORK_NAMES.find((f) => f === name) ?? null;
}

/** The role a stored name refers to within a framework's rail, or null. */
export function roleIn(framework: Framework, name: string): Role | null {
  const roles: readonly Role[] = FRAMEWORKS[framework];
  return roles.find((r) => r === name) ?? null;
}

/** Shown in the summary, not the identifier. */
export const FRAMEWORK_LABEL: Record<Framework, string> = {
  nestjs: "NestJS",
  nextjs: "Next.js",
  react: "React",
  none: "none detected",
};
