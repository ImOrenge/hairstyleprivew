# HairFit V2 lifecycle workspace 완수 골

- 기준일: 2026-08-09
- 구현 브랜치: `feat/2026-08-08-hairfit-v2-backend`
- 통합 대상: `develop/2026-08-08-hairfit-v2-backend`
- 화면 권위: `HairFit_Interactive_Consulting_Frontend_Design_Plan_v1.0.docx`
- 제품 정의: 헤어스타일 이미지 생성기가 아니라, 사용자 조건과 사진 근거에서 결정·시술·관리·패션까지 이어지는 AI 컨설턴트 서비스
- 시각 경계: 기존 공개 클래스·`--app-*` 토큰·타이포그래피·간격·표면 스타일은 유지한다. 입력 구분선과 전환 화면은 `.f-consulting-*`, `.f-consultant-*` 범위의 scoped CSS만 추가하며 전역 reset·토큰 교체·무관 화면 재설계는 금지한다.

## 목표

문서의 11개 Scene URL은 유지하되 순번 완료를 강제하는 마법사 상태를 제거한다. 서버가 `lifecycleState`, `recommendedStage`, `allowedStages`, `completedStages`, `activeTasks`, `blockingActions`를 계산하고, 화면은 현재 가능한 작업과 복구 행동을 표시한다. 사용자 확인은 전략 확정, 최종 방향, 최종 선택처럼 디자인 의사결정에만 남기며 유료 생성 여부를 묻는 별도 확인은 제외한다.

## 구현 계약

| 영역 | 완수 계약 | 구현 위치 |
|---|---|---|
| 여정 | 순번이 아닌 lifecycle capability로 직접 URL 접근과 추천 작업을 결정 | `packages/shared/src/consulting/journey.ts` |
| 공통 이동 | 저장 뒤 별도 Next 제거, 저장 결과의 추천 작업으로 직접 이동 | `useConsultationMutation.ts`, `FloatingStageControls.tsx` |
| 사진 | 선택 즉시 시스템 사전검사→private upload→분석 작업 접수 | `PhotoWorkbench.tsx` |
| 분석 | durable run이 preflight→landmarks→AI→persistence를 기록하고 Scan이 자동 polling | `photo-analysis-server.ts`, `photo-analysis/route.ts`, `ScanWorkbench.tsx` |
| 근거 | signed URL과 저장 landmark를 진입 즉시 로드하고 만료 시 자동 재발급 | `ConsultationPhotoEvidence.tsx` |
| 비교·결정 | 후보마다 얼굴 균형, 볼륨, 현재 모발 차이, 시술, 손상, 관리 시간, 방문 주기, 제약의 8축을 표시하고 결정값은 원본 입력에서 파생 | `decision-derivation.ts`, `CompareWorkbench.tsx`, `DecisionWorkbench.tsx` |
| 브리프 | 최종 스타일 확정과 함께 서버 브리프 자동 생성, 이후 사용자는 버전 편집·공유만 수행 | `DecisionWorkbench.tsx`, `BriefWorkbench.tsx` |
| 병렬 출력 | 선택 확정 직후 Salon Brief와 Fashion을 함께 개방 | `journey.ts` |
| Aftercare | 상담 순서에서 제거하고 실제 시술 종류·날짜 기록 후에만 개방 | `BriefWorkbench.tsx`, `AftercareWorkbench.tsx` |
| Fashion | 방향 입력 1회, entitlement 자동 확인, 9개 추천·batch 자동 접수와 partial 상태 보존 | `FashionBatchWorkbench.tsx`, `fashion-batch-server.ts` |
| 데이터 패널 | 우측에 lifecycle, 추천 작업, 접근 가능 화면, active task, blocker, 분석·생성·선택 상태 표시 | `shared.tsx` |
| 캔버스 | 좌측 User input, 우측 AI output/system data를 데스크톱 독립 스크롤로 유지 | `shared.tsx`, `ConsultationScene.tsx` |
| 타이틀 | 11 Scene identity는 유지하되 데스크톱 제목 높이를 압축해 본문 가시 영역 확보 | `SceneIdentity.tsx` |

## 데이터와 마이그레이션

`20260809111554_consultation_lifecycle_tasks.sql`은 기존 테이블을 파괴하지 않는 additive migration이다.

- `consultation_analysis_runs_v2`: 사진별 durable 분석 상태, pipeline, 시도 횟수, 오류와 완료 시각
- `fashion_preview_batches_v2`: 선택 snapshot별 9개 세션, entitlement snapshot, 방향 확정·부분 완료·실패·최종 상태
- 두 테이블 모두 사용자·상담 cascade, service-role 전용 권한, RLS enabled/forced를 사용한다.
- root와 `my-app` migration mirror는 byte-for-byte 일치해야 한다.
- 원격 적용은 이 구현 골에 포함하지 않으며 별도 승인 뒤 `CONSULTATION_ASYNC_ANALYSIS_V2_ENABLED`, `FASHION_BATCH_V2_ENABLED`을 활성화한다.

## 기능 플래그와 롤백

- `NEXT_PUBLIC_CONSULTATION_FRONTEND_V2=false`: 기존 workspace로 전체 화면 롤백
- `CONSULTATION_LIFECYCLE_NAV_V2_ENABLED=false`: 새 lifecycle workspace 진입 차단
- `CONSULTATION_ASYNC_ANALYSIS_V2_ENABLED=false`: 기존 동기 분석 응답 경로 사용
- `FASHION_BATCH_V2_ENABLED=false`: 패션 배치 API 비활성
- 롤백은 상담 snapshot, 분석 근거, 생성 결과와 선택 이력을 삭제하지 않는다.

## 수용 조건과 괴리율

기능 괴리율은 프론트 요구서의 55개 수용조건을 `충족 1 / 부분 0.5 / 미충족 0`으로 다시 채점한다. 능동형 UX 괴리율은 아래 11개 행동 계약을 동일 방식으로 채점한다.

1. 저장 뒤 별도 Next가 없다.
2. 미래 순번이 아니라 lifecycle capability로 화면이 열린다.
3. 사진 선택 뒤 분석 결과까지 불필요한 클릭이 없다.
4. signed URL 만료를 자동 복구한다.
5. Scan/Analysis에서 완료 승인을 반복하지 않는다.
6. Compare가 8개 비교축을 표시한다.
7. Decision이 기존 입력과 AI 근거에서 실행 조건을 파생한다.
8. 최종 선택 뒤 Brief와 Fashion이 병렬 개방된다.
9. Aftercare는 실제 시술 뒤에만 열린다.
10. Fashion 9개는 슬롯별 수동 요청이 아니라 한 배치로 준비·승인된다.
11. 좌우 pane과 우측 시스템 데이터가 실제 진행 상태를 충분히 표시한다.

종료 기준은 기능 괴리율 10% 이하, 능동형 UX 괴리율 15% 이하이다. 정적 계약과 브라우저 검증을 모두 반영하되 실제 인증·라이브 AI·entitlement 기반 실제 생성은 별도 운영 승인 없이 실행하지 않고 미실행 위험으로 기록한다. 유료 생성 여부 확인은 사용자 흐름과 종료조건에서 제외한다.

## 최종 검증 게이트

모든 구현과 문서 수정 이후 한 번만 종합 검증한다.

- [x] shared/web typecheck
- [x] 상담·HairFit V2 계약 테스트
- [x] migration mirror와 additive SQL·권한 정적 검증 (Docker fresh-chain 제외)
- [x] 기존 시각 토큰 유지, V2 scoped CSS와 component passport 계약
- [x] production build
- [x] 인증을 우회하지 않는 로컬 browser smoke: 직접 URL, stage map, 독립 scroll, 모바일 overflow, common Next 부재
- [x] 실제 인증·AI·결제·원격 DB 미실행 범위 명시
- [x] 기능/UX 괴리율 재산정과 종료 기준 판정

## 최종 판정

로컬 구현 종료조건은 충족했다.

- 요구서 수용조건 재채점: `53 / 55`, 기능 괴리율 `3.6%`
  - 남은 부분 항목은 Photo의 복수 보조사진/crop 편집과 Brief의 디자이너 비동기 feedback이다. 핵심 자동 분석·결정·출력 lifecycle을 막지 않는다.
- 능동형 UX 행동 계약: `11 / 11`, 로컬 정적·harness 괴리율 `0%`
- 2026-08-10 재검증: shared `75 / 75`, 상담 계약 `26 / 26`, HairFit V2 계약 `15 / 15`
- global CSS 계약 `9 / 9`; component registry의 마지막 기록값은 `51 / 51`
- Next production 및 E2E-harness build 각각 130 route 통과
- Chromium 상담 harness의 마지막 전체 기록은 `14 / 14`: 11 Scene 직접 주소, lifecycle stage map, 독립 scroll, 모바일 overflow/a11y, 부분 결과 비교, 자동 evidence/landmark, 대기·이탈·피젯·9개 Fashion 배치 흐름 통과. 2026-08-10 문서 정규화에서는 브라우저 suite를 재실행하지 않았다.
- migration mirror `83 / 83`, 신규 두 테이블 RLS forced/service-role-only 정적 계약 통과
- `globals.css`에는 입력 구분선과 전환 canvas를 위한 scoped 규칙 470줄이 추가되어 있으므로 CSS/SCSS diff `0` 주장은 폐기한다. 기존 토큰·표면 계약은 global CSS contract `9 / 9`로 확인했고 `git diff --check -- docs`는 통과했다.

이전 보완 작업에서 Clerk 기반 업로드·분석 smoke와 원격 migration `202608090001`~`004` 적용 증거는 확보했다. 다만 현재 lifecycle/liveness 변경 이후 동일 실인증을 재실행하지 않았고, lifecycle migration `20260809111554`, 실제 크레딧 예약/환불, 새 feature flag 활성화와 배포도 수행하지 않았다. 원격 활성화 전에는 `20260809111554`를 먼저 적용하고 새 세 플래그를 순서대로 활성화해야 한다.

## 재사용 가능한 골 프롬프트

```text
새 개발 브랜치에서 HairFit V2 프론트엔드와 백엔드를 하나의 비마법사형 AI 컨설턴트 lifecycle workspace로 완성한다. HairFit_Interactive_Consulting_Frontend_Design_Plan_v1.0.docx의 11개 Scene URL과 화면 역할, 기존 공개 CSS 토큰·타이포그래피·표면 스타일은 유지한다. 필요한 입력 구분선과 전환 화면 스타일은 V2 전용 scoped namespace에만 추가한다.

currentStage 순번 잠금 대신 서버 소유 recommendedStage, allowedStages, completedStages, activeTasks, blockingActions를 구현한다. 공통 Next와 저장→Next 이중 동작을 제거하고 저장 성공 CTA가 직접 추천 작업으로 이동하게 한다. 사진을 고르면 시스템 사전검사, private upload, durable FaceMesh/AI 분석, evidence 저장, signed URL/landmark 표시와 Analysis 이동이 자동으로 이어져야 한다. Scan·Analysis 승인 반복을 제거한다.

Compare는 문서의 8개 축을 표시하고 Decision 실행 조건은 사용자 입력·AI 근거·확정 전략에서 파생한다. 최종 스타일 확정 시 Salon Brief를 자동 생성하고 Brief와 Fashion을 병렬로 연다. Aftercare는 실제 시술 종류와 날짜가 기록된 뒤에만 연다. Fashion은 방향 1회 입력, entitlement 자동 확인, DAILY 3 + WORK 3 + STATEMENT 3의 9개 자동 접수와 partial retry 상태 보존으로 구현한다. 유료 생성 확인 CTA는 두지 않는다.

데스크톱 캔버스는 좌측 사용자 input과 우측 AI output/system data를 독립 스크롤로 유지하고, 우측에 lifecycle, 추천 작업, blocker, 분석 pipeline, 생성 완료도, 비교 근거, 선택·브리프·시술·패션 상태를 표시한다. additive migration과 개별 rollback flag를 제공한다. 원격 migration, 실결제, push, merge, deploy는 별도 승인 없이 수행하지 않는다.

검증은 모든 수정이 끝난 마지막에만 실행한다. 기능 요구서 괴리율 10% 이하, 능동형 AI UX 괴리율 15% 이하, 기존 토큰·표면 회귀 0, V2 scoped CSS 계약 통과, 타입·계약·migration mirror와 additive SQL 권한 정적 검사·production build·브라우저 smoke 통과를 종료조건으로 삼는다. Docker fresh-chain은 요구하지 않는다. 실제 인증·라이브 AI·결제·실기기·원격 적용처럼 실행하지 않은 증거를 통과로 위장하지 않는다. 모든 종료조건을 만족한 경우에만 골을 완료한다.
```
