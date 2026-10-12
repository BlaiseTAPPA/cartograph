"use server";

import { auth } from "@clerk/nextjs/server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { MODELS, tracing, type Tracing } from "@/ai/client";
import type { ClassifiableRole } from "@/frameworks/taxonomy";
import { checkFreshness, explainStoredFile, explainStoredFolder, type Freshness } from "@/lib/explain";
import { requeueAnalysis, runAnalysis, startAnalysis } from "@/pipeline/run";

// The run happens after the response, in the same process. There is no queue:
// if this process stops mid-run, the row stops moving, and the dashboard says
// so once it has been still for a few minutes.
function runAfterResponse(analysisId: string): void {
  after(async () => {
    try {
      await runAnalysis(analysisId);
    } catch (cause) {
      // The run has already written the failure to its row; this is for the
      // server log.
      console.error(`Analysis ${analysisId} failed:`, cause);
    }
  });
}

/** Returns an error to show under the form, or redirects to the analysis. */
export async function analyseRepository(_previous: string | null, form: FormData): Promise<string | null> {
  const { orgId } = await auth();
  if (!orgId) return "No active organization. Choose one before analysing a repository.";

  const url = form.get("url");
  if (typeof url !== "string" || url.trim() === "") return "Paste a GitHub repository URL.";

  let analysisId: string;
  try {
    const started = await startAnalysis(orgId, url);
    analysisId = started.analysisId;
    // An existing analysis is opened, not run again. Re-running is a separate,
    // deliberate act from the analysis itself.
    if (started.created) runAfterResponse(analysisId);
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
  redirect(`/analyses/${analysisId}`);
}

/** Returns an error to show beside the button, or null once re-queued. */
export async function rerunAnalysis(analysisId: string): Promise<string | null> {
  const { orgId } = await auth();
  if (!orgId) return "No active organization.";

  if (!(await requeueAnalysis(orgId, analysisId))) {
    return "This analysis is still running, or isn't in this organization.";
  }
  runAfterResponse(analysisId);
  refresh();
  return null;
}

export type ExplainResult =
  | {
      ok: true;
      body: string;
      cached: boolean;
      model: string;
      tracing: Tracing;
      /** Set for a file no convention named: what the model labelled it, if anything. */
      label: { role: ClassifiableRole | null } | { error: string } | null;
    }
  | { ok: false; error: string };

export async function explainFileAction(analysisId: string, path: string): Promise<ExplainResult> {
  const { orgId } = await auth();
  if (!orgId) return { ok: false, error: "No active organization." };
  try {
    const { answer, label } = await explainStoredFile(orgId, analysisId, path);
    return {
      ok: true,
      body: answer.body,
      cached: answer.cached,
      model: MODELS.explain,
      tracing: tracing(),
      label: label === null ? null : "error" in label ? { error: label.error } : { role: label.role },
    };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

export async function explainFolderAction(analysisId: string, dir: string): Promise<ExplainResult> {
  const { orgId } = await auth();
  if (!orgId) return { ok: false, error: "No active organization." };
  try {
    const answer = await explainStoredFolder(orgId, analysisId, dir);
    return { ok: true, body: answer.body, cached: answer.cached, model: MODELS.explain, tracing: tracing(), label: null };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

export type FreshnessResult = { ok: true; freshness: Freshness } | { ok: false; error: string };

/** `path` is null for a folder, which is checked by commit only. */
export async function checkFreshnessAction(analysisId: string, path: string | null): Promise<FreshnessResult> {
  try {
    return { ok: true, freshness: await checkFreshness(analysisId, path) };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}
