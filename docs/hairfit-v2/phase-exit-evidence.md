# HairFit V2 backend phase-exit evidence

## 페이즈

- 번호/이름: Backend Phase 0~9 implementation baseline
- 책임자: local implementation task
- 구현일: 2026-08-08
- 기준 커밋: frontend `d51ffcb9823d8f94dd60e90f11fe90bea8aad425`
- 기능 플래그: 모든 V2 플래그 기본 OFF
- 관련 migration: `202608080002_hairfit_v2_backend_core.sql`
- 원격 배포/PR: 수행하지 않음

## 구현 종료 기준

| 기준 | 구현 상태 | 최종 검증 증거 | 비고 |
|---|---|---|---|
| 공유 제품 계약 | 구현 완료 | typecheck, shared 64/64, V2 contract 8/8 | Web/Expo API client 포함 |
| additive schema/RPC | 구현 완료 | mirror 77, fresh-chain 77, upgrade probe 통과 | root/my-app mirror |
| entitlement 멱등·동시성·환불 | 구현 완료 | local DB concurrency/replay/restore 통과 | 실제 provider 제외 |
| consultation 소유권·상태·409 | 구현 완료 | local DB owner/version/link replay 통과 | 서버 aggregate |
| 사용자 옵션 -> 실제 provider prompt | 구현 완료 | compiler fixture와 provider seam 계약 통과 | PromptInputV2/hash/version |
| 3x3 accepted 9·retry·권리 복구 | 구현 완료 | shared quality fixture와 local DB accepted-nine 통과 | exact/near-duplicate 포함 |
| immutable selection·downstream snapshot | 구현 완료 | local DB confirm race/replay/lock 통과 | brief/aftercare/fashion |
| prompt/PII 비노출 | 구현 완료 | V2 redaction 정적 계약 통과 | API/export/log redaction |
| flag OFF legacy 회귀 | 구현 완료 | 관련 회귀 144/144, OFF/ON build 통과 | CSS/페이지 구조 변경 없음 |
| migration/RLS/owner/delete | 구현 완료 | local DB RLS/RPC/FK index/cascade 통과 | 원격 DB 미실행 |
| rollback/runbook | 구현 완료 | 문서 검토 | `backend-v2-implementation.md` |

## 마지막 통합 게이트

구현 완료 후 아래 순서로 최종 실행했다. 실패는 숨기지 않고 명령·오류·재현 조건을 이 문서에 남긴다.

1. migration mirror와 정적 계약
2. shared unit/contract 및 typecheck
3. my-app V2 contract, 기존 consulting/generation/result/payment 관련 회귀
4. monorepo lint/typecheck/build — V2 flags OFF
5. V2 flags ON compile/build와 fixture integration
6. local PostgreSQL fresh-chain, 기존 schema upgrade, RLS/owner/RPC/concurrency SQL
7. 최종 git diff/whitespace/secret audit

## 최종 검증 결과

검증 시각: 2026-08-08 KST. 아래 명령은 모두 격리 worktree에서 exit code 0으로 끝났다.

- `npm run supabase:migrations:mirror:check`: root/my-app 77개 migration mirror 일치.
- `npm run typecheck`: my-app, Expo, api-client, shared 등 전체 workspace 통과.
- `npm --workspace @hairfit/shared test`: 64/64 통과. 사용자 옵션 전 범주, unknown, 충돌 우선순위, 결정적 3x3, exact/near-duplicate fixture 포함.
- `npm run hairfit-v2:contract:test`: 8/8 통과. 실제 Gemini prompt 전달 seam, attempt 연결, API/로그 비노출, 플래그 fail-closed, Web/Expo parity, 결제/reconciliation adapter 포함.
- `npm run lint:all`: 오류 0. 기존 `apps/hairfit-app/app/aftercare/[hairRecordId].tsx`의 `Array<T>` 표기 경고 1개만 존재하며 이번 변경 범위가 아니다.
- 기존 회귀: consulting 6, generation workflow 69, generation entry 14, progress parity 6, result 11, aftercare 7, personal color 3, styling 7, Google Play 6, account deletion 3, original retention 3, global CSS 9로 총 144/144 통과. PortOne contract/confirmation 검사도 통과.
- `npm run build`: V2 플래그 기본 OFF에서 Next.js production build 129 routes 통과.
- 모든 V2 플래그를 `true`로 설정한 `npm run build`: production build 129 routes 통과.
- local PostgreSQL `verify-supabase-fresh-chain.mjs`: 빈 DB 77개 migration 통과.
- local PostgreSQL upgrade probe: frontend consultation session, 기존 generation, legacy credit fixture를 V2 migration 전 삽입하고 모두 보존됨을 확인.
- local PostgreSQL `verify-hairfit-v2-database.mjs`: 강제 RLS/private RPC/FK index, 타 사용자 차단, generation-consultation 원자 연결, 권리 replay/충돌/restore와 동시 소비, accepted 9, 선택 동시 확정·불변 lock, 계정 삭제 cascade 통과.

실제 외부 AI provider, PortOne/Google Play webhook, 원격 Supabase, 배포와 canary는 승인 범위 밖이라 실행하지 않았다. 따라서 로컬 fixture/mock/정적 seam 통과를 운영 provider 품질·비용 또는 원격 배포 증거로 간주하지 않는다. 의존성 설치 시 기존 baseline으로 `npm audit` 42건(낮음 1, 보통 16, 높음 25)이 보고되었으며 자동 수정하지 않았다.

## 배포 결과

- 대상: 로컬 격리 worktree만
- rollout 비율: 0%
- 실제 오류율/전환율/권리 mismatch/품질 거절률/고객 문의: 측정하지 않음
- 이유: merge, push, 원격 DB, provider, deploy는 승인 범위 밖

## 롤백 리허설

- 코드 경로: 모든 V2 플래그 OFF가 기본값이며 legacy 경로를 유지하도록 구현
- 데이터 경로: additive schema를 보존하고 revoke/restore/reconciliation으로 보정
- 실제 staging 리허설: 수행하지 않음
- 남은 위험: 운영 상품 매핑, 실제 webhook replay, provider 품질·비용, remote RLS/storage 삭제, 구버전 모바일 soak

## 다음 단계 인계

- 제거 금지: legacy credit/결제/read 경로, `catalog-v3`, 기존 generation workflow, 기존 CSS와 페이지형 AI 컨설턴트 구조
- 임시 호환 계층: entitlement dual write/shadow read, generation selection과 hair-record adapter
- 배포 blocking decision: 운영 offering/price 승인, 유료 mismatch 0, 실제 refund/webhook replay, staging deletion/rollback 증거
- legacy 제거 조건: 지원 client legacy read 0, 한 결제 주기 관찰, deletion ADR와 별도 destructive PR

## 2026-08-09 사진·분석·생성 직접 연결 후속

- 상담 사진 화면에서 구 마법사 handoff와 generation ID 수동 입력을 제거하고 private upload draft → AI photo analysis로 직접 연결했다.
- 사진 선택 시 시스템 사전검사 결과가 8개 품질 카드에 연결되며 `AI 분석 대기`라는 오해 소지가 있는 상태 문구를 제거했다. 서버는 Sharp로 품질 신호를 재검사하고 blocking 사진에는 AI를 호출하지 않는다.
- 분석 근거를 저장하고 검토한 뒤 전략을 확정해야 프리뷰 생성 접수가 가능하도록 순서를 고정했다.
- 전략 확정 뒤 서버는 entitlement·중복 소비를 내부 검증하고 consultation-linked durable acceptance → V2 3×3 board polling을 수행한다. 사용자에게 별도 유료 생성 확인·견적 승인 CTA를 노출하지 않으며, 품질 승인 결과가 2개 이상이면 전체 9개 완료 전에도 비교를 열 수 있다.
- 원격 Supabase에 `20260722120000`, `202608080001`, `202608080002`가 적용됐고 원격 pending migration은 0이다. `consultation_sessions` Data API service read와 active `hair_decision_once` offering을 확인했다.
- 검증: consultation 8/8, HairFit V2 8/8, upload 5/5, generation entry 14/14, generation workflow 69/69, global CSS 9/9, component registry, migration mirror, monorepo typecheck, 집중 lint, V2 flag ON production build 129 routes 통과.
- 실제 사용자 사진·Clerk 로그인·외부 Gemini 9장 생성은 사용자 입력과 유료 처리량이 필요한 최종 smoke이므로 정적/빌드 결과로 완료 주장하지 않는다.

## 2026-08-11 P16/P17 실행 후속

- feature와 `develop/2026-08-08-hairfit-v2-backend`를 `1d66bd73665510793950cba405ccdb95544d8349`까지 ff-only 통합하고 원격 SHA 일치를 확인했다.
- 원격 Supabase migration은 `85/85`, 서버 rollout flag 25개는 OFF, vision model은 `gpt-4o`, 필수 secret 이름은 값 조회 없이 `32/32`다.
- 실 Clerk 개발 인증과 저장소 데모 얼굴 fixture로 Discovery 7개 autosave→Photo preflight/crop→비동기 analysis→MediaPipe landmark→`gpt-4o`→원격 evidence→overlay를 검증했고 live E2E `1/1`이 58.3초에 통과했다.
- 실검증에서 부분 autosave를 전체 완료로 막던 server guard와 autosave 후 조기 Photo 이동을 수정했다. 계약 `75/75`, typecheck와 lint가 통과했다.
- 초기 단일 Cloudflare source deploy는 `3,406.17 KiB`로 3 MiB 제한에서 거부됐으나, OpenNext 멀티 워커로 분리해 server `3,049.89 KiB`, router `189.10 KiB`로 배포했다. 0% staff canary의 version override가 적용되지 않아 공개 비율을 올리지 않고 복구했다. 최종 OFF source `c4763844af9496d68759b07aa8907183c0902b41`, server `52c8f342-a9af-4f3f-807b-18ed3a4c8862`, router `1b759a85-a42f-44e7-942c-d02ac9900112`의 exact probe와 인증 경계를 확인했다. 공개 canary/실기기·유료 generation은 미완료다.
- 상세 증거와 재개 조건은 `p16-source-deployment-and-live-result-2026-08-11.md`, `p17-final-handoff-2026-08-11.md`를 따른다. 이 상태에서 전체 goal을 완료로 선언하지 않는다.
