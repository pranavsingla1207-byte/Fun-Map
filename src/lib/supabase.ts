import { createClient } from "@supabase/supabase-js";
import { assertServerConfig, config } from "./config";

export function supabaseAdmin() {
  assertServerConfig();
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
