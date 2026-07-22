export type StylingSessionDisplayStatus = "recommended" | "generating" | "completed" | "failed" | "unknown";
export type StylingSessionStatusTone = "neutral" | "accent" | "success" | "danger";

export interface StylingSessionStatusPresentation {
  status: StylingSessionDisplayStatus;
  labelKo: string;
  tone: StylingSessionStatusTone;
}

const PRESENTATIONS: Record<StylingSessionDisplayStatus, Omit<StylingSessionStatusPresentation, "status">> = {
  recommended: { labelKo: "추천 준비됨", tone: "accent" },
  generating: { labelKo: "이미지 생성 중", tone: "accent" },
  completed: { labelKo: "완료", tone: "success" },
  failed: { labelKo: "실패", tone: "danger" },
  unknown: { labelKo: "상태 확인 필요", tone: "neutral" },
};

export function normalizeStylingSessionStatus(value: unknown): StylingSessionDisplayStatus {
  if (typeof value !== "string") return "unknown";

  switch (value.trim().toLowerCase()) {
    case "recommended":
      return "recommended";
    case "generating":
    case "processing":
      return "generating";
    case "completed":
    case "complete":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    default:
      return "unknown";
  }
}

export function getStylingSessionStatusPresentation(value: unknown): StylingSessionStatusPresentation {
  const status = normalizeStylingSessionStatus(value);
  return { status, ...PRESENTATIONS[status] };
}
