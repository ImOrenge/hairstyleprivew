import { FULL_STYLE_REFUND_POLICY_VERSION } from "@hairfit/shared/v2";

export const FULL_STYLE_COMMON_BENEFITS = [
  "얼굴·모발 분석과 정밀 퍼스널 컬러 진단",
  "AI 주도 방향 설정과 실제 헤어 3×3 생성",
  "AI가 9개 생성 결과를 검토해 최종 헤어 1개와 선정 근거 확정",
  "염색·메이크업·패션 기본 3개와 최대 6개 추가 생성",
  "Salon Brief·AI 결과 해설·PDF·애프터케어",
] as const;

export const FULL_STYLE_PLAN_DISPLAY_NAMES = {
  full_style_once: "Private Hair Direction",
  full_style_quarterly: "Total Image Direction",
  full_style_annual: "Signature Style Membership",
} as const;

export const PREMIUM_OFFER_POLICY = {
  version: "2026-08-26-v7",
  priceVersion: 3,
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
      name: FULL_STYLE_PLAN_DISPLAY_NAMES.full_style_once,
      koreanName: FULL_STYLE_PLAN_DISPLAY_NAMES.full_style_once,
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
      ctaLabel: "Private Hair Direction 선택",
      recommended: false,
      planTypeLabel: "1회 완결형",
      retentionDays: 60,
      autoRenew: false,
    },
    {
      key: "full_style_quarterly",
      name: FULL_STYLE_PLAN_DISPLAY_NAMES.full_style_quarterly,
      koreanName: FULL_STYLE_PLAN_DISPLAY_NAMES.full_style_quarterly,
      priceKrw: 129_000,
      priceLabel: "129,000원",
      periodLabel: "/ 3개월",
      billingInterval: "quarter",
      sessions: 1,
      restartCount: 2,
      aftercareConsultationCount: 3,
      tagline: "한 계절의 변화와 관리를 한 기준으로 이어갑니다.",
      summary: "3개월마다 풀코스 1회, 전체 재시작 2회와 D+30·60·90 AI 사후상담",
      management: ["3개월 안에 풀코스 1회", "상담당 전체 재시작 2회", "시술 후 D+30·60·90 AI 사후상담 3회", "회차별 결과 완료 후 90일 보관"],
      ctaLabel: "Total Image Direction 선택",
      recommended: true,
      planTypeLabel: "3개월 관리형",
      retentionDays: 90,
      autoRenew: true,
    },
    {
      key: "full_style_annual",
      name: FULL_STYLE_PLAN_DISPLAY_NAMES.full_style_annual,
      koreanName: FULL_STYLE_PLAN_DISPLAY_NAMES.full_style_annual,
      priceKrw: 412_800,
      priceLabel: "412,800원",
      periodLabel: "/ 년",
      billingInterval: "year",
      sessions: 4,
      restartCount: 5,
      aftercareConsultationCount: 3,
      tagline: "한 해의 변화를 네 번의 결정으로 축적합니다.",
      summary: "연 4회, 상담마다 전체 재시작 5회와 D+30·60·90 AI 사후상담",
      management: ["연 4회 자유 사용", "각 상담 전체 재시작 5회 · 연 최대 20회", "각 상담 D+30·60·90 AI 사후상담 3회 · 연 최대 12회", "회차별 전후 비교·연간 종합 리포트", "회차별 결과 완료 후 365일 보관"],
      ctaLabel: "Signature Style Membership 선택",
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
    refundPolicyVersion:FULL_STYLE_REFUND_POLICY_VERSION,
    refund: "법정 청약철회 7일 경과 후에는 미사용 상태라도 단순 변심 환불 불가",
    withdrawalNotice:[
      "계약 내용을 확인할 수 있는 문서를 받은 날부터 법정 청약철회 기간인 7일 이내에 환불을 신청할 수 있습니다. 서비스 제공이 그보다 늦게 시작되면 법령에 따라 서비스 제공 시작일을 기준으로 다시 계산될 수 있습니다.",
      "법정 청약철회 기한이 지나면 상담을 시작하지 않았더라도 단순 변심에 따른 환불은 불가능합니다.",
      "유료 3×3 생성 또는 무료 데모 결제 후 비교 계속하기를 실행하면 해당 상담 회차가 시작되며, 시작된 회차는 7일 이내라도 단순 변심 환불이 제한됩니다.",
      "중복·오결제, 승인하지 않은 결제, HairFit 책임의 결과 미제공, 표시·광고·계약과 중요한 부분이 다른 경우는 별도 예외 규정으로 처리합니다.",
    ],
    paidStartNotice:"지금 유료 상담 1회가 시작됩니다. 시작 후에는 단순 변심에 따른 해당 회차의 청약철회와 환불이 제한됩니다. Signature Style Membership의 아직 시작하지 않은 회차와 법정 예외 사유에 대한 권리는 유지됩니다.",
    annualNotice:"Signature Style Membership에서 법정 청약철회 기간 안에 일부 상담을 시작했다면 시작하지 않은 회차는 회차당 103,200원으로 계산합니다. 청약철회 기간이 지난 뒤에는 미시작 회차도 단순 변심 환불 대상이 아닙니다.",
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

export function getFullStylePlanDisplayName(key: string): string | null {
  return Object.prototype.hasOwnProperty.call(FULL_STYLE_PLAN_DISPLAY_NAMES, key)
    ? FULL_STYLE_PLAN_DISPLAY_NAMES[key as FullStyleOfferingKey]
    : null;
}
