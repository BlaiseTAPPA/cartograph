"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  checkFreshnessAction,
  explainFileAction,
  explainFolderAction,
  type ExplainResult,
  type FreshnessResult,
} from "@/app/(workspace)/actions";
import { linkPaths, parseProse, type Inline, type PathRef } from "@/lib/prose";
import { RerunButton } from "./analysis-progress";
import { roleLabel } from "./category-rail";
import { useMapState } from "./map-state";

export type Subject = { kind: "file"; path: string } | { kind: "folder"; dir: string };

/** null while the request is out. */
type Entry = { answer: ExplainResult | null; freshness: FreshnessResult | null };

const keyOf = (s: Subject) => (s.kind === "file" ? `file:${s.path}` : `folder:${s.dir}`);

/**
 * Every explanation fetched on this page, by subject. Held above the
 * selection, so moving away and back finds the answer still there without a
 * second click, and a request still out when the selection moves lands anyway.
 */
export function useExplanations(analysisId: string) {
  const { label } = useMapState();
  const [entries, setEntries] = useState<ReadonlyMap<string, Entry>>(() => new Map());

  const patch = useCallback((key: string, part: Partial<Entry>) => {
    setEntries((prev) => {
      const current = prev.get(key) ?? { answer: null, freshness: null };
      return new Map(prev).set(key, { ...current, ...part });
    });
  }, []);

  const request = useCallback(
    (subject: Subject) => {
      const key = keyOf(subject);
      setEntries((prev) => new Map(prev).set(key, { answer: null, freshness: null }));
      // Separate requests, so a cached answer shows before GitHub has answered
      // whether the code has moved on.
      void (subject.kind === "file"
        ? explainFileAction(analysisId, subject.path)
        : explainFolderAction(analysisId, subject.dir)
      ).then(
        (answer) => {
          patch(key, { answer });
          if (subject.kind === "file" && answer.ok && answer.label && "role" in answer.label && answer.label.role) {
            label(subject.path, answer.label.role);
          }
        },
        (cause: unknown) => patch(key, { answer: { ok: false, error: cause instanceof Error ? cause.message : String(cause) } }),
      );
      void checkFreshnessAction(analysisId, subject.kind === "file" ? subject.path : null).then(
        (freshness) => patch(key, { freshness }),
        (cause: unknown) =>
          patch(key, { freshness: { ok: false, error: cause instanceof Error ? cause.message : String(cause) } }),
      );
    },
    [analysisId, label, patch],
  );

  return { entryOf: (s: Subject) => entries.get(keyOf(s)), request };
}

export function Explanation({
  analysisId,
  subject,
  entry,
  request,
}: {
  analysisId: string;
  subject: Subject;
  entry: Entry | undefined;
  request: (s: Subject) => void;
}) {
  const what = subject.kind === "file" ? "file" : "folder";

  if (entry === undefined) {
    return (
      <div className="px-3 py-3">
        <button
          type="button"
          onClick={() => request(subject)}
          className="h-6 rounded-sm border border-line px-2 text-[11px] hover:border-accent"
        >
          Explain
        </button>
        <p className="mt-1.5 text-[11px] text-muted">
          {subject.kind === "file"
            ? "Asks the model what this file does, from its source and every file it imports or is imported by."
            : "Asks the model what this folder holds and why the files outside it point at it."}
        </p>
      </div>
    );
  }

  const { answer, freshness } = entry;
  return (
    <div className="px-3 py-2">
      <Freshness analysisId={analysisId} freshness={freshness} what={what} />
      {answer === null ? (
        <p className="text-muted">Explaining…</p>
      ) : !answer.ok ? (
        <div>
          <p role="alert">Not explained: {answer.error}</p>
          <button
            type="button"
            onClick={() => request(subject)}
            className="mt-1.5 h-6 rounded-sm border border-line px-2 text-[11px] hover:border-accent"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <Prose body={answer.body} />
          <p className="mt-2 border-t border-line pt-1.5 text-[11px] text-muted">
            <span className="font-mono">{answer.model}</span>, {answer.cached ? "from the cache" : "answered now"},{" "}
            {answer.tracing.on ? "traced" : `not traced: ${answer.tracing.why}`}
          </p>
          {answer.label && (
            <p className="mt-0.5 text-[11px] text-muted">
              {"error" in answer.label
                ? `Not labelled: ${answer.label.error}`
                : answer.label.role === null
                  ? "No convention identifies this file and no role fits it, so it stays unclassified."
                  : `No convention identifies this file; the model labelled it ${roleLabel(answer.label.role).toLowerCase()}.`}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Freshness({
  analysisId,
  freshness,
  what,
}: {
  analysisId: string;
  freshness: FreshnessResult | null;
  what: "file" | "folder";
}) {
  // Said nothing about until it is known.
  if (freshness === null) return null;
  if (!freshness.ok) {
    return <p className="mb-2 text-[11px] text-muted">Couldn&apos;t check whether this is current: {freshness.error}</p>;
  }
  const f = freshness.freshness;
  if (f.state === "current") return null;
  const change =
    f.file === "changed"
      ? "This file has changed since, so the explanation is stale."
      : f.file === "deleted"
        ? "This file no longer exists there, so the explanation is stale."
        : f.file === "unchanged"
          ? "This file is unchanged, but what imports it may not be."
          : `What is in this ${what} may have changed.`;
  return (
    <div role="status" className="mb-2 rounded-sm border border-line px-2 py-1.5">
      <p>
        The repository has moved past the analysed commit, to{" "}
        <span className="font-mono" title={f.head}>
          {f.head.slice(0, 7)}
        </span>
        . {change}
      </p>
      <div className="mt-1.5">
        <RerunButton analysisId={analysisId} />
      </div>
    </div>
  );
}

function Prose({ body }: { body: string }) {
  return (
    <div className="leading-relaxed">
      {parseProse(body).map((block, i) =>
        block.kind === "paragraph" ? (
          <p key={i} className="mb-2">
            <Inlines nodes={block.content} />
          </p>
        ) : (
          <ul key={i} className="mb-2 list-disc pl-4">
            {block.items.map((item, j) => (
              <li key={j}>
                <Inlines nodes={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  const { fileInfo, groups } = useMapState();
  // Only a path that is on this map becomes a link; anything else stays text.
  const lookup = (candidate: string): PathRef | null => {
    const path = candidate.replace(/^\.\//, "");
    if (fileInfo.has(path)) return { kind: "file", path };
    const dir = path.replace(/\/$/, "");
    if (groups.some((g) => g.dir === dir)) return { kind: "folder", path: dir };
    return null;
  };

  return nodes.map((node, i): ReactNode => {
    if (node.kind === "bold") {
      return (
        <strong key={i} className="font-semibold">
          <Inlines nodes={node.children} />
        </strong>
      );
    }
    if (node.kind === "code") {
      const ref = lookup(node.text);
      return ref ? (
        <PathLink key={i} ref_={ref} text={node.text} />
      ) : (
        <code key={i} className="rounded-sm bg-surface px-0.5 font-mono text-[11px]">
          {node.text}
        </code>
      );
    }
    return linkPaths(node.text, lookup).map((seg, j) =>
      "ref" in seg ? <PathLink key={`${i}-${j}`} ref_={seg.ref} text={seg.text} /> : <span key={`${i}-${j}`}>{seg.text}</span>,
    );
  });
}

/** A path in prose. Clicking moves the map to it, the same as a path in a list. */
function PathLink({ ref_, text }: { ref_: PathRef; text: string }) {
  const { selectFile, open, setHover, paneHovered } = useMapState();
  const file = ref_.kind === "file";
  return (
    <button
      type="button"
      onClick={() => (file ? selectFile(ref_.path) : open(ref_.path))}
      onMouseEnter={() => file && setHover({ from: "pane", path: ref_.path })}
      onMouseLeave={() => file && setHover(null)}
      title={ref_.path}
      className={`inline break-all rounded-sm font-mono text-[11px] text-accent hover:underline ${file && paneHovered(ref_.path) ? "bg-accent/15" : ""}`}
    >
      {text}
    </button>
  );
}
