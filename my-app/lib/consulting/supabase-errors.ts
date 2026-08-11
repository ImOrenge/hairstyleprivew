type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
};

export function isMissingOptionalTableError(error: SupabaseErrorLike | null | undefined) {
  if (!error) return false;
  const code = error.code?.toUpperCase();
  if (code === "42P01" || code === "PGRST205") return true;

  const message = error.message?.toLowerCase() ?? "";
  return message.includes("could not find the table") && message.includes("schema cache");
}
