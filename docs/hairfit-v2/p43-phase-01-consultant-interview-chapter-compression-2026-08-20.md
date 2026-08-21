# P43 Phase 01 — 컨설턴트형 인터뷰와 4챕터 여정 압축

> 2026-08-20 후속 결정: P43의 초기 3개 필수 결정은 [P54 Zero-input Intake](./p54-zero-input-intake-adaptive-followup-2026-08-20.md)가 대체한다. P43의 4챕터·내부 stage·중단/재개 계약은 유지하지만 신규 기본 여정의 사진 전 필수 질문은 0개다. 입력과 결과가 필요한 도메인은 같은 챕터 안에서도 `input → waiting → result → revision` 독립 surface로 분리하며 editable input과 상세 output을 한 canvas에 섞지 않는다.

- 기준일: 2026-08-20
- 선행 문서: P41 컨설턴트형 인터뷰·챕터 압축·모질 분석 아키텍처
- 후속 페이즈: P44 적응형 AI 진단·모질 분석, P45 메이크업 스타일 시뮬레이션
- 변경 성격: 표시 계층·인터뷰 계약의 additive 전환
- 비목표: 기존 15개 내부 stage 삭제, 전역 CSS 스타일 변경, 분석 provider 교체, Aftercare를 상담 안으로 복귀

## 1. 목표

고객에게 노출되는 15개 stage를 네 개의 상담 챕터로 압축하고, 초기 Discovery 장문 설문을 30초 이내의 상담 목표 설정으로 교체한다. 내부 stage, durable task, blocking action, deep link는 그대로 유지해 중단·재개와 재시도 정밀도를 잃지 않는다.

완료 시 고객이 인식하는 여정은 다음 네 챕터다.

1. 상담 준비
2. AI 진단
3. 스타일 디자인
4. 최종 리포트

Aftercare는 실제 시술 기록 이후 열리는 별도 프로그램이며 챕터 진행률에 포함하지 않는다.

## 2. 현재 문제

- `CONSULTATION_STAGE_SLUGS` 15개가 고객 전역 내비게이션에 그대로 노출된다.
- 시스템 작업인 Scan, Brief compilation, Result compilation도 고객이 직접 통과해야 하는 단계처럼 보인다.
- Discovery readiness가 현재 모발 텍스트와 시술 필드에 의존해 사진 분석 전 입력 부담이 크다.
- 저장 CTA와 Next CTA가 분리되면 완료 후 한 번 더 눌러야 한다.
- `currentStage`가 고객 위치, 서버 권장 작업, 진행 중 task를 동시에 표현하려 한다.

## 3. 범위

### 포함

- stage→chapter presentation adapter
- 축소된 `ConsultationIntentV2`
- 저장 프로필 prefill과 provenance
- semantic CTA와 `recommendedTask`
- 챕터 내 domain tab과 완료 작업 표시
- 나가기·재개·deep link 호환
- Web/Native 동일 chapter 계약

### 제외

- 얼굴·모질·퍼스널 컬러 분석 로직
- 메이크업 이미지 생성
- 기존 DB stage 값의 대규모 backfill
- 상담 완료 전 실제 시술·Aftercare 활성화

## 4. 내부 상태 계약

### 4.1 서버 권위 상태와 표시 상태 분리

서버 권위 `ConsultationJourney`는 유지한다.

```ts
interface ConsultationJourney {
  recommendedStage: ConsultationStage;
  allowedStages: ConsultationStage[];
  completedStages: ConsultationStage[];
  stageStatus: Record<ConsultationStage, ConsultationStageStatus>;
  activeTasks: ConsultationActiveTask[];
  blockingActions: ConsultationBlockingAction[];
}
```

고객 표시를 위해 다음 파생 계약을 추가한다.

```ts
export type ConsultationChapter =
  | "intake"
  | "diagnosis"
  | "design"
  | "report";

export type ConsultationChapterStatus =
  | "locked"
  | "available"
  | "active"
  | "waiting"
  | "attention"
  | "complete";

export interface RecommendedConsultationTaskV2 {
  stage: ConsultationStage;
  kind: ConsultationTaskKind | "user-decision";
  domain: "intake" | "hair" | "color" | "makeup" | "fashion" | "report";
  label: string;
  href: string;
  reasonCode: string;
}

export interface ConsultationChapterPresentationV2 {
  schemaVersion: "consultation-chapter-presentation-v2";
  activeChapter: ConsultationChapter;
  recommendedTask: RecommendedConsultationTaskV2;
  chapters: Array<{
    id: ConsultationChapter;
    status: ConsultationChapterStatus;
    completedTaskCount: number;
    totalTaskCount: number;
    availableDomains: Array<"hair" | "color" | "makeup" | "fashion">;
  }>;
  visibleBlockingAction: ConsultationBlockingAction | null;
  resumableHref: string;
}
```

`ConsultationChapterPresentationV2`는 snapshot에서 매번 파생한다. 별도 chapter cursor, 질문 번호, 완료 퍼센트를 DB에 저장하지 않는다.

### 4.2 stage→chapter 매핑

| chapter | 내부 stage |
|---|---|
| intake | discovery, photo |
| diagnosis | scan, analysis, personal-color |
| design | direction, previews, compare, decision, color-studio, salon-brief, makeup, fashion |
| report | result |
| 외부 프로그램 | aftercare |

`salon-brief`는 디자인 챕터의 백그라운드 산출물이다. 내부 stage와 버전은 유지하지만 전역 챕터 버튼으로 노출하지 않는다.

### 4.3 챕터 상태 파생 규칙

```text
complete  = chapter에 속한 적용 대상 사용자 결정이 모두 완료
attention = 실패 또는 사용자 복구 행동이 필요
waiting   = 현재 chapter에 running/waiting task가 있음
active    = 현재 route 또는 recommended task가 chapter에 속함
available = 선행 조건을 만족하고 진입 가능
locked    = 선행 조건 미충족
```

우선순위는 `attention > waiting > active > complete > available > locked`다. 완료된 챕터 안에서 background refresh가 실행되는 경우 고객 상태는 `complete`를 유지하고 task badge만 표시한다.

### 4.4 상담 목표 상태

```ts
export interface ConsultationIntentV2 {
  schemaVersion: "consultation-intent-v2";
  scope: "hair" | "hair_color" | "total_styling";
  changeLevel: "maintain" | "natural_change" | "clear_change";
  exclusions: string[];
  exclusionsConfirmed: boolean;
  styleTarget: "male" | "female" | "neutral";
  sourceProfileId: string | null;
  interviewRevision: number;
  confirmedAt: string | null;
}

export type ConsultantIntakeState =
  | "hydrating-profile"
  | "intent-required"
  | "intent-saving"
  | "intent-ready"
  | "photo-required"
  | "photo-validating"
  | "analysis-starting"
  | "complete"
  | "attention";
```

`ConsultantIntakeState` 역시 저장 cursor가 아니라 다음 사실에서 파생한다.

- profile hydrate 완료 여부
- intent revision과 `confirmedAt`
- photo draft 상태와 preflight 결과
- analysis task 접수 여부
- 저장 또는 업로드 오류

### 4.5 readiness 변경

새 `discoveryReady`:

```text
intent.scope 존재
AND intent.changeLevel 존재
AND intent.exclusionsConfirmed = true
AND intent.confirmedAt 존재
```

다음 필드는 비어 있어도 사진 제출을 막지 않는다.

- currentHair 자유 텍스트
- hairDensity, strandThickness, hairTexture
- damageLevel, treatmentHistory
- allowedServices 상세

이 항목은 저장 프로필, P44 AI 관찰, 점진형 질문 또는 Hair/Color 설계에서 채운다.

## 5. 상태 전이

| 현재 상태 | 이벤트 | 조건 | 다음 상태 | 부작용 |
|---|---|---|---|---|
| hydrating-profile | PROFILE_READY | 성공 | intent-required 또는 intent-ready | saved profile prefill |
| intent-required | INTENT_OPTION_SELECTED | valid option | intent-saving | optimistic revision |
| intent-saving | INTENT_SAVED | revision 일치 | intent-required 또는 intent-ready | coverage 갱신 |
| intent-saving | VERSION_CONFLICT | 최신 draft 존재 | intent-required | 최신 값 merge·재선택 안내 |
| intent-ready | PHOTO_NEEDED | photo 없음 | photo-required | photo pane 활성화 |
| photo-required | PHOTO_SUBMITTED | 소유권·형식 통과 | photo-validating | private upload 연결 |
| photo-validating | PREFLIGHT_RETRY_REQUIRED | blocking diagnostic | attention | 재촬영 CTA |
| photo-validating | PREFLIGHT_PASSED | pass 또는 warning | analysis-starting | analysis idempotent 접수 |
| analysis-starting | ANALYSIS_ACCEPTED | task ID 존재 | complete | diagnosis recommended task 생성 |
| attention | RECOVERY_COMPLETED | blocking 해소 | 이전 파생 상태 | 실패 task만 재처리 |

저장 성공과 다음 화면 이동은 동일 사용자 행동의 결과다. 저장 후 별도의 전역 Next를 활성화하지 않는다.

## 6. 라우팅과 CTA

### 6.1 라우팅

- 기존 `/consulting/:sessionId/:stage`는 유지한다.
- chapter route를 새 권위 저장값으로 만들지 않는다.
- 챕터 버튼은 해당 챕터의 `recommendedTask.href`로 이동한다.
- 구 deep link 진입 시 presentation adapter가 올바른 chapter를 표시한다.
- 잠긴 stage deep link는 정확한 복구 stage와 semantic CTA를 제공한다.

### 6.2 CTA 문구

| 금지 | 사용 |
|---|---|
| Next | 사진 제출하고 분석 시작 |
| 다음 단계 | 추천 방향 확인 |
| 완료 후 이동 | 헤어 스타일 확정 |
| Continue | 메이크업 추천 검토 |

CTA는 navigation이 아니라 사용자가 수행하는 실제 결정이나 작업을 이름으로 표시한다.

## 7. 화면 구조

### 상담 준비

- 단독 집중 레이아웃
- 상담 범위, 변화 정도, 금지 조건
- 저장 프로필 출처와 수정 가능 여부
- intent 완료 후 사진 제출 화면 자동 전환
- 상담 나가기와 재개

### AI 진단

- waiting surface: system task와 partial readiness
- result surface 좌측: 분석 사진
- result surface 우측: 얼굴·모질 분석, 품질·근거와 system state
- 필요한 추가 질문은 별도 clarification surface에서 표시
- 전체 stage 목록 대신 네 챕터 상태

### 스타일 디자인

- Hair / Color / Makeup / Fashion domain tab
- 각 탭은 준비됨·진행 중·확정됨 상태
- Brief는 Hair·Color 결정에서 자동 갱신되는 산출물

### 최종 리포트

- 기존 세로형 명세·탭 리포트 유지
- 작업 controls와 분할 workbench를 제거한 읽기 중심 레이아웃

## 8. API와 저장

### API

- `GET /api/consultations/:id/intent`
- `PATCH /api/consultations/:id/intent` — `expectedRevision`, topic answer
- `POST /api/consultations/:id/intent/confirm`
- 기존 consultation GET 응답에 `chapterPresentation` 추가

신규 UI는 legacy 전체 Discovery form route를 호출하지 않는다. 기능 플래그 OFF와 구 클라이언트를 위해 기존 route는 유지한다.

### 저장

가능하면 기존 `consultation_interview_drafts_v2`의 `interview_kind=discovery`와 확정 snapshot을 재사용한다. 별도 테이블이 필요하면 additive migration으로 만들고 다음을 지킨다.

- public schema RLS 활성화와 현재 Clerk 소유권 adapter 유지
- 브라우저 direct table write 금지
- service role 또는 secret key client 노출 금지
- UPDATE 경로의 SELECT policy와 권한 검증
- Data API 직접 노출이 불필요하면 anon/authenticated grant 회수

실제 migration 파일은 구현 시 `supabase migration new`로 생성한다. 문서에서 timestamp 파일명을 선결정하지 않는다.

## 9. 호환성과 플래그

- `CONSULTATION_CHAPTER_NAV_ENABLED`
- `CONSULTATION_PROGRESSIVE_INTERVIEW_ENABLED`

| 플래그 | OFF | ON |
|---|---|---|
| chapter nav | 기존 stage map | 네 챕터 presentation |
| progressive interview | 기존 Discovery 인터뷰/form | 초기 3개 결정과 점진형 질문 |

기존 snapshot은 adapter가 purpose/goals/allowedServices를 intent로 읽기 projection한다. 값이 불분명하면 추론하지 않고 intent confirmation을 요청한다.

## 10. 구현 순서

1. chapter·intent 공유 타입과 validator
2. 기존 fixture 기반 stage→chapter 파생 테스트
3. consultation read 응답에 presentation 추가
4. SceneIdentity, FloatingStageControls, StageMapOverlay 교체
5. 초기 목표 설정 UI와 API 연결
6. semantic CTA와 resume href
7. Native parity
8. component registry·passport 갱신
9. 기능 플래그 OFF/ON 회귀

## 11. 테스트

### 계약

- 15 stage가 정확히 네 챕터와 Aftercare 외부 프로그램에 매핑
- recommendedStage 변화에 따른 recommendedTask 파생
- chapter cursor·question index 영속화 금지
- scope별 적용 대상 domain과 not_applicable 처리

### 브라우저

- 신규 상담에서 필수 결정 3개 이하로 사진 제출 도달
- 저장 성공 후 별도 Next 클릭 없음
- 전역 `01 / 15`, `ALL STAGES` 부재
- deep link, 잠금 복구, 나가기·재개
- 390/768/desktop overflow와 독립 스크롤
- keyboard, focus, aria-live, reduced motion

### 회귀

- 기존 stage guard와 durable task
- Photo 자동 분석 접수
- Makeup/Fashion 단독 인터뷰
- Result와 Aftercare 활성화 경계
- 기능 플래그 OFF legacy 화면

## 12. 종료 기준

- [ ] 고객 전역 내비게이션에는 네 챕터만 표시된다.
- [ ] 내부 15 stage와 deep link는 유지된다.
- [ ] 초기 필수 결정은 3개 이하이고 모발 텍스트가 사진 제출 장벽이 아니다.
- [ ] 저장 후 별도 Next가 없다.
- [ ] 챕터 상태는 서버 snapshot에서 파생되며 별도 wizard cursor가 없다.
- [ ] 재접속은 chapter 첫 화면이 아니라 recommended task로 복귀한다.
- [ ] Brief는 전역 stage가 아니라 자동 산출물로 표시된다.
- [ ] Aftercare는 실제 시술 이후 별도 프로그램으로 남는다.
- [ ] Web/Native와 기능 플래그 OFF 회귀가 통과한다.

## 13. 롤백

1. `CONSULTATION_PROGRESSIVE_INTERVIEW_ENABLED=false`로 기존 Discovery 복귀
2. `CONSULTATION_CHAPTER_NAV_ENABLED=false`로 기존 stage map 복귀
3. additive intent data는 삭제하지 않고 read adapter에서 무시

롤백은 저장된 상담, stage 완료 기록, task, 결과 산출물을 삭제하지 않는다.

## 14. 증거 경계

정적 계약·fixture·브라우저 smoke는 실제 사용자의 인지 부담 감소, 상담 완료율 향상, 인증 세션 재개, 원격 migration 또는 production 배포를 증명하지 않는다. canary에서 시작→사진 제출 시간, 이탈률, 질문 수, resume 성공률을 별도로 측정한다.

## 15. 2026-08-20 로컬 종료 판정

판정: **PASS — 구현·로컬 검증 완료**

- shared presentation/intent 계약과 Web·Native 표시를 네 챕터로 연결했다. 내부 15 stage와 deep link는 유지한다.
- Discovery는 `scope/change/exclusions` 세 결정만 받고 현재 모발 텍스트 입력을 제거했다. 저장 후 공통 Next 없이 Photo로 연결한다.
- 브라우저 harness에서 `01 / 04`, 초기 `0/3`, 세 주제, 현재 모발 입력 없음, 390px 무가로오버플로를 확인했다.
- shared 136/136, consulting 112/112, Native 178/178, component registry 61/61, Web/Shared/API/Native typecheck가 통과했다.
- 실인증 resume, canary 행동지표, production 배포는 이 판정에 포함하지 않는다.
