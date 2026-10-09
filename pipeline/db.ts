import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types.ts";
import { env } from "../lib/env.ts";

// The run's own client, with the secret key. It bypasses row-level security,
// so every query through it names the organization it acts for, taken from a
// verified session before the run started. Nothing that renders in a browser
// may import this module.
export function createRunSupabase() {
  return createClient<Database>(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type RunSupabase = ReturnType<typeof createRunSupabase>;
