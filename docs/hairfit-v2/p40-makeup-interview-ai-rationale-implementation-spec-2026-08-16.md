# P40 Makeup Interview and AI Rationale Implementation Specification

## Goal

Makeup은 새 여정 단계를 만들지 않고 같은 `makeup` 경로에서 `단독 인터뷰 → 추천 검토 → 방향 맵 → 확정`으로 파생된다. 숫자형 질문 인덱스와 별도 Next CTA는 저장하지 않는다. 사용자의 대표 모드는 AI가 임의 변경할 수 없고, 조정안은 명시적 결정 이후에만 캔버스 입력이 된다.

## Journey contract

1. `interview`: 필수 5개와 선택 2개 coverage를 저장한다. 단일 선택은 즉시 저장하고 복합 입력만 `답변 저장`을 사용한다.
2. `recommendation-preparing`: 결정론적 근거는 즉시 준비한다. 선택적 AI 설명 task는 비차단으로 실행한다.
3. `recommendation-review`: 사용자 선택과 AI 조정안을 나란히 보여준다. `accept_adjustment | keep_selection` 중 하나를 저장한다.
4. `direction-map`: 승인된 모드로 7개 모듈을 빌드한다. 캔버스와 각 모듈은 동일 rationale revision을 참조한다.
5. `confirmed`: 스냅샷을 불변으로 확정하고 같은 revision으로 루틴·아티스트 브리프·리포트를 만든다.

확정 전 답변 수정은 interview draft revision을 증가시키고 기존 확정 스냅샷을 변형하지 않는다. 중단 후 재개 시 최초 미완료 주제를 추천하되 모든 완료 답변을 다시 열 수 있다.

## Data and API

- Shared: `MakeupInterviewProfileV2`, `MakeupRecommendationRationaleV1`, `MakeupRationaleNarrativeV1`.
- Draft: `consultation_interview_drafts_v2.interview_kind='makeup-direction'`.
- Capability: `makeup-rationale-generation`; 입력은 구조화 근거뿐이며 원본 사진은 포함하지 않는다.
- API: `GET/PATCH makeup/interview`, `POST makeup/interview/confirm`, `POST makeup/recommendation/decision`, `GET/POST/PUT makeup/recommendation/rationale`.
- Legacy: `/makeup/context`는 플래그 롤백과 구 클라이언트용으로 유지한다.

`MakeupRecommendationRationaleV1`은 5개 근거 축, 7개 모듈 reason code, 충돌·트레이드오프·제약·신뢰도, source ID와 revision을 가진다. AI 출력은 존재하는 evidence ID만 참조하며 스키마 오류나 provider 실패 시 결정론적 문장으로 폴백한다.

## UI and accessibility

- 대표 모드 6종: 투명 보정, 데일리 내추럴, 소프트 블렌드, 풀 메이크업, 글램 이벤트, 패션 에디토리얼.
- 좌측 7개 주제는 완료 `✓`, 건너뜀 `–`, 현재 항목을 구분한다.
- 저장·AI task 상태는 `aria-live`, 질문 전환은 제목 포커스, 선택지는 native radio/checkbox를 사용한다.
- 기존 `.f-consulting-interview-*`, `.makeup-direction-*`, 앱 토큰을 재사용한다. 전역 팔레트와 기존 CSS 스타일은 바꾸지 않는다.
- 리포트 Makeup 탭은 희망/최종 모드, AI 조정 결정, 5개 근거, 7개 모듈, 제한사항, rationale revision을 표시한다.

## Flags, migration, rollback

- `CONSULTATION_MAKEUP_INTERVIEW_ENABLED`: false이면 기존 Context Form으로 복귀.
- `MAKEUP_RATIONALE_AI_ENABLED`: false이면 구조화 추천만 사용.
- Migration `20260816112511_extend_makeup_interview_rationale.sql`은 interview/capability check constraint만 확장한다. 새 테이블·새 고객 권한은 추가하지 않으며 기존 forced RLS와 service-role-only grant를 유지한다.
- 원격 적용·배포는 이 구현 문서의 완료 증거가 아니다.

## Acceptance gates

- Contract: 6개 모드, 필수 5/선택 2 coverage, legacy presentation 역변환, revision conflict, 확정 스냅샷 불변.
- Policy: 시간·숙련도 충돌은 조정안만 제시하고 `acceptedMode=null`, `decision=pending`을 유지.
- AI: JSON schema, evidence allow-list, idempotency, 실패·재시도와 비차단 폴백.
- UI: 자동 저장, 완료/건너뜀, 나가기·재개·전체 수정, 조정안 승인/거절, 방향 맵 전환.
- Consistency: canvas/routine/brief/report의 `rationaleRevision` 일치.
- Regression: shared/web typecheck, Makeup Phase 05~08, report tests, component registry/passport, migration mirror, Playwright desktop/390/768 overflow.

## External evidence boundary

로컬 타입·계약·브라우저 fixture는 실제 Clerk 소유권, 원격 Supabase migration, 실제 LLM provider 응답, production canary 또는 배포를 증명하지 않는다. 이 항목은 별도 운영 승인과 인증 환경에서 검증한다.
