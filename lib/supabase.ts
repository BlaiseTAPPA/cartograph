import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Supabase never holds a session of its own: Clerk owns identity, and every
// request carries the Clerk session token so policies can read the
// organization claim off auth.jwt(). Passing accessToken also disables
// supabase-js's own auth, so there is no second session to drift.
export function createServerSupabase() {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    accessToken: async () => (await auth()).getToken(),
  });
}
