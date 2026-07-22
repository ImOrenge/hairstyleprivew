# Phase 10C — 에프터케어 유료·잠금·일정 흐름

- 상태: 부분 로컬 구현 — 첫 무료/추가 30크레딧 Quote·원자 claim/receipt·웹/Expo 확인/결제 복귀와 확정 스타일 이미지 카드 목록은 연결, Expo 날짜 입력·목록 실환경 증거는 미완료
- 우선순위: P0/P1
- 변경 게이트: `behavioral`
- 선행 페이즈: Phase 01A, Phase 01B, Phase 02A, Phase 03, Phase 06
- 독립 배포: migration/RPC와 호환 client를 함께 rollout하고 실환경 검증한 뒤 가능

## 목표

계정 생애 첫 에프터케어 무료, 이후 고정 30크레딧, 시술 계획 확정과 선택 잠금, 서비스 날짜, 주기별 메일 생성 결과를 사용자가 실행 전에 이해하고 실패 시 복구하게 한다.

## 확정 제품 계약

- `selectedVariantId`는 바꿀 수 있는 대표 선택이고, 에프터케어 생성 성공으로 생긴 `confirmedHairRecord`만 선택 잠금 근거다.
- 첫 무료 혜택은 계정 생애 1회이며 `aftercare_free_claims.user_id`로 직렬화한다.
- 추가 프로그램 단가는 shared `ADDITIONAL_AFTERCARE_PROGRAM_CREDITS = 30`으로 고정하며 paid-action 가격 env override를 사용하지 않는다.
- 성공 프로그램은 hair record 1개, guide 1개, 서로 다른 content type 6개, free 또는 charged receipt가 모두 존재해야 한다.
- 같은 user/generation 재요청은 기존 receipt와 상세 경로를 반환하고 추가 차감하지 않는다.
- 결제 뒤 `/result/{generationId}?variant={selectedVariantId}`로 복귀하지만 자동 확정하지 않고 fresh Quote와 사용자 재확인을 요구한다.

## 2026-07-15 로컬 구현

- [x] 첫 무료 또는 추가 30크레딧 Quote와 현재/차감 후 잔액 표시
- [x] 웹·Expo에서 확정 후 선택 잠금 결과와 receipt 표시
- [x] 부족 시 Phase 06 billing 복귀와 fresh Quote 재확인
- [x] 선택 저장과 에프터케어 확정 명령을 분리하고 `confirmedHairRecord`만 잠금 근거로 사용
- [x] 동일 generation 재요청 시 기존 프로그램을 열고 추가 차감 금지
- [x] `aftercare_free_claims`, `aftercare_program_receipts`, `execute_aftercare_program`, `read_aftercare_program_receipt`로 첫 무료 claim·record·guide·6 content·ledger를 한 트랜잭션으로 처리
- [x] 웹 날짜 입력을 native date input으로 제한하고 서버에서 실제 달력 날짜를 재검증
- [x] 웹·Expo 기본 날짜를 같은 KST calendar key로 계산해 UTC·사용자 현지 시각 차이로 전날이 되는 오류 제거
- [x] 생성된 care content 6개, free/charged receipt, 기존 프로그램 replay 피드백
- [x] 모바일 API client에 `quoteId`, charged/free/cost/receipt/confirmed response 반영
- [x] 웹의 중복 확정 overlay를 공통 `AftercareConfirmDialog`로 통합하고 잠금 CTA는 기존 상세를 연다.
- [x] RPC 응답이 모호하면 persisted receipt·record를 재조회해 완료된 확정을 replay하고 중복 차감·거짓 실패 안내를 방지
- [x] 케어 메일 CTA origin을 요청 Host가 아닌 검증된 `getSiteUrl()`로 고정
- [x] 홈의 헤어 생성 기록을 시술 확정 목록으로 치환하고 웹·Expo·마이페이지·에프터케어 목록에 확정 스타일 이미지 카드와 가이드 이동 연결
- [x] 생성 작업은 삭제하지 않고 마이페이지 `작업 현황`으로 분리해 대기·진행·완료·실패 추적 유지
- [ ] Expo의 서비스 날짜를 문자열 입력이 아닌 접근 가능한 DatePicker로 교체
- [ ] 에프터케어 목록·상세의 loading, empty, error, retry를 실제 네트워크 장애와 빈 계정으로 검증
- [ ] portrait가 없는 오류 상태의 잘못된 생성 CTA와 전 플랫폼 문구를 실사용 흐름에서 재점검

## 데이터·실행 구조

```text
fresh HMAC Quote
  -> 사용자/generation/selected variant/date 검증
  -> AI guide + 6 care content 생성 (DB transaction 전)
  -> execute_aftercare_program(user row lock)
       first use: free claim + record + guide + 6 content + free receipt
       later use: 30 debit + record + guide + 6 content + charged receipt
       duplicate: persisted record/receipt replay
```

RPC는 사용자와 generation을 잠그고, 첫 무료 claim 또는 30크레딧 debit과 프로그램 row 묶음을 한 트랜잭션으로 처리한다. 오류가 나면 record·guide·content·ledger·claim이 함께 롤백된다. RLS는 강제되고 관련 table/RPC는 service-role 전용이다. legacy backfill은 guide와 정확히 6개의 distinct content type이 모두 있는 완성 프로그램만 claim/receipt로 인정한다.

## 중단·재시도 한계

에프터케어 AI 생성은 DB transaction 전에 HTTP 요청 안에서 실행된다. 이 단계에서 브라우저·앱 또는 런타임이 종료되면 DB write와 차감은 남지 않지만, 생성도 완료됐다고 보장할 수 없다. 사용자는 결과 화면으로 돌아와 fresh Quote를 받고 직접 다시 시도해야 한다.

RPC 호출 뒤 응답만 유실된 경우 현재 요청에서도 persisted receipt를 먼저 재조회하고, 이후 같은 user/generation 재요청도 그 receipt를 replay한다. 그러나 AI 단계 자체는 durable Workflow/outbox가 아니므로 “앱을 닫아도 백그라운드에서 반드시 생성 완료”라고 안내하지 않는다.

## 제외 범위

- 주기별 케어 콘텐츠의 AI 문체 변경
- cron 메일 인프라 전면 교체
- 결과 action toolbar 전체 재디자인
- 살롱 방문 확정과 고객 시술 확정 통합
- 에프터케어 완료 Push

## 주요 파일

- `my-app/components/aftercare/AftercareConfirmDialog.tsx`
- `my-app/components/result/ActionToolbar.tsx`
- `my-app/components/workspace/WorkspaceWizard.tsx`
- `my-app/app/api/hair-records/route.ts`
- `my-app/app/aftercare/page.tsx`
- `my-app/app/aftercare/[hairRecordId]/page.tsx`
- `apps/hairfit-app/app/result/[id].tsx`
- `apps/hairfit-app/app/aftercare.tsx`
- `apps/hairfit-app/app/aftercare/[hairRecordId].tsx`
- `packages/api-client/src/index.ts`
- `packages/shared/src/billing/paid-action.ts`
- `supabase/migrations/20260715173000_paid_action_atomic_execution.sql`과 `my-app` 미러

## 수용 기준

- [x] 사용자는 실행 전에 무료 또는 30크레딧과 잠금 결과를 확인한다.
- [x] 첫 무료 동시 요청에서 한 건만 무료 claim된다.
- [x] 같은 generation 재요청은 기존 에프터케어를 열고 추가 차감하지 않는다.
- [x] DB 실패 시 partial guide/content/ledger/claim이 남지 않는다.
- [x] KST 기본 날짜가 전날로 밀리지 않고 서버가 달력 날짜를 검증한다.
- [x] 주기별 메일 6개와 receipt가 서버 결과와 일치한다.
- [ ] Expo DatePicker와 목록 장애/빈 상태를 iOS·Android 실기기에서 검증한다.
- [ ] 요청 종료 전후의 no-write/replay 동작을 배포 런타임에서 검증한다.

## 검증

```powershell
npm run paid-action:contract:test
npm run aftercare:contract:test --workspace=my-app
npm test --workspace=@hairfit/shared
npm test --workspace=@hairfit/app -- --runInBand __tests__/confirmed-style-list.test.tsx
npm run portone:audit
npm run portone:confirmation:test
npm run typecheck
npm run lint:all
npm run build
npm run supabase:migrations:mirror:check
npm run supabase:migrations:fresh:check -- --databaseUrl=<local-empty-db-url>
npm --workspace @hairfit/app test
npm run mobile:bundle
# migration 적용이 끝난 격리 PostgreSQL에서
psql -v ON_ERROR_STOP=1 -f my-app/supabase/tests/paid_action_atomic_execution_smoke.sql
```

이번 로컬 PostgreSQL 18.4 fresh DB에서 첫 무료, 정확히 6개 content, CTA record ID 치환, duplicate replay, 두 번째 30크레딧, 잘못된 guide 전체 rollback, stale Quote no-write를 확인했다. 두 개의 서로 다른 generation을 실제 병렬 요청했을 때 free claim 1·free receipt 1·프로그램 record 1·잔액 100으로 한 요청만 무료 성공하고 다른 요청은 `QUOTE_CHANGED`로 재확인됐다.

2026-07-17 목록 후속에서는 공통 variant media 계약 32/32, 에프터케어·확정 목록 계약 6/6, Expo 확정 카드 렌더·가이드 이동 2/2와 웹·공통·Expo 대상 typecheck를 통과했다. `user_hair_records`와 연결된 generation의 실제 선택 variant 이미지만 카드에 사용하고, 선택 ID 또는 이미지가 없는 legacy 기록은 빈 이미지 안내로 안전하게 표시한다.

2026-07-18 재검증에서는 공통 계약 51/51, 에프터케어·확정 목록 계약 6/6, Expo 카드 2/2, production Playwright 43/43, Next E2E build static 103/103와 전체 workspace typecheck·lint 오류 0을 통과했다. 운영 DB read-only 확인 결과 확정 record 4건 모두 generation과 연결되고, 3건은 legacy JSON의 선택 variant가 실제 후보에 존재해 카드 이미지를 표시할 수 있다. 나머지 1건은 선택 ID가 없어 임의 이미지 대신 준비 중 상태를 유지한다. 운영 DB에는 아직 공개 `generations.selected_variant_id` column이 없으므로 현재 목록 query는 `options` 호환 경로를 유지하고, shared resolver만 migration 적용 이후 column-first 호출을 받을 수 있게 검증했다. lint에는 이번 범위 밖의 기존 Expo 에프터케어 배열 표기 경고 1개만 남았다.

같은 날 루트에 빠져 있던 과거 migration 43개를 `my-app` 이력과 동기화해 두 트리를 73/73개로 맞췄다. 완전히 빈 로컬 PostgreSQL에 73개 전체 fresh-chain을 적용한 뒤 확정 스타일 dual-field, paid-action 원자 실행, Styling Workflow를 포함한 SQL smoke 9개가 모두 통과했다. 이 검증은 `generation_upload_drafts`·`styling_sessions` 같은 선행 테이블 누락을 배포 전에 차단한다.

이는 로컬 DB·정적 UI 계약 증거다. 원격 migration, 인증된 웹 viewport, 실제 PortOne, cron care email, iOS/Android DatePicker·프로세스 종료는 아직 검증하지 않았다.

## 롤백·인계

- transaction/RPC idempotency와 고정 단가는 유지하고 UI rollout만 되돌린다.
- migration 미적용 환경에서 보상 삭제 방식이나 직접 `consume_credits`로 조용히 fallback하지 않는다.
- Phase 10D와 12B에 confirmation/aftercare fixture, DatePicker·목록 상태·실기기 잔여 항목을 넘긴다.
