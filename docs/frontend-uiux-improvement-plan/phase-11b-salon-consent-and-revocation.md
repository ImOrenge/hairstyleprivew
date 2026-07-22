# Phase 11B — 살롱 연결 동의·철회·초대 재발급

- 상태: 로컬 구현 완료 — 인증 살롱 조회·역할 거절 E2E 목록까지 구현, 운영 migration·mutation 브라우저/실기기 증거 대기
- 우선순위: P1, 개인정보
- 변경 게이트: `behavioral`, 개인정보 계약
- 선행 페이즈: Phase 01A, Phase 05
- 독립 배포: migration과 구형 invite compatibility가 있으면 가능

## 목표

회원이 살롱 연결 전에 실제 공유 데이터, 목적, 보존 기간, 철회 방법을 이해하고 동의하게 한다. 초대 재발급이 기존 링크를 무효화한다는 결과도 실행 전에 알려야 한다.

## 포함 범위

- [x] 공유 항목: 프로필, 이메일 여부, 생성 기록, 선택·확정 정보, 에프터케어 범위 명시
- [x] 처리 목적과 살롱이 할 수 있는 행동 설명
- [x] 보존 기간과 연결 해제 후 처리
- [x] 명시적 동의와 동의 version 저장
- [x] 회원·살롱이 확인 가능한 연결 해제
- [x] 연결 해제 후 권한·cache·진입 링크 차단
- [x] invite 재발급 전 기존 활성 링크 무효화 확인
- [x] invite code의 인증 ResumeTarget 보존
- [x] 연결·해제·재발급 audit event
- [x] 개인정보 처리방침과 UI 문구 정렬

## 제외 범위

- 고객 목록 pagination
- 살롱 CRM mutation 전체 확대
- 고객 시술 확정과 살롱 방문 확정 통합
- 살롱 요금제 변경

## 예상 파일

- `my-app/components/salon/MatchInviteClient.tsx`
- `my-app/components/salon/CustomerListClient.tsx`
- `my-app/app/api/salon/match/[code]/route.ts`
- `my-app/app/api/salon/matching/invite/route.ts`
- `my-app/app/api/salon/customers/[id]/route.ts`
- `apps/hairfit-app/app/salon/match/[code].tsx`
- `my-app/app/salon/connections/page.tsx`
- `my-app/components/salon/SalonConnectionsClient.tsx`
- `apps/hairfit-app/app/salon/connections.tsx`
- `supabase/migrations/20260717042426_salon_connection_consent_revocation.sql`과 `my-app` 미러
- `my-app/app/api/salon/connections/route.ts`
- `my-app/app/api/salon/matches/[requestId]/route.ts`
- `packages/shared/src/salon/connection-consent.ts`

## 수용 기준

- 회원은 수락 전에 실제 공유 항목과 목적을 볼 수 있다.
- 동의하지 않거나 철회해도 계정의 일반 고객 기능을 계속 사용할 수 있다.
- 철회 후 살롱 API가 해당 고객 상세와 생성 기록을 반환하지 않는다.
- 재발급 전에 기존 링크 무효화를 확인하고 성공 후 새 링크 상태를 표시한다.
- 인증을 거쳐도 invite code가 유지된다.
- 동의 version과 철회·재발급 이력이 감사 가능하다.

## 검증

```powershell
npm run salon-consent:contract:test
npm --prefix packages/shared test
npm --workspace @hairfit/app run test:auth
npm run lint
npm run typecheck
npm run build
npm run mobile:sync
# migration 적용 격리 DB에서 아래 smoke 실행
psql -v ON_ERROR_STOP=1 -f my-app/supabase/tests/salon_connection_consent_revocation_smoke.sql
```

회원 수락·거절·철회, 살롱 재발급, stale 링크, 다른 계정, 로그인 만료를 웹·앱에서 확인한다.

### 2026-07-17 로컬 검증

- `salon-consent:contract:test` 3/3 통과: migration 미러·service-role RPC 제한·동의/철회/재발급 route·웹/Expo 노출 계약 확인
- shared test 25/25와 shared/API client/웹/Expo typecheck 통과
- Expo auth resume 5/5 통과: invite code를 SecureStore 계약으로 보존하고 로그인 후 1회 소비
- PostgreSQL 18.4 fresh DB에서 초기 schema → salon CRM → matching → 11B migration 적용 후 `salon_connection_consent_revocation_smoke_ok`
- 격리 DB smoke에서 재발급 사전 확인, old invite 무효화, stale consent 거부, 명시 동의 저장, member/salon 양쪽 철회, 고객 link 제거, current-consent detail gate 차단, 고객 record 재연결, 9개 audit event를 확인
- 기존 `salon_owner` fixture의 `/salon/customers`·`/salon/connections` 조회와 관리자 경로 거절, axe serious/critical 0·375px overflow 0·브라우저 write request 0의 Playwright 목록을 구성했다. 기존 role row 조회는 profile 초기화 RPC를 다시 호출하지 않는다.
- 승인된 fixture의 실제 green run과 초대·수락·철회·재발급 mutation interaction은 아직 외부 게이트다.
- 운영 Supabase migration 적용, 인증된 웹 상호작용/viewport, iOS/Android 실기기 확인은 아직 실행하지 않았으므로 출시 증거가 아니다.

## 롤백·인계

- 구형 invite를 즉시 삭제하지 않고 만료·전환 정책을 둔다.
- 개인정보 동의 record는 UI rollback 시에도 보존한다.
- Phase 11C와 13에 consent scope와 audit event를 넘긴다.
