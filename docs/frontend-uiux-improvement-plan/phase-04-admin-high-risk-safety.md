# Phase 04 — 관리자 고위험 작업 안전장치

- 상태: core implementation locally complete — 인증 관리자 조회·역할 거절 E2E 목록까지 구현, 운영 migration·PortOne sandbox·mutation interaction은 별도 게이트
- 우선순위: P0
- 변경 게이트: `behavioral`
- 선행 페이즈: Phase 00, Phase 01A
- 독립 배포: 가능, 다른 고객 과금 작업과 분리

## 목표

전액 환불, 관리자 권한 상승, 크레딧 조정이 한 번의 오클릭으로 완료되지 않게 한다. 관리자 UI 확인뿐 아니라 서버 재검증과 감사 영수증까지 하나의 계약으로 묶는다.

## 포함 범위

- [x] 전액 환불: 사용자·거래·환불 금액·현재 상태·되돌릴 수 없는 결과 표시
- [x] 관리자 권한 부여: 현재 role → 목표 role과 영향 범위 표시
- [x] 크레딧 조정: 현재 잔액, delta, 조정 후 잔액, 사유 필수
- [x] 위험도별 typed confirmation 적용
- [x] 서버에서 현재 DB admin 권한과 대상 상태·권한·금액 재검증
- [x] 중복 제출 action key idempotency
- [x] 처리자, 시각, 대상, 전후 값, 외부 취소 ID를 포함한 audit receipt
- [x] success, conflict, already processed, processing, provider pending, failed 상태 분리
- [x] `ConfirmActionDialog` focus trap·typed lock·pending ESC 차단·focus restore 정적/실브라우저 접근성 계약 검사

## 2026-07-15 구현 결과

### DB·동시성 계약

- `admin_action_receipts`를 추가하고 `action_key`를 유일키로 고정했다. actor, action type, 대상, 요청 payload, 변경 전후 상태, 외부 참조, 오류, 생성·완료 시각을 보존한다.
- RLS를 enable/force하고 table과 여섯 RPC의 `public`·`anon`·`authenticated` 권한을 회수했다. `service_role`에만 최소 실행 권한을 부여했으며 RPC는 `security invoker`, 빈 `search_path`를 사용한다.
- 크레딧 조정은 사용자 row lock 뒤 expected balance를 비교하고 receipt 생성, ledger insert, balance trigger를 한 트랜잭션에서 수행한다. 같은 action key replay는 기존 receipt를 반환하며 별도 JSON metadata 유일 인덱스도 중복 adjustment를 막는다.
- 권한 변경은 self-role mutation을 거절하고 expected account type을 비교한 뒤 DB role과 receipt를 한 트랜잭션에서 변경한다. Clerk metadata는 트랜잭션 밖에서 동기화하며 실패하면 `provider_pending`을 유지해 같은 action key로 재시도한다.
- 환불은 `begin_admin_refund_approval`이 `pending → processing`을 원자 선점한다. 최초 요청만 PortOne cancel을 호출하고 같은 action key replay는 lookup만 수행한다. 다른 action key는 `refund_in_progress` conflict가 된다.
- PortOne timeout·5xx는 취소 실패로 단정하지 않고 `approved/provider_pending`으로 남긴다. UI의 재조회는 같은 action key로 PortOne 상태를 읽되 cancel을 재호출하지 않는다.
- webhook은 `mark_payment_refund_after_cancellation` RPC로 기존 metadata를 병합하고 환불 원장과 감사 영수증을 한 트랜잭션에서 완료한다.

### API·관리자 UX

- 회원 권한과 크레딧 API는 직접 table mutation을 제거하고 expected state와 UUID action key가 필수인 receipt RPC만 호출한다.
- 환불 API는 claim, 내부·PortOne 상태/금액/통화 재검증, 외부 취소, 조회 기반 최종화, receipt finalization을 분리했다.
- 회원관리와 환불 화면은 `ConfirmActionDialog`에서 대상, 변경 전후, 영향, 사유·금액을 표시하고 `권한 변경`, `크레딧 조정`, `환불 승인`, `수동 검토`, `상태 재조회` 문구가 정확히 입력되어야 실행된다.
- 결과 panel은 완료·이미 처리됨·충돌·외부 동기화 대기·실패를 다른 tone으로 표시하고 receipt ID, 처리 시각, PortOne 취소 ID를 노출한다.
- DB role은 변경됐지만 Clerk metadata가 대기 중이면 응답의 기존 action key로 동기화를 다시 실행할 수 있다.

### 로컬 검증 증거

- `npm run admin-high-risk:contract:test`: 10/10 통과. migration mirror/RLS/RPC, expected state/action key, refund claim/recheck/finalize, webhook 원자 finalization, typed dialog/focus, 기존 사용자 role 조회의 profile 무변경 fast path와 역할별 보호 E2E 구성을 검사한다.
- `npm run portone:refund:smoke`: 통과. 신규 claim·receipt·unknown outcome·webhook RPC 정적 계약을 포함한다.
- 격리 PostgreSQL fresh apply를 세 번 수행했다. 최종 DB에서는 service role이 `payment_transactions` select 권한만 가진 상태에서 환불 claim이 `processing`을 반환했다.
- 실제 DB smoke에서 credit success/replay 1 ledger, stale balance, negative balance, role replay, stale role, self-role 거절, refund same-key replay, different-key conflict, webhook receipt completion을 확인했다.
- 최종 webhook smoke는 기존 `customerContext`, `adminActionKey`, 신규 event metadata가 모두 보존되고 refund/receipt가 함께 `completed/succeeded`가 되는 것을 확인했다. `anon` table select/RPC execute는 false, `service_role` execute는 true였다.
- 웹 typecheck, lint, production build가 통과했다. 비로그인 production browser에서 `/admin/refunds`가 `/login?redirect_url=%2Fadmin%2Frefunds`로 목적을 보존하고 error overlay 0임을 확인했다.

### 남은 운영 게이트

- linked Supabase에 `20260715210815_admin_high_risk_actions.sql`을 적용하지 않았다.
- PortOne sandbox cancel timeout/중복 webhook과 Clerk 실제 metadata 동기화는 외부 서비스에서 검증하지 않았다.
- 승인된 인증 관리자 fixture 실행 전이지만 `/admin/stats`·`/admin/members` 조회, axe serious/critical 0·375px overflow 0·브라우저 write request 0의 Playwright 목록을 구성했다. 기존 관리자 row가 있으면 `getCurrentActor`가 role 조회 중 `ensure_user_profile`을 호출하지 않는 정적 계약도 고정했다.
- 운영 `ConfirmActionDialog` fail-closed E2E harness의 최초 focus, typed confirmation 잠금, pending 중복 실행·ESC 차단, 완료 뒤 focus 복원·live status, axe serious/critical 0과 320px light·375px dark 반응형 screenshot diff는 통과했다. 실제 관리자 회원·환불 route의 API 성공·충돌·provider pending과 screen reader는 Phase 13 잔여 게이트다.

## 제외 범위

- 일반 고객 결제·quote
- 관리자 목록 pagination
- 모바일 관리자 mutation 확대
- PortOne 전체 환불 운영 정책 재설계

## 예상 파일

- `my-app/app/admin/refunds/page.tsx`
- `my-app/app/admin/members/page.tsx`
- `my-app/app/api/admin/payments/refunds/[requestId]/approve/route.ts`
- `my-app/app/api/admin/members/[userId]/account-type/route.ts`
- `my-app/app/api/admin/members/[userId]/credits/route.ts`
- Phase 01A의 `ConfirmActionDialog`
- 신규 admin action audit migration/API

## 수용 기준

- 환불·admin 승격은 단일 클릭으로 실행되지 않는다.
- 권한이 없는 사용자와 stale 관리자 session은 서버에서 거절된다.
- 같은 요청의 반복 제출은 외부 환불이나 ledger 변경을 중복 실행하지 않는다.
- 성공 후 화면에서 처리 결과와 영수증 식별자를 확인할 수 있다.
- 실패 후 실제 외부 상태를 모른 채 “실패”만 표시하지 않고 재조회 경로를 제공한다.
- audit record 없이 고위험 mutation이 성공하지 않는다.

## 검증

```powershell
npm run lint
npm run build
npm run portone:refund:smoke
npm run admin-high-risk:contract:test
```

테스트 환경에서 환불 성공, 이미 환불됨, provider timeout, 중복 클릭, role conflict, 음수 잔액 방지를 확인한다.

2026-07-18 추가 브라우저 계약은 `tests/web-e2e/dialog-components.spec.ts`에서 운영 `ConfirmActionDialog`의 typed lock·pending dismissal 차단·focus 복원·axe를 검증한다. 전체 production Playwright는 21/21이며 인증 관리자 API 결과 증거를 대체하지 않는다.

## 롤백·인계

- UI rollout을 되돌리더라도 서버 idempotency와 audit 기록은 유지한다.
- Phase 11C에는 audit receipt와 pagination에 필요한 action metadata를 넘긴다.
