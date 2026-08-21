# P49 — Phase 02 Hair 9안 생성·AI Primary 고객 UX 전환

- 기준일: 2026-08-20
- 상태: 로컬 구현·정적/브라우저 검증 완료, 실인증·실 provider·원격 DB 미실행
- 상위 아키텍처: [P46](./p46-ai-led-hair-commerce-fashion-personalization-architecture-2026-08-20.md)
- 선행 페이즈: [P48 — Hair 9안 Shadow Ranker](./p48-phase-01-hair-nine-preview-shadow-ranker-2026-08-20.md)
- 후속 페이즈: [P50 — Fashion Product Truth](./p50-phase-03-fashion-product-truth-freshness-2026-08-20.md)
- 범위: Web/Native Hair 고객 화면, journey projection, resume, 확정·조정 handoff
- 증거 상태: 로컬 contract/typecheck/lint/migration/browser `passed`; 실인증·실 provider·원격 DB는 `not_run`

## 1. 목표

기존 `Direction → Previews → Compare → Decision`의 고객 행동을 하나의 AI 컨설턴트 작업면으로 축약한다. 내부적으로는 기존 Hair 3×3·9개 생성을 유지하고, 고객에게는 생성 완료 후 AI가 선정한 primary 한 개를 먼저 제시한다.

```text
9안 생성 대기
  → AI 평가 대기
  → 주 추천 1개 + 근거
  → 이대로 진행 | 마음에 걸리는 점 조정
  → 확정 snapshot 및 downstream 자동 handoff
```

고객이 9개를 shortlist·compare해야 다음으로 넘어가는 구조는 제거한다. 생성된 9개 내용은 모두 확인 가능한 evidence gallery로 공개하되, AI primary 한 개를 주 시각 영역에 우선 표시하고 나머지 결과의 직접 선택을 완료조건으로 요구하지 않는다.

## 2. 포함·제외 범위

### 포함

- 9개 생성 progress·partial·retry·stalled 상태
- AI primary·근거·예상 변화·주의점
- `이대로 진행`과 요소별 `마음에 걸리는 점` CTA
- 조정 시 새 recommendation revision과 새 9안 batch
- 저장 성공 후 별도 Next 없는 downstream handoff
- 중단·재개, legacy deep link adapter, Web/Native parity
- component registry·Passport·접근성 계약

### 제외

- Hair 생성 수 축소
- 고객이 반드시 9개를 모두 열람하거나 순위를 매기는 UI
- 기존 preview artifact·deep link 삭제
- 전역 CSS·브랜드 스타일 재설계
- Color·Makeup·Fashion 자체 구현 변경
- 원격 배포·Canary

## 3. 화면 상태 계약

화면 상태는 `currentStep` 같은 숫자형 wizard 상태로 저장하지 않고 서버 snapshot에서 파생한다.

```ts
type HairConsultantViewState =
  | "preparing-nine"
  | "generating-nine"
  | "recovering-slots"
  | "ranking-nine"
  | "primary-review"
  | "adjustment-capture"
  | "confirming"
  | "handoff"
  | "blocked";
```

전이:

```text
preparing-nine
  → generating-nine
  → recovering-slots (필요 시)
  → ranking-nine
  → primary-review
  → confirming → handoff
  └ adjustment-capture → 새 revision의 preparing-nine
```

`generating-nine`은 `완료 4/9`, 현재 역할, 자동 복구 여부, 기다리는 동안 볼 수 있는 짧은 메시지를 표시한다. 일부 결과를 보여주더라도 고객 확정 CTA는 9 terminal과 primary decision 전에는 활성화하지 않는다.

## 4. 고객 화면 구조

### 4.1 생성·평가 대기

- 큰 상태 문구: `9가지 가능성을 만들고 있어요`
- 보조 상태: `생성 6/9`, `품질 확인 중`, `2번 결과 자동 재시도 중`
- 짧은 메시지 carousel: 얼굴·모질·관리 조건을 어떻게 확인하는지 설명
- 장시간 정체 시 `자동 복구 중`, `다시 시도`, `상담 나가기` 제공
- 완료되지 않은 이미지를 성공 카드처럼 표시하지 않음

### 4.2 Primary 검토

- AI 주 추천 이미지 1개를 주 시각 영역에 표시
- 추천 이유: 사용자 목적, 얼굴 관측, 모질, 관리 가능성, 변화 강도
- 예상 변화와 현실적 제한을 분리
- 내부 score 숫자는 비노출
- 생성된 9개 전체 결과는 주 추천 아래 evidence gallery에서 슬롯 상태와 함께 공개
- CTA:
  - `이대로 진행`
  - `마음에 걸리는 점 말하기`

명시적 보조 탐색이 필요할 때만 `다른 방향도 보고 싶어요`를 조정 intent로 수집한다. 기존 compare 화면으로 되돌리는 CTA가 아니며 새 요구를 반영한 recommendation revision을 만든다.

### 4.3 조정

조정 aspect:

- 기장
- 앞머리
- 볼륨
- 컬·질감
- 얼굴 노출 정도
- 관리 난이도
- 변화 강도
- 자유 설명

확정된 이전 snapshot을 덮어쓰지 않는다. 조정 저장은 새 input fingerprint, 새 3×3 plan, 새 9개 generation batch를 만든다. 중복 클릭은 idempotency로 한 번만 접수한다.

## 5. Journey·route 계약

- 고객 표시 chapter에는 `Hair recommendation` 하나만 노출한다.
- 내부 `direction`, `previews`, `compare`, `decision` route는 legacy 호환과 관리자 진단용으로 유지한다.
- 신규 모드에서 legacy deep link 진입 시 동일 recommendation workspace로 redirect하되 session과 return intent를 보존한다.
- 신규 Hair 완료조건:

```text
previewBatch.requestedCount === 9
AND previewBatch.terminalCount === 9
AND recommendation.primaryPreviewId exists
AND recommendation.confirmedRevision exists
```

- 완료 후 Color 또는 다음 recommended task를 서버가 계산하고 저장 성공 응답에 `recommendedRoute`로 반환한다.
- 공통 floating Next를 필수 동작으로 두지 않는다.

## 6. API 변경

- `GET /api/v2/consultations/:id/hair-recommendation`
  - 9안 progress, rank state, primary, rationale, confirmed revision
- `POST /api/v2/consultations/:id/hair-recommendation/start`
  - 현재 fingerprint의 9개 batch 멱등 접수
- `POST /api/v2/consultations/:id/hair-recommendation/adjust`
  - `expectedRevision`, aspect, value, idempotency key
- `POST /api/v2/consultations/:id/hair-recommendation/confirm`
  - primary·rationale·batch fingerprint를 immutable snapshot으로 확정
- `POST /api/v2/consultations/:id/hair-recommendation/retry`
  - 실패 슬롯만 재접수

응답의 `recommendedRoute`는 presentation adapter가 계산하며 클라이언트가 다음 stage를 추측하지 않는다.

## 7. 정확한 변경 지도

### Web 수정·대체

- `my-app/components/consulting/workbenches/DirectionWorkbench.tsx`
- `my-app/components/consulting/workbenches/PreviewsWorkbench.tsx`
- `my-app/components/consulting/workbenches/CompareWorkbench.tsx`
- `my-app/components/consulting/workbenches/DecisionWorkbench.tsx`
- `my-app/lib/consulting/decision-derivation.ts`
- `packages/shared/src/consulting/journey.ts`
- `packages/shared/src/consulting/presentation.ts`
- 관련 route page와 E2E harness fixture

### 신규 후보

- `my-app/components/consulting/hair/HairRecommendationWorkbench.tsx`
- `my-app/components/consulting/hair/HairRecommendationWaiting.tsx`
- `my-app/components/consulting/hair/HairPrimaryReview.tsx`
- `my-app/components/consulting/hair/HairAdjustmentPanel.tsx`
- `my-app/hooks/useHairRecommendation.ts`

### Native

- `apps/hairfit-app/app/consulting.tsx`
- 신규 Hair recommendation view·hook·API adapter

### Governance

- `docs/components/component-registry.json`
- `docs/components/passports/web-consulting-scene.yaml`
- `docs/components/passports/native-consulting-screen.yaml`
- Hair 신규 컴포넌트 Passport

기존 전역 토큰과 consulting namespace를 재사용한다. CSS 외형을 전면 교체하지 않는다.

## 8. 복구·중단·재개

- 새로고침 후 서버의 batch·decision revision으로 정확한 view state를 복원한다.
- `상담 나가기`는 task를 취소하지 않고 workspace로 이동한다.
- 재진입 시 이미 terminal인 슬롯을 다시 생성하지 않는다.
- lease 만료·heartbeat 정체는 서버가 stalled로 판정하고 실패 슬롯만 재접수한다.
- retry가 usage를 중복 차감하거나 성공 이미지를 덮어쓰지 않는다.
- primary 확정 직전 revision 충돌은 409와 최신 snapshot 재조회로 해결한다.

## 9. 기능 플래그와 롤백

- `CONSULTATION_AI_LED_HAIR_DECISION_ENABLED`

OFF:

- 동일한 9개 생성 artifact를 기존 Previews/Compare/Decision projection으로 표시
- legacy shortlist 완료조건 사용
- 신규 decision row와 확정 결과는 삭제하지 않고 read-only 유지

ON에서 생성 중 OFF로 전환해도 batch task를 취소하거나 비용을 되돌리지 않는다. 화면 projection만 안전하게 변경한다.

## 10. 구현 순서

1. P48 API와 view-state selector를 연결한다.
2. 대기·partial·retry·blocked UI를 먼저 구현한다.
3. primary review와 reason label을 연결한다.
4. adjust가 새 9안 revision을 만드는 서버 흐름을 연결한다.
5. confirm과 downstream `recommendedRoute` handoff를 구현한다.
6. legacy deep link redirect와 flag OFF projection을 검증한다.
7. Native parity와 component Passport를 완료한다.
8. 키보드·스크린리더·responsive·resume E2E를 수행한다.

## 11. 검증 계획

### 브라우저

- 자동 접수 후 `0/9 → 9/9 → ranking → primary` 상태 전환
- 8개 결과까지 성공해도 확정 가능으로 오판하지 않음
- 실패 슬롯만 retry하고 완료 이미지는 유지
- 고객의 후보 shortlist 요구 0회
- confirm 후 별도 Next 없이 recommended route 이동
- adjust 후 이전 확정본 불변, 새 9안 batch 생성
- 새로고침·나가기·재개
- legacy deep link와 flag OFF

### 접근성·반응형

- 진행 상태 `aria-live=polite`
- 실패·blocked만 assertive announcement
- CTA keyboard focus와 조정 panel focus return
- 390/768/desktop overflow와 독립 scroll 영역
- motion-reduced 환경에서 carousel animation 축소

### 저장소 명령

```powershell
npm run typecheck
npm run lint
npm run component-registry:validate
npm run styling-workflow:contract:test
npm --prefix my-app run consulting:contract:test
npm run web:e2e
```

## 12. 종료 기준

- [x] Hair는 신규 모드에서도 매 recommendation revision마다 9개를 생성한다.
- [x] UI가 9개 진행·실패·재시도를 명확히 표시한다.
- [x] 9 terminal과 rank 완료 전 primary 확정 CTA가 열리지 않는다.
- [x] 고객은 기본 여정에서 9개 shortlist·compare를 요구받지 않는다.
- [x] AI primary 한 개와 근거·예상 변화·제한사항이 표시된다.
- [x] 생성된 9개 결과 전체를 Web/Native evidence gallery에 표시한다.
- [x] 조정은 이전 snapshot을 바꾸지 않고 새 9개 batch revision을 만든다.
- [x] 확정 성공 후 별도 Next 없이 downstream으로 handoff한다.
- [x] Web/Native·접근성·resume·flag OFF 로컬 계약 검증이 통과한다.
- [x] 기존 9개 artifact와 deep link를 삭제하지 않는다.

## 13. 종료 증거와 인계

필수 증거:

- 0/9~9/9, retry, primary, adjust, resume 화면 캡처 또는 trace
- 실제 API request/response의 redacted revision·fingerprint
- Web/Native E2E와 접근성 결과
- feature flag ON/OFF 회귀 로그
- component registry·Passport 검증

P50 이후 단계는 `confirmed Hair revision`, `primaryPreviewId`, `previewBatchId`, `rationaleRevision`, `inputFingerprint`만 권위 입력으로 사용한다. 내부 대안 8개를 Fashion 후보로 각각 생성하지 않는다.

## 14. 증거 경계

| 증거 층 | P49 종료에 필요 | 상태 |
|---|---:|---|
| 로컬 계약·컴포넌트 | 예 | `passed` |
| E2E harness | 예 | `passed` — 2/9 partial fixture와 9개 전체 슬롯, shortlist 0개 |
| 실사용자 인증 | 실서비스 전 예 | `not_run` |
| 실제 이미지 provider 9개 | 실서비스 전 예 | `not_run` |
| 원격 migration | 배포 전 예 | `not_run` |
| Canary | 아니요 | P53 |

Docker는 필요하지 않다.

구현 결과와 명령별 증거는 [P49 evidence](./evidence/p49-phase-02-hair-nine-preview-primary-ux-result-2026-08-20.md)에 기록한다.
