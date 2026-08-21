export const PREMIUM_OFFER_POLICY = {
  version: "2026-08-21",
  statusLabel: "출시 예정가",
  disclosure:
    "세 가격은 프리미엄 컨설팅의 출시 예정가입니다. 새 결제 상품이 연결되기 전에는 이 화면에서 결제되지 않습니다.",
  offers: [
    {
      key: "private-hair-direction",
      name: "Private Hair Direction",
      koreanName: "프라이빗 헤어 디렉팅",
      priceKrw: 99_000,
      priceLabel: "99,000원",
      periodLabel: "/ 1회",
      tagline: "머리를 바꾸기 전에, 선택의 기준부터 만듭니다.",
      summary: "헤어 한 가지 결정을 위한 분석·비교·살롱 전달 패키지",
      scope: [
        "사진 품질과 얼굴 구조 분석 근거",
        "세 방향으로 설계한 헤어 후보 9개",
        "후보 비교·최종 스타일 1개·Salon Brief",
      ],
      ctaLabel: "헤어 컨설팅 시작",
      recommended: false,
      scopeState: "current" as const,
    },
    {
      key: "total-image-direction",
      name: "Total Image Direction",
      koreanName: "토털 이미지 디렉팅",
      priceKrw: 189_000,
      priceLabel: "189,000원",
      periodLabel: "/ 3개월",
      tagline: "헤어 한 가지가 아니라, 나를 표현하는 전체 이미지를 설계합니다.",
      summary: "헤어·컬러·패션의 선택 기준을 3개월 단위로 연결하는 패키지",
      scope: [
        "프라이빗 헤어 디렉팅 전체 범위",
        "추정 퍼스널 컬러와 염색 방향",
        "패션 방향·9개 룩·상세 Style Dossier",
      ],
      ctaLabel: "토털 이미지 디렉팅 시작",
      recommended: true,
      scopeState: "mixed" as const,
    },
    {
      key: "signature-style-membership",
      name: "Signature Style Membership",
      koreanName: "시그니처 스타일 멤버십",
      priceKrw: 649_000,
      priceLabel: "649,000원",
      periodLabel: "/ 년",
      tagline: "한 번의 추천이 아니라, 나만의 스타일 기준을 계속 구축합니다.",
      summary: "계절과 실제 선택 이력을 축적하는 연간 스타일 관리 멤버십",
      scope: [
        "토털 이미지 디렉팅 전체 범위",
        "연 4회 계절별 헤어·컬러·패션 업데이트",
        "선택 이력·Before/After·Style Archive",
      ],
      ctaLabel: "시그니처 멤버십 시작",
      recommended: false,
      scopeState: "planned" as const,
    },
  ],
} as const;

export type PremiumOffer = (typeof PREMIUM_OFFER_POLICY.offers)[number];
