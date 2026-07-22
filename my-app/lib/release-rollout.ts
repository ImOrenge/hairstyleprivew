export const GENERATION_ACCEPTANCE_PAUSED_CODE = "GENERATION_ACCEPTANCE_PAUSED";
export const STYLING_ACCEPTANCE_PAUSED_CODE = "STYLING_ACCEPTANCE_PAUSED";
export const ACCEPTANCE_PAUSE_RETRY_AFTER_SECONDS = 5 * 60;

type AcceptanceEnvironment = Readonly<{
  GENERATION_ACCEPTANCE_ENABLED?: string;
  STYLING_ACCEPTANCE_ENABLED?: string;
}>;

function isEnabledUnlessExplicitlyFalse(value: string | undefined) {
  return value?.trim().toLowerCase() !== "false";
}

export function isGenerationAcceptanceEnabled(env?: AcceptanceEnvironment) {
  const value = env === undefined
    ? process.env.GENERATION_ACCEPTANCE_ENABLED
    : env.GENERATION_ACCEPTANCE_ENABLED;
  return isEnabledUnlessExplicitlyFalse(value);
}

export function isStylingAcceptanceEnabled(env?: AcceptanceEnvironment) {
  const value = env === undefined
    ? process.env.STYLING_ACCEPTANCE_ENABLED
    : env.STYLING_ACCEPTANCE_ENABLED;
  return isEnabledUnlessExplicitlyFalse(value);
}
