import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env["VITE_SUPABASE_URL"];
const anonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"];

/**
 * `undefined` when VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY aren't set
 * (dev/test without a project configured yet — every e2e run in this repo
 * today). Unlike apps/server's jwtSecret/allowDebugOmniscient dev-only
 * fallbacks, this can't default to a fake client: createClient validates
 * its arguments eagerly and throws on an empty URL, which would crash the
 * whole app at module load, not just the OAuth buttons. Callers
 * (LoginView's OAuth buttons, AuthCallbackView, session.ts's signOut) must
 * handle the unconfigured case explicitly.
 */
export const supabase: SupabaseClient | undefined =
  url && anonKey ? createClient(url, anonKey) : undefined;
