# HairFit V2 프리미엄 랜딩 리팩토링 기준점

- date: `2026-08-13`
- mode: `redesign`
- phase: `implementation-planned`
- branch: `feat/2026-08-12-premium-landing-refactor`
- worktree: `D:/HariStyle-Preview-worktrees/feat-2026-08-12-premium-landing-refactor`
- base: `develop/2026-08-08-hairfit-v2-backend@3be4d88`
- imported source: `feat/2026-08-04-landing-rolling-hero@c2162ed`
- product authority: `D:/HariStyle-Preview/docs/HairFit_프리미엄_AI_스타일_컨설팅_전략_v1.0.md`
- primary conversion: `/consulting/new`
- implementation authority: `docs/hairfit-v2-premium-landing-redesign-implementation-2026-08-13.md`

## Goal

기존 랜딩 리팩토링의 에디토리얼 구조, 실제 인물 중심 이미지, 투명한 레이아웃, 절제된 모션을 시각 기준으로 삼는다. 그 위에서 HairFit을 `AI 헤어 합성 앱`이 아니라 분석, 조정, 비교, 결정, Salon Brief, Aftercare, Fashion Direction을 연결하는 `PRIVATE AI STYLE DIRECTION` 서비스로 재구성한다.

## Product truth

- 대표 문장: `당신의 스타일에는, 생성보다 정확한 기준이 필요합니다.`
- 판매 단위는 이미지 생성 횟수나 크레딧이 아니라 완결된 컨설팅이다.
- 고객은 AI 권장을 수동으로 승인만 하는 사람이 아니라 방향을 조정하고 최종 선택하는 주체다.
- 랜딩의 핵심 증거는 분석 근거, 전략형 9개 후보, 비교, Salon Brief, Aftercare, Fashion Direction, Style Dossier다.
- 컨설팅의 실제 진입 경로는 `/consulting/new`이며 `/workspace`는 랜딩 CTA로 사용하지 않는다.
- 가격은 검증 전 가설이다: Private Hair Direction `99,000원`, Total Image Direction `189,000원`, Signature Style Membership `649,000원/년`.

## Preserved visual baseline

- `LandingScene` 기반의 11개 에디토리얼 장면
- 카드 반복을 줄인 오픈 레이아웃과 대형 타이포그래피
- Hero 4열 롤링 필름, 실제 인물·태블릿 중심의 연속 이미지
- `data-reveal-item`, `data-detail-closeup`, reduced-motion 계약
- Hairstyle/Fashion의 동일 인물 연속성과 반응형 이미지 crop
- Graphite, Warm Ivory, Champagne 계열의 현재 시각 언어

시각 구조는 기준점으로 유지하되, 현재 섹션의 의미와 순서는 프리미엄 전환 퍼널에 맞춰 수정할 수 있다.

## Superseded contracts

- `/workspace`를 1차 전환으로 삼는 과거 계약
- `무료로 시작`, `9가지 생성`, 이미지 수량 중심의 Hero와 CTA
- 월 플랜·크레딧·할인 중심의 가격 설명
- 제품 가치를 헤어 미리보기와 패션 이미지 생성만으로 축소하는 정보 구조
- 실제 기능 증거 없이 분위기 이미지로만 프리미엄을 주장하는 구성

## Target information architecture

1. Hero — Private AI Style Direction과 단일 핵심 약속
2. Analysis Evidence — 얼굴 측정선, 혼합 차트, 컬러 4축, Evidence Ledger
3. Direction — AI 권장, 사용자 선택, 근거, 예상 영향
4. Strategic Preview — Balance 3, Image 3, Lifestyle 3
5. Compare & Decision — 동일 얼굴·동일 crop의 현실성 비교
6. Salon Brief — 선택을 시술 제원으로 변환하는 결과물
7. Aftercare — 오늘, 3일, 2주, 6주, 다음 방문
8. Fashion Direction — 선택한 헤어에서 전체 이미지로 확장
9. Style Dossier — 전체 결과물과 샘플 공개
10. Services — 세 상품을 editorial row로 비교
11. Trust & Final CTA — 개인정보, 재처리, 시뮬레이션 한계와 컨설팅 시작

## Work queue

| Priority | Work | Exit condition |
|---|---|---|
| P0 | Hero와 모든 CTA를 프리미엄 카테고리로 전환 | `/workspace`와 무료 생성기 카피가 랜딩에서 사라지고 `/consulting/new`로 연결됨 |
| P0 | Analysis, Salon Brief, Style Dossier 증거 장면 구현 | 실제 V2 데이터 구조를 설명하는 샘플 또는 제품 UI가 가격보다 먼저 노출됨 |
| P0 | 기존 11장면을 목표 정보 구조에 재매핑 | 장면 번호, 앵커, 내비게이션, 모바일 순서가 일치함 |
| P1 | 가격 표현을 컨설팅 상품 단위로 전환 | 크레딧을 노출하지 않고 범위·결과·관리 기간을 비교함 |
| P1 | Trust와 품질 재처리 정책 추가 | 사진 사용, 삭제, 공유 만료, 시뮬레이션 한계가 명시됨 |
| P1 | 샘플 Style Dossier 진입점 추가 | Hero 보조 CTA와 본문 샘플이 같은 결과물로 연결됨 |
| P2 | 전환·스크롤·CTA 이벤트 계측 | Hero CTA, Dossier, 서비스 선택, 상담 시작을 구분해 측정함 |

## Acceptance gates

- 시각: 기존 에디토리얼 자산과 모션 품질을 유지하고 데스크톱·모바일에서 가로 overflow가 없다.
- 메시지: `AI 합성 앱`이 아니라 선택과 실행을 돕는 프리미엄 컨설팅으로 이해된다.
- 증거: Analysis, Brief, Aftercare, Fashion, Dossier가 각각 구체적인 데이터나 산출물로 보인다.
- 전환: 모든 B2C CTA가 `/consulting/new`로 이어지고 B2B CTA는 기존 경로를 유지한다.
- 정합성: 랜딩의 약속이 현재 V2 컨설팅 워크플로우와 기능적으로 연결된다.
- 접근성: 키보드, 포커스, alt, reduced motion 계약을 유지한다.
- 검증: typecheck, lint, landing contracts, image contract, component registry, production build, 데스크톱·모바일 브라우저 확인이 모두 통과한다.

## Non-goals for this baseline

- 가격 가설을 운영 가격으로 확정하지 않는다.
- 결제·환불·DB 스키마를 변경하지 않는다.
- 기존 V2 컨설팅 워크플로우를 이 브랜치에서 재설계하지 않는다.
- 병합, 푸시, 배포를 수행하지 않는다.

## Next action

`docs/hairfit-v2-premium-landing-redesign-implementation-2026-08-13.md`의 Phase 0에 따라 premium message, 11 Scene, 현재 billing과 전략 가격의 호환 경계를 contract test로 먼저 고정한다.

## 2026-08-21 가격 가설 노출 결정

기존 기준점의 `운영 가격으로 확정하지 않는다`는 경계는 유지하되, 고객이 컨설팅 범위와 기간을 비교할 수 있도록 세 가격 가설을 랜딩에 `출시 예정가`로 노출한다.

| 상품 | 출시 예정가 | 기간 단위 | 랜딩 역할 |
|---|---:|---|---|
| Private Hair Direction | 99,000원 | 1회 | 단일 헤어 결정을 위한 기본 컨설팅 |
| Total Image Direction | 189,000원 | 3개월 | 헤어·컬러·패션을 연결하는 권장 패키지 |
| Signature Style Membership | 649,000원 | 1년 | 계절별 업데이트와 선택 이력을 위한 예정 멤버십 |

- 세 CTA는 모두 `/consulting/new`로 연결하며 결제를 시작하지 않는다.
- `189,000원`은 3개월 단위라는 사용자 정책 결정을 따른다. 자동갱신 여부나 제공 횟수는 별도 운영 계약 전까지 단정하지 않는다.
- 연간 상담, Style Archive 등 미구현 범위는 `예정 범위`로 표시한다.
- `/billing`의 기존 월 구독·사용권과 PortOne 결제 계약은 변경하지 않는다.
- 결제 상품, entitlement, 환불, DB migration, 운영 활성화는 후속 상품화 범위다.
