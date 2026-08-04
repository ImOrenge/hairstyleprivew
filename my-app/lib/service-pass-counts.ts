import {
  ADDITIONAL_AFTERCARE_PROGRAM_CREDITS,
  HAIRSTYLE_GENERATION_CREDITS,
  OUTFIT_LOOKBOOK_CREDITS,
} from "../../packages/shared/src/billing/policy-selectors.ts";

export interface ServicePassCounts {
  hairCount: number;
  fashionSetCount: number;
  careCount: number;
}

function normalizeCredits(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function getServicePassCounts(credits: number): ServicePassCounts {
  const normalizedCredits = normalizeCredits(credits);
  const fashionSetCost = HAIRSTYLE_GENERATION_CREDITS + OUTFIT_LOOKBOOK_CREDITS;

  return {
    hairCount: Math.floor(normalizedCredits / HAIRSTYLE_GENERATION_CREDITS),
    fashionSetCount: Math.floor(normalizedCredits / fashionSetCost),
    careCount: Math.floor(normalizedCredits / ADDITIONAL_AFTERCARE_PROGRAM_CREDITS),
  };
}

export function formatServicePassCountsKo(counts: ServicePassCounts): string {
  return `헤어 ${counts.hairCount.toLocaleString("ko-KR")}회 · 패션 ${counts.fashionSetCount.toLocaleString("ko-KR")}세트 · 케어 ${counts.careCount.toLocaleString("ko-KR")}회`;
}
