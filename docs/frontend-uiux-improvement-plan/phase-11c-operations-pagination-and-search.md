# Phase 11C — 살롱·관리자 운영 목록과 검색

- 상태: 대표 목록·살롱 매칭 로컬 구현 — 관리자 회원·리뷰·수신/발신 메일·B2B·살롱 고객과 매칭 후보의 deterministic cursor/검색 race/웹·앱 탐색 적용, 외부 analytics·인증 대량 실데이터·실기기 성능 증거는 미완료
- 우선순위: P1
- 변경 게이트: `behavioral`, `compatible`
- 선행 페이즈: Phase 01A, 모바일은 Phase 11A
- 독립 배포: endpoint별로 가능

## 목표

살롱·관리자가 총 건수를 보면서 앞부분만 전체로 오해하지 않게 하고, 100건 이상 데이터·검색 race·네트워크 오류에서도 목록을 탐색하고 복구하게 한다.

## 포함 범위

- [x] cursor 기반 API pagination과 deterministic sort — 관리자 회원·리뷰·발신 메일·B2B `created_at,id`, 수신 메일 `received_at,id`, 살롱 고객 `updated_at,id`
- [x] `현재 범위 / 총 N` 또는 다음 cursor 표시 — 대표 웹·앱 목록
- [x] 검색·filter 변경 시 AbortController 또는 request sequence — 웹 AbortController, 앱 request sequence
- [x] panel별 loading, empty, error, retry 상태 — 대표 회원·리뷰·메일·B2B·고객 목록
- [x] 모바일 FlatList/SectionList virtualization과 load-more — 대표 회원·리뷰·수신 메일·B2B·고객 목록
- [x] pull-to-refresh와 selection 유지 — 대표 목록
- [x] raw status/channel의 사용자 label·tone 변환 — 비-에프터케어 범위에서 관리자 계정 유형·리뷰 노출·메일 상태/수신함·B2B 단계/유입·salon match 동의/연결 대기를 사용자 label로 전환
- [x] 관리자·살롱 기능이 조회 전용인지 mutation 가능한지 화면별 명시 — 웹 회원·리뷰·메일·B2B·살롱 변경 결과와 Expo 회원·리뷰·메일·B2B 조회 전용/웹 변경 경로, salon match CRM 연결 결과 명시
- [x] 대량 fixture와 stale-response 자동 test — 125개 후보 전체 도달·고유성, 첫 100 raw row 뒤 검색 일치, 최신 요청 guard 검사
- [x] pagination analytics와 오류 관측의 로컬 계약 — salon match route가 검색어·회원 식별자 없이 성공 `status/qApplied/cursorApplied/limit/returned/scanned/hasMore`, 실패 `errorKind` 구조 로그를 기록; 외부 수집·경보는 운영 게이트

## 제외 범위

- 살롱 연결 동의·철회 정책
- 관리자 고위험 mutation
- 새 CRM 기능 대량 추가
- 역할 권한 모델 재설계

## 예상 파일

- `my-app/components/salon/CustomerListClient.tsx`
- `my-app/app/api/salon/customers/route.ts`
- `my-app/app/api/salon/matches/route.ts`
- `my-app/app/admin/members/page.tsx`
- `my-app/app/admin/reviews/page.tsx`
- `my-app/app/admin/inbox/page.tsx`
- `my-app/app/admin/b2b/page.tsx`
- `packages/api-client/src/index.ts`
- `apps/hairfit-app/app/admin/*`
- `apps/hairfit-app/app/salon/customers/*`

## 수용 기준

- 100건 이상에서 첫 page만 전체처럼 보이지 않는다.
- 다음·이전 또는 load-more로 모든 row에 도달할 수 있다.
- 늦게 도착한 이전 검색 응답이 최신 결과를 덮지 않는다.
- 각 panel 장애가 다른 panel의 데이터를 지우지 않는다.
- 모바일 긴 목록이 모든 item을 한 번에 mount하지 않는다.
- 조회 전용 화면은 “관리”라는 이름으로 mutation 가능성을 암시하지 않는다.

## 검증

```powershell
npm run lint
npm run typecheck
npm run build
npm run mobile:sync
# 신규: pagination/search race contract test
# 신규: 100+ fixture web E2E/native device smoke
```

## 롤백·인계

- 기존 offset/limit 응답을 compatibility layer로 유지한 뒤 client 전환 후 제거한다.
- Phase 12B와 13에 인증 100+ 실데이터, 외부 analytics와 실기기 성능·오류 기준을 넘긴다.

### 2026-07-15 로컬 구현 증거

- 기존 `members/customers/total/summary` 응답은 유지하고 `limit`, `nextCursor`만 추가해 구형 client 호환을 보존했다.
- cursor는 versioned base64url payload이며 malformed 값은 400으로 fail closed 한다.
- 웹은 검색 변경 시 이전 fetch를 abort하고, Expo는 request sequence로 늦은 응답이 최신 목록을 덮지 못하게 한다.
- 후속 page가 첫 page의 전체 건수를 덮지 않으며, append 오류가 기존 row를 지우지 않는다.
- `list-pagination:contract:test` 2/2, 7-workspace typecheck, 대상 웹·Expo ESLint가 통과했다.
- salon match 후보의 pagination, 100+ fixture, analytics/성능 관측은 후속 endpoint별 작업으로 남는다.

### 2026-07-17 관리자 리뷰 pagination 후속 구현

- 리뷰 API를 `created_at DESC, id DESC` deterministic ordering과 versioned cursor, `limit + 1`, malformed cursor 400 계약으로 이전했다. 기존 `reviews/total/limit` 응답은 유지하고 `nextCursor`만 추가했다.
- 웹 리뷰 목록은 검색·필터 변경 시 이전 요청을 `AbortController`로 취소하고 `현재 N / 총 N`, 기존 row를 보존하는 더 보기, 초기/추가 로딩·오류·빈 상태를 분리했다.
- Expo 리뷰 목록은 `Screen scroll={false}` 안의 `FlatList`, pull-to-refresh, request sequence fencing, 더 보기를 사용한다. 모바일 화면은 조회 전용이고 노출 변경·삭제는 웹 관리자에서만 가능하다고 명시했다.
- 웹·Expo 모두 API raw 오류를 사용자에게 직접 표시하지 않고 권한·재시도 중심의 안전 문구를 사용한다.
- `list-pagination:contract:test` 6/6, 웹·Expo·API client 대상 TypeScript와 ESLint, Next build 95/95, Expo Web 978·iOS 1,261·Android 1,282 modules export, 앱 Jest 96/96, `mobile:sync` 230/230을 통과했다. 인증 계정 100+ fixture, 실제 stale network, iOS/Android frame/memory와 analytics는 아직 운영 증거가 아니다.

### 2026-07-17 관리자 메일함·B2B pagination 후속 구현

- 수신 메일은 `received_at DESC, id DESC`, 발신 메일과 B2B는 `created_at DESC, id DESC` ordering과 versioned cursor, `limit + 1`, malformed cursor 400 계약을 적용했다. 공통 decoder는 timestamp와 ID 허용 문자를 검증해 PostgREST filter 문자가 섞인 cursor를 거절한다. 기존 목록·요약·전체 건수 응답을 유지하고 `nextCursor`만 추가했다.
- 웹 수신/발신 메일과 B2B는 각각 진행 중 요청을 `AbortController`로 취소하고, 현재/전체 건수, 기존 row와 선택을 보존하는 더 보기, 초기/추가 로딩을 분리했다.
- Expo 수신 메일과 B2B는 `Screen scroll={false}`의 `FlatList`, pull-to-refresh, request sequence fencing과 더 보기를 적용했다. 앱은 조회 전용이며 상태·메모 변경은 웹 관리자에서 수행한다고 명시했다.
- 수신함·메일 상태, B2B 단계·유입 경로·웹훅 결과를 사용자 label로 바꾸고 API/provider raw 오류는 권한·네트워크·재시도 중심 문구로 대체했다.
- 비-에프터케어 관리자/살롱 lint 경고도 정리해 전체 lint는 오류 0, 범위에서 제외한 에프터케어 파일 경고 1개만 남았다.
- 확장된 `list-pagination:contract:test` 6/6, 전체 workspace typecheck, 앱 Jest 96/96, `mobile:sync` 230/230, Next build 95/95, Expo Web 978·iOS 1,261·Android 1,282 modules export를 통과했다. 인증 100+ fixture, 실제 네트워크 순서 역전, iOS/Android frame/memory와 pagination analytics는 아직 미검증이다.

### 2026-07-17 salon match pagination 후속 구현

- Supabase JS는 여러 테이블을 가로지르는 `.or()`를 지원하지 않으므로, `salon_match_requests`를 `updated_at DESC, id DESC` cursor로 배치 조회하고 회원 정보와 결합한 뒤 실제 검색 일치 후보 `limit + 1`개가 모일 때까지 진행하는 scanner를 적용했다. 기존 `candidates` 응답은 유지하고 `limit`, `nextCursor`만 추가했다.
- 웹 매칭 후보는 진행 중 요청을 abort하고 공통 `LatestRequestGuard`로 완료된 이전 검색도 차단한다. 오류는 후보 panel 안에서 복구하고 기존 고객 목록을 지우지 않으며, 20명 단위 이전/다음 페이지와 동의 완료·CRM 연결 mutation 결과를 명시한다.
- Expo 살롱 고객 화면에도 최대 20명의 매칭 후보 page, 검색·이전/다음·새로고침·CRM 연결을 추가했다. 긴 고객 목록의 `FlatList`는 유지하고 후보는 bounded header panel로 제한해 중첩 virtualized list를 만들지 않았다.
- 자동 fixture는 125개 후보를 7페이지로 모두 도달하고 중복이 없음을 확인하며, 첫 100개 raw row 뒤에서 시작하는 검색 결과와 늦은 요청 차단도 검사한다. `CustomerListClient`의 검색·필터·초대·등록 control에 명시적 접근성 이름을 연결하고 작은 보조 문구 대비를 높였다. 목록 계약 13/13과 fail-closed production Chromium 4/4에서 125개 고객 전체 도달·중복 0, 700ms 늦은 이전 검색 응답 폐기, 320px light·375px dark overflow 0·axe serious/critical 0·viewport visual baseline을 통과했다. 승인된 인증 실데이터·외부 analytics·통제되지 않은 실제 회선·iOS/Android frame/memory는 아직 운영 증거가 아니다.
- route는 검색어 원문이나 회원 식별자를 남기지 않고 `status`, `qApplied`, `limit`, `returned`, `scanned`, `hasMore`만 구조 로그로 기록한다. 인증 계정의 실제 100+ DB, 외부 로그 drain/alert, iOS/Android frame·memory는 아직 운영 증거가 아니다.
- 웹 회원관리의 `member/salon_owner/admin` 원문을 고객/살롱 운영자/관리자로 바꾸고 고위험 변경 결과를 명시했다. 웹 리뷰·메일·B2B·살롱과 Expo 회원 목록/상세에도 조회 전용 또는 변경 가능 경계를 적었으며, 비-에프터케어 운영 화면 계약으로 고정했다.
- 최종 회귀에서 7개 workspace typecheck, 전체 lint 오류 0·범위 제외 에프터케어 경고 1, 목록 계약 11/11, Expo Jest 96/96, `mobile:sync` 230/230, Next production build 95/95, Expo Web 979·iOS 1,261·Android 1,283 modules export가 통과했다.

### 2026-07-18 pagination 관측 계약 보강

- 성공 로그에 `salon_match_pagination_read`, 실패 로그에 `salon_match_pagination_failed` event를 부여하고 cursor 적용 여부와 제한된 오류 종류만 기록한다.
- 실패 로그는 raw Supabase 오류 객체·검색어·이메일·회원 ID를 출력하지 않는다. 외부 collector에서는 실패율과 `scanned / returned` 비율을 집계할 수 있지만 실제 drain·alert 연결은 운영 환경에서 검증한다.
- native 목록 계약은 화면별 과거 `<Screen><FlatList>` 구현 문자열이 아니라 공용 `VirtualizedListScreen`이 `AppScreen scroll={false}`와 단일 `FlatList`를 소유하는 현재 구조를 검증하도록 갱신했다.
