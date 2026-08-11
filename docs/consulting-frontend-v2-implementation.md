# HairFit AI Consultant frontend v2 implementation

> 2026-08-11 통합 완수 골: 구 엔진 6개 capability 재활용과 Discovery·Fashion 인터뷰 개선을 포함한 전체 P0~P17 실행 순서와 최종 종료조건은 [HairFit V2 엔진 리사이클링·인터뷰 경험 통합 완수 골](hairfit-v2-engine-recycling-interview-completion-goal-2026-08-11.md)이 최종 권위다.

> 생동감 개선 후속 계획: 비동기 작업을 접수하면 11개 정식 Scene 사이의 full-canvas 전환 대기 화면에 머물고, 실제 서버 readiness가 충족되면 자동으로 목적 Scene으로 이동한다. 대기 화면의 activity rail, 짧은 스몰토크 캐러셀, task별 kinetic animation, 결과에 영향을 주지 않는 선택형 피젯, 부분 결과 공개와 completion moment 계약은 [HairFit V2 AI 컨설팅 생동감 개선 계획](hairfit-v2-consulting-liveness-improvement-plan-2026-08-09.md)이 권위다. 이 전환 화면은 정식 단계나 추가 승인 CTA가 아니다.

> 2026-08-09 lifecycle 보완: 11개 URL은 유지하지만 순차 완료 wizard 계약은 제거했다. `recommendedStage`, `allowedStages`, `activeTasks`, `blockingActions`가 내비게이션을 결정하며 공통 Next는 없다. 사진 분석은 durable server task로 자동 진행되고, 선택 뒤 Brief/Fashion은 병렬 개방되며 Aftercare는 실제 시술 뒤에만 열린다. Fashion은 방향 확정 뒤 서버 이용 권한을 자동 검증하고 별도 유료 생성 확인 없이 9개 배치를 접수한다. 최신 종료조건은 `hairfit-v2-lifecycle-workspace-completion-2026-08-09.md`가 권위다.

> 2026-08-11 인터뷰 입력 개선: Discovery와 Fashion 방향 설정은 각 Scene 내부의 단독 인터뷰 레이아웃으로 개선하되 `currentStep`, step lock, 질문별 공통 Next를 도입하지 않는다. 공용 InterviewShell, 적응형 질문·자동 저장·전체 summary·exit/resume, Fashion 방향 확인 후 entitlement 기반 자동 batch 계약은 [HairFit V2 상담 인터뷰형 입력 개선 계획](hairfit-v2-interview-experience-improvement-plan-2026-08-11.md)이 권위다. 유료 생성 여부를 묻는 별도 확인은 제외한다.

> 2026-08-10 문서 정규화: 화면 구조는 원본 DOCX, 여정·종료조건은 lifecycle 완수 골, 대기·전환 연출은 생동감 개선 계획, Discovery·Fashion 입력 표현은 인터뷰 개선 계획, 구 엔진 재사용은 리사이클링 계획이 각각 권위다. `hairfit-v2-frontend-backend-remediation-goal-2026-08-09.md`와 `hairfit-v2/backend-v2-implementation.md`의 과거 실행 수치는 당시 증거로만 읽고 최신 수치는 이 문서의 최종 검증 게이트를 따른다.

## Authority and boundary

This implementation follows `HairFit_Interactive_Consulting_Frontend_Design_Plan_v1.0.docx` as an independent frontend authority. It does not adopt or reconcile contracts from the backend refactor package. Existing generation, Result, Personal Color, Styler, and Aftercare surfaces remain compatibility bridges.

The visual contract is preserved rather than byte-identical: existing `--app-*` tokens, typography, spacing, radii, and shared UI surfaces remain unchanged, while input separators and the transient consultant canvas use scoped `.f-consulting-*` and `.f-consultant-*` additions in `my-app/app/globals.css`. No global reset, token replacement, or unrelated surface redesign is allowed.

## Product outcome

The product journey changes from a four-step image-generation wizard to a headerless AI decision service. The legacy wizard remains available only as the feature-flag rollback and generation bridge.

| # | Scene URL | Server snapshot responsibility |
|---|---|---|
| 01 | `/consulting/[sessionId]/discovery` | goals, current hair, services, maintenance, avoid conditions |
| 02 | `/consulting/[sessionId]/photo` | private draft upload, AI photo analysis, eight quality checks, use scope, retention |
| 03 | `/consulting/[sessionId]/scan` | evidence layers, excluded regions, confidence, manual correction |
| 04 | `/consulting/[sessionId]/analysis` | face analysis, personal color, Evidence -> Meaning -> Action ledger |
| 05 | `/consulting/[sessionId]/direction` | versioned eight-axis `StrategySnapshot` before generation |
| 06 | `/consulting/[sessionId]/previews` | BALANCE, IMAGE, LIFESTYLE 3x3 board and two-to-three shortlist |
| 07 | `/consulting/[sessionId]/compare` | same-crop finalist and optional backup comparison |
| 08 | `/consulting/[sessionId]/decision` | immutable, revisioned `SelectedStyleSnapshot` |
| 09 | `/consulting/[sessionId]/salon-brief` | versioned brief, customer/designer modes, expiring/revocable sanitized share |
| 10 | `/consulting/[sessionId]/aftercare` | actual multi-service record and Today/D+3/W+2/W+6/W+10 care program |
| 11 | `/consulting/[sessionId]/fashion` | direction, nine looks, shortlist/compare, selected look |

## State and consistency

- `consultation_sessions.snapshot` is the source of truth; component state is an unsaved form draft only.
- Every PATCH sends `expectedVersion` and `If-Match`; the database update also matches the previous version. A conflict returns HTTP 409 with the latest snapshot.
- Direct URLs authenticate ownership and apply server route guards. Refresh and mobile re-entry restore the server snapshot.
- Every Scene and transient waiting screen exposes `상담 나가기`. Confirmation sends the user to `/home`; persisted consultation data and server-owned AI tasks continue, while the dialog explicitly warns that unsaved form drafts on the current Scene may be discarded.
- Generated asset paths are retained separately from signed presentation URLs. Direct reads and the explicit refresh endpoint renew expired URLs.
- A strategy revision invalidates downstream preview, comparison, brief, care, and fashion state while preserving immutable selection history for audit.
- A new style selection appends a revision and never mutates the prior snapshot. Actual service confirmation locks further strategy/style changes.
- Public salon shares use a 256-bit opaque token, a SHA-256 database lookup hash, frozen sanitized payload, expiry, and revocation. Raw face photos and the full consultation snapshot are excluded.

## Photo, analysis, and generation workflow

- Scene 02 first runs a system photo preflight. File metadata, image decoding, resolution, browser face detection, and Canvas pixel signals populate the eight quality cards; the cards are not presented as AI output.
- After upload to the existing private generation draft Storage path, the authenticated `photo-analysis` route verifies ownership and reruns the system preflight with Sharp. A blocking resolution, exposure, sharpness, or face-detection result returns `422` without calling the AI model.
- Only a preflight-eligible portrait reaches the AI face and hair-strategy analysis. The route then persists versioned `analysis_evidence_v2` before the UI advances. It no longer asks the user to open the legacy wizard or paste a generation ID.
- Scenes 03~05 review the evidence and confirm the strategy. Image generation is not accepted before the strategy snapshot is confirmed.
- Scene 06 confirms the strategy, resolves the existing entitlement on the server, accepts the stored draft with the consultation ID without a second paid-generation confirmation, and polls the V2 preview board until exactly nine quality-accepted results are ready. If entitlement is unavailable, the existing product purchase route owns recovery and the consultation draft remains saved.
- Source Storage paths, service credentials, provider prompts, and rejected attempt internals are not returned to the browser. Source-photo display continues to use short-lived signed URLs.

## Compatibility and rollback

- `NEXT_PUBLIC_CONSULTATION_FRONTEND_V2=false`: `/workspace` and all existing paths behave as before; consulting routes redirect to the legacy workspace.
- Flag enabled: `/workspace` enters `/consulting/new`.
- `/workspace?legacy=1` remains available only as the feature-flag rollback entry. The V2 consulting photo scene does not navigate to it.
- Result/Aftercare and Styler routes remain unchanged and are linked from Scenes 10 and 11.
- Rollback is a feature-flag change only. It does not delete consultation snapshots or revoke existing privacy controls.

## Shared platform contract

`@hairfit/shared/consulting/contract` owns the DTOs used by web and Expo. `@hairfit/api-client` exposes create, latest/read, optimistic update, and asset-refresh methods so both platforms consume the same server source of truth.

## Final validation gate

Formal validation is intentionally deferred until implementation is complete. The single final gate must record all of the following before this document can claim completion:

- [x] lint and monorepo typecheck
- [x] consultation contract and directly affected regression contracts
- [x] component registry and Supabase migration mirror check (83 mirrored migrations)
- [x] production web build with the flag both OFF and ON
- [x] 11-stage browser harness at desktop, tablet, and small mobile widths
- [x] keyboard, dialog focus, reduced-motion, privacy-share expiry/revocation checks
- [x] direct URL, refresh, conflict, partial generation, signed URL refresh, and selection-lock evidence

The last recorded consultation browser suite passes 14/14, including the 11 addressable Scenes, left/right independent scrolling, input separators, consultation exit confirmation during normal and waiting states, transition focus, partial-result priority, failure/offline recovery, refresh/resume message continuity, 5-second optional fidget, reduced motion, completion handoff, landmark overlay, Fashion batch flow, horizontal overflow, focus trapping/return, Escape, and accessibility checks at 390px and 768px. The recorded transition performance harness also reports zero animation/fidget requests, zero layout shift, and zero animation-caused long tasks above 50ms during its 10-second observation window. The 2026-08-10 document normalization reran only the local contract gates below, not this browser suite.

The fresh-database Docker chain is intentionally outside this task. The root and `my-app` migration directories are byte-for-byte mirrored across 83 migrations and the mirror gate passes. No Docker service was used and no remote database was mutated for validation.

Implementation status: frontend lifecycle and liveness scope is locally implemented in the dirty working tree. Shared presentation DTOs, full-canvas transition UI, task-specific motion, optional result-neutral fidget, partial results, automatic handoff, recovery, privacy-safe browser events, component passport/registry, and backend phase integration are present. On 2026-08-10 the current tree passed shared `75/75`, consulting `26/26`, HairFit V2 `15/15`, global CSS contract `9/9`, migration mirror `83/83`, and the 182-blueprint audit. Earlier authenticated upload/analysis and migrations `202608090001`~`004` have separate historical evidence; the current liveness/recycling delta, lifecycle migration `20260809111554`, live AI/payment, canary, remote activation, and deployment remain unclaimed until rerun.
