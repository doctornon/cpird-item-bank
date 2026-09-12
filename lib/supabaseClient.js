"use client";
import { createClient } from "@supabase/supabase-js";

// Publishable key + URL are safe to expose to the browser (RLS enforces access).
const SUPABASE_URL = "https://dainlpcqtirqoekrjtem.supabase.co";
const SUPABASE_KEY = "sb_publishable_KgK7wG8bV2i2gal9A-LwOg_K6k7kVo1";

let _client = null;
export function getSupabase() {
  if (_client) return _client;
  _client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return _client;
}
