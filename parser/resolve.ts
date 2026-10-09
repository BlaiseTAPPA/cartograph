import { existsSync, realpathSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { ts } from "ts-morph";
import type { ImportOutcome, ResolutionRules, SkipReason } from "./types.ts";
import type { FoundImport } from "./imports.ts";
import { isSourcePath, SOURCE_EXTENSIONS } from "./walk.ts";

/** What the resolver knows about each walked file, keyed by repo-relative path. */
export type KnownFile = { status: "parsed" } | { status: "skipped"; reason: SkipReason };

type Rules = { options: ts.CompilerOptions; cache: ts.ModuleResolutionCache };

type ConfigContext = Rules & {
  /** Directory `paths` targets are relative to. */
  pathsBase: string | null;
  /** Bundler rules to retry with when the config's own rules are Node's strict ESM ones. */
  bundler: Rules | null;
};

type ParsedConfig = {
  context: ConfigContext;
  references: string[];
  fileNames: Set<string>;
};

const CONFIG_NAMES = ["tsconfig.json", "jsconfig.json"];

// TypeScript diagnostic for a config whose include pattern matches nothing.
// Normal for solution-style configs, which list only references.
const NO_INPUTS_FOUND = 18003;

const BUILTINS = new Set(builtinModules);

/**
 * Resolution uses TypeScript's own module resolution, under the tsconfig that
 * governs each file. Nothing here interprets a specifier by guessing: an import
 * either lands on a real file or is reported with the reason it didn't.
 */
export class Resolver {
  private readonly root: string;
  private readonly known: Map<string, KnownFile>;
  private readonly ignoredDirectories: string[];
  private readonly configs = new Map<string, ParsedConfig>();
  private readonly nearest = new Map<string, string | null>();
  private readonly defaultContext: ConfigContext;
  readonly configErrors: { config: string; message: string }[] = [];

  constructor(root: string, known: Map<string, KnownFile>, ignoredDirectories: string[]) {
    this.root = root;
    this.known = known;
    this.ignoredDirectories = ignoredDirectories;
    this.defaultContext = makeContext(adjust({}), root, null);
  }

  resolve(found: FoundImport, fromRelative: string): ImportOutcome {
    if (found.specifier === null) {
      return { status: "unresolved", reason: "non-literal-dynamic-import" };
    }
    const spec = found.specifier;
    const fromAbs = path.join(this.root, fromRelative);
    const context = this.contextFor(fromAbs);

    const mode =
      found.mode === "esm"
        ? ts.ModuleKind.ESNext
        : found.mode === "cjs"
          ? ts.ModuleKind.CommonJS
          : ts.getImpliedNodeFormatForFile(
              fromAbs,
              context.cache.getPackageJsonInfoCache(),
              ts.sys,
              context.options,
            );

    const resolved = ts.resolveModuleName(
      spec,
      fromAbs,
      context.options,
      ts.sys,
      context.cache,
      undefined,
      mode,
    ).resolvedModule;

    if (resolved) {
      return this.classifyFile(resolved.resolvedFileName, resolved.isExternalLibraryImport === true);
    }

    // Node16/NodeNext ESM rules reject extensionless paths and directory
    // imports, yet test runners and bundlers load those files without
    // complaint. Retrying with TypeScript's bundler rules still only accepts a
    // file TypeScript itself finds; the outcome records that it took the retry.
    if (context.bundler) {
      const retried = ts.resolveModuleName(
        spec,
        fromAbs,
        context.bundler.options,
        ts.sys,
        context.bundler.cache,
      ).resolvedModule;
      if (retried) {
        return this.classifyFile(
          retried.resolvedFileName,
          retried.isExternalLibraryImport === true,
          "bundler",
        );
      }
    }
    return this.classifyFailure(spec, fromAbs, context);
  }

  /** A path TypeScript (or a direct file check) landed on. */
  private classifyFile(
    fileName: string,
    externalLibrary: boolean,
    rules: ResolutionRules = "config",
  ): ImportOutcome {
    const real = realpathSync.native(fileName);
    const rel = toPosix(path.relative(this.root, real));
    if (rel.startsWith("../") || path.isAbsolute(rel)) {
      return { status: "external", via: externalLibrary ? "package" : "outside-root" };
    }

    // Checked before node_modules, so a workspace package linked into
    // node_modules still counts as the repository file it really is.
    const known = this.known.get(rel);
    if (known?.status === "parsed") return { status: "resolved", target: rel, rules };
    if (known?.status === "skipped") {
      return { status: "excluded", reason: "target-skipped", target: rel };
    }

    if (rel.split("/").includes("node_modules")) return { status: "external", via: "package" };
    if (!isSourcePath(rel)) return { status: "excluded", reason: "non-source-file", target: rel };
    if (this.ignoredDirectories.some((dir) => rel.startsWith(`${dir}/`))) {
      return { status: "excluded", reason: "ignored-directory", target: rel };
    }
    // A source file inside the root that the walk neither found nor ignored
    // means the walk and the resolver disagree about the repository.
    throw new Error(`Resolved to ${rel}, which the walk never saw.`);
  }

  private classifyFailure(spec: string, fromAbs: string, context: ConfigContext): ImportOutcome {
    // TypeScript only resolves module extensions. A real file of another kind
    // (stylesheet, image) is checked for directly so it reads as excluded
    // rather than as a failure.
    if (isRelative(spec)) {
      const target = path.resolve(path.dirname(fromAbs), spec);
      if (isFile(target)) return this.classifyFile(target, false);
      return { status: "unresolved", reason: "no-file-at-relative-path" };
    }

    const aliasTargets = pathCandidates(spec, context);
    if (aliasTargets !== null) {
      const hit = aliasTargets.find(isFile);
      if (hit) return this.classifyFile(hit, false);
      return { status: "unresolved", reason: "no-file-at-alias-target" };
    }

    if (BUILTINS.has(spec) || spec.startsWith("node:")) {
      return { status: "external", via: "builtin" };
    }

    const baseUrl = context.options.baseUrl;
    if (baseUrl) {
      const target = path.resolve(baseUrl, spec);
      if (isFile(target)) return this.classifyFile(target, false);
      // The first segment exists under baseUrl, so this names a repository
      // path that isn't there, not a package.
      const first = spec.split("/")[0];
      const firstAbs = path.resolve(baseUrl, first);
      if (existsSync(firstAbs) || SOURCE_EXTENSIONS.some((ext) => existsSync(firstAbs + ext))) {
        return { status: "unresolved", reason: "no-file-at-base-url-path" };
      }
    }

    // A bare specifier no alias or baseUrl claims is a package. In a clone
    // without node_modules it can't be opened, but it points outside either way.
    return { status: "external", via: "package" };
  }

  private contextFor(fileAbs: string): ConfigContext {
    const configPath = this.nearestConfig(path.dirname(fileAbs));
    if (configPath === null) return this.defaultContext;
    const config = this.loadConfig(configPath);
    // A solution-style config defers to whichever referenced project actually
    // includes the file, which is where its paths and options live.
    const normalized = toPosix(fileAbs);
    for (const ref of config.references) {
      const referenced = this.loadConfig(ref);
      if (referenced.fileNames.has(normalized)) return referenced.context;
    }
    return config.context;
  }

  private nearestConfig(dir: string): string | null {
    const cached = this.nearest.get(dir);
    if (cached !== undefined) return cached;
    let found: string | null = null;
    for (const name of CONFIG_NAMES) {
      const candidate = path.join(dir, name);
      if (isFile(candidate)) {
        found = candidate;
        break;
      }
    }
    if (found === null && path.relative(this.root, dir) !== "") {
      found = this.nearestConfig(path.dirname(dir));
    }
    this.nearest.set(dir, found);
    return found;
  }

  private loadConfig(configPath: string): ParsedConfig {
    const key = toPosix(configPath);
    const cached = this.configs.get(key);
    if (cached) return cached;

    const label = toPosix(path.relative(this.root, configPath)) || configPath;
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    if (read.error) this.recordError(label, read.error);

    const parsed = ts.parseJsonConfigFileContent(
      read.config ?? {},
      ts.sys,
      path.dirname(configPath),
      undefined,
      configPath,
    );
    for (const error of parsed.errors) {
      if (error.code !== NO_INPUTS_FOUND) this.recordError(label, error);
    }

    const options = adjust(parsed.options);
    const pathsBasePath = parsed.options.pathsBasePath;
    const result: ParsedConfig = {
      context: makeContext(
        options,
        path.dirname(configPath),
        typeof pathsBasePath === "string" ? pathsBasePath : null,
      ),
      references: (parsed.projectReferences ?? []).map((ref) =>
        ts.resolveProjectReferencePath(ref),
      ),
      fileNames: new Set(parsed.fileNames.map(toPosix)),
    };
    this.configs.set(key, result);
    return result;
  }

  private recordError(config: string, diagnostic: ts.Diagnostic) {
    this.configErrors.push({
      config,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
    });
  }
}

/**
 * Options the parser needs regardless of what the repository says: JavaScript
 * and JSON are files like any other here, even if the project never compiles them.
 */
function adjust(options: ts.CompilerOptions): ts.CompilerOptions {
  const adjusted: ts.CompilerOptions = { ...options, allowJs: true, resolveJsonModule: true };
  // Classic resolution never looks in node_modules or at index files, so it
  // would call most real imports missing. TypeScript falls back to it when a
  // project names an ES module target without a resolution strategy, which in
  // practice means the project is bundled.
  const nodeModules = [
    ts.ModuleKind.CommonJS,
    ts.ModuleKind.Node16,
    ts.ModuleKind.Node18,
    ts.ModuleKind.Node20,
    ts.ModuleKind.NodeNext,
  ];
  const unset =
    options.moduleResolution === undefined &&
    (options.module === undefined || !nodeModules.includes(options.module));
  if (unset || options.moduleResolution === ts.ModuleResolutionKind.Classic) {
    adjusted.moduleResolution = ts.ModuleResolutionKind.Bundler;
    adjusted.module = ts.ModuleKind.ESNext;
  }
  return adjusted;
}

function makeContext(
  options: ts.CompilerOptions,
  configDir: string,
  pathsBase: string | null,
): ConfigContext {
  const strictEsm =
    options.moduleResolution === ts.ModuleResolutionKind.Node16 ||
    options.moduleResolution === ts.ModuleResolutionKind.NodeNext ||
    (options.moduleResolution === undefined &&
      options.module !== undefined &&
      options.module >= ts.ModuleKind.Node16 &&
      options.module <= ts.ModuleKind.NodeNext);
  const bundlerOptions: ts.CompilerOptions = {
    ...options,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
  };
  return {
    options,
    cache: ts.createModuleResolutionCache(configDir, (f) => f, options),
    pathsBase: options.paths ? (pathsBase ?? options.baseUrl ?? configDir) : null,
    bundler: strictEsm
      ? {
          options: bundlerOptions,
          cache: ts.createModuleResolutionCache(configDir, (f) => f, bundlerOptions),
        }
      : null,
  };
}

/**
 * Where `paths` would send a specifier, following TypeScript's matching rule:
 * at most one `*`, and the longest matching prefix wins. Null when no pattern
 * matches, so the caller knows the specifier isn't an alias at all.
 */
function pathCandidates(spec: string, context: ConfigContext): string[] | null {
  const paths = context.options.paths;
  const base = context.pathsBase;
  if (!paths || base === null) return null;

  let best: { prefix: string; captured: string; targets: string[] } | null = null;
  for (const [pattern, targets] of Object.entries(paths)) {
    const star = pattern.indexOf("*");
    if (star === -1) {
      if (pattern === spec && (!best || pattern.length > best.prefix.length)) {
        best = { prefix: pattern, captured: "", targets };
      }
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (
      spec.length >= prefix.length + suffix.length &&
      spec.startsWith(prefix) &&
      spec.endsWith(suffix) &&
      (!best || prefix.length > best.prefix.length)
    ) {
      best = { prefix, captured: spec.slice(prefix.length, spec.length - suffix.length), targets };
    }
  }
  if (!best) return null;
  const captured = best.captured;
  return best.targets.map((t) => path.resolve(base, t.replace("*", captured)));
}

function isRelative(spec: string): boolean {
  return spec === "." || spec === ".." || spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("/");
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}
