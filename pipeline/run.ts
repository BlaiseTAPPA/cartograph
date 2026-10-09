import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { STALE_AFTER_MS, type Stage } from "../lib/progress.ts";
import { fallbackAdapter, parseRepository, type ParseResult } from "../parser/index.ts";
import { isSourcePath, walkRepository } from "../parser/walk.ts";
import { createRunSupabase, type RunSupabase } from "./db.ts";
import { fetchArchive, parseRepoUrl } from "./github.ts";
import { unpackTarGz, type Unwritten } from "./tar.ts";

/**
 * One analysis per repository: returns the existing one when this
 * organization has analysed the repository before, and creates a queued one
 * otherwise. `orgId` must come from a verified session.
 */
export async function startAnalysis(
  orgId: string,
  repoUrl: string,
): Promise<{ analysisId: string; created: boolean }> {
  const repo = parseRepoUrl(repoUrl);
  const db = createRunSupabase();

  must(await db.from("organizations").upsert({ id: orgId }, { ignoreDuplicates: true }), "Recording the organization");
  must(
    await db
      .from("projects")
      .upsert({ org_id: orgId, repo_url: repo.url }, { onConflict: "org_id,repo_url", ignoreDuplicates: true }),
    "Recording the repository",
  );
  const project = must(
    await db.from("projects").select("id").eq("org_id", orgId).eq("repo_url", repo.url).single(),
    "Reading the repository",
  );

  // The unique constraint decides, not a read beforehand: two submissions of
  // the same URL at once still produce one row.
  const inserted = must(
    await db
      .from("analyses")
      .upsert({ org_id: orgId, project_id: project.id }, { onConflict: "project_id", ignoreDuplicates: true })
      .select("id"),
    "Creating the analysis",
  );
  if (inserted.length === 1) return { analysisId: inserted[0].id, created: true };

  const existing = must(
    await db.from("analyses").select("id").eq("org_id", orgId).eq("project_id", project.id).single(),
    "Reading the existing analysis",
  );
  return { analysisId: existing.id, created: false };
}

/**
 * Puts a finished, failed or abandoned analysis back in the queue. Refuses one
 * that is still running. Returns whether it was re-queued.
 */
export async function requeueAnalysis(orgId: string, analysisId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const rows = must(
    await createRunSupabase()
      .from("analyses")
      .update({ status: "queued", stage: null, stage_message: null, error: null, finished_at: null })
      .eq("id", analysisId)
      .eq("org_id", orgId)
      .or(
        `status.in.(complete,failed),stage_changed_at.lt.${staleBefore},and(stage_changed_at.is.null,created_at.lt.${staleBefore})`,
      )
      .select("id"),
    "Re-queueing the analysis",
  );
  return rows.length === 1;
}

/**
 * Fetch, select, parse, store. Never leaves the row mid-run on an error: any
 * failure is written as a failed state with the reason, and the stage column
 * still names the stage it failed in.
 */
export async function runAnalysis(analysisId: string): Promise<void> {
  const db = createRunSupabase();

  // Claiming moves queued to parsing in one statement, so two callers can't
  // both run the same analysis.
  const claimed = must(
    await db
      .from("analyses")
      .update({ status: "parsing", stage: "fetch", stage_message: "Starting", coverage: null, adapter: null })
      .eq("id", analysisId)
      .eq("status", "queued")
      .select("id, org_id, project:projects!inner(repo_url)")
      .maybeSingle(),
    "Claiming the analysis",
  );
  if (!claimed) throw new Error(`Analysis ${analysisId} is not queued.`);

  const orgId = claimed.org_id;
  const setStage = async (stage: Stage, message: string) =>
    must(
      await db.from("analyses").update({ stage, stage_message: message }).eq("id", analysisId).eq("org_id", orgId),
      `Recording the ${stage} stage`,
    );

  const workdir = mkdtempSync(path.join(tmpdir(), "cartograph-"));
  try {
    const repo = parseRepoUrl(claimed.project.repo_url);

    await setStage("fetch", `Downloading ${repo.owner}/${repo.name} from GitHub`);
    const archive = await fetchArchive(repo);

    await setStage("select", `Unpacking ${megabytes(archive.length)} and choosing source files`);
    const unpacked = unpackTarGz(archive, workdir);
    if (!unpacked.commitSha) {
      throw new Error("The archive names no commit, so this analysis couldn't say which version of the code it describes.");
    }
    must(
      await db.from("analyses").update({ commit_sha: unpacked.commitSha }).eq("id", analysisId).eq("org_id", orgId),
      "Recording the commit",
    );
    failOnMissingSource(unpacked.unwritten);
    const walk = walkRepository(workdir, fallbackAdapter);

    await setStage(
      "parse",
      `Resolving imports in ${walk.files.length} source files of ${unpacked.written}` +
        (unpacked.unwritten.length > 0 ? `; ${unpacked.unwritten.length} archive entries not unpacked` : ""),
    );
    const result = parseRepository(workdir, fallbackAdapter);

    await setStage("store", `Writing ${result.files.length} files and ${result.edges.length} edges`);
    await store(db, orgId, analysisId, result);

    const { files, imports } = result.coverage;
    must(
      await db
        .from("analyses")
        .update({
          status: "complete",
          finished_at: new Date().toISOString(),
          coverage: result.coverage,
          adapter: result.adapter,
          stage_message: `${files.parsed} files parsed, ${imports.resolved} of ${imports.seen} imports resolved to a file`,
        })
        .eq("id", analysisId)
        .eq("org_id", orgId),
      "Marking the analysis complete",
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const { error } = await db
      .from("analyses")
      .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
      .eq("id", analysisId)
      .eq("org_id", orgId);
    if (error) throw new Error(`${message} — and recording the failure also failed: ${error.message}`);
    throw cause;
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

/**
 * A source file that couldn't be written would be missing from the parse
 * without the parser knowing it ever existed. The graph would look complete
 * and wouldn't be, so that fails the run instead. Links are fine: the walk
 * doesn't follow them either.
 */
function failOnMissingSource(unwritten: Unwritten[]): void {
  const missing = unwritten.filter(
    (u) =>
      u.reason !== "link" &&
      isSourcePath(u.path) &&
      !u.path.split("/").slice(0, -1).some((dir, i, dirs) =>
        fallbackAdapter.ignoresDirectory(dir, dirs.slice(0, i + 1).join("/")),
      ),
  );
  if (missing.length === 0) return;
  const shown = missing.slice(0, 5).map((u) => `${u.path} (${u.reason})`).join(", ");
  throw new Error(
    `${missing.length} source file${missing.length === 1 ? "" : "s"} could not be unpacked on this machine: ${shown}${missing.length > 5 ? ", …" : ""}`,
  );
}

const FILE_BATCH = 500;
const EDGE_BATCH = 1000;

async function store(db: RunSupabase, orgId: string, analysisId: string, result: ParseResult): Promise<void> {
  // A re-run replaces what an earlier run stored; edges go with their files.
  // Rows written here aren't visible as an analysis until the status says
  // complete, so a run that dies mid-store never shows a partial graph as whole.
  must(
    await db.from("files").delete().eq("analysis_id", analysisId).eq("org_id", orgId),
    "Clearing the previous run's files",
  );

  const idByPath = new Map<string, string>();
  for (let i = 0; i < result.files.length; i += FILE_BATCH) {
    const rows = result.files.slice(i, i + FILE_BATCH).map((f) => ({
      org_id: orgId,
      analysis_id: analysisId,
      path: f.path,
      module: f.module,
      skip_reason: f.status === "skipped" ? f.reason : null,
      lines: f.status === "parsed" ? f.lines : null,
      hash: f.status === "parsed" ? f.hash : null,
    }));
    const stored = must(await db.from("files").insert(rows).select("id, path"), "Writing files");
    for (const row of stored) idByPath.set(row.path, row.id);
  }

  const edgeRows = result.edges.map((e) => {
    const from = idByPath.get(e.from);
    const to = idByPath.get(e.to);
    // The parser promises both ends are files it listed. If that ever breaks,
    // stop rather than store an edge to nowhere.
    if (!from || !to) throw new Error(`Edge ${e.from} → ${e.to} names a file that wasn't stored.`);
    return { org_id: orgId, analysis_id: analysisId, from_file_id: from, to_file_id: to, kind: e.kind };
  });
  for (let i = 0; i < edgeRows.length; i += EDGE_BATCH) {
    must(await db.from("edges").insert(edgeRows.slice(i, i + EDGE_BATCH)), "Writing edges");
  }
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Unwraps a Supabase response, throwing with what was being attempted. */
function must<T>(
  // The failure branch names no data, so T is inferred from success alone.
  response: { data: T; error: null } | { error: { message: string } },
  doing: string,
): T {
  if (response.error) throw new Error(`${doing} failed: ${response.error.message}`);
  return response.data;
}

