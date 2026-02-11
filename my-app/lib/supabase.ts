import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type SupabaseAny = Record<string, Json>;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function getSupabaseAdminClient(): SupabaseClient<SupabaseAny> {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient<SupabaseAny>(supabaseUrl, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function buildStoragePublicUrl(bucket: string, objectPath: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    return "";
  }

  return `${base}/storage/v1/object/public/${bucket}/${objectPath}`;
}
