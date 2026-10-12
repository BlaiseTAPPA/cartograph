// Framework knowledge lives behind this interface. The parser hands every
// parsed file to the adapter and never checks for a framework itself; it
// doesn't know any naming convention, not even a test file's.

import type { SourceFile } from "ts-morph";
import type { Route, RouteGap } from "./types.ts";

export type FileSyntax = {
  /** Relative to the parsed root, forward slashes. */
  path: string;
  /** Only valid during the call it was passed to. */
  syntax: SourceFile;
};

export type FileReading = {
  /**
   * What sort of file this is by the framework's conventions, or null when no
   * convention identifies it. Never a best guess.
   */
  role: string | null;
  /** Only routes whose method and full path are both in the syntax. */
  routes: Route[];
  /** Routes the file declares that couldn't be recovered exactly, and why. */
  gaps: RouteGap[];
};

export type FrameworkAdapter = {
  name: string;
  /**
   * Whether the walk should skip a directory. Skipped directories are listed in
   * coverage, and imports into them are reported as excluded.
   */
  ignoresDirectory(name: string, relativePath: string): boolean;
  read(file: FileSyntax): FileReading;
  /**
   * Gaps that hold across the repository rather than one file, found when the
   * adapter was set up: a prefix that can't be read, for instance.
   */
  repositoryGaps: RouteGap[];
};
