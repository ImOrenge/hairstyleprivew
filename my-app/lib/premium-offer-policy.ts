export const FULL_STYLE_COMMON_BENEFITS = [
  "얼굴·모발 분석과 정밀 퍼스널 컬러 진단",
  "AI 주도 방향 설정과 실제 헤어 3×3 생성",
  "2~3개 후보 비교 후 최종 헤어 1개 확정",
  "염색·메이크업·패션 기본 3개와 최대 6개 추가 생성",
  "Salon Brief·AI 결과 해설·PDF·애프터케어",
] as const;

export const PREMIUM_OFFER_POLICY = {
  version: "2026-08-21-v3",
  priceVersion: 2,
  statusLabel: "가격 확정",
  disclosure:
    "표시 금액은 부가세를 포함한 실제 승인 총액입니다. 정기 상품은 미사용 회차가 이월되지 않으며, 다음 결제 전에 언제든 기간말 해지를 신청할 수 있습니다.",
  commonBenefits: FULL_STYLE_COMMON_BENEFITS,
  freeDemo: {
    key: "free_hair_demo",
    koreanName: "무료 헤어 데모",
    priceKrw: 0,
    priceLabel: "0원",
    periodLabel: "/ 계정당 1회",
    summary: "간이 퍼스널 컬러 진단과 워터마크 헤어 3×3을 실제로 확인",
    management: ["로그인 후 계정당 1회", "비교 직전 유료 전환", "완료 후 7일 보관"],
    ctaLabel: "무료 3×3 생성 시작",
    retentionDays: 7,
  },
  offers: [
    {
      key: "full_style_once",
      name: "Full Style Once",
      koreanName: "풀 스타일 1회",
      priceKrw: 59_000,
      priceLabel: "59,000원",
      periodLabel: "/ 1회",
      billingInterval: null,
      sessions: 1,
      restartCount: 1,
      aftercareConsultationCount: 1,
      tagline: "한 번의 스타일 결정을 완결합니다.",
      summary: "풀코스 1회, 전체 재시작 1회와 시술 후 D+30 사후상담 1회",
      management: ["풀 스타일 컨설팅 1회", "최종 확정 전 전체 재시작 1회", "시술 후 D+30 AI 사후상담 1회", "완료 후 60일 보관"],
      ctaLabel: "1회 컨설팅 선택",
      recommended: false,
      planTypeLabel: "1회 완결형",
      retentionDays: 60,
      autoRenew: false,
    },
    {
      key: "full_style_quarterly",
      name: "Full Style Quarterly",
      koreanName: "3개월 정기",
      priceKrw: 89_000,
      priceLabel: "89,000원",
      periodLabel: "/ 3개월",
      billingInterval: "quarter",
      sessions: 1,
      restartCount: 2,
      aftercareConsultationCount: 3,
      tagline: "한 계절의 변화와 관리를 한 기준으로 이어갑니다.",
      summary: "3개월마다 풀코스 1회, 전체 재시작 2회와 D+30·60·90 AI 사후상담",
      management: ["3개월 안에 풀코스 1회", "상담당 전체 재시작 2회", "시술 후 D+30·60·90 AI 사후상담 3회", "회차별 결과 완료 후 90일 보관"],
      ctaLabel: "3개월 정기 선택",
      recommended: true,
      planTypeLabel: "3개월 정기형",
      retentionDays: 90,
      autoRenew: true,
    },
    {
      key: "full_style_annual",
      name: "Full Style Annual",
      koreanName: "연간",
      priceKrw: 299_000,
      priceLabel: "299,000원",
      periodLabel: "/ 년",
      billingInterval: "year",
      sessions: 4,
      restartCount: 5,
      aftercareConsultationCount: 3,
      tagline: "한 해의 변화를 네 번의 결정으로 축적합니다.",
      summary: "연 4회, 상담마다 전체 재시작 5회와 D+30·60·90 AI 사후상담",
      management: ["연 4회 자유 사용", "각 상담 전체 재시작 5회 · 연 최대 20회", "각 상담 D+30·60·90 AI 사후상담 3회 · 연 최대 12회", "회차별 전후 비교·연간 종합 리포트", "회차별 결과 완료 후 365일 보관"],
      ctaLabel: "연간 플랜 선택",
      recommended: false,
      planTypeLabel: "연간 관리형",
      retentionDays: 365,
      autoRenew: true,
    },
  ],
  policies: {
    vatIncluded: true,
    rollover: false,
    cancellation: "기간말 해지 또는 즉시 종료·환불 견적 요청",
    refund: "완전 미사용 계약만 자동 환불하며, 사용 이력이 있으면 검토 후 안내",
  },
} as const;

export type FullStyleOffer = (typeof PREMIUM_OFFER_POLICY.offers)[number];
export type FullStyleOfferingKey = FullStyleOffer["key"];
export type PremiumOffer = FullStyleOffer;

export function isFullStyleOfferingKey(value: string): value is FullStyleOfferingKey {
  return PREMIUM_OFFER_POLICY.offers.some((offer) => offer.key === value);
}

export function getFullStyleOffer(key: string): FullStyleOffer | null {
  return PREMIUM_OFFER_POLICY.offers.find((offer) => offer.key === key) ?? null;
}
