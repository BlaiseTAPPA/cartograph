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
  router: { label: "Routers", tier: "surface", reachedByName: false },
  layout: { label: "Layouts", tier: "layer", reachedByName: true },
  boundary: { label: "Loading and error", tier: "layer", reachedByName: true },
  component: { label: "Components", tier: "layer", reachedByName: false },
  hook: { label: "Hooks", tier: "layer", reachedByName: false },
  service: { label: "Services", tier: "layer", reachedByName: false },
  repository: { label: "Repositories", tier: "layer", reachedByName: false },
  module: { label: "Modules", tier: "layer", reachedByName: false },
  entity: { label: "Entities", tier: "layer", reachedByName: false },
  model: { label: "Models", tier: "layer", reachedByName: false },
  dto: { label: "DTOs", tier: "layer", reachedByName: false },
  util: { label: "Utilities", tier: "plumbing", reachedByName: false },
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
 * The only roles a model may give, to a file no convention identified. None
 * of them is structural: pages, routes and controllers decide the route table
 * and the entry points, and convention owns those. The database checks the
 * same list.
 */
export const CLASSIFIABLE_ROLES = ["service", "repository", "model", "util", "config", "component", "hook"] as const;
export type ClassifiableRole = (typeof CLASSIFIABLE_ROLES)[number];

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
    "repository",
    "module",
    "entity",
    "model",
    "dto",
    "component",
    "hook",
    "util",
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
    "service",
    "repository",
    "model",
    "util",
    "middleware",
    "story",
    "test",
    "config",
    "script",
  ],
  express: [
    "router",
    "controller",
    "service",
    "repository",
    "model",
    "component",
    "hook",
    "util",
    "middleware",
    "test",
    "config",
    "script",
  ],
  react: ["component", "hook", "service", "repository", "model", "util", "story", "test", "config", "script"],
  none: ["component", "hook", "service", "repository", "model", "util", "story", "test", "config", "script"],
} as const satisfies Record<string, readonly Role[]>;

export type Framework = keyof typeof FRAMEWORKS;

// Every rail carries every classifiable role, so a model's label always has a
// place to be counted. A rail missing one fails to compile here.
type MissingFromRails = { [F in Framework]: Exclude<ClassifiableRole, (typeof FRAMEWORKS)[F][number]> }[Framework];
type Never<T extends never> = T;
export type RailsCarryEveryClassifiableRole = Never<MissingFromRails>;

const FRAMEWORK_NAMES: readonly Framework[] = ["nestjs", "nextjs", "express", "react", "none"];

/** The framework a stored name refers to, or null when it names none of them. */
export function frameworkNamed(name: string): Framework | null {
  return FRAMEWORK_NAMES.find((f) => f === name) ?? null;
}

/** The role a stored name refers to within a framework's rail, or null. */
export function roleIn(framework: Framework, name: string): Role | null {
  const roles: readonly Role[] = FRAMEWORKS[framework];
  return roles.find((r) => r === name) ?? null;
}

/** The classifiable role a stored or answered name refers to, or null. */
export function classifiableRole(name: string): ClassifiableRole | null {
  return CLASSIFIABLE_ROLES.find((r) => r === name) ?? null;
}

/** Shown in the summary, not the identifier. */
export const FRAMEWORK_LABEL: Record<Framework, string> = {
  nestjs: "NestJS",
  nextjs: "Next.js",
  express: "Express",
  react: "React",
  none: "none detected",
};
