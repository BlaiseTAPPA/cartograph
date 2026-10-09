"use client";

import { useAuth } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { Database } from "./database.types";
import { newer, parseProgress, type Progress } from "./progress";

// The browser's client exists for one thing: subscribing to progress. It
// carries the Clerk session token, which is why that token is readable from
// the page at all. A bare client would join as anonymous and every private
// channel would refuse it. Reads stay on the server.

type TokenSource = () => Promise<string | null>;

let client: SupabaseClient<Database> | null = null;
let tokenSource: TokenSource | null = null;

function browserSupabase(getToken: TokenSource): SupabaseClient<Database> {
  // Always the latest: Clerk refreshes the token, and the socket asks for it
  // again on reconnect.
  tokenSource = getToken;
  if (client) return client;

  // Spelled out so Next inlines them into the bundle; lib/env reads by name,
  // which only works on the server.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.");

  client = createClient<Database>(url, key, {
    accessToken: async () => (tokenSource ? tokenSource() : null),
  });
  return client;
}

// Covers a whole run several times over: a run publishes about six events.
const REPLAY_LIMIT = 25;

/**
 * The newest of the server's snapshot and what the channel has published
 * since. Subscribes only while `live` is true.
 *
 * The channel replays what was published after the snapshot was read, so an
 * update landing between the server render and the subscription isn't lost,
 * and nothing has to read the row again.
 */
export function useProgress(analysisId: string, snapshot: Progress, live: boolean): Progress {
  const { getToken } = useAuth();
  const [received, setReceived] = useState<Progress | null>(null);
  const since = snapshot.at;

  useEffect(() => {
    if (!live) return;
    const supabase = browserSupabase(getToken);
    const channel = supabase
      .channel(`analysis:${analysisId}`, {
        config: {
          private: true,
          broadcast: since ? { replay: { since: Date.parse(since), limit: REPLAY_LIMIT } } : {},
        },
      })
      .on<Record<string, unknown>>("broadcast", { event: "progress" }, ({ payload }) => {
        const progress = parseProgress(payload);
        if (progress) setReceived((current) => (current ? newer(current, progress) : progress));
      })
      .subscribe((status, err) => {
        // Said loudly: a refused or failed join otherwise looks exactly like
        // a run that isn't moving.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(`Progress channel for ${analysisId}: ${status}`, err);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [analysisId, since, live, getToken]);

  return newer(snapshot, received);
}
