# HairFit V2 구 마법사 엔진 리사이클링 계획

- 작성일: 2026-08-10
- 작업 브랜치: `feat/2026-08-08-hairfit-v2-backend`
- 통합 대상: `develop/2026-08-08-hairfit-v2-backend`
- 문서 상태: 구현 계획
- 제품 방향: 헤어스타일 프리뷰를 사진 분석, 스타일 결정, 살롱 전달, 실제 시술, 에프터케어, 패션까지 이어지는 AI 컨설턴트 서비스로 확장한다.
- UI 원칙: 기존 공개 CSS 토큰·타이포그래피·표면 스타일과 11개 Consulting Scene 구조를 유지한다. 입력 구분선과 전환 화면은 V2 scoped namespace만 사용하며 구 마법사 UI는 재도입하지 않는다.

> 2026-08-11 통합 실행 안내: 이 문서의 엔진 상세와 인터뷰 개선을 함께 완수하는 Phase 순서·종합 종료조건은 `hairfit-v2-engine-recycling-interview-completion-goal-2026-08-11.md`를 따른다.

## 1. 목적

구 Workspace, Result, Personal Color, Styler, Aftercare 흐름에는 이미 운영 경험이 축적된 분석·추천·생성 엔진이 존재한다. 이를 새 V2 컨설팅에서 다시 작성하지 않고 공용 Capability로 분리하여 재사용한다.

재사용의 단위는 화면이나 단계가 아니라 다음 네 가지다.

1. 정규화된 입력 계약
2. 순수 추천·생성 엔진
3. 내구성 실행과 비용 처리
4. 버전·출처가 고정된 결과

구 `Wizard`, `currentStep`, 단계 이동 Controller, 페이지 전용 상태와 CTA는 재사용하지 않는다. V2에서는 서버가 lifecycle, 권한, 작업 상태를 계산하고 프론트는 사용자 입력과 AI·시스템 출력을 표시한다.

## 2. 현재 판정

| Capability | 재사용할 구 엔진 | 현재 V2 연결 상태 | 핵심 보완 |
|---|---|---|---|
| 헤어 블루프린트 | `hairstyle-catalog*`, 182개 v4 blueprint | 부분 완료 | V2 입력 provenance, 활성 cycle, prompt version을 결과까지 고정 |
| 헤어 프리뷰 생성 | generation draft/accept/prepare/run, provider prompt, quality gate | 상당 부분 완료 | 컨설팅 전략과 사용자 모발 입력의 단일 snapshot, 재시도·비용 감사 강화 |
| 퍼스널 컬러 | `analyzePersonalColor` | 저장 API만 존재 | Analysis 진입 전에 서버가 자동 실행하고 `PersonalColorEvidenceV2`로 저장 |
| Salon Brief | `generateDesignerBriefs`, deterministic fallback | V2는 화면 조립 비중이 큼 | 최종 선택 1건을 기준으로 서버가 자동 초안 생성 |
| Aftercare | `generateAftercareGuide`, `hair-care-generator` | V2 저장 모델은 존재 | 실제 시술 record 이후 서버 생성, treatment occurrence 단위 멱등성 |
| Fashion | 추천, 카탈로그, 이미지 생성, styling workflow | 소스 브리지·9슬롯 UI 존재 | 브라우저 9회 실행을 서버 배치 오케스트레이터로 이전 |

현재 헤어 블루프린트 매니페스트, V2 선택 snapshot, Brief·Aftercare·Fashion 저장 API와 일부 legacy adapter는 존재한다. 따라서 전면 재작성보다 엔진 경계를 정리하고 V2 lifecycle에 연결하는 작업이 우선이다.

2026-08-10 소스 기준선은 작업트리 `3476260`, 로컬 `main` `40c6f75`이며 두 ref는 각각 14개와 17개의 고유 커밋으로 갈라져 있다. 182개 catalog-v4 데이터는 존재하지만 `my-app/lib/hairstyle-catalog-recommendation.ts`는 현재 작업트리에서 미추적이고 `main`과 byte-identical하지 않다. 따라서 “메인 엔진 연결 완료”는 아직 branch-level 완료 증거가 아니다. 구현 착수 직전에 fetch한 `main`의 정확한 SHA, 가져올 파일 목록, blueprint manifest hash와 충돌 해소 기록을 source manifest로 고정한다.

## 3. 재사용 원칙

### 3.1 재사용 대상

- 순수 분석·추천 함수
- 모델 provider 호출과 정규화·fallback 로직
- durable workflow, outbox, lease, fencing, retry
- 비용 견적, 승인, 예약, 정산, 환불·복구 계약
- Storage 업로드와 private asset 정책
- 기존 결과의 provenance와 품질 평가

### 3.2 재사용 금지 대상

- `WorkspaceWizard`, `SalonWorkspaceWizard`
- `StylerNewView`, `useStylerNewController`, `StylerWizardStep`
- `WorkspaceStepNavigation`, `currentStep`, `stepIndex`
- 저장 후 별도의 공통 Next를 요구하는 제어 구조
- 브라우저가 여러 생성 작업을 순차 dispatch하는 루프
- legacy route나 UI state를 V2의 authoritative state로 사용하는 구조
- 사용자가 분석·브리프·에프터케어 생성을 매번 수동 요청해야 하는 흐름

### 3.3 공통 실행 원칙

- V2 server snapshot이 authoritative source다.
- 사용자의 명시적 확인은 `최종 선택`, `실제 시술 확인`에만 둔다. 유료 생성 여부를 묻는 별도 확인은 두지 않는다.
- 분석, Brief 초안, 후속 데이터 조립은 선행 조건이 충족되면 자동 실행한다.
- 오래 걸리는 작업은 서버에서 지속되며 사용자가 Scene을 벗어나도 중단되지 않는다.
- waiting·partial·complete·failed 상태는 실제 task 상태에서만 파생한다.
- 모든 생성은 멱등 키와 입력 fingerprint를 가진다.
- 같은 입력의 완료 결과가 있으면 재사용하고 이중 과금하지 않는다.
- V2 migration은 additive로 유지하고 legacy 데이터를 삭제하지 않는다.
- 원본 얼굴 사진은 Brief, 공유 URL, QR, PDF에 포함하지 않는다.

## 4. 목표 구조

```text
Legacy routes ───────┐
                    ├─> Shared Capability Service
V2 consultant ──────┘      ├─ Input normalizer
                            ├─ Domain engine
                            ├─ Provider adapter
                            ├─ Durable task/outbox
                            └─ Result normalizer
                                      │
                                      ├─ Legacy result adapter
                                      └─ V2 evidence/snapshot/output store
```

구 route와 V2 route가 같은 Capability Service를 호출한다. legacy route는 기존 응답 형태로 변환하고 V2 route는 evidence·snapshot·version 계약으로 저장한다. 엔진 구현은 한 벌만 유지한다.

## 5. 공통 Capability 계약

```ts
interface CapabilityRequest<TInput> {
  userId: string;
  consultationId: string;
  input: TInput;
  inputFingerprint: string;
  engineVersion: string;
  idempotencyKey: string;
}

interface CapabilityResult<TOutput> {
  state: "queued" | "running" | "partial" | "completed" | "failed";
  output: TOutput | null;
  sourceMode: "legacy_reuse" | "v2_generated" | "fallback";
  provider: string | null;
  model: string | null;
  engineVersion: string;
  inputFingerprint: string;
  outputFingerprint: string | null;
  costMinor: number | null;
  latencyMs: number | null;
}
```

각 Capability는 다음을 보장한다.

- 사용자 소유권 확인
- 입력 schema validation
- 멱등 replay
- provider timeout과 재시도 상한
- deterministic fallback 여부 명시
- 결과 provenance 저장
- customer-facing 응답에서 prompt·provider 원문 제거
- 관측 event와 실패 코드 기록

## 6. Capability별 리사이클링 계획

### 6.1 헤어 블루프린트 추천

재사용 엔진:

- `my-app/lib/hairstyle-catalog-seed.ts`
- `my-app/lib/hairstyle-catalog.ts`
- `my-app/lib/hairstyle-catalog-recommendation.ts`
- `my-app/lib/hairstyle-catalog-lineup.ts`

입력:

- 얼굴 분석 evidence
- 성별·스타일 타깃
- 현재 길이, 모질, 굵기, 손상, 시술 이력
- 사용자가 확정한 희망 길이와 변화 강도
- 허용·회피 시술, 관리 가능 시간, 방문 주기
- 활성 catalog cycle과 feature rollout batch

출력:

- 정확히 9개의 blueprint-backed recommendation
- `catalogItemId`, `catalogCycleId`, `promptTemplateVersion`
- 적합성 점수, 선택 근거, hard conflict, maintenance·service 제약
- BALANCE, IMAGE, LIFESTYLE 슬롯 intent

멱등 키:

```text
consultationId + analysisEvidenceId + strategyRevision + catalogCycleId + engineVersion
```

보완 작업:

- [x] V2 Discovery 모발 입력을 `CurrentHairProfile`로 정규화한다.
- [ ] 메인의 v4 blueprint runtime과 개인화 선택 엔진을 source SHA·파일 manifest·hash와 함께 작업 브랜치에 포함한다. 현재 182개 로컬 audit는 통과하지만 추천 모듈의 Git 포함과 `main` parity가 남아 있다.
- [ ] generation attempt에 blueprint slug·cycle·prompt version·input fingerprint를 고정한다.
- [ ] 활성 cycle이 없을 때 자동 rebuild하지 않고 운영 가능한 오류와 복구 행동을 반환한다.
- [ ] 같은 snapshot에 catalog cycle이 중간 변경되어도 기존 9슬롯을 다시 섞지 않는다.

### 6.2 헤어 프리뷰 이미지 생성

재사용 엔진:

- generation draft/accept/prepare/run 경로
- V2 prompt policy와 prompt artifact token
- durable generation workflow/outbox
- preview quality gate와 slot retry

입력:

- private 원본 사진 fingerprint
- `AnalysisEvidenceV2`
- 확정 strategy revision
- blueprint recommendation 9개
- identity preservation와 사용자 옵션

출력:

- `PreviewBoardV2`와 9개 `PreviewVariantV2`
- attempt별 provider, model, prompt policy, 품질 판정, output fingerprint
- 완성된 결과부터 제공되는 partial output

멱등 키:

```text
consultationId + sourceImageFingerprint + strategyRevision + boardVersion
```

보완 작업:

- [ ] 전략 확정과 entitlement 검증 직후 서버가 별도 유료 확인 없이 9개 attempt를 모두 durable queue에 등록한다.
- [ ] 브라우저 종료·새로고침 후에도 생성과 품질 재시도가 계속된다.
- [ ] 부분 성공 결과는 유지하고 실패 슬롯만 재시도한다.
- [ ] 동일 board replay는 기존 generation과 비용 receipt를 반환한다.

### 6.3 퍼스널 컬러 분석

재사용 엔진:

- `my-app/lib/personal-color.ts`의 `analyzePersonalColor`
- 비교 palette와 결과 normalization
- 기존 style profile의 저장 결과

목표 흐름:

1. Photo 사용 범위에 `personalColor` 동의가 있는지 확인한다.
2. 시스템 사진 적합성 검사와 얼굴 landmark 저장 후 서버 task를 등록한다.
3. 컬러 분석을 자동 실행한다.
4. 결과를 `PersonalColorEvidenceV2`로 저장한다.
5. Analysis 우측 output에 결과·신뢰도·근거 palette를 자동 표시한다.
6. Fashion과 Brief는 같은 evidence version을 참조한다.

출처 우선순위:

```text
현재 consultation의 PersonalColorEvidenceV2
> 동일 사진 fingerprint의 최신 완료 evidence
> legacy style profile 결과
> 결과 없음
```

legacy profile을 사용하면 `sourceMode=legacy_reuse`와 원본 진단 시각을 표시한다. 단순히 confidence를 `high`로 승격하지 않는다.

멱등 키:

```text
consultationId + sourcePhotoFingerprint + personalColorEngineVersion
```

보완 작업:

- [ ] `/api/style-profile` 버튼 로딩을 V2 evidence 자동 로딩으로 교체한다.
- [ ] legacy 분석 결과와 새 분석 결과의 provenance를 구분한다.
- [ ] 사진 사용 동의가 없으면 분석을 실행하지 않고 명시적 unavailable 상태를 저장한다.
- [ ] provider 실패 시 fallback을 진단 완료로 위장하지 않는다.

### 6.4 Salon Brief

재사용 엔진:

- `my-app/lib/designer-brief-generator.ts`
- `generateDesignerBriefs`
- `buildFallbackDesignerBrief`

구 엔진은 generation 후보별 Brief를 만든다. V2에서는 최종 확정된 `StyleSelectionSnapshotV2` 한 건을 기준으로 `SalonBriefV2` 한 버전을 생성하도록 adapter를 둔다.

입력:

- 확정 style selection snapshot
- 얼굴·모발 분석 evidence
- 확정 strategy와 feasibility
- 필요한 시술과 제한 조건
- 관리 가능 시간과 방문 주기
- 사용자가 수정한 추가 요청

출력:

- customer/designer audience
- summary, cut, volume·texture, color, styling, cautions
- evidence와 selection snapshot ID
- generator/model/version과 fallback 여부
- 공유 만료·폐기 상태

멱등 키:

```text
selectionSnapshotId + briefAudience + briefEngineVersion + userEditRevision
```

목표 흐름:

- 최종 스타일 확정 후 Brief 생성 task를 자동 등록한다.
- 짧은 waiting 화면 후 완료되면 Salon Brief와 Fashion을 병렬 개방한다.
- 사용자는 자동 생성된 초안을 편집·버전 저장·공유할 수 있다.
- 원본 얼굴 사진과 내부 prompt는 공유 결과에 포함하지 않는다.

보완 작업:

- [ ] Decision의 화면 조립 fallback을 서버 Capability 호출로 교체한다.
- [ ] fallback도 명시적인 engine result로 저장한다.
- [ ] 사용자 편집본과 AI 원본을 별도 revision으로 보존한다.
- [ ] 공유 링크는 가장 최근에 선택된 공개 가능 version만 가리킨다.

### 6.5 Aftercare

재사용 엔진:

- `my-app/lib/aftercare-guide-generator.ts`
- `my-app/lib/hair-care-generator.ts`
- `my-app/lib/aftercare-model.ts`
- legacy confirmation adapter

Aftercare는 스타일 선택 직후 생성하지 않는다. 실제 시술 종류와 시술일이 확인된 뒤에만 개방한다.

실행 단위:

```text
StyleSelectionSnapshotV2
  └─ ActualService occurrence
       └─ AftercareProgram version 1..N
```

같은 generation이나 같은 선택이라도 실제 시술일이 다르면 다른 occurrence다. 같은 `aftercareProgramRequestId`의 재요청만 replay한다.

입력:

- 확정 selection snapshot
- 실제 시술 종류·날짜·디자이너 메모
- 분석·Brief·모발 손상 상태
- 사용자 관리 가능 시간과 열기구 선호

출력:

- 오늘 행동
- D+3, W+2, W+6, W+10 checkpoint
- 세정·건조·열기구·제품·회피 지침
- concern, satisfaction, after photo 연결
- model/version/fallback provenance

멱등 키:

```text
actualServiceId + aftercareProgramRequestId + aftercareEngineVersion
```

보완 작업:

- [ ] V2 actual service 저장과 guide 생성을 하나의 서버 orchestration으로 묶는다.
- [ ] 첫 프로그램·추가 프로그램 entitlement 정책은 program receipt와 원자적으로 연결하고 별도 유료 확인은 두지 않는다.
- [ ] 생성 중 사용자가 나가도 서버 작업을 계속하고 재진입 시 복구한다.
- [ ] after photo는 동의 확인 후 private Storage에 actual service ID로 연결한다.
- [ ] legacy aftercare는 consultation·selection provenance가 정확한 경우에만 lazy import한다.

### 6.6 Fashion 추천·이미지 생성

재사용 엔진:

- `my-app/lib/fashion-recommendation-generator.ts`
- `my-app/lib/fashion-catalog.ts`
- `my-app/lib/openai-image.ts`
- `my-app/lib/styling-workflow-execution.ts`
- styling workflow/outbox와 notification
- V2 styling source adapter

입력:

- 확정 selection snapshot과 헤어 이미지
- 전신 사진 fingerprint와 사용 동의
- 현재 consultation의 PersonalColorEvidenceV2
- 상황, 계절, 핏, 노출, 예산, 회피 아이템
- DAILY 3, WORK 3, STATEMENT 3 슬롯

목표 흐름:

1. 사용자가 패션 방향을 한 번 입력한다.
2. 서버가 entitlement를 검증하고 9개 추천을 만든다.
3. 방향 확인 뒤 별도 유료 확인 없이 batch를 접수한다.
4. 서버 batch orchestrator가 동시성 3으로 9개 작업을 fan-out한다.
5. 완성 결과부터 즉시 표시한다.
6. 실패 슬롯만 개별 재시도한다.
7. 최대 3개 shortlist와 최종 룩을 저장한다.

배치 멱등 키:

```text
consultationId + selectionSnapshotId + directionHash + engineVersion
```

슬롯 멱등 키:

```text
selectionSnapshotId + bodyPhotoFingerprint + personalColorEvidenceId
+ directionHash + slotId + engineVersion
```

legacy 결과 재사용 조건:

- 선택 헤어 source가 동일하다.
- 전신 사진 fingerprint가 동일하다.
- personal color evidence version이 동일하다.
- 방향 hash와 slot ID가 동일하다.
- 완료된 결과이며 provenance와 비용 receipt가 존재한다.

위 조건을 만족하지 않는 legacy 결과는 히스토리에는 표시할 수 있지만 V2 9슬롯을 자동으로 채우지 않는다.

보완 작업:

- [ ] 브라우저의 9개 추천·생성 loop를 제거한다.
- [ ] entitlement 검증과 9개 dispatch를 서버에서 원자적으로 연결한다.
- [ ] user exit 후에도 생성·notification을 계속한다.
- [ ] provider 구현은 `OutfitImageProvider` 뒤로 숨기고 실제 사용 provider를 정확히 기록한다.
- [ ] partial·failed·retry·ready 상태를 batch row와 lifecycle task에서 계산한다.

## 7. 데이터 출처와 재사용 규칙

### 7.1 공통 source precedence

```text
현재 V2 consultation에서 생성된 versioned evidence/output
> 동일 입력 fingerprint의 V2 완료 결과
> provenance가 완전한 legacy 완료 결과
> deterministic fallback
> unavailable/failed
```

### 7.2 lazy import

legacy 데이터를 일괄 변환하지 않는다. 사용자가 해당 상담이나 결과를 열 때 다음 조건을 확인하고 V2 adapter row를 생성한다.

- 소유자 일치
- source generation·variant 존재
- 입력·출력 asset 접근 가능
- version 또는 생성 시각 존재
- 선택·시술·패션 source 관계가 모호하지 않음

조건을 만족하지 않으면 legacy history로만 표시한다.

### 7.3 provenance 필수 필드

- `sourceMode`
- `sourceEntityId`
- `inputFingerprint`
- `outputFingerprint`
- `engineVersion`
- `provider`, `model`
- `promptPolicyVersion`
- `selectionSnapshotId`
- `analysisEvidenceId`
- `personalColorEvidenceId`
- `createdAt`, `completedAt`
- `costMinor`, `latencyMs`

## 8. 서버 작업과 UX 계약

각 재활용 엔진은 `consultation_lifecycle_tasks` 또는 동등한 durable task record를 사용한다.

| 작업 | 자동 시작 조건 | 사용자 승인 | 완료 후 개방 |
|---|---|---|---|
| 얼굴·모발 분석 | 사진 사전검사·동의 통과 | 없음 | Analysis, Direction |
| 퍼스널 컬러 | 컬러 사용 동의·적합 사진 | 없음 | Analysis 컬러 결과, Fashion 입력 |
| 헤어 프리뷰 | 전략 확정·entitlement 충족 | 없음 | Preview partial/compare |
| Salon Brief | 최종 스타일 확정 | 없음 | Brief 편집·공유 |
| Fashion | 방향 확정·entitlement 충족 | 없음 | 9-look partial board |
| Aftercare | 실제 시술 확인·entitlement 정책 충족 | 실제 시술 확인 | Care program |

waiting 화면은 최소 체류 시간을 위한 장식이 아니라 실제 task 상태를 반영한다.

- `queued`: 작업이 접수됨
- `running`: 실제 provider·worker 실행 중
- `partial`: 일부 결과 사용 가능
- `completed`: 결과 저장과 다음 capability 개방 완료
- `failed`: 복구 행동과 실패 코드 표시

사용자는 모든 waiting 화면에서 상담을 나갈 수 있다. 저장된 입력과 완료 결과는 유지되며 서버 작업은 계속된다.

## 9. API·서비스 목표 경계

신규 또는 정리 대상 서비스:

```text
lib/capabilities/hair-blueprint-service.ts
lib/capabilities/hair-preview-service.ts
lib/capabilities/personal-color-service.ts
lib/capabilities/salon-brief-service.ts
lib/capabilities/aftercare-service.ts
lib/capabilities/fashion-batch-service.ts
lib/capabilities/provenance.ts
lib/capabilities/idempotency.ts
```

기존 route는 서비스 호출과 HTTP 변환만 담당한다. UI component에서 provider SDK, service-role DB, prompt 조립, 과금 계산을 수행하지 않는다.

V2 route 예시:

```text
POST /api/v2/consultations/:id/personal-color/run
GET  /api/v2/consultations/:id/personal-color
POST /api/v2/consultations/:id/salon-brief/generate
POST /api/v2/consultations/:id/aftercare/programs
POST /api/v2/consultations/:id/fashion-batches
POST /api/v2/consultations/:id/fashion-batches/:batchId/approve
GET  /api/v2/consultations/:id/tasks/:taskId
```

실제 route 이름은 기존 V2 계약과 중복되지 않도록 Phase 0에서 동결한다.

## 10. 구현 순서

### P0. 계약 동결과 fixture 확보

- legacy 엔진별 입력·출력 fixture를 저장한다.
- 공용 Capability request/result와 provenance schema를 동결한다.
- 기존 V2 route, shared type, feature flag 이름의 충돌을 해소한다.
- 동일 입력의 legacy/V2 결과 허용 차이를 정의한다.

종료조건:

- 엔진별 golden fixture가 존재한다.
- UI 재사용 금지 목록과 adapter 경계가 contract test로 고정된다.
- schema/API/flag 이름에 미해결 충돌이 없다.

### P1. 공용 서비스 추출

- legacy 엔진을 이동하지 않고 얇은 서비스 facade를 먼저 만든다.
- legacy route를 facade 호출로 바꾸되 응답과 UX는 유지한다.
- provider·fallback·비용·latency metadata를 공통 결과로 정규화한다.

종료조건:

- legacy contract test 결과가 변경되지 않는다.
- V2에서 UI controller 없이 같은 서비스를 호출할 수 있다.

### P2. 분석·퍼스널 컬러 자동 연결

- 사진 task pipeline에 컬러 분석을 병렬 또는 후속 task로 등록한다.
- `PersonalColorEvidenceV2` 저장과 자동 로딩을 연결한다.
- 동의·실패·legacy reuse 상태를 구분한다.

### P3. 헤어 선택·Brief 연결

- 최종 선택 확정 event가 Brief task를 생성한다.
- 공용 Brief 엔진 결과를 `SalonBriefV2`로 version 저장한다.
- Brief와 Fashion을 병렬 개방한다.

### P4. 실제 시술·Aftercare 연결

- actual service occurrence를 먼저 생성한다.
- Aftercare 엔진을 durable task로 실행한다.
- replay, 추가 프로그램 entitlement receipt, after photo 연결을 구현한다.

### P5. Fashion 서버 배치화

- 추천 9개 준비와 entitlement 검증을 서버로 이동한다.
- 방향 확정 후 별도 유료 확인 없이 9개 작업을 서버에서 dispatch한다.
- 동시성, partial result, slot retry, notification을 연결한다.

### P6. legacy/V2 양방향 adapter와 deprecation

- 정확한 legacy 결과만 lazy import한다.
- legacy route가 공용 서비스를 사용하도록 전환한다.
- 더 이상 엔진 소유자가 아닌 Wizard controller를 deprecated로 표시한다.
- V2 기본 경로에서 legacy UI import가 없음을 검증한다.

### P7. 종합 검증과 단계 출시

- feature flag별 shadow read와 결과 비교를 수행한다.
- internal account → canary → 확대 순서로 활성화한다.
- 오류율, latency, 비용, fallback, 중복 과금을 관측한다.
- 검증은 모든 구현이 끝난 마지막 단계에서 한 번 종합 수행한다.

## 11. Feature flag와 롤백

권장 flag:

- `PERSONAL_COLOR_CAPABILITY_V2_ENABLED`
- `SALON_BRIEF_ENGINE_V2_ENABLED`
- `AFTERCARE_ENGINE_V2_ENABLED`
- `FASHION_BATCH_ORCHESTRATOR_V2_ENABLED`
- 기존 blueprint·preview V2 flag는 재사용

롤백 원칙:

- flag를 끄면 신규 task 접수만 중단한다.
- 이미 실행 중인 생성 작업은 완료 또는 정책에 따른 소비 복구를 수행한다.
- V2 evidence, selection, Brief, Aftercare, Fashion row를 삭제하지 않는다.
- legacy 결과와 Storage asset을 삭제하지 않는다.
- 이중 쓰기 실패는 event와 reconciliation 대상에 남긴다.
- rollback 후 UI는 저장된 완료 결과를 계속 읽을 수 있어야 한다.

## 12. 검증 계획

Docker는 요구하지 않는다. 검증은 로컬 정적·계약·브라우저 검증과 승인된 원격 smoke를 분리한다.

2026-08-10 문서 정규화 기준선은 shared `75/75`, consulting `26/26`, HairFit V2 `15/15`, global CSS contract `9/9`, migration mirror `83/83`, blueprint `182`다. 이는 리사이클링 구현 완료 증거가 아니라 착수 전 회귀 기준선이다. 브라우저 14-case와 production build는 직전 전체 기록이며 이번 문서 갱신에서는 재실행하지 않았다.

### 12.1 정적·단위 검증

- TypeScript typecheck
- ESLint
- engine normalization·fallback unit test
- legacy/V2 golden fixture parity
- prompt·provider 비노출 test
- migration mirror와 additive SQL 검사

### 12.2 통합 검증

- 동일 멱등 키 replay 시 row·비용 중복 없음
- provider timeout 후 허용 횟수만 재시도
- partial 성공 보존
- legacy reuse 시 신규 provider 호출·과금 없음
- source fingerprint 변경 시 재사용 차단
- 실제 시술이 없으면 Aftercare 생성 차단

### 12.3 브라우저 검증

- 구 Wizard navigation이 V2에 나타나지 않는다.
- 사진 선택 후 분석 결과까지 불필요한 수동 클릭이 없다.
- 완료 후 별도의 공통 Next가 없다.
- waiting 중 나가기와 재진입이 가능하다.
- Brief 자동 초안과 Fashion 병렬 개방이 보인다.
- Fashion 방향 확정 후 브라우저가 9개 생성 loop를 실행하지 않는다.
- 부분 결과가 우측 AI output에 즉시 표시된다.
- 모바일에서 User input이 AI output보다 먼저 나타난다.

### 12.4 승인된 실환경 검증

- 실제 Clerk 인증
- 실제 private photo upload
- 실제 분석·퍼스널 컬러 provider
- entitlement·usage receipt와 중복 소비 방지
- 실제 헤어·패션 생성과 retry
- 원격 migration·RLS·Storage 정책
- notification과 재진입 복구

로컬 mock, 정적 contract, 비활성 인증 결과를 실환경 성공으로 간주하지 않는다.

## 13. 완료 조건

- [ ] 구 Wizard UI와 step controller를 V2에서 import하지 않는다.
- [ ] 여섯 Capability가 공용 서비스 경계를 가진다.
- [ ] legacy route와 V2 route가 같은 엔진 구현을 호출한다.
- [ ] V2 snapshot과 evidence가 authoritative source다.
- [ ] 퍼스널 컬러와 Brief는 조건 충족 후 자동 실행된다.
- [ ] Aftercare는 실제 시술 occurrence 이후에만 실행된다.
- [ ] Fashion은 서버가 9개 작업을 durable batch로 실행한다.
- [ ] 사용자가 나가도 서버 작업이 계속되고 재진입 시 복구된다.
- [ ] 모든 작업에 멱등 키, 입력·출력 fingerprint, engine version이 있다.
- [ ] legacy 결과 재사용 시 신규 과금이 없다.
- [ ] prompt, provider 원문, 원본 얼굴 사진이 고객 공유 결과에 노출되지 않는다.
- [ ] partial failure가 완료 결과를 폐기하지 않는다.
- [ ] feature flag rollback이 데이터 삭제 없이 동작한다.
- [ ] 기존 공개 CSS 토큰·표면과 11개 Scene 구조가 유지되고 새 스타일은 V2 scoped namespace로 제한된다.
- [ ] 재사용한 메인 엔진마다 source SHA, 파일 manifest, 입력·출력 hash와 충돌 해소 기록이 남는다.
- [ ] 정적·계약·브라우저·승인된 실환경 검증 결과가 각각 구분되어 기록된다.

## 14. 구현 골로 전환할 때 사용할 종료문

```text
구 마법사의 UI와 단계 제어를 재사용하지 않고 헤어 블루프린트, 헤어 프리뷰 생성, 퍼스널 컬러, Salon Brief, Aftercare, Fashion 엔진을 공용 Capability Service로 분리하여 HairFit V2 AI 컨설턴트 lifecycle에 연결한다. V2 server snapshot과 versioned evidence를 authoritative source로 사용하고, 장시간 작업은 durable task와 outbox로 실행하여 사용자가 중간에 나가도 계속 처리하고 재진입 시 복구한다. 동일 입력은 멱등하게 replay하며 provenance가 완전한 legacy 완료 결과만 lazy reuse하고 추가 과금하지 않는다. 재사용한 메인 엔진은 source SHA·파일 manifest·hash를 고정한다. 기존 공개 CSS 토큰·표면과 11개 Scene 구조를 유지하고 새 스타일은 V2 scoped namespace로 제한하며 Wizard, currentStep, 공통 Next, 브라우저 다중 생성 loop를 도입하지 않는다. 모든 구현을 완료한 뒤 마지막에 typecheck, lint, unit/contract, migration mirror, 11-Scene browser regression과 승인된 실환경 smoke를 수행하며 모든 완료 조건이 충족될 때만 골을 종료한다.
```
