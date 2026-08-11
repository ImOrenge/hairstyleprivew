# HairFit V2 P13 Expo parity 진행 증거

작성일: 2026-08-11

## 구현 상태

- Expo `/consulting`은 `createConsultation`, `getConsultation`, `updateConsultation`을 사용해 Web과 같은 `ConsultationSnapshot`과 consultation ID를 권위 상태로 사용한다.
- SecureStore에는 authoritative snapshot이 아니라 재진입용 consultation ID만 저장한다.
- 신규 상담 생성은 `Idempotency-Key`를 전송하고 서버가 동일 사용자·키 replay와 unique race를 같은 snapshot으로 복구한다.
- Discovery는 7개 주제의 단독 인터뷰이며 단일 선택은 즉시 저장하고, 복수·복합 입력만 명시 저장한다. `currentStep`, 질문별 공통 Next, 단계 잠금은 없다.
- Photo는 native 4:5 편집 결과를 crop transform으로 저장하고 선택적 자연광 보조 사진을 별도 private draft로 올린다. 보조 사진은 Personal Color에만 사용하며, Analysis·landmark correction·3×3 Preview·shortlist·Decision은 동일 consultation ID의 V2 projection을 읽고 쓴다.
- Salon Brief는 확정 snapshot 이후 사용자의 생성 클릭 없이 멱등 자동 생성·조회한다.
- Aftercare는 실제 시술 종류와 날짜를 먼저 저장한 뒤 서버 Capability가 오늘 행동과 D+3/W+2/W+6/W+10 프로그램을 생성한다.
- Fashion은 확정 헤어 이후 7개 방향 주제를 같은 snapshot에 자동 저장하고, 방향 확인 뒤 별도 유료 생성 확인 없이 서버 entitlement·멱등 검증을 거쳐 9-slot batch를 접수한다.
- Fashion batch는 reconcile polling, partial/failed dispatch recovery, 2~3개 shortlist와 최종 선택을 제공한다.
- 기존 `/upload`, `/generate`, `/personal-color`, `/styler`, `/aftercare` 링크와 V2 feature flag rollback은 유지한다.

## 로컬 검증

- `npm --workspace @hairfit/api-client run typecheck`: 통과
- `npm --workspace @hairfit/app run typecheck`: 통과
- `npm --workspace @hairfit/app run test`: 41 suites, 175 tests 통과
- `mobile-v2-consultation.test.js`: Photo crop·자연광 보조 사진 계약을 포함해 통과
- 대상 Expo consulting lint: 오류 0
- `npm run mobile:bundle`: Web, Android, iOS export 통과

## 아직 종료 증거가 아닌 항목

- 실제 인증 계정·실기기에서 offline/resume와 409 conflict 상호작용은 `not_run`이다.
- 실제 provider 생성, entitlement 소비, Fashion partial retry, Aftercare 실제 DB lifecycle은 P16 승인 게이트 전에는 `not_run`이다.
- iOS/Android development build의 접근성·화면 크기·키보드 visual audit은 `not_run`이다.
- 따라서 P13 코드는 구현됐지만 실환경 종료조건까지 완료됐다고 판정하지 않는다.
