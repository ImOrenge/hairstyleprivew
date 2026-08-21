# P51 — Phase 04 온보딩 Fashion 개인화 정책·Ranker

- 기준일: 2026-08-20
- 상태: 로컬 구현 완료, 실인증·실 provider·원격 DB·물리 기기 검증 대기
- 상위 아키텍처: [P46](./p46-ai-led-hair-commerce-fashion-personalization-architecture-2026-08-20.md)
- 선행 페이즈: [P50 — Fashion Product Truth](./p50-phase-03-fashion-product-truth-freshness-2026-08-20.md)
- 후속 페이즈: [P52 — Adaptive Fashion Generation](./p52-phase-05-adaptive-fashion-generation-2026-08-20.md)
- 범위: Web/Native 온보딩, 지속 개인화 정책, 상담 맥락, 합성 snapshot, 상품 ranker
- 증거 상태: 로컬 계약·Web/Native·RLS·fresh migration·fixture browser 통과; 실인증·원격 DB는 not_run

## 1. 목표

Fashion 개인화의 지속 정책을 온보딩·계정 프로필이 소유하게 하고, 컨설팅 Fashion 화면은 이번 상담에만 필요한 상황을 짧게 확인한다. 생성·추천은 두 입력을 immutable snapshot으로 합성해 사용한다.

```text
온보딩의 지속 정책
  + 이번 상담 context
  + 확정 Hair/Color/Makeup revision
  + 검증된 Product Truth
  → immutable personalization snapshot
  → hard filter
  → policy ranker
  → 한 방향의 3개 Fashion look plan
```

## 2. 제품 경계

### 온보딩·프로필이 소유

- 사용자 명시 style target와 표현 선호
- 의류 size system과 사용자가 직접 입력한 사이즈
- fit·silhouette 선호
- 기본 예산 범위
- 피하고 싶은 품목·색·노출·핏
- 소재 민감도·접근성 조건
- 선호 브랜드·판매처와 회피 판매처
- 윤리·지속가능성 선호
- 행동 기반 개인화 학습 동의와 reset

### Fashion 상담이 소유

- 이번 상황·목적
- dress code
- 계절·날씨·실내외 환경
- 이번에만 적용할 목표 인상
- 이번에만 적용할 예산 override
- 보유 아이템 중 이번에 꼭 사용할 품목

### 수집하지 않거나 추론하지 않음

- 사진으로 의류 사이즈·체중·성별 확정
- 얼굴·몸 사진에서 민감 특성 추론
- 사용자가 밝히지 않은 경제상태·직업·건강정보 추정
- 회피 규칙을 클릭 행동으로 자동 완화

`styleTarget` 등 이미 온보딩에 저장된 명시 정보는 재질문하지 않고 revision과 함께 사용한다.

## 3. 계약

### 3.1 지속 정책

```ts
interface UserFashionPersonalizationPolicyV1 {
  schemaVersion: "user-fashion-personalization-policy-v1";
  userId: string;
  styleTarget: string | null;
  sizeProfile: Array<{
    category: string;
    system: string;
    value: string;
    source: "user-entered";
  }>;
  fitPreferences: string[];
  silhouettePreferences: string[];
  baselineBudget: { minKrw: number | null; maxKrw: number | null };
  avoidRules: string[];
  materialPreferences: string[];
  materialSensitivities: string[];
  accessibilityNeeds: string[];
  preferredBrands: string[];
  avoidedBrands: string[];
  preferredSellers: string[];
  avoidedSellers: string[];
  ethicalPreferences: string[];
  learningConsent: boolean;
  revision: number;
  confirmedRevision: number;
  updatedAt: string;
}
```

### 3.2 상담 context

```ts
interface ConsultationFashionContextV1 {
  schemaVersion: "consultation-fashion-context-v1";
  consultationId: string;
  occasion: string;
  dressCode: string | null;
  environment: string[];
  season: string | null;
  oneTimeGoal: string | null;
  oneTimeBudgetOverride: { minKrw: number | null; maxKrw: number | null } | null;
  mustUseOwnedItemIds: string[];
  revision: number;
  confirmedRevision: number | null;
}
```

### 3.3 합성 snapshot

```ts
interface FashionPersonalizationSnapshotV1 {
  schemaVersion: "fashion-personalization-snapshot-v1";
  consultationId: string;
  onboardingPolicyRevision: number;
  consultationContextRevision: number;
  confirmedHairRevision: number;
  confirmedColorRevision: number | null;
  confirmedMakeupRevision: number | null;
  productCatalogRevision: string;
  hardConstraints: string[];
  softPreferences: string[];
  effectiveBudget: { minKrw: number | null; maxKrw: number | null };
  sourceIds: string[];
  fingerprint: string;
  createdAt: string;
}
```

snapshot 생성 이후 온보딩이 바뀌어도 기존 상담 결과를 덮어쓰지 않는다. 재생성은 새 snapshot과 supersede chain을 만든다.

## 4. Coverage와 왕복 UX

온보딩 필수값은 실제 추천을 막는 최소 hard constraint만 사용한다.

- 필수: size system과 핵심 category size 또는 `사이즈 무관 추천만`
- 필수: 최소 한 개의 fit 기준 또는 `상관없음`
- 필수: avoid/accessibility 확인 또는 `없음`
- 선택: 예산, 소재, 브랜드, 윤리 선호, 학습 동의

Fashion 진입 시 필수 hard constraint가 비어 있으면 중복 form을 렌더링하지 않고 다음으로 왕복한다.

```text
/onboarding/fashion-personalization
  ?returnTo=/consulting/:id/fashion
```

저장 후 정확한 상담과 질문 위치로 돌아온다. 선택값은 건너뛸 수 있고 완료·건너뜀 상태를 명확히 표시한다.

## 5. 우선순위와 무단 변경 방지

```text
accessibility·material sensitivity·explicit avoid
  > 사용자 입력 size·fit
  > 이번 상담 dress code·환경
  > 이번 상담 budget override
  > 온보딩 기본 budget·brand·seller preference
  > 명시적 feedback
  > 동의한 행동 학습
  > trend signal
```

- 일회성 budget·goal override는 온보딩 기본 정책을 바꾸지 않는다.
- avoid·accessibility는 상담 override로 완화할 수 없다. 사용자가 온보딩 정책을 직접 수정해야 한다.
- size가 불명확하면 특정 호수 단정 대신 size-flexible 품목 또는 추가 입력을 사용한다.
- AI는 사용자 선택을 몰래 변경하지 않고 충돌·대안을 설명한다.

## 6. Ranker

### 6.1 Hard filter

- 상품 freshness와 국내 배송
- 사용 가능 size 또는 size-flexible 조건
- 예산 상한의 정책상 hard 여부
- avoid brand/seller/item/color/material
- 접근성·소재 민감도
- dress code 필수조건
- 확정 Hair/Color/Makeup 정체성 충돌

### 6.2 내부 점수 축

```ts
interface FashionRankScoreV2 {
  productEligibility: number;
  occasionFit: number;
  personalColorHarmony: number;
  confirmedHairHarmony: number;
  confirmedMakeupHarmony: number;
  fitPreference: number;
  budgetFit: number;
  wearable: number;
  trendMatch: number;
  timeless: number;
  diversityPenalty: number;
}
```

`TREND MATCH / WEARABLE / TIMELESS`는 고객이 고르는 카드가 아니다. policy version에 따른 내부 가중치이며 하나의 확정 방향 안에서 `hero / practical / variation` 역할을 만든다.

### 6.3 학습

- 학습은 opt-in일 때만 시작한다.
- 명시적 `좋아요/별로예요/이유`가 클릭·체류시간보다 우선한다.
- 학습 결과는 hard constraint를 변경하지 않는다.
- 사용자는 온보딩에서 학습 근거를 확인하고 reset할 수 있다.
- reset은 미래 rank에만 적용하고 과거 report를 변경하지 않는다.

## 7. API·DB

### API

- `GET /api/v2/me/onboarding/fashion-personalization`
- `PATCH /api/v2/me/onboarding/fashion-personalization`
- `POST /api/v2/me/onboarding/fashion-personalization/confirm`
- `POST /api/v2/me/onboarding/fashion-personalization/reset-learning`
- `GET /api/v2/consultations/:id/fashion/context`
- `PATCH /api/v2/consultations/:id/fashion/context`
- `POST /api/v2/consultations/:id/fashion/context/confirm`
- `POST /api/v2/consultations/:id/fashion/personalization-snapshot`

PATCH는 `expectedRevision`을 요구하고 충돌 시 409를 반환한다.

### DB

- `user_fashion_personalization_profiles_v2`
- `consultation_fashion_contexts_v2`
- `fashion_personalization_snapshots_v2`
- `fashion_preference_feedback_v2`

RLS는 사용자 profile과 consultation ownership을 각각 강제한다. snapshot은 consultation worker만 생성하고 owner가 읽는다.

## 8. 정확한 변경 지도

### Web 온보딩·프로필

- `my-app/components/mypage/StyleProfileForm.tsx`
- `my-app/components/mypage/panels/MyPageBodyProfilePanel.tsx`
- `my-app/lib/style-profile-server.ts`
- `my-app/lib/onboarding.ts`
- `my-app/app/api/style-profile/route.ts`
- 신규 `my-app/app/onboarding/fashion-personalization/page.tsx`
- 신규 온보딩 form·coverage component

### Fashion 상담

- `my-app/components/consulting/interview/FashionDirectionInterview.tsx`
- `my-app/lib/consulting/fashion-recommendation-batch-server.ts`
- context API route

### Native

- `apps/hairfit-app/components/mypage/panels/MobileMyPageBodyProfilePanel.tsx`
- `apps/hairfit-app/app/consulting.tsx`
- 신규 native fashion personalization route·component

### Shared·governance

- `packages/shared/src/consulting/contract.ts`
- 신규 `packages/shared/src/consulting/fashion-personalization.ts`
- `docs/components/component-registry.json`
- web/native onboarding·interview Passport

## 9. 기능 플래그와 롤백

- `ONBOARDING_FASHION_PERSONALIZATION_ENABLED`
- `FASHION_TREND_SIGNALS_V2_ENABLED`

온보딩 flag OFF에서는 기존 StyleProfile·FashionDirectionSnapshot adapter를 사용한다. 저장된 신규 정책과 snapshot을 삭제하지 않는다. trend flag만 OFF하면 product eligibility와 wearable/timeless score로 계속 추천한다.

## 10. 구현 순서

1. P50 Product Truth reason code와 shared personalization schema를 연결한다.
2. profile/context/snapshot migration과 RLS를 구현한다.
3. Web 온보딩 coverage·수정·returnTo를 구현한다.
4. Fashion 인터뷰에서 지속 정책 질문을 제거하고 일회 context만 남긴다.
5. snapshot 합성 순서와 hard filter를 순수 함수로 구현한다.
6. rank score·policy version·reason mapping을 구현한다.
7. feedback consent·reset을 구현한다.
8. Native parity와 component Passport를 완료한다.

## 11. 검증 계획

### 계약·정책

- 일회 override가 온보딩 policy를 수정하지 않음
- avoid/accessibility가 trend·feedback보다 항상 우선
- 사진 기반 size·성별 추론 없음
- 동일 revision 조합이 같은 fingerprint 생성
- onboarding 변경 후 과거 snapshot 불변
- 학습 미동의 시 행동 event가 rank 입력에 포함되지 않음

### 브라우저·Native

- 필수 누락 시 onboarding 왕복과 정확한 returnTo
- 선택 항목 건너뜀·재개·전체 수정
- Fashion에서 지속 정책 질문이 반복되지 않음
- 390/768/desktop overflow와 keyboard focus
- Web/Native 같은 policy revision 표시

### 저장소 명령

```powershell
npm run typecheck
npm run lint
npm run component-registry:validate
npm --prefix my-app run consulting:contract:test
npm run web:e2e
npm run supabase:migrations:mirror:check
npm run supabase:migrations:fresh:check -- <repository-owned-arguments>
```

## 12. 종료 기준

- [x] 지속 Fashion 개인화 정책이 온보딩·프로필에서 열람·수정·reset된다.
- [x] Fashion 상담은 이번 occasion·인상·계절·일회 override만 묻고 지속 질문을 반복하지 않는다.
- [x] 필수값 누락 시 중복 form 대신 onboarding returnTo 왕복 계약이 동작한다.
- [x] 확정 Hair 한 개와 Color·Makeup revision이 snapshot에 연결된다.
- [x] 사용자 명시 avoid·접근성·민감 소재가 trend·학습보다 우선한다.
- [x] 사진으로 size·성별·체중을 단정하지 않는다.
- [x] snapshot은 immutable이며 온보딩 변경이 과거 결과를 덮어쓰지 않는다.
- [x] 학습은 opt-in이고 확인·reset할 수 있다.
- [x] Web/Native·RLS·migration·접근성 fixture 검증이 통과한다. 실인증·물리 기기는 not_run이다.

## 13. 종료 증거와 P52 인계

필수 증거:

- 온보딩 coverage·returnTo·reset E2E
- policy/context/snapshot redacted revision trace
- hard filter와 우선순위 fixture
- 학습 동의 ON/OFF fixture
- Web/Native parity와 RLS·migration 로그

P52에는 확정된 `FashionPersonalizationSnapshotV1`, eligible offer snapshot pool, rank policy version, 3개 look plan을 인계한다.

## 14. 증거 경계

| 증거 층 | P51 종료에 필요 | 상태 |
|---|---:|---|
| 로컬 정책·계약 | 예 | `not_run` |
| Web/Native UI | 예 | `not_run` |
| 실사용자 인증 | 실서비스 전 예 | `not_run` |
| 실제 상품 provider | P50 evidence 재사용 | `not_run` |
| 원격 DB | 배포 전 예 | `not_run` |
| Canary | 아니요 | P53 |

Docker는 필요하지 않다.
