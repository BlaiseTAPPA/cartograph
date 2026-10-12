"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { analyseRepository } from "../app/(workspace)/actions";

/**
 * `startWith`: a URL carried in from the landing page through sign-in. It is
 * submitted once on arrival, through the same action as a typed one, so a bad
 * URL or a missing organization shows the same error in the same place.
 */
export function AnalyseForm({ startWith }: { startWith?: string }) {
  const [error, action, pending] = useActionState(analyseRepository, null);
  const started = useRef(false);

  useEffect(() => {
    // Effects run twice in development; the ref keeps it to one analysis.
    if (!startWith || started.current) return;
    started.current = true;
    const form = new FormData();
    form.set("url", startWith);
    startTransition(() => action(form));
  }, [startWith, action]);

  return (
    <form action={action} className="shrink-0 border-b border-line px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <input
          name="url"
          type="text"
          required
          spellCheck={false}
          autoComplete="off"
          defaultValue={startWith}
          placeholder="https://github.com/owner/repository"
          aria-label="Public GitHub repository URL"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "analyse-error" : undefined}
          className="h-7 min-w-0 flex-1 rounded-sm border border-line bg-raised px-2 font-mono text-[11px] outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-7 shrink-0 rounded-sm bg-accent px-3 text-[11px] font-medium text-white disabled:opacity-60"
        >
          {pending ? "Starting…" : "Analyse"}
        </button>
      </div>
      {error && (
        <p id="analyse-error" role="alert" className="mt-1.5 text-[11px]">
          {error}
        </p>
      )}
    </form>
  );
}
