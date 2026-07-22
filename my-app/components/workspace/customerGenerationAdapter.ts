import type { PersonalColorResult } from "../../lib/fashion-types";

interface StyleProfileResponse {
  profile?: {
    personalColor?: PersonalColorResult | null;
  };
}

interface GenerationSelectionResponse {
  error?: string;
}

export async function loadCustomerPersonalColor(signal?: AbortSignal) {
  const response = await fetch("/api/style-profile", {
    cache: "no-store",
    signal,
  });
  const data = (await response.json().catch(() => ({}))) as StyleProfileResponse;

  if (!response.ok) {
    return null;
  }

  return data.profile?.personalColor ?? null;
}

export async function saveCustomerSelectedVariant(input: {
  generationId: string;
  selectedVariantId: string;
}) {
  const response = await fetch(
    `/api/generations/${encodeURIComponent(input.generationId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedVariantId: input.selectedVariantId }),
    },
  );
  const data = (await response.json().catch(() => ({}))) as GenerationSelectionResponse;

  if (!response.ok) {
    throw new Error(
      response.status === 409
        ? data.error || "확정한 헤어는 변경할 수 없습니다. 다른 스타일은 다시 생성해 주세요."
        : data.error || "선택한 헤어를 저장하지 못했습니다.",
    );
  }
}
