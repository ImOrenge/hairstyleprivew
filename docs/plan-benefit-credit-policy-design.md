# HairFit 플랜 혜택 및 크레딧 정책 설계서

작성일: 2026-07-02
상태: 구현 전 설계안

## 1. 목적

랜딩, 플랜 선택, 체크아웃, 마이페이지 플랜 선택 화면에서 노출되는 플랜 혜택을 실제 구현 가능한 제약과 일치시킨다.

이번 설계의 핵심은 다음이다.

- 미구현 혜택은 플랜 문구에서 제거한다.
- 헤어, 패션, 에프터케어의 크레딧 차감 기준을 한 가지 규칙으로 설명한다.
- 패션은 확정된 헤어스타일을 기준으로만 생성되므로, 패션 가능 횟수는 헤어 생성 비용까지 포함해 계산한다.
- 에프터케어는 단순 가이드 1개가 아니라 주기별 케어 메일 발송을 포함한 프로그램으로 정의한다.
- 결제 직전 체크아웃 화면에서 사용자가 실제 차감 기준과 보관기간을 다시 확인할 수 있게 한다.

## 2. 설계 원칙

### 2.1 거짓 없는 혜택 문구

플랜 문구에는 현재 구현되어 있거나 이번 작업에서 서버 제약까지 같이 구현할 항목만 쓴다.

금지 문구:

- 컬러변형
- HD 이미지
- 우선 생성
- PDF 다운로드
- 팀 계정
- 살롱 브랜딩
- 전용 지원
- 패션 무제한
- 실제 크레딧 또는 권한과 맞지 않는 포함 횟수

### 2.2 크레딧 지갑 중심

Basic, Standard, Pro는 모두 같은 크레딧 지갑을 사용한다. 유료 플랜에서 패션만 별도로 막는 hidden cap은 제거하고, 실제 한도는 잔여 크레딧으로 결정한다.

Free는 무료 체험 목적이므로 10 무료 크레딧으로 헤어 생성 1회를 체험하게 한다. Free에서 패션 생성을 혜택으로 광고하지 않는다.

### 2.3 의존성 포함 계산

패션 이미지는 단독으로 생성되지 않는다. 사용자는 먼저 헤어 추천 보드에서 결과 이미지를 만들고, 그중 하나를 확정한 뒤 패션 추천과 룩북 이미지를 생성한다.

따라서 고객-facing 문구에서 "패션 약 N회"라고 단독 표기하지 않는다. 대신 "헤어+패션 세트" 기준으로 표기한다.

### 2.4 프로그램 단위 에프터케어

에프터케어는 다음을 묶은 하나의 프로그램이다.

- 에프터케어 가이드 페이지 생성
- D+1 드라이 가이드 메일
- D+3 케어 루틴 메일
- D+7 유지 팁 메일
- D+30 점검 메일
- D+45 시즌 트렌드 제안 메일
- D+90 새 스타일 제안 메일

메일 1통마다 과금하지 않는다. 에프터케어 프로그램 생성 1회 단위로 과금한다.

## 3. 현재 구현 기준

| 영역 | 현재 구현 | 파일 |
| --- | --- | --- |
| 플랜 가격/월 크레딧 | Free 10, Basic 80, Standard 200, Pro 600, Salon 500 | `my-app/lib/billing-plan.ts` |
| 헤어 생성 크레딧 | 현재 기본 5크레딧 | `my-app/lib/pricing-plan.ts` |
| 패션 생성 크레딧 | 현재 기본 8크레딧 | `my-app/lib/pricing-plan.ts` |
| 헤어 크레딧 차감 | 추천 보드 첫 결과 이미지 생성 시 `recommendation_grid_usage`로 1회 차감 | `my-app/app/api/generations/run/route.ts` |
| 패션 크레딧 차감 | 패션 룩북 이미지 생성 시 `outfit_styling_usage`로 차감 | `my-app/app/api/styling/generate/route.ts` |
| 패션 별도 상한 | Free 1, Basic 1, Standard 3, Pro 무제한 | `my-app/lib/plan-entitlements.ts` |
| 에프터케어 생성 | 가이드, 케어 콘텐츠, 예약 메일 row 생성. 크레딧 차감 없음 | `my-app/app/api/hair-records/route.ts` |
| 에프터케어 메일 발송 | `scheduled_send_at <= now()` 및 `sent_at is null`인 row를 매일 발송 | `my-app/supabase/functions/cron-care-emails/index.ts` |
| 생성 이미지 보관기간 | Free 7일, Basic 30일, Standard 365일, Pro 영구 | `my-app/lib/plan-entitlements.ts` |

현재 불일치:

- 목표 과금안은 헤어 10, 패션 20이지만 코드는 5, 8이다.
- 에프터케어는 목표 과금안에 있지만 현재는 무료 생성이다.
- 유료 플랜 패션 별도 상한이 크레딧 기반 "헤어+패션 세트" 계산과 충돌한다.
- 가격 문구에 기존 5크레딧 기준의 헤어 가능 횟수가 남아 있다.
- 체크아웃 화면은 월 크레딧과 금액만 보여주고, 실제 차감 기준과 보관기간을 보여주지 않는다.

## 4. 목표 과금 모델

### 4.1 기본 차감 단위

| 사용 행위 | 차감 | 과금 기준 | 비고 |
| --- | ---: | --- | --- |
| 헤어 추천 목록 열람 | 0 | 목록/분석 조회 | 무료 |
| 헤어 결과 이미지 생성 | 10 | 추천 보드 첫 결과 이미지 생성 시 1회 | 같은 추천 세트 중복 차감 방지 |
| 헤어스타일 확정 | 0 | 이미 생성한 후보 중 선택 저장 | 무료 |
| 패션 추천 텍스트/코디 방향 생성 | 0 | 장르와 바디 프로필 기반 추천 미리보기 | 무료 |
| 패션 룩북 이미지 생성 | 20 | 확정된 헤어 기준 룩북 이미지 생성 | 같은 세션 재조회 무료 |
| 첫 에프터케어 프로그램 | 0 | 계정 기준 최초 1회 | 가이드와 주기별 메일 포함 |
| 추가 에프터케어 프로그램 | 30 | 계정 기준 두 번째 프로그램부터 | 메일별 추가 차감 없음 |
| 기존 결과 조회 | 0 | 보관기간 내 결과 조회 | 무료 |
| 기존 에프터케어 조회 | 0 | 가이드/메일 링크 재방문 | 무료 |

### 4.2 패션 의존성

패션 룩북 이미지 1개를 새로 만들려면 최소 30크레딧이 필요하다.

```text
헤어 결과 이미지 생성 10크레딧
+ 헤어스타일 확정 0크레딧
+ 패션 룩북 이미지 생성 20크레딧
= 헤어+패션 세트 30크레딧
```

플랜 문구는 패션 단독 횟수가 아니라 헤어+패션 세트 기준으로 표기한다.

### 4.3 에프터케어 프로그램 정의

에프터케어 프로그램 1회는 다음 DB row 묶음으로 정의한다.

- `user_hair_records` 1개
- `user_aftercare_guides` 1개
- `user_care_contents` 6개

프로그램이 이미 생성된 같은 헤어 기록을 다시 열거나 같은 요청이 재시도되는 경우 추가 차감하지 않는다.

생성 이미지 보관기간과 에프터케어 발송기간은 서로 다른 개념이다.

- 생성 이미지 보관기간: AI 생성 결과 asset에 대한 접근 가능 기간
- 에프터케어 프로그램: 확정 헤어 기록과 주기별 케어 메일 예약

따라서 Free의 "결과 7일 보관"은 AI 결과 이미지 보관기간을 뜻한다. 이미 생성된 에프터케어 프로그램의 예약 메일 발송을 7일로 끊는다는 뜻이 아니다.

## 5. 목표 플랜 구조

### 5.1 플랜별 가격과 월 크레딧

| 플랜 | 가격 | 지급 크레딧 | 결제 방식 |
| --- | ---: | ---: | --- |
| Free | 0원 | 10 최초 지급 | 결제 없음 |
| Basic | 9,900원/월 | 80/월 | self-serve 구독 |
| Standard | 19,900원/월 | 200/월 | self-serve 구독 |
| Pro | 49,900원/월 | 600/월 | self-serve 구독 |
| Salon | 문의 | 상담 후 확정 | B2B 문의 |

### 5.2 플랜별 예상 사용량

| 플랜 | 단독 헤어 기준 | 헤어+패션 세트 기준 | 첫 에프터케어 | 추가 에프터케어 | 생성 이미지 보관 |
| --- | ---: | ---: | --- | --- | --- |
| Free | 약 1회 | 불가 | 최초 1회 무료 | 크레딧 부족 시 불가 | 7일 |
| Basic | 약 8회 | 약 2세트, 20크레딧 잔여 | 최초 1회 무료 | 30크레딧 | 30일 |
| Standard | 약 20회 | 약 6세트, 20크레딧 잔여 | 최초 1회 무료 | 30크레딧 | 365일 |
| Pro | 약 60회 | 약 20세트 | 최초 1회 무료 | 30크레딧 | 영구 |

주의:

- "약 N회"는 해당 기능만 사용했을 때의 단순 계산이다.
- 실제 사용 가능량은 헤어, 패션, 에프터케어를 어떻게 섞어 쓰는지에 따라 달라진다.
- 패션은 확정된 헤어가 있어야 하므로 Free 10크레딧만으로는 패션 룩북 이미지까지 만들 수 없다.

### 5.3 플랜별 혜택 문구

#### Free

- 10 무료 크레딧
- 헤어 결과 이미지 약 1회 생성
- 3x3 헤어 추천 목록 무료 열람
- 첫 에프터케어 프로그램 무료
- 생성 이미지 7일 보관
- 워터마크 포함

#### Basic

- 월 80크레딧
- 헤어 약 8회 또는 헤어+패션 약 2세트
- 첫 에프터케어 프로그램 무료, 이후 30크레딧
- 상담용 이미지 다운로드
- 생성 이미지 30일 보관
- 워터마크 없음

#### Standard

- 월 200크레딧
- 헤어 약 20회 또는 헤어+패션 약 6세트
- 첫 에프터케어 프로그램 무료, 이후 30크레딧
- 상담용 이미지 다운로드
- 생성 이미지 365일 보관
- 워터마크 없음

#### Pro

- 월 600크레딧
- 헤어 약 60회 또는 헤어+패션 약 20세트
- 첫 에프터케어 프로그램 무료, 이후 30크레딧
- 상담용 이미지 다운로드
- 상담 시트 출력
- 생성 이미지 영구 보관
- 워터마크 없음

#### Salon

- B2B 상담 후 월 크레딧 범위 확정
- 고객별 결과 및 시술 기록 관리
- 살롱 상담 워크플로
- 결제와 제공 범위는 도입 상담에서 확정

Salon은 self-serve 결제 플랜으로 표기하지 않는다.

## 6. 화면별 표시 설계

### 6.1 랜딩 가격 영역

목적:

- 플랜 간 차이를 빠르게 이해시킨다.
- 과장된 기능보다 실제 사용량과 보관기간을 보여준다.

필수 표시:

- 월 크레딧
- 헤어 단독 예상 횟수
- 헤어+패션 세트 예상 횟수
- 첫 에프터케어 프로그램 무료
- 추가 에프터케어 30크레딧
- 생성 이미지 보관기간

랜딩 공통 주석:

```text
헤어 생성은 10크레딧, 패션 룩북 이미지는 확정된 헤어 기준 20크레딧이 차감됩니다.
에프터케어 프로그램은 첫 1회 무료이며, 추가 생성은 30크레딧입니다.
```

Free 카드 주석:

```text
Free 10크레딧은 헤어 결과 이미지 1회 체험 기준입니다. 패션 룩북은 확정 헤어와 추가 크레딧이 필요합니다.
```

### 6.2 `/billing` 플랜 선택 화면

`/billing`은 랜딩의 가격 카드를 재사용하되, 결제 의도가 더 강한 화면이므로 다음을 추가한다.

- "월 자동 결제, 언제든 해지 가능"
- "크레딧은 월 지급량 안에서 헤어, 패션, 에프터케어에 함께 사용"
- "패션은 확정된 헤어스타일 기준으로 생성"
- "첫 에프터케어 프로그램 무료, 추가 30크레딧"

### 6.3 마이페이지 플랜 선택

마이페이지 플랜 탭은 공간이 좁으므로 압축 표기를 사용한다.

예시:

```text
Basic
80크레딧 / 월
헤어 약 8회 또는 헤어+패션 약 2세트
생성 이미지 30일 보관
첫 에프터케어 프로그램 무료
```

활성 구독이 있거나 결제 확인 중이면 기존 정책대로 중복 결제 CTA를 막는다.

### 6.4 체크아웃 선택 플랜 요약

체크아웃은 결제 직전이므로 가장 엄격하게 실제 계약 정보를 보여준다.

필수 표시:

- 선택 플랜명
- 월 결제 금액
- 월 지급 크레딧
- 차감 기준
- 예상 사용량
- 생성 이미지 보관기간
- 자동 결제 및 해지 안내

예시:

```text
선택 플랜: Standard
월 19,900원
매월 200크레딧 지급

차감 기준
- 헤어 결과 이미지 생성: 10크레딧
- 패션 룩북 이미지 생성: 확정된 헤어 기준 20크레딧
- 에프터케어 프로그램: 첫 1회 무료, 이후 30크레딧

예상 사용량
- 헤어만 사용 시 약 20회
- 헤어+패션 세트 기준 약 6세트, 20크레딧 잔여

보관기간
- 생성 이미지 365일 보관
```

## 7. 단일 소스 설계

### 7.1 추가할 플랜 표시 헬퍼

새 파일:

```text
my-app/lib/plan-benefit-display.ts
```

역할:

- 플랜별 월 크레딧, 가격, 보관기간을 모은다.
- 헤어 단독 예상 횟수를 계산한다.
- 헤어+패션 세트 예상 횟수와 잔여 크레딧을 계산한다.
- 에프터케어 무료/추가 차감 정책을 반환한다.
- 랜딩, `/billing`, 마이페이지, 체크아웃이 같은 값을 쓰게 한다.

권장 타입:

```ts
export interface PlanUsageEstimate {
  hairOnlyCount: number;
  hairFashionSetCount: number;
  hairFashionRemainderCredits: number;
}

export interface PlanDisplayBenefit {
  key: BillingPlanKey;
  label: string;
  priceKrw: number;
  credits: number;
  selfServe: boolean;
  retentionLabelKo: string;
  retentionDays: number | null;
  usage: PlanUsageEstimate;
  firstAftercareProgramFree: boolean;
  aftercareProgramCredits: number;
  featureLinesKo: string[];
}
```

계산식:

```ts
hairOnlyCount = Math.floor(planCredits / creditsPerStyle);
hairFashionSetCost = creditsPerStyle + creditsPerOutfit;
hairFashionSetCount = Math.floor(planCredits / hairFashionSetCost);
hairFashionRemainderCredits = planCredits % hairFashionSetCost;
```

Free의 패션 세트 문구는 `0세트`보다 `불가`로 보여준다.

### 7.2 i18n 문구

`ko.ts`, `en.ts`에는 계산된 값을 끼워 넣는 문장만 둔다. 플랜별 횟수를 하드코딩하지 않는다.

권장 키:

```text
pricing.usage.hairOnly
pricing.usage.hairFashionSets
pricing.usage.hairFashionUnavailable
pricing.usage.aftercarePolicy
pricing.usage.creditRules
pricing.retention.free
pricing.retention.basic
pricing.retention.standard
pricing.retention.pro
```

## 8. 서버 제약 설계

### 8.1 헤어 생성

변경:

- `DEFAULT_CREDITS_PER_STYLE`을 10으로 변경한다.
- `PRICING_CREDITS_PER_STYLE` 환경 변수 override는 유지한다.

서버 정책:

- 추천 목록 생성 자체는 무료다.
- 추천 보드의 첫 결과 이미지 생성 시 `recommendation_grid_usage`로 10크레딧을 차감한다.
- 기존 `idx_credit_ledger_unique_recommendation_grid_usage`를 유지해 같은 `generation_id`에서 중복 차감을 막는다.

대상 파일:

- `my-app/lib/pricing-plan.ts`
- `my-app/app/api/prompts/generate/route.ts`
- `my-app/app/api/generations/run/route.ts`
- `my-app/app/api/salon/customers/[id]/workspace/recommendations/route.ts`

### 8.2 패션 생성

변경:

- `DEFAULT_CREDITS_PER_OUTFIT`을 20으로 변경한다.
- 유료 플랜의 별도 `maxFashionGenerations` 상한을 제거한다.
- Free는 패션 혜택으로 광고하지 않는다.

확정 헤어 조건:

- `recommendationSet.selectedVariantId`가 있어야 한다.
- 요청의 `selectedVariantId`는 `recommendationSet.selectedVariantId`와 같아야 한다.
- 해당 variant는 `outputUrl` 또는 `generatedImagePath`가 있어야 한다.

`styling/recommend`에서 위 조건을 검사한다. `styling/generate`에서도 세션의 `selected_variant_id`가 현재 확정 헤어와 같은지 재검증한다.

대상 파일:

- `my-app/lib/pricing-plan.ts`
- `my-app/lib/plan-entitlements.ts`
- `my-app/app/api/styling/recommend/route.ts`
- `my-app/app/api/styling/generate/route.ts`
- `my-app/app/styler/new/page.tsx`
- `my-app/components/result/ActionToolbar.tsx`

### 8.3 에프터케어 프로그램

변경:

- `DEFAULT_CREDITS_PER_AFTERCARE_PROGRAM = 30`을 추가한다.
- `getCreditsPerAftercareProgram()`을 추가한다.
- 계정 기준 첫 에프터케어 프로그램은 무료다.
- 두 번째 프로그램부터 30크레딧을 차감한다.

권장 서버 흐름:

1. 사용자, generation, selectedVariant, serviceType, serviceDate를 검증한다.
2. 같은 `generation_id`로 이미 생성된 `user_hair_records`가 있으면 기존 프로그램으로 redirect하고 추가 차감하지 않는다.
3. 첫 무료 사용 여부를 확인한다.
4. 유료 생성이면 잔여 크레딧을 사전 확인한다.
5. AI 에프터케어 가이드와 6개 예약 메일 콘텐츠를 생성한다.
6. DB 트랜잭션 또는 RPC에서 다음을 원자적으로 처리한다.
   - `users` row lock
   - 첫 무료 여부 재확인
   - 필요 시 `consume_credits` 또는 동일 로직으로 30크레딧 차감
   - `user_hair_records` insert
   - `user_aftercare_guides` insert
   - `user_care_contents` 6개 insert
   - `care_generated_at` update
7. 성공 응답에 `chargedCredits`, `firstAftercareProgramFreeUsed`, `careScheduledCount`를 포함한다.

중복 방지:

- `user_aftercare_guides.hair_record_id` unique 제약을 유지한다.
- `user_hair_records`에는 `generation_id is not null`인 경우 `(user_id, generation_id)` unique 제약을 추가하는 것을 권장한다.
- 유료 에프터케어 차감에는 `credit_ledger` unique index를 추가한다.

권장 인덱스:

```sql
create unique index if not exists idx_credit_ledger_unique_aftercare_program_usage
  on public.credit_ledger (generation_id, reason)
  where generation_id is not null
    and entry_type = 'usage'
    and reason = 'aftercare_program_usage';
```

대상 파일:

- `my-app/lib/pricing-plan.ts`
- `my-app/app/api/hair-records/route.ts`
- `my-app/lib/hair-care-generator.ts`
- `my-app/supabase/functions/cron-care-emails/index.ts`
- 신규 migration

### 8.4 에프터케어 메일 발송

현재 발송 구조는 유지한다.

- `cron-care-emails`는 매일 09:00 KST 기준 실행된다.
- `scheduled_send_at <= now()`이고 `sent_at is null`인 `user_care_contents`를 발송한다.
- 발송 성공 시 `sent_at`, `email_message_id`를 기록한다.
- 발송 실패나 재시도는 사용자에게 추가 차감하지 않는다.

추가 보강:

- 메일 본문의 브랜드명을 `HairFit`으로 통일한다.
- CTA는 가능하면 해당 에프터케어 상세 URL을 유지한다.
- 현재 cron fallback CTA가 `/mypage`로 치환될 수 있으므로 `body_html`에 이미 기록된 `/aftercare/{hairRecordId}` 링크를 보존하는지 점검한다.

## 9. 데이터 변경 계획

### 9.1 migration 후보

파일명 예시:

```text
my-app/supabase/migrations/202607020001_plan_credit_policy_aftercare.sql
```

포함 내용:

- `idx_credit_ledger_unique_aftercare_program_usage` 추가
- 필요 시 `idx_user_hair_records_unique_generation_confirmation` 추가
- 에프터케어 프로그램 생성 RPC 추가 또는 기존 API에서 안전하게 호출할 수 있는 보조 RPC 추가

### 9.2 유료 플랜 패션 상한 변경

`PLAN_ENTITLEMENTS` 목표:

```ts
free: {
  maxFashionGenerations: 0,
}
basic: {
  maxFashionGenerations: null,
}
standard: {
  maxFashionGenerations: null,
}
pro: {
  maxFashionGenerations: null,
}
```

상한을 없애면 paid plan은 월 크레딧이 실제 사용량 제한이 된다.

## 10. 감사 및 회귀 방지

`my-app/scripts/audit-portone-billing.mjs`에 다음 검사를 추가한다.

필수 포함 검사:

- `DEFAULT_CREDITS_PER_STYLE = 10`
- `DEFAULT_CREDITS_PER_OUTFIT = 20`
- `DEFAULT_CREDITS_PER_AFTERCARE_PROGRAM = 30`
- `pricing` 문구에 "헤어+패션" 또는 동등 문구 포함
- 체크아웃에 차감 기준 문구 포함
- Standard 보관기간 365일
- Pro 보관기간 영구
- 에프터케어 프로그램 문구에 "주기별 메일" 포함

금지 문구 검사:

- 컬러변형
- 패션 무제한
- Free 패션 생성 가능
- Basic 패션 4회 단독 표기
- Standard 패션 10회 단독 표기
- Pro 패션 30회 단독 표기
- 2회, 16회, 40회, 120회처럼 5크레딧 기준의 낡은 헤어 횟수

## 11. 구현 순서

1. `pricing-plan.ts`에 10/20/30 크레딧 상수와 getter를 추가한다.
2. `plan-benefit-display.ts`를 추가해 플랜별 예상 사용량과 혜택 문구를 계산한다.
3. `plan-entitlements.ts`에서 paid plan의 패션 별도 상한을 제거한다.
4. 패션 추천/생성 API에 확정 헤어 조건을 적용한다.
5. 에프터케어 프로그램 첫 무료 및 추가 30크레딧 차감을 구현한다.
6. 랜딩 `PricingPreview`가 새 단일 소스를 쓰게 한다.
7. `/billing`은 같은 가격 카드를 유지하되 정책 설명을 추가한다.
8. 마이페이지 플랜 선택 카드에 헤어+패션 세트 기준 문구를 추가한다.
9. 체크아웃 선택 플랜 요약에 차감 기준, 보관기간, 예상 사용량을 추가한다.
10. `ko.ts`, `en.ts` 문구를 새 정책으로 교체한다.
11. `audit-portone-billing.mjs`에 회귀 방지 검사를 추가한다.
12. 관련 smoke 및 정적 검증을 실행한다.

## 12. 검증 계획

정적 검증:

```bash
npm run portone:audit
npm run portone:contract:test
npm run lint
npm run typecheck
npm run build
```

수동 또는 API smoke:

- Free 10크레딧 계정에서 헤어 1회 생성 후 잔액 0 확인
- Free 계정에서 패션 룩북 이미지 생성 시 크레딧 부족으로 차단되는지 확인
- Basic 80크레딧 계정에서 헤어+패션 2세트 후 잔여 20크레딧 확인
- 첫 에프터케어 프로그램 생성 시 0크레딧 차감 확인
- 두 번째 에프터케어 프로그램 생성 시 30크레딧 차감 확인
- 같은 에프터케어 프로그램 재요청 시 추가 차감 없음 확인
- `user_care_contents` 6개가 생성되고 `scheduled_send_at`이 D+1, D+3, D+7, D+30, D+45, D+90 기준인지 확인
- `cron-care-emails`가 발송 성공 시 `sent_at`, `email_message_id`를 기록하는지 확인
- 체크아웃에서 선택 플랜의 월 크레딧, 차감 기준, 예상 사용량, 보관기간이 보이는지 확인

## 13. 오픈 결정사항

현재 설계에서는 계정 기준 첫 에프터케어 프로그램 1회만 무료로 둔다. 월마다 첫 에프터케어를 무료로 줄 경우 retention에는 유리하지만, 구현과 문구가 달라진다.

월 1회 무료로 바꾸려면 다음이 추가로 필요하다.

- 현재 결제 주기 기준 무료 사용 여부 계산
- 구독 갱신 시 무료 에프터케어 allowance 재설정
- 마이페이지에 해당 월 무료 사용 여부 표시
- 체크아웃 문구를 "첫 1회 무료"가 아니라 "월 1회 무료"로 변경

이번 설계의 기본값은 "계정 기준 최초 1회 무료, 이후 30크레딧"이다.
