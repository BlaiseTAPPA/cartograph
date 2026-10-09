/**
 * The shortest trailing run of path segments that no other path in the set
 * also ends with. "." (the root) is its own label.
 */
export function shortestUniqueLabels(paths: string[]): Map<string, string> {
  const split = new Map(paths.map((p) => [p, p === "." ? ["."] : p.split("/")]));
  const suffix = (segments: string[], n: number) => segments.slice(-n).join("/");
  const labels = new Map<string, string>();
  for (const [path, segments] of split) {
    let n = 1;
    while (n < segments.length) {
      const candidate = suffix(segments, n);
      let clash = false;
      for (const [other, otherSegments] of split) {
        if (other !== path && suffix(otherSegments, n) === candidate) {
          clash = true;
          break;
        }
      }
      if (!clash) break;
      n++;
    }
    labels.set(path, suffix(segments, n));
  }
  return labels;
}
