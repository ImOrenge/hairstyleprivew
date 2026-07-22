export const HAIRSTYLE_GENERATION_CREDITS = 10;
export const OUTFIT_LOOKBOOK_CREDITS = 20;
export const ADDITIONAL_AFTERCARE_PROGRAM_CREDITS = 30;
export const FIRST_AFTERCARE_PROGRAM_CREDITS = 0;

export interface ProductCreditPolicySnapshot {
  version: string;
  hairstyleGeneration: number;
  outfitLookbook: number;
  firstAftercareProgram: number;
  additionalAftercareProgram: number;
}

export const DEFAULT_PRODUCT_CREDIT_POLICY: ProductCreditPolicySnapshot = {
  version: "hairfit-credit-policy-2026-07",
  hairstyleGeneration: HAIRSTYLE_GENERATION_CREDITS,
  outfitLookbook: OUTFIT_LOOKBOOK_CREDITS,
  firstAftercareProgram: FIRST_AFTERCARE_PROGRAM_CREDITS,
  additionalAftercareProgram: ADDITIONAL_AFTERCARE_PROGRAM_CREDITS,
};

function normalizedCredits(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function estimateHairstyleGenerations(
  credits: number,
  creditsPerGeneration = HAIRSTYLE_GENERATION_CREDITS,
): number {
  const normalizedCost = Math.max(1, normalizedCredits(creditsPerGeneration));
  return Math.floor(normalizedCredits(credits) / normalizedCost);
}

export function canAffordHairstyleGeneration(credits: number): boolean {
  return normalizedCredits(credits) >= HAIRSTYLE_GENERATION_CREDITS;
}

export function canAffordOutfitLookbook(credits: number): boolean {
  return normalizedCredits(credits) >= OUTFIT_LOOKBOOK_CREDITS;
}

export function aftercareProgramCredits(hasUsedFreeProgram: boolean): number {
  return hasUsedFreeProgram
    ? ADDITIONAL_AFTERCARE_PROGRAM_CREDITS
    : FIRST_AFTERCARE_PROGRAM_CREDITS;
}
