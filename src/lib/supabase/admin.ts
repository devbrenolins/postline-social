import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com service role (server-only, ignora RLS).
 * Usado para operações administrativas como enviar convites por e-mail.
 * NUNCA importe isto em código client-side.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Configure SUPABASE_SERVICE_ROLE_KEY para operações administrativas.");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function supabaseAdminConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
