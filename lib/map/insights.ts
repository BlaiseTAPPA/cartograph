// Facts about the edge list, and nothing else. No model finds or words these:
// each kind has one fixed sentence.

import type { Neighbours } from "./detail.ts";

export type InsightFile = { path: string; fanIn: number; lines: number };

export const INSIGHT_SENTENCES = {
  unimported: "Nothing in the repository imports these files.",
  cycle: "These files import one another in a loop.",
  heavilyImported: "An unusual number of files import these.",
  long: "These files are longer than 1,000 lines.",
} as const;

/** Above this a file is long, whatever the repository. */
export const LONG_LINES = 1000;
/** "Unusual" is relative to the repository: the top 1% of files by fan-in. */
export const HEAVY_SHARE = 0.01;

export type Insights = {
  /** Files nothing imports, leaving out what a framework or tool reaches by name. */
  unimported: InsightFile[];
  /** Each a closed loop: the last file imports the first. One per tangle. */
  cycles: string[][];
  heavilyImported: InsightFile[];
  long: InsightFile[];
};

const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function findInsights(
  files: readonly InsightFile[],
  index: ReadonlyMap<string, Neighbours>,
  /** True when a framework or tool reaches the file without an import. */
  reachedByName: (path: string) => boolean,
): Insights {
  const unimported = files
    .filter((f) => f.fanIn === 0 && !reachedByName(f.path))
    .sort((a, b) => byPath(a.path, b.path));

  // Ties at the cut-off are all in: two files with the same fan-in can't be
  // one unusual and one not.
  const imported = files.filter((f) => f.fanIn > 0).sort((a, b) => b.fanIn - a.fanIn || byPath(a.path, b.path));
  const take = Math.max(1, Math.ceil(files.length * HEAVY_SHARE));
  const cutoff = imported[Math.min(take, imported.length) - 1]?.fanIn ?? Infinity;
  const heavilyImported = imported.filter((f) => f.fanIn >= cutoff);

  const long = files.filter((f) => f.lines > LONG_LINES).sort((a, b) => b.lines - a.lines || byPath(a.path, b.path));

  return { unimported, cycles: findCycles(files.map((f) => f.path), index), heavilyImported, long };
}

/**
 * One concrete loop per strongly connected group of files. The groups come
 * from Tarjan's algorithm, run with an explicit stack: a real repository's
 * import chains are deep enough to overflow the call stack if done recursively.
 */
export function findCycles(paths: readonly string[], index: ReadonlyMap<string, Neighbours>): string[][] {
  const out = (p: string) => index.get(p)?.imports ?? [];
  const order = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const groups: string[][] = [];
  let counter = 0;

  for (const root of [...paths].sort(byPath)) {
    if (order.has(root)) continue;
    // Each frame is a file and how far through its imports we've got.
    const frames: { path: string; next: number }[] = [{ path: root, next: 0 }];
    order.set(root, counter);
    low.set(root, counter);
    counter++;
    stack.push(root);
    onStack.add(root);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const targets = out(frame.path);
      if (frame.next < targets.length) {
        const target = targets[frame.next++];
        if (!order.has(target)) {
          order.set(target, counter);
          low.set(target, counter);
          counter++;
          stack.push(target);
          onStack.add(target);
          frames.push({ path: target, next: 0 });
        } else if (onStack.has(target)) {
          low.set(frame.path, Math.min(low.get(frame.path) ?? 0, order.get(target) ?? 0));
        }
        continue;
      }
      frames.pop();
      const parent = frames[frames.length - 1];
      if (parent) low.set(parent.path, Math.min(low.get(parent.path) ?? 0, low.get(frame.path) ?? 0));
      if (low.get(frame.path) === order.get(frame.path)) {
        const group: string[] = [];
        let member: string | undefined;
        do {
          member = stack.pop();
          if (member === undefined) break;
          onStack.delete(member);
          group.push(member);
        } while (member !== frame.path);
        const selfImport = group.length === 1 && out(group[0]).includes(group[0]);
        if (group.length > 1 || selfImport) groups.push(group);
      }
    }
  }

  return groups
    .map((group) => shortestLoop(group, out))
    .sort((a, b) => a.length - b.length || byPath(a[0], b[0]));
}

/**
 * The shortest loop through the group's first file (by path), found
 * breadth-first inside the group. Shortest, so it can be walked by hand.
 */
function shortestLoop(group: string[], out: (p: string) => string[]): string[] {
  const members = new Set(group);
  const start = [...group].sort(byPath)[0];
  const cameFrom = new Map<string, string>();
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    for (const next of out(at)) {
      if (!members.has(next)) continue;
      if (next === start) {
        const loop = [at];
        for (let p = cameFrom.get(at); p !== undefined; p = cameFrom.get(p)) loop.push(p);
        return loop.reverse();
      }
      if (cameFrom.has(next)) continue;
      cameFrom.set(next, at);
      queue.push(next);
    }
  }
  // A strongly connected group always has a loop through every member.
  throw new Error(`No loop found through ${start}`);
}
