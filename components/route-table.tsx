import { FRAMEWORK_LABEL, type Framework } from "@/frameworks/taxonomy";
import type { Route, RouteGap } from "@/parser/types";

/** Where the table points for each row: the line on GitHub at the analysed commit. */
export type SourceLink = { owner: string; name: string; commitSha: string } | null;

function lineUrl(source: SourceLink, file: string, line: number | null): string | null {
  if (source === null) return null;
  const path = file.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${source.owner}/${source.name}/blob/${source.commitSha}/${path}${line === null ? "" : `#L${line}`}`;
}

// Why a table is empty depends on the framework, and the reason is the point:
// an empty table must never read as "this code has no routes" when the truth
// is "nothing here declares them in a way that can be read exactly".
const EMPTY: Record<Framework, string> = {
  nestjs: "No controller declares a route that could be read exactly.",
  nextjs: "No page or route handler declares a route that could be read exactly.",
  react: "React has no routing of its own, so there are no routes to read.",
  none: "No framework adapter matched this repository, so no routes are read.",
};

export function RouteTable({
  framework,
  routes,
  gaps,
  source,
}: {
  framework: Framework;
  routes: Route[];
  gaps: RouteGap[];
  source: SourceLink;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-surface text-xs">
      <div className="flex h-7 items-center gap-3 border-b border-line bg-raised px-3 text-[11px] text-muted tabular-nums">
        <span>{FRAMEWORK_LABEL[framework]}</span>
        <span>
          {routes.length} route{routes.length === 1 ? "" : "s"}
        </span>
        {gaps.length > 0 && <span>{gaps.length} not shown</span>}
        <span className="ml-auto">Only routes whose method and full path are both in the code.</span>
      </div>

      {routes.length === 0 ? (
        <p className="px-3 py-3 text-muted">{EMPTY[framework]}</p>
      ) : (
        <table className="w-full border-collapse tabular-nums">
          <thead className="sticky top-0 bg-raised text-left text-[11px] text-muted">
            <tr className="border-b border-line">
              <th className="h-6 w-20 px-3 font-normal">Method</th>
              <th className="h-6 px-3 font-normal">Path</th>
              <th className="h-6 px-3 font-normal">Declared in</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => {
              const url = lineUrl(source, r.file, r.line);
              const where = `${r.file}:${r.line}`;
              return (
                <tr key={`${r.method} ${r.path} ${where}`} className="border-b border-line hover:bg-raised">
                  {/* "page" isn't an HTTP method, so it doesn't look like one. */}
                  <td className={`h-6 px-3 font-mono ${r.method === "page" ? "text-muted" : ""}`}>{r.method}</td>
                  <td className="h-6 px-3 font-mono break-all">{r.path}</td>
                  <td className="h-6 px-3 font-mono text-[11px] break-all">
                    {url === null ? (
                      where
                    ) : (
                      <a href={url} target="_blank" rel="noreferrer" className="hover:text-accent hover:underline">
                        {where}
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {gaps.length > 0 && (
        <section className="border-t border-line">
          <h2 className="flex h-7 items-center px-3 text-[11px] text-muted">
            Declared in the code but not shown, {gaps.length}
          </h2>
          <ul className="pb-2">
            {gaps.map((g, i) => {
              const where = g.line === null ? g.file : `${g.file}:${g.line}`;
              const url = lineUrl(source, g.file, g.line);
              return (
                <li key={`${where} ${i}`} className="flex gap-3 px-3 py-0.5">
                  <span className="w-[40%] shrink-0 font-mono text-[11px] break-all">
                    {url === null ? (
                      where
                    ) : (
                      <a href={url} target="_blank" rel="noreferrer" className="hover:text-accent hover:underline">
                        {where}
                      </a>
                    )}
                  </span>
                  <span className="text-muted">{g.reason}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
