// This publishable key is intended for browser applications.
// Database security is enforced by Supabase Row Level Security policies.
const FYDP_SUPABASE_URL = "https://xxqrjpgdjmrlyqktfiby.supabase.co";
const FYDP_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_hmSRVlTBTxpl3WP-t0lUOg_5m1y0rQG";

window.fydpSupabase = window.supabase.createClient(
  FYDP_SUPABASE_URL,
  FYDP_SUPABASE_PUBLISHABLE_KEY
);
