export const DEFAULT_AFTERCARE_LLM_MODEL = "gemini-3.5-flash";

export function getAftercareLlmModel(
  env: Record<string, string | undefined> = process.env,
) {
  const configured = env.AFTERCARE_LLM_MODEL?.trim();
  if (!configured || configured.includes("YOUR_")) {
    return DEFAULT_AFTERCARE_LLM_MODEL;
  }

  return configured;
}
