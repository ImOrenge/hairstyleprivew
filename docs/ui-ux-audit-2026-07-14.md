# HairFit 웹·앱 UI/UX 감사

- 감사일: 2026-07-14
- 범위: Next.js 고객·살롱·관리자 화면 전체, Expo Router 33개 경로, 생성·결과·결제·마이페이지 핵심 여정
- 방법: 라우트/상태/오류/접근성/반응형/웹·앱 일관성 정적 감사와 프로덕션 빌드 검증
- 제한: 실제 운영 계정 브라우저 시각 회귀, iOS/Android 실기기, 원격 DB·메일 수신 E2E는 수행하지 않음

## 소스에 반영한 P0 기반 — 운영 검증 대기

1. 브라우저와 앱이 직접 9개 이미지를 순차 생성하던 구조를 Cloudflare Workflows 기반 서버 작업으로 전환하는 코드를 반영했다.
2. 고객 웹, 살롱 웹, 모바일이 `/api/generations/drafts` 사전 업로드와 `/api/generations/accept` 접수 계약을 사용하며 구형 prompt/start route는 compatibility adapter로 수렴한다.
3. 원본 사진을 private Supabase Storage에 저장하고 generation·`acceptedAt`·Workflow outbox를 한 트랜잭션으로 접수하도록 구현했다. `acceptedAt` 이후 분석·추천 준비도 Workflow가 소유하며 실제 종료 E2E는 아직 미완료다.
4. 웹·앱은 가벼운 status API를 재조회하고 `updatedAt`이 바뀔 때만 상세 결과와 signed URL을 갱신한다.
5. 완료·부분 완료·전체 실패 이메일, DB claim, Resend idempotency 코드를 구현했다. 실제 메일 수신과 정확히 1회 발송은 운영 검증 전이다.
6. 모든 후보 완료 원본은 즉시 삭제 요청하고 partial/failed 원본은 접수 후 최대 24시간 무료 재시도용으로 보존한다. 보존기한 만료·사용자 포기·draft 만료는 DB outbox와 원자 전이하며 실제 객체는 Storage API consumer가 lease fencing 후 삭제한다.
7. 생성 중 수동 재시도를 막아 Workflow와 같은 후보를 동시에 생성하지 않게 했다.
8. 업로드 검증 결과와 생성 진행 상태에 live status/progress 접근성 정보를 추가했다.
9. 웹·모바일 모두 처리 중 기록을 결과 화면이 아닌 진행 보드로 보내도록 정적으로 수정했으며 모바일 실기기 확인은 대기 중이다.
10. generation accept와 같은 트랜잭션에서 10크레딧을 예약하고, 첫 authoritative 성공에서 차감을 확정하며, 성공 0건 terminal 실패에서 전액을 멱등 복구하도록 구현했다. 운영 migration·동시성 E2E는 대기 중이다.
11. 본인 소유 완료 generation은 `200`과 추천 보드·접근성을, 다른 계정의 generation 링크는 결과 payload 없는 `403`과 결과 이미지 비노출·다른 계정 로그인/홈 이동을 확인하는 protected Playwright 시나리오를 추가했다. preflight는 서로 다른 두 `+clerk_test` fixture, 본인 completed generation과 foreign owner 불일치를 읽기 전용으로 확인한다.
12. 보호 E2E를 고객·관리자·살롱 3개 역할 storage state와 14개 setup/검사 목록으로 확장했다. 관리자 통계/회원, 살롱 고객/연결 조회는 write request 없이 열려야 하고 고객·살롱의 관리자 진입은 역할별 안전 경로로 거절된다. 기존 사용자 역할 확인 중 프로필 초기화 RPC를 다시 호출하던 숨은 write는 DB role read-first fast path로 제거했다.

## 2026-07-15 후속 구현 정정

아래 항목은 소스·정적 계약 수준에서 해결했으며, 실기기·운영 환경 증거가 필요한 항목은 아직 완료로 승격하지 않는다.

- 모바일 마이페이지의 `credits / 5`를 제거하고 서버 `creditPolicy`와 공통 10크레딧 selector를 사용한다.
- 모바일 이력은 후보 수를 포함해 queued/processing/partial/failed를 `/generate/:id`, 전부 완료만 `/result/:id`로 보낸다.
- 모바일 billing은 서버 self-serve catalog를 표시하고 계정/대시보드 일부 실패를 `Free / 0`으로 숨기지 않는다.
- 네이티브 UI primitive와 앱 `AppScreen`의 소유 경계를 분리하고 Button/TextField interaction test와 Expo 3-platform bundle 검사를 추가했다.
- Workflow callback의 Clerk 우회 조건을 exact path+강한 secret으로 제한하고, production 이메일 링크는 HTTPS origin만 허용한다.
- DB가 발급하는 variant fencing token, 완료 흡수 상태, 응답 유실 재조회를 추가해 HTTP timeout의 stale writer와 성공 강등을 막는 계약을 구현했다.
- generation 완료와 메일 발송을 전용 outbox로 분리하고, lease token·`SKIP LOCKED`·불변 provider payload·23시간 `delivery_unknown` 격리·5분 drain을 구현했다.
- private upload draft, 원자적 accept, preparation lease, Workflow dispatch outbox를 추가해 큰 업로드와 작은 접수 command를 분리했다.
- 웹·앱은 `acceptedAt` 전에는 화면 유지, 이후에는 종료 가능 문구를 표시하고 모바일은 accept 후 base64를 메모리에서 제거한다.
- Expo 접수 상호작용은 서버 commit 뒤 응답 유실을 재현해 같은 draft/quote로 재시도하고, receipt 성공 전에는 원본을 유지하되 성공 뒤 portrait data URL·recommendation draft·receipt를 한 번에 제거한다. 복구 SecureStore와 console에는 base64 원본을 남기지 않으며 로컬 PostgreSQL idempotent replay smoke가 중복 generation·크레딧 처리를 차단한다.
- generation UUID ResumeTarget, 웹 open-redirect 방어, Expo SecureStore pending target, fail-closed AASA/Asset Links route를 구현했다.
- legacy claim fence와 `sent/skipped` 흡수로 rolling deploy의 이중 consumer를 막고, 메일 장애는 generation Workflow 결과를 실패시키지 않는다.
- accept/run/detail/status API와 웹·Expo·살롱 UI에 예약·차감·환불 receipt를 연결하고, 완료 이메일은 settlement 전 발송을 보류한 뒤 실제 차감·환불 결과를 표시한다.
- 고객·살롱 route와 DB에서 v1 금액을 10으로 고정하고 settlement reason을 256자로 제한했다. authenticated의 직접 `ensure_user_profile` 실행은 revoke했으며, refund `retryPath`와 전체 실패 이메일은 개인·살롱 context를 보존한다.
- 이번 세션의 임시 PostgreSQL 18에서 migration을 fresh apply해 generation accept/replay, credit commit/refund 멱등성, 부족 잔액 전체 롤백, 직접 쓰기 권한 차단, 중복 enqueue, active lease, stale token, payload·전이 불변식, empty full failure, poison row, legacy cutover를 일회성 smoke했다. 재사용 fixture·결과 artifact는 저장하지 않았다.
- 로컬 자동 증거는 shared 13/13, Supabase RPC receiver binding과 v1 금액·reason·profile 권한·retry context 회귀를 포함한 generation 31/31, 전체 typecheck, lint 오류 0·기존 경고 14, Next build exit 0·compile 17.2초·TypeScript 28.8초·static 89/89·app paths 128이다. root/`my-app` credit migration SHA-256은 `C08B7D5BA25CB18FDD775E01CDAF14D6DEA1227D4599CC6CA1124DCFAF47248F`, `retryPath` notification outbox migration은 `3C4C909B92DF29C0CA464C487CD77952F86244F96BB20A36A32049F02138334B`로 일치한다.
- 현재 후보 `mobile:bundle`은 17:23:58 exit 0, 61 files·16,629,001 bytes이며 Web 941·iOS 1,224·Android 1,245 modules, Android 31·iOS 23 metadata, Android `E9C7E52B…17E74`·iOS `EE3FEFB6…D64B4`·Web `091C48F6…DC730` bundle hash를 확인했다. Worker는 Wrangler 4.87.0 dry-run exit 0, upload 8.61 KiB/gzip 2.55 KiB와 bindings/base URL을 확인했으며 배포하지 않았다.
- 남은 운영 증거: 원격 credit·retention migration 적용, 재사용 staging 동시성·settlement smoke, 배포 환경 migration과 Workflow/App secret 일치, 실제 Resend 1회 수신, 앱·브라우저 종료 후 완료, 로그인 만료 재진입, 외부 경보 수집·호출, retention cron 실제 실행. 메일 payload는 완료 30일·수동 판정 90일 뒤 비식별화하고 메타데이터는 365일 뒤 삭제하는 로컬 계약을 반영했다.
- 2026-07-18에는 완료 이메일 운영 표면을 추가했다. 관리자 통계에서 outbox 상태별 건수·처리 가능한 재시도·만료 lease·가장 오래된 큐 체류와 행동 지침을 확인하고, 5분 drain은 같은 snapshot을 구조화 경보로 남긴다. `delivery_unknown`은 중복 위험 때문에 자동 재발송하지 않도록 UI·계약 테스트·운영 runbook에 고정했다. 외부 로그 수집·호출 채널과 실제 Resend 수신은 운영 검증으로 남는다.

## 2026-07-17 Styler 종료 내구성 후속 구현

- Styler 20크레딧 reservation과 `styling_workflow_outbox` enqueue를 하나의 DB transaction으로 묶고 생성 API는 HTTP 202로 즉시 접수한다.
- AI/storage 실행은 요청 handler가 아니라 전용 Cloudflare `StylingWorkflow`가 소유하며, 2시간 lease token·deterministic output path·정산 재조회로 중복 실행과 모호한 응답을 복구한다.
- 성공·실패·환불 정산 뒤 `styling_notification_outbox`가 가입 이메일을 별도로 발송한다. 알림 실패는 Styler terminal 상태를 바꾸지 않는다.
- 웹·Expo는 접수 뒤 다른 화면 이동·종료 가능, 열린 화면에서는 3초마다 진행 상태 확인, 완료 이메일 발송 상태를 함께 안내한다.
- 로컬 증거는 styling 계약 7/7, paid-action 17/17, generation Workflow 45/45, PostgreSQL 18.4 smoke, TypeScript·lint, 두 Workflow binding의 Wrangler dry-run이다.
- 남은 운영 증거는 원격 migration, Worker/App coordinated deploy, 실제 Resend 1회 수신, 인증 브라우저·iOS/Android 강제 종료 뒤 terminal·환불·재진입이다.

## 2026-07-17 비-에프터케어 운영 목록 후속 구현

- 관리자 회원·리뷰·수신/발신 메일·B2B와 살롱 고객 API에 deterministic compound ordering, versioned cursor, `limit + 1`, malformed cursor fail-closed 계약을 적용했다. cursor decoder는 timestamp와 ID 허용 문자를 검증해 PostgREST filter 문자가 포함된 payload를 거절한다.
- 웹은 검색·필터 변경 시 이전 요청을 취소하고 현재/전체 건수, 기존 row를 보존하는 더 보기를 제공한다. Expo 대표 운영 목록은 `FlatList`, pull-to-refresh, request sequence fencing과 더 보기를 사용한다.
- Expo 리뷰·메일·B2B는 조회 전용임과 변경 가능한 웹 관리자 경로를 명시했다. 메일 상태·수신함, B2B 단계·유입 경로·웹훅 상태는 사용자 label로 바꾸고 raw API/provider 오류는 안전 복구 문구로 대체했다.
- 살롱 매칭 후보도 `updated_at,id` cursor와 검색 일치 후보 scanner로 전환했다. 웹은 AbortController와 최신 요청 guard, Expo는 20명 bounded page·검색·이전/다음·CRM 연결을 제공하며 후보 오류가 고객 목록을 지우지 않는다.
- 웹 회원관리의 계정 유형 원문을 사용자 label로 바꾸고, 웹 회원·리뷰·메일·B2B·살롱의 변경 가능 범위와 Expo 회원·리뷰·메일·B2B의 조회 전용/웹 변경 경로를 명시했다.
- 확장된 목록 계약 11/11은 125개 후보 전체 도달·중복 없음, 첫 100 raw row 뒤 검색 결과, 늦은 응답 차단, 비-에프터케어 운영 화면의 label·조회/변경 경계를 포함한다. 대상 typecheck와 ESLint도 통과했다.
- 인증 100+ 실데이터, 외부 pagination 로그 drain/alert와 iOS/Android frame/memory는 남은 종료 게이트다.

## 2026-07-17 비-에프터케어 결제·생성 문구 후속 구현

- `docs/frontend-uiux-improvement-plan/copy-terminology-contract.md`에 선택/시술 계획 확정/변경 불가, 실패 후보 재시도/새 작업 다시 생성, 비용 확인/결제 후 복귀의 의미를 분리했다.
- 웹·Expo 결제와 구독 오픈 알림에서 `PortOne Checkout`, 카드 빌링키, `PG 연동`, webhook/API, 서버 검증 중심 설명을 제거하고 결제 확인·중복 결제 방지·원래 작업 복귀·최신 비용 재확인 문구로 교체했다.
- 마이페이지의 결제·구독·환불 provider 실패 message/code와 알 수 없는 enum 원문을 차단했다. Expo 생성 결과의 정적 영문 상태·CTA와 후보 raw error도 한국어 복구 행동으로 교체했다.
- 웹 생성 결과와 비-에프터케어 계정·홈·관리자·개인컬러·살롱·고객지원의 소유 정적 영문을 한국어로 통일했다. `멱등`, 결제 callback, 임시 서명 링크, Clerk/Turnstile 환경 변수 같은 구현 안내도 사용자 상태·다음 행동 문구로 교체했다.
- 문구 계약 5/5, 기존 사용자 안전 오류 계약 4/4, 7개 workspace typecheck, 전체 lint 오류 0·범위 제외 에프터케어 경고 1, Expo Jest 96/96, `mobile:sync` 230/230, Next static 95/95와 Expo Web 979·iOS 1,261·Android 1,283 modules export를 통과했다. 모델 생성 콘텐츠와 별도 범위 에프터케어 KO/EN inventory는 남아 있다.

## 2026-07-17 비-에프터케어 안전 오류·상태 안내 후속 구현

- 웹·Expo 사용자 화면이 일반 예외의 `error.message`나 API/DB/결제/provider의 `error` payload를 직접 표시하지 않도록 상태·작업 기반 공용 매퍼를 적용했다. 인증·권한·요청 제한·서버·네트워크·사진 용량은 구분하되, 분류되지 않은 내부 문구는 각 화면이 소유한 복구 문구로 대체한다.
- 결제·환불·구독, 생성·결과·개인컬러·Styler·Workspace, 계정·고객지원·B2B, 관리자 운영과 살롱 연결/고객/초대 표면을 감사했다. 에프터케어 전용 작업 문구와 상태는 이번 범위에서 제외했다.
- Expo 생성 결과의 남아 있던 영문 재시도 조건·prompt token·rendering/variant 완료 문구를 한국어 복구 행동으로 교체했다.
- 웹 오류는 `role="alert"`, 성공·진행은 `role="status"`/polite live region으로 연결하고, Expo 계정·생성·운영·살롱 오류에는 assertive alert를 추가했다.
- 인앱 브라우저 공개 홈 5개 viewport는 가로 넘침 0·단일 `main`·단일 `h1`을 통과했다. 375px B2B 문의에서 select 3개의 접근성 이름 누락과 8px overflow를 찾아 라벨·`min-w-0`를 적용하고 접근성 이름 3개·overflow 0으로 재확인했다.
- 정적 계약 4/4, 7-workspace typecheck, 전체 lint 오류 0(제외 범위 에프터케어 경고 1), Expo Jest 96/96, mobile sync 230/230, Next static 95/95와 Expo Web/iOS/Android export를 통과했다. 자동 axe, 인증 화면 screenshot/keyboard, 실제 VoiceOver/TalkBack과 200% 글자/CWV는 완료 증거가 아니다.

## 2026-07-17 공개 웹 자동 UI/UX 기준선

- 별도 `.next-e2e` production build와 3100번 서버를 사용하는 Playwright 검증을 추가해 사용 중인 3000번 개발 세션과 산출물을 분리했다.
- 홈·B2B 문의·개인정보처리방침·이용약관에서 axe WCAG A/AA serious·critical 위반 0을 확인했다.
- 자동 결제 안내의 초기 포커스·ESC, skip link, 데모 tablist의 방향키·Home·End, FAQ Enter 조작을 자동 검증한다.
- 홈 320/375/768/1024/1440px에서 가로 넘침 0과 screenshot regression 기준선을 확보했다.
- 검사 중 발견한 footer 사업자 정보 대비, 리뷰 가로 스크롤의 키보드 접근, B2B 문의의 placeholder-only 입력, 데모 탭의 roving focus를 수정했다.
- Playwright 10/10과 컴포넌트 registry 42개·passport 42개의 저장소/공식 validator를 통과했다. 인증 생성·결제·관리자·살롱 화면, 실제 스크린리더, 200% 글자 크기와 iOS/Android 실기기는 아직 Phase 13 종료 게이트다.

## 2026-07-17 생성 전 계정 설정 가드

- 웹 `/workspace`는 DB 우선 계정 상태에서 닉네임·성별·온보딩 완료를 확인하고, 필수 정보가 없는 회원을 사진 선택 전에 계정 설정 탭으로 이동시킨다.
- Expo `/upload`도 `/api/mobile/me`가 완료 회원임을 확인하기 전에는 이미지 선택기를 노출하지 않는다. 확인 실패는 사진 화면을 열어 둔 채 숨기지 않고 재확인 CTA를 제공한다.
- 홈의 계정 설정 안내는 닫을 수 있는 선택 안내로 유지하고, 실제 생성 진입에서만 필수 설정을 차단해 첫 방문 탐색과 생성 사전조건을 분리했다.
- 계정 설정의 복귀 대상은 임의 URL이 아니라 `generation-upload`·`generation-submit` 두 값만 허용한다. 저장 후 웹은 workspace 단계로, Expo는 upload/generate 단계로 돌아간다.
- 공통 계약 4/4, 웹·앱 integration 계약 10/10, Expo 렌더 interaction 2/2를 통과했다. 실제 Clerk 신규 계정과 iOS/Android 키보드·스크린리더는 후속 게이트다.

## 2026-07-17 시술 확정 스타일 카드 목록

- 웹·Expo 홈의 `헤어 생성 기록`을 `시술 확정 목록`으로 치환했다. 단순 생성 결과가 아니라 `user_hair_records`가 존재하는 실제 확정 스타일만 노출한다.
- 카드에는 확정 당시 generation의 선택 variant 이미지, 스타일명, 시술 유형, 시술일을 표시하고 해당 에프터케어 가이드로 바로 이동한다. 이미지가 없는 legacy 기록은 깨진 이미지 대신 준비 중 상태를 표시한다.
- 웹·Expo 마이페이지와 전체 에프터케어 목록도 같은 확정 스타일 카드 계약을 사용한다. 생성 예약·진행 확인은 제거하지 않고 `헤어 생성 작업 현황`으로 명칭과 목적을 분리했다.
- 로컬 증거는 shared 32/32, 에프터케어·확정 목록 계약 7/7, Expo 카드 렌더·가이드 이동 2/2, 앱 전체 100/100, 관련 web/shared/native typecheck다. 원격 DB read-only 검증에서는 `user_hair_records → generations` 외래키와 확정 record 4건의 4건 join을 확인했다. 선택 variant ID가 없는 legacy 1건은 임의 후보 이미지를 확정 스타일처럼 표시하지 않고 이미지 준비 중 상태로 처리한다. 인증 브라우저 렌더와 iOS/Android 이미지·터치·스크린리더는 Phase 13에서 확인해야 한다.
- 2026-07-18 보강: 웹 홈·마이페이지·전체 목록과 모바일 목록·상세 API가 `generations.selected_variant_id`를 우선하고 JSON 선택값은 레거시 보완으로만 쓰도록 매핑을 통일했다. 따라서 두 값이 과거 데이터에서 어긋나도 실제 확정 variant 외의 후보 이미지를 카드에 표시하지 않는다.

## 2026-07-17 생성 퍼널 관측 보강

- 생성 진입·접수·완료·결과 열기 분석 이벤트를 `draft_started → accepted → terminal → result_opened` 네 단계로 통일했다. 이로써 웹과 앱이 서로 다른 이름을 쓰거나 페이지 종료 때문에 접수·완료 기록이 빠지는 혼란을 줄였다.
- 초안 시작·접수·완료는 DB 상태 전이에서 기록하고, 결과 열기만 실제 terminal 결과를 연 웹·Expo가 같은 endpoint에 기록한다. 단계별 unique key가 재시도·새로고침 중복을 막는다.
- 로컬 증거는 shared 34/34, generation-entry/funnel 13/13, Expo 100/100, 7-workspace typecheck와 변경 표면 lint 오류 0이다. 원격 migration 적용, 운영 funnel query/dashboard, 인증 브라우저와 실제 기기 기록은 Phase 13에서 확인해야 한다.

## 2026-07-17 생성·Styler DTO와 선택 parity

- 생성과 Styler 응답 타입이 웹 지역 interface와 Expo API client에 중복돼 필드 optional 여부와 확정 잠금 해석이 갈라질 수 있던 구조를 shared wire DTO로 정렬했다. raw fetch 오류 envelope와 API client 성공 DTO를 분리해 타입 안전성을 유지했다.
- 웹 결과와 Expo 진행·결과 화면은 이제 `confirmedHairRecord`만 선택 잠금의 근거로 사용하는 동일 resolver를 호출한다. 확정 뒤 과거 query variant, 존재하지 않는 variant, stale store가 서버 선택보다 앞서 표시되지 않는다.
- 웹의 구체 AI 평가 타입은 generic DTO로 유지하므로 공통화를 위해 `unknown`으로 약화하지 않았다. 에프터케어 DTO는 이번 목표에서 제외해 미완료 상태를 그대로 남겼다.
- 로컬 증거는 shared 36/36, result UX·adapter parity 7/7, Expo 100/100, 7-workspace typecheck, 변경 범위 lint 오류 0, Next `BUILD_ID=jjPltgocS6BE1p9EyGq6R`이다. 인증 결과 재진입과 실제 기기 deep-link는 Phase 13 잔여 게이트다.

## 2026-07-17 선택 스타일 저장 호환성

- 시술 확정 카드는 선택 variant를 정확히 재현해야 하므로 generation의 공개 `selected_variant_id`를 additive로 추가했다. API는 column-first/legacy JSON fallback으로 읽고 선택 PATCH는 두 위치를 함께 쓴다.
- DB trigger가 구형 JSON-only 앱과 신형 column-only 앱을 양방향 지원한다. 서로 다른 두 값을 동시에 보내거나 recommendation variants에 없는 ID를 보내면 저장을 거절해 임의 이미지가 확정 스타일 카드에 연결되는 경로를 차단한다.
- legacy JSON은 최소 두 개의 호환 릴리스와 30일 mismatch 0 관측 전까지 유지한다. 따라서 이번 변경은 즉시 breaking rename을 요구하지 않는다.
- 로컬 증거는 result UX·호환 계약 10/10, shared 36/36, Expo 100/100, 전체 workspace typecheck·변경 파일 lint, Next production `BUILD_ID=w3g_S68p5bCajZn2546O0`, PostgreSQL 18.4 실제 backfill/trigger/constraint와 dual-write smoke 통과다. root/app migration hash는 `B02D78B5934E7B845B8D6915BA3A3C7EF4EDDDDCD54C55A179EB658529D6981A`로 일치하며 원격 적용·운영 telemetry는 Phase 13 잔여 게이트다.

## 남은 웹 우선순위

### P1

- [로컬 수정·운영 검증 대기] 얼굴 분석과 추천 보드 준비를 `acceptedAt` 뒤의 Workflow 단계로 옮겼다. 로컬 PostgreSQL에서는 1분 dispatcher 지연, active lease 중복 차단, expired lease 재시작, stale worker fencing, retry budget 실패 수렴을 rollback smoke로 확인했다. 실제 브라우저·앱 종료와 운영 dispatcher 중지/재시작 환경에서 terminal 도달 증거는 여전히 필요하다.
- [로컬 수정·운영 검증 대기] accept 트랜잭션의 10크레딧 reservation, 첫 성공 commit, 전체 실패 refund와 receipt UI를 구현했다. 일반 `quoteId`·만료·현재 잔액 Quote, Styler·에프터케어 통합, 운영 ledger E2E는 Phase 03/07A의 남은 범위다.
- 전체 실패 refund 뒤 재시도는 새 generation 접수로 안내한다. partial의 실패 후보는 페이지·앱 종료 후에도 24시간 안에 owner 인증된 서버 원본으로 재시도하며, 사용자 포기·만료·삭제 요청 뒤에는 UI·API·DB가 모두 재시도를 차단한다.
- 결과 조회 실패가 placeholder 이미지로 가려져 정상 결과처럼 보일 수 있다: `my-app/app/result/[id]/page.tsx`.
- 공유 버튼이 인증 전용 결과 URL을 복사해 수신자가 열 수 없다: `my-app/components/result/ActionToolbar.tsx`.
- 홈·마이페이지·에프터케어 일부 데이터 오류가 빈 상태로 변환되어 장애와 데이터 없음이 구분되지 않는다.
- 퍼스널컬러 진행 수치가 실제 서버 진행률이 아닌 시뮬레이션 값이다.
- Styler 네트워크 오류에서 무한 로딩이 생길 수 있는 경로가 있다: `my-app/app/styler/new/page.tsx`.
- [로컬 수정·운영 품질 확인 대기] 비-에프터케어 생성·결과·Workspace·Styler의 모델 label·reason·분석·태그는 웹·Expo 공통 한국어 표시 resolver를 사용한다. 번역 장애도 한국어 fallback으로 닫았으며 shared 46/46, Expo 136/136, Next static 96/96와 3플랫폼 export를 통과했다. 실제 번역 provider 품질과 별도 에프터케어 문구 감사는 남아 있다.

### P2

- 결과 비교는 hover/focus 중심이라 모바일 터치 비교 조작이 부족하다.
- 기능별 모달에 공용 focus trap, ESC 닫기, focus 복원, scroll lock 계약이 없다.
- 일부 `Link`와 `Button`, `main` 요소가 중첩된다.
- [부분 수정] 전역 loading/error/not-found 경계와 공개 shell skip link를 추가하고 자동 키보드 검증을 통과했다. 인증 shell 전체와 현재 메뉴 `aria-current`의 전수 검증은 계속 미완료다.
- 관리자·살롱 폼에 placeholder-only 입력과 테마 토큰을 우회한 고정 색상이 남아 있다.

## 남은 모바일 우선순위

### P1

- [정적 수정·실기기 확인 대기] 마이페이지 생성 가능 횟수는 서버 `creditPolicy`와 공통 10크레딧 selector를 사용한다.
- [정적 수정·실기기 확인 대기] 처리 중·부분 완료 마이페이지 기록은 `/generate/:id`, 전부 완료만 `/result/:id`로 이동한다.
- 에프터케어의 유료 전환 비용과 확인 단계가 결과 화면에 충분히 드러나지 않는다.
- 공통 내비게이션, bottom safe area, 키보드 회피가 화면마다 일관되지 않다.
- 모바일 결과 화면은 웹의 원본 비교, 디자이너 브리프, 평가, 공유, 다운로드 기능과 격차가 크다.
- [부분 수정] generation 로그인·가입·OAuth·SSO return target은 복구한다. MFA, 비밀번호 재설정, invite, billing 복귀와 운영 Universal/App Link 실기기 검증은 미완료다.
- Styler 선택 모달은 작은 화면 스크롤과 밝은 패널 대비 문제가 있다.
- [부분 수정] 결제 CTA와 서버 가격 catalog는 연결했으며 약관·개인정보 내용 일치와 실결제 복구는 계속 확인해야 한다.
- 살롱·관리자 모바일 화면은 다수 기능이 조회 전용이며 긴 목록에 pagination/virtualization이 없다.

### P2

- 선택형 컨트롤의 `accessibilityState`, 이미지 설명, 동적 오류 live region이 부족하다.
- 반복 애니메이션에 reduced-motion 대응이 부족하다.
- 권한 영구 거부 시 OS 설정으로 이동하는 복구 CTA가 없다.
- 개발자용 문구와 한국어·영어가 사용자 화면에 혼재한다.

## 생성 완료 알림 운영 조건

1. 신규 generation 접수를 중지하고 legacy `sending`, preparation, variant active lease를 확인·drain한다.
2. `20260714121238_generation_completion_notifications.sql` 적용 여부와 legacy 컬럼·claim RPC를 확인하고 누락 시 먼저 적용한다.
3. `20260715103000_generation_variant_attempt_leases.sql`을 적용하고 RPC·권한을 probe한다.
4. `20260715134451_generation_notification_outbox.sql`을 적용하고 service-role 전용 RPC와 legacy claim fence를 probe한다.
5. `20260715150000_generation_durable_acceptance.sql`을 적용하고 draft/accept/preparation/Workflow outbox RPC·RLS를 probe한다.
6. `20260715160000_generation_credit_reservation_settlement.sql`을 적용하고 reservation/settlement RPC·trigger·RLS·revoke 및 root/`my-app` hash를 probe한다.
7. 동일한 강한 `GENERATION_WORKFLOW_CALLBACK_SECRET`, app base URL, Resend key·sender를 설정한 App과 Workflow Worker를 접수 중지 상태에서 coordinated deploy한다.
8. 1분 Workflow dispatch와 5분 notification drain을 probe하고 첫 reconcile이 legacy `sent/skipped`를 다시 발송하지 않는지 확인한다.
9. `retry_wait`, `failed`, `dead_letter`, `delivery_unknown` 경보와 운영자 runbook을 확인하고 unknown은 수동 판정 전 재발송하지 않는다.
10. canary로 accept reservation, partial/complete commit, full failure refund, API/UI/email receipt와 ledger 잔액 일치를 확인한다.
11. 운영 Apple Team ID와 Android release cert SHA-256 association을 확인한 뒤 canary 사용자로 브라우저 종료·앱 강제 종료, DB terminal, 이메일 1회, 로그인 만료 재진입을 확인하고 접수를 재개한다.

## 2026-07-17 생성 완료 네이티브 Push 로컬 구현

- Expo 계정 화면에 사용자가 직접 켜는 완료 알림 설정을 추가했다. 권한 거부 시 반복 요청 대신 OS 설정 이동과 이메일·앱 내 작업 현황 fallback을 안내한다.
- 사용자·기기 소유권을 서버 인증으로 고정한 등록 API와 private RLS table을 추가했다. 같은 installation/token이 다른 계정으로 재등록되면 이전 연결을 해제하고, 로그아웃은 서버 revoke 성공 전에 세션을 닫지 않는다.
- 이메일 outbox와 별도인 기기별 push outbox가 terminal event를 enqueue한다. send lease, Expo ticket, 15분 뒤 receipt, retry/dead-letter, `DeviceNotRegistered` 기기 무효화를 분리해 push 장애가 생성 상태나 이메일 발송을 막지 않는다.
- 알림 payload는 완료·부분 완료·실패와 정확한 `/generate/{uuid}`만 허용한다. foreground banner/list, background tap, terminated response, 로그인 후 복귀와 badge 정리 코드를 연결했다.
- 로컬 증거는 generation 계약 50/50, Expo Jest 102/102, 7-workspace typecheck, 변경 범위 lint 오류 0, Expo Web 1,049·iOS 1,327·Android 1,351 modules export, Next static 96/96 `BUILD_ID=JbIMCYuDtmZBP9RvY8GDE`, PostgreSQL 18.4 push smoke다. root/app migration SHA-256은 `BFB737E94D133614547F275FE178AAFF4325DB8D4ED4725531FE4C1B0C410567`로 일치한다.
- EAS project ID, APNs/FCM 운영 자격 증명, 원격 migration, 실제 iOS/Android foreground/background/terminated 수신과 token rotation·계정 삭제 E2E는 남아 있다. 그 전에는 `GENERATION_PUSH_ENABLED=false`를 유지하고 이메일을 공통 완료 채널로 사용한다.

## 2026-07-17 인증 복귀·MFA·비밀번호 재설정 후속 구현

- pending ResumeTarget을 생성 시각이 포함된 v2 envelope로 바꾸고 24시간 만료, 미래 시각 거절, 검증된 v1 값만 이관하는 정책을 적용했다. 인증 성공 시 한 번 소비하고, 일반 로그아웃은 세션 종료 성공 뒤 삭제한다.
- generation 외에 이미 구현된 salon invite 복귀를 Phase 05 명세에 반영했다. 결제는 일반 auth target과 섞지 않고 사용자 ID별 pending payment로 보존해, 재로그인 뒤 결제 상태를 확인하고 fresh quote 화면만 열며 유료 행동은 자동 실행하지 않는다.
- Expo 로그인은 email/SMS/TOTP/backup-code second factor를 앱 안에서 선택·준비·검증한다. 이메일 비밀번호 재설정은 코드 발송·검증, 새 비밀번호 확인, 다른 세션 종료, 필요 시 MFA, 원래 ResumeTarget 복귀를 한 흐름으로 제공한다.
- 공통 2차 인증 UI는 Clerk resource·route·storage에 의존하지 않는 controlled form `AuthSecondFactorPanel`로 분리했다. `component-stabilizer` 계약에 따라 candidate로 등록하고 passport·interaction/model test를 추가했다.
- 로컬 증거는 Expo Jest 110/110, 7-workspace typecheck, 변경 범위 lint 오류 0, mobile sync 246/246, registry/passport 43/43, Expo Web 1,053·iOS 1,332·Android 1,355 modules export다.
- 실제 Clerk MFA 계정, reset email 수신, 성공·취소·잘못된 코드·계정 삭제, iOS/Android keyboard·VoiceOver/TalkBack·cold start는 Phase 13 외부/실기기 게이트다.
- 회원 탈퇴는 웹의 문구 입력 확인과 Expo 파괴적 확인을 추가했다. 서버는 해시 tombstone과 Storage cleanup outbox를 만든 뒤 사용자 row·Push token을 cascade 삭제하고, Storage API 삭제 완료 후 Clerk identity를 닫는다. Expo는 auth ResumeTarget·현재 계정 pending payment·Push opt-in·badge를 함께 비운다. 로컬 계약·PostgreSQL smoke는 통과했지만 원격 migration, 실제 Supabase Storage/Clerk 테스트 계정과 iOS/Android 미수신 증거는 Phase 13 게이트다.
