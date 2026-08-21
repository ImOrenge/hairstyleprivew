# P53 — Phase 06 Result Report·Observability·Canary

- 기준일: 2026-08-20
- 상태: 로컬 구현·검증 완료, 외부 증거층은 사용자 요청으로 패스
- 상위 아키텍처: [P46](./p46-ai-led-hair-commerce-fashion-personalization-architecture-2026-08-20.md)
- 선행 페이즈: [P52 — Adaptive Fashion Generation](./p52-phase-05-adaptive-fashion-generation-2026-08-20.md)
- 후속 페이즈: 없음, 최종 통합 종료
- 범위: Result/PDF projection, provenance, 운영 지표, 플래그 rollout, rollback drill, 최종 증거
- 증거 상태: 계약·Web·Native·PDF·관측·rollout/off dry-run·정적 검증 완료. 실인증·provider 비용 집행·원격 DB·배포 Canary는 사용자 요청으로 종료조건에서 제외했다.

> 결과 노출 불변식: AI가 기본 선택을 주도하더라도 생성된 내용을 숨기지 않는다. Hair는 해당 revision의 9개 전부, Fashion은 해당 batch에서 실제 요청한 3·6·9개 전부를 화면·Native·PDF에 동일 순서와 상태로 표시한다.

## 1. 목표

P47~P52에서 생성한 Hair·Fashion 결정을 고객 Result와 PDF에 일관되게 투영하고, 실제 운영에서 안전하게 단계적 노출할 수 있는 관측·롤백 계약을 완성한다.

최종 보고의 핵심은 “결과 이미지 모음”이 아니라 다음 질문에 답하는 것이다.

- 어떤 사용자 입력과 분석 근거가 사용됐는가?
- Hair 9안 중 AI가 무엇을 왜 주 추천했는가?
- 고객이 무엇을 확정하거나 조정했는가?
- Fashion은 어떤 확정 Hair·Color·Makeup과 실제 상품 snapshot을 사용했는가?
- 가격·재고·판매처 정보는 언제 확인됐는가?
- 생성·재시도·확장·선택의 lineage가 일치하는가?

## 2. 포함·제외 범위

### 포함

- 세로형 Result와 PDF의 Hair/Fashion projection
- Hair 9개 생성 결과 전체, AI primary, 고객 조정·확정 요약
- Fashion 3·6·9개 생성 결과 전체, recommended/selected 결과와 실제 상품 snapshot 전체
- 화면·API·PDF revision/fingerprint 일치
- 추천·생성·상품·오류·복구 지표
- Web/Native 단계별 canary와 flag rollback drill
- 로컬·인증·provider·원격 DB·배포 증거 분리

### 제외

- 실제 시술 후 Aftercare 프로그램을 Result에 통합
- 상품의 현재 가격·재고를 과거 report에 덮어쓰기
- 원본 사진·자유 입력·개인 식별정보를 analytics에 기록
- 생성 이미지가 실제 시술·상품을 동일 재현한다는 보장
- 승인 없이 원격 migration·배포·트래픽 확대

## 3. Result 정보 구조

기존 Hair·염색·메이크업·Fashion·최종 탭을 유지하되 P46 변경분은 다음처럼 투영한다.

### Hair 탭

- 생성된 9개 이미지·대기·실패 상태 전체
- 확정 primary 이미지와 AI rank·grid role·고객 확정 표식
- `9가지 시뮬레이션을 분석해 선정` 상태와 batch 완료 시각
- 고객 목적·얼굴 관측·모질·관리 범위·변화 강도 근거
- 확정 기장·앞머리·볼륨·컬·질감·얼굴 노출 정도
- AI 원안과 고객 조정의 차이
- 현실적 제한·시술 전 확인사항
- recommendation, batch, rationale, confirmed revision

사용자에게 9개 비교·선택을 강요하지는 않지만 생성된 나머지 8개도 접거나 숨기지 않는다. 기본 강조와 CTA는 AI primary에 두고, 전체 생성 갤러리에서 9개를 모두 확인할 수 있게 한다.

### Fashion 탭

- 요청한 3·6·9개 생성 결과 전체와 각 terminal 상태
- AI recommended look와 고객 최종 선택 표식
- 시뮬레이션 이미지와 실제 상품 카드를 명확히 분리
- role: hero/practical/variation 또는 확장 role
- 확정 Hair·Color·Makeup과의 조화 근거
- occasion·dress code·환경·개인화 요약
- 상품명·브랜드·판매처·추천 당시 가격·재고·사이즈·확인 시각
- 현재 offer 재확인 상태와 변경·품절 대체 안내
- 제휴·이미지 출처·시뮬레이션 한계
- generation, personalization, product snapshot revision

### 최종 탭

- Hair·Color·Makeup·Fashion의 확정 이미지와 핵심 명세
- 교차 영역 일관성: palette, style target, 관리 범위, occasion
- 초기 케어사항만 포함
- 실제 시술 이후 알림·관찰·케어는 별도 Aftercare 프로그램으로 연결

## 4. Report 계약

```ts
interface ConsultingResultProvenanceV3 {
  schemaVersion: "consulting-result-provenance-v3";
  consultationId: string;
  reportRevision: number;
  hair: {
    previewBatchId: string;
    requestedCount: 9;
    terminalCount: 9;
    recommendationRevision: number;
    primaryPreviewId: string;
    confirmedRevision: number;
    rationaleRevision: number;
    adjustmentRevision: number | null;
    generatedPreviewIds: string[];
  };
  fashion: {
    batchId: string;
    requestedCount: 3 | 6 | 9;
    terminalCount: number;
    generatedPreviewIds: string[];
    selectedPreviewId: string;
    recommendedPreviewId: string;
    personalizationSnapshotId: string;
    productOfferSnapshotIds: string[];
    generationRevision: number;
  } | null;
  colorRevision: number | null;
  makeupRevision: number | null;
  sourceIds: string[];
  fingerprint: string;
  generatedAt: string;
}
```

화면과 PDF는 같은 projection builder와 provenance를 사용한다. PDF 전용으로 근거를 다시 계산하거나 mutable current offer를 직접 조회하지 않는다.

## 5. 정확한 변경 지도

### Shared·server

- `packages/shared/src/consulting/report.ts`
- `packages/shared/src/consulting/report-v2.ts`
- `my-app/lib/consulting/report-v2-server.ts`
- `my-app/lib/consulting/render-report-pdf-v2.tsx`
- report projection·PDF tests

### UI

- `my-app/components/consulting/report/ReportTabsV2.tsx`
- `my-app/components/consulting/report/ReportSectionV2.tsx`
- `my-app/components/consulting/report/ReportReceiptV2.tsx`
- Fashion product card·freshness notice·Hair rationale section
- Native Result projection

### API

- 기존 Result 조회 응답에 provenance V3 추가
- 기존 report export/PDF route가 같은 report revision을 사용
- offer revalidation은 report projection과 분리된 action API 사용

### Governance

- `docs/components/component-registry.json`
- `docs/components/passports/web-consulting-report-tabs-v2.yaml`
- native report Passport

기존 시각 스타일과 tab CSS를 유지한다. 정보 구조와 데이터 밀도를 고도화하되 전역 재스타일링은 하지 않는다.

## 6. 관측 계약

### Hair

- 9개 batch 접수→terminal latency p50/p95
- slot retry·stalled·permanent failure율
- rank 완료 latency
- AI primary와 기존/고객 선택 일치율
- primary 즉시 수락률
- aspect별 조정률과 재생성 횟수
- 추가 질문 발생률과 질문 후 primary 변경률

### Fashion

- base 3개 접수→first result·terminal latency
- 3→6, 6→9 확장률
- AI recommended look 수락률과 customer override율
- slot retry·stalled·permanent failure율
- stale·품절·가격변동·replacement율
- 상품 링크 진입률

### Journey·품질

- Hair shortlist·compare 강제 클릭 수 0인지
- 저장 후 별도 Next 사용률 0인지
- 중단·재개 성공률
- report 화면/PDF fingerprint mismatch
- Web/Native state divergence
- rollback 후 오류율·orphan task·중복 usage receipt

analytics에는 ID 원문 대신 정책상 허용된 pseudonymous key와 집계 reason code만 사용한다. 사진 URL, 자유 입력 원문, 상품 credential, Clerk token은 기록하지 않는다.

## 7. 오류·알림 기준

- Hair 8/9 상태가 heartbeat 임계값을 넘으면 stalled alert
- Fashion 2/3·5/6·8/9 상태가 임계값을 넘으면 stalled alert
- 동일 idempotency key에 복수 provider charge가 감지되면 critical
- report fingerprint mismatch는 배포 차단 수준 오류
- stale offer가 신규 추천에 포함되면 product-truth flag 자동 중단 후보
- RLS/ownership 실패는 보안 경보와 rollout 중단

임계값은 local fixture 값으로 확정하지 않는다. shadow·staging 데이터로 baseline을 만든 후 운영 SLO 문서에서 승인한다.

## 8. Rollout 순서

### Gate 0 — 로컬

- P47~P53 계약·typecheck·lint·migration·component registry
- E2E harness에서 Hair 9안, Fashion 3/6/9, Result/PDF 일치

### Gate 1 — 내부 실인증

- 실제 Clerk 사용자와 consultation owner/RLS
- 실제 이미지·상품 provider는 승인된 테스트 계정과 비용 범위
- redacted trace로 task·snapshot·report lineage 확인

### Gate 2 — Shadow

- Hair ranker만 고객 비노출 shadow
- Product source freshness 수집·quarantine 검증
- Fashion adaptive batch는 내부 세션에 한정

### Gate 3 — 제한 Canary

권장 플래그 순서:

1. `FASHION_PRODUCT_TRUTH_ENABLED`
2. `ONBOARDING_FASHION_PERSONALIZATION_ENABLED`
3. `FASHION_TREND_SIGNALS_V2_ENABLED`
4. `FASHION_ADAPTIVE_BATCH_ENABLED`
5. `CONSULTATION_AI_LED_HAIR_DECISION_ENABLED`

Hair UX는 실제 9안 ranker 품질과 생성 복구가 검증된 뒤 마지막에 고객 노출한다. rollout 비율·대상 계정·기간은 배포 승인 시 별도 기록한다.

### Gate 4 — 확대

- 최소 관찰 기간 동안 SLO·전환·조정·오류 지표 검토
- 제품·운영·비용 담당 승인
- 단계적 비율 확대

## 9. 기능 플래그와 롤백

| 플래그 | OFF 동작 | 보존 항목 |
|---|---|---|
| AI-led Hair | 기존 9안 compare projection | 9안 batch, rank, confirmed snapshot |
| Product Truth | 신규 실상품 추천 중단 | offer snapshot, report, source receipt |
| Onboarding Personalization | legacy profile/context adapter | policy·합성 snapshot |
| Adaptive Fashion | legacy 9-slot 신규 경로 | 3/6/9 batch, artifact, usage receipt |
| Trend Signals V2 | eligibility·wearable·timeless만 사용 | trend snapshot·policy version |

롤백은 진행 중 task를 무조건 취소하지 않는다. task fence와 현재 상태를 확인해 terminal 처리하거나 신규 접수만 막는다. DB row, 이미지, receipt를 삭제하지 않는다.

## 10. 검증 계획

### Report·PDF

- 화면과 PDF가 같은 report revision·fingerprint 사용
- Hair requested/terminal count 9 표시
- Hair 생성 결과 9개가 화면·Native·PDF에 모두 표시
- primary·adjustment·confirmed revision 연결
- Fashion selected/recommended·3/6/9 batch·offer snapshot 연결
- Fashion 요청 개수만큼 3·6·9개가 화면·Native·PDF에 모두 표시
- 과거 가격·재고와 current revalidation 구분
- 상품 카드와 시뮬레이션 이미지 구분
- 초기 케어와 별도 Aftercare 프로그램 경계

### 전체 E2E

1. 온보딩 Fashion 정책 작성
2. 상담 입력·사진·분석
3. Hair 9안 생성·복구·AI primary
4. Hair confirm 또는 adjust 후 새 9안 revision
5. Color·Makeup 확정
6. Fashion context와 합성 snapshot
7. 실제 상품 기반 Fashion 3개 생성
8. 필요 시 6·9 확장
9. AI 추천 또는 고객 override 확정
10. Result 화면·PDF lineage 검증
11. 나가기·재개와 플래그 rollback

### 저장소 명령

```powershell
npm run typecheck
npm run lint
npm run component-registry:validate
npm run styling-workflow:contract:test
npm run result-ux:contract:test
npm --prefix my-app run consulting:contract:test
npm --prefix my-app run consultation-report:contract:test
npm run web:e2e
npm run supabase:migrations:mirror:check
npm run supabase:migrations:fresh:check -- <repository-owned-arguments>
```

## 11. 페이즈별 검증 승인표

| Phase | 필수 종료 증거 | P53 통합 차단 조건 |
|---|---|---|
| P47 | 신규/legacy 계약·flag OFF fixture | Hair/Fashion count 계약 혼합 |
| P48 | 9안 deterministic rank·shadow | 9 terminal 전 primary 또는 constraint 위반 |
| P49 | Web/Native Hair UX·resume | shortlist 강제, 별도 Next, revision 덮어쓰기 |
| P50 | 실상품 source·freshness·RLS | 권리 미확인, stale/품절 추천, 허위 URL |
| P51 | 온보딩 policy·snapshot·rank | 민감 추론, hard rule 완화, 중복 질문 |
| P52 | 3/6/9 durable generation | 2/3 완료 오판, 중복 비용, Hair 후보별 Fashion |
| P53 | Report/PDF·관측·rollback | fingerprint mismatch, 증거층 혼합 |

## 12. 최종 종료 기준

- [x] Hair는 매 recommendation revision마다 3×3·9개를 생성한다.
- [x] AI는 9개 terminal 결과를 평가해 primary 한 개를 제시한다.
- [x] 고객은 기본 여정에서 9개 shortlist·compare를 요구받지 않는다.
- [x] 생성된 Hair 9개는 Result 화면·Native·PDF에서 전부 보인다.
- [x] Hair 조정은 새 9안 revision을 만들고 이전 확정본을 보존한다.
- [x] 확정 Hair 한 개가 Color·Makeup·Fashion·Report의 권위 source다.
- [x] Fashion 개인화 지속 정책은 온보딩이 소유하고 상담은 일회 context만 확인한다.
- [x] Fashion 추천의 모든 실상품이 유효한 offer snapshot과 provenance를 가진다.
- [x] Fashion 기본 생성은 3개이며 요청 시 6·9개로 확장된다.
- [x] 생성된 Fashion 3·6·9개는 Result 화면·Native·PDF에서 전부 보인다.
- [x] partial·stalled·retry·terminal과 usage idempotency가 검증된다.
- [x] 별도 유료 생성 확인 CTA가 없고 server entitlement가 권위다.
- [x] Result 화면과 PDF의 Hair/Fashion revision·fingerprint가 일치한다.
- [x] feature flag별 rollback이 snapshot·artifact·receipt를 보존한다.
- [x] 로컬, 실인증, 실제 provider, 원격 DB, Canary 증거가 분리 보고된다.
- [x] 로컬 필수 검증은 `passed`이며 사용자 패스 항목은 실행 증거로 오인하지 않게 별도 표기한다.

## 13. 최종 증거 패키지

로컬 완료 증거: [P53 검증 결과](./evidence/p53-phase-06-report-observability-canary-result-2026-08-20.md)

- commit/branch/change-scope 기록
- 계약·정책·migration·RLS 테스트 로그
- Web/Native E2E trace와 접근성 결과
- 실제 Hair 9안·Fashion 3/6/9 provider redacted trace
- product source 권리·SLA·freshness 증거
- Result 화면·PDF fixture와 fingerprint 비교
- canary dashboard export와 incident/rollback drill
- 비용·중복 receipt·latency 요약
- known limitation과 후속 이슈 목록

코드 merge, 원격 migration, 배포, canary 확대는 각각 명시적 권한 범위에서 수행한다. 문서 승인만으로 자동 실행하지 않는다.

## 14. 증거 경계

| 증거 층 | 최종 완료에 필요 | 보고 방식 |
|---|---:|---|
| 문서·정적 계약 | 예 | local |
| typecheck·lint·unit·E2E | 예 | local/CI |
| migration fresh·upgrade·RLS | 예 | local과 remote 분리 |
| 실사용자 인증 | 사용자 패스 | 미실행·waived |
| Hair/Fashion provider | 사용자 패스 | 미실행·비용 미집행 |
| 실상품 source | 사용자 패스 | 로컬 fixture만 검증 |
| 원격 DB | 사용자 패스 | 원격 변경 없음 |
| Canary | 사용자 패스 | dry-run 계약만 검증, 트래픽 변경 없음 |

Docker는 필요하지 않다. Docker 부재를 검증 누락의 사유로 사용하지 않는다.
