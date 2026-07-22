export const SALON_CONNECTION_CONSENT_VERSION = "2026-07-17.v1" as const;

export const SALON_CONNECTION_CONSENT_SCOPE = {
  profile: {
    displayName: true,
    avatarUrl: true,
    email: true,
  },
  hairstyle: {
    recentGenerations: true,
    selectedStyle: true,
    confirmedHairRecords: true,
  },
  aftercare: {
    personalGuide: false,
    salonRecords: true,
  },
} as const;

export const SALON_CONNECTION_CONSENT_COPY = {
  purpose:
    "초대한 살롱이 상담 준비, 스타일 제안, 방문 기록 관리를 위해 연결된 회원 정보를 확인합니다.",
  sharedItems: [
    "프로필의 닉네임, 아바타와 계정 이메일",
    "최근 헤어 생성 기록 5건과 선택한 스타일",
    "확정한 헤어 시술 기록",
  ],
  excludedItems: [
    "개인 HairFit 애프터케어 가이드 원문은 공유하지 않습니다.",
    "결제 정보, 비밀번호, 개인 사진 원본은 공유하지 않습니다.",
  ],
  retention:
    "연결을 해제하면 살롱은 회원 프로필과 HairFit 생성·확정 기록을 즉시 조회할 수 없습니다. 살롱이 직접 작성한 방문·상담·관리 기록은 고객 관리 및 분쟁 대응을 위해 일반 고객 기록으로 남으며, 삭제는 해당 살롱 또는 HairFit 지원 채널에 요청할 수 있습니다.",
  revocation:
    "회원과 살롱 모두 언제든 연결을 해제할 수 있으며, 해제해도 일반 HairFit 기능은 계속 사용할 수 있습니다.",
} as const;

export interface SalonConnectionConsentAcceptance {
  accepted: true;
  version: typeof SALON_CONNECTION_CONSENT_VERSION;
}

export function isSalonConnectionConsentAcceptance(
  value: unknown,
): value is SalonConnectionConsentAcceptance {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.accepted === true && candidate.version === SALON_CONNECTION_CONSENT_VERSION;
}

export function createSalonConnectionConsentAcceptance(): SalonConnectionConsentAcceptance {
  return {
    accepted: true,
    version: SALON_CONNECTION_CONSENT_VERSION,
  };
}
