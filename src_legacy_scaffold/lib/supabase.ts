export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function buildStoragePublicUrl(bucket: string, objectPath: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    return "";
  }

  return `${base}/storage/v1/object/public/${bucket}/${objectPath}`;
}
