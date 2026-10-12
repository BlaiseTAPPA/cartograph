import { Client } from "langsmith";
import { getCurrentRunTree } from "langsmith/traceable";
import { tracing } from "./client.ts";
import { checkPaths, pathComment, PATH_CHECK_KEY, pathScore } from "./invented-paths.ts";

// The invented-path check, live: every answer a model writes in the app is
// scored the moment it comes back, against the exact messages it was handed,
// and the score is recorded on the run that asked. A cache hit isn't scored
// again; its answer was scored when it was written, and counting it twice
// would weigh repeated questions over fresh ones.

const langsmith = new Client();

// Feedback names its project by id; runs name it by name. Looked up once each.
const projectIds = new Map<string, Promise<string>>();
function projectId(name: string): Promise<string> {
  let id = projectIds.get(name);
  if (!id) {
    id = langsmith.readProject({ projectName: name }).then((p) => p.id);
    // A failed lookup isn't remembered, so the next answer tries again.
    id.catch(() => projectIds.delete(name));
    projectIds.set(name, id);
  }
  return id;
}

/**
 * Called inside the traced run, after the model answered. A failure to record
 * is logged and the answer still returned: the explanation doesn't depend on
 * its own score.
 */
export async function scorePaths(answer: string, shown: readonly string[]): Promise<void> {
  if (!tracing().on) return;
  const run = getCurrentRunTree(true);
  if (!run) throw new Error("scorePaths was called outside a traced run, so there is no run to score.");
  const check = checkPaths(answer, shown);
  try {
    if (!run.project_name) throw new Error("the run names no project");
    await langsmith.createFeedback({
      runId: run.id,
      traceId: run.trace_id,
      startTime: run.start_time,
      sessionId: await projectId(run.project_name),
      key: PATH_CHECK_KEY,
      score: pathScore(check),
      value: { named: check.named, invented: check.invented },
      comment: pathComment(check),
    });
  } catch (cause) {
    console.error(
      `Recording ${PATH_CHECK_KEY} on run ${run.id} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}
