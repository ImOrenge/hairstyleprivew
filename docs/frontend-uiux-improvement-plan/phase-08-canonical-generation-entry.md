# Phase 08 — 생성 진입 단일화

- 상태: 핵심 로컬 구현·4단계 funnel analytics 완료, 인증 브라우저·운영 migration 검증 대기
- 우선순위: P1
- 변경 게이트: `behavioral`, `deprecation`
- 선행 페이즈: Phase 05, Phase 07A, Phase 07B
- 독립 배포: 구형 route compatibility와 draft handoff가 있을 때 가능

## 목표

웹의 `/workspace`와 구형 `/upload → /generate` 퍼널을 `/workspace` 하나로 수렴시킨다. redirect 때문에 로컬 초안, 이메일 링크, 인증 문맥이 유실되지 않아야 한다.

## 포함 범위

- [x] `/workspace`를 유일한 웹 생성 시작 route로 지정
- [x] `/upload`와 ID 없는 `/generate`의 compatibility redirect
- [x] 구형 local draft를 `/workspace`로 handoff
- [x] landing, home, mypage, result, Styler 복구 CTA 교체
- [x] sitemap, robots, canonical metadata 정리
- [x] 지원 문서, i18n, 메일 CTA route 계약 정렬
- [x] 모바일은 platform-native upload/generate 화면을 유지하되 같은 서버 state machine 사용
- [x] analytics를 `draft_started → accepted → terminal → result_opened`로 통일
- [x] 구형 route 사용량 관측과 deprecation 기간

## 2026-07-15 로컬 구현

- middleware가 인증 판정보다 먼저 `/upload`를 `/workspace`로, ID 없는 `/generate`를 `/workspace?nextStep=generate`로 307 redirect한다. `/generate/{id}`는 exact legacy matcher에서 제외된다.
- redirect 응답은 `private, no-store`와 `x-hairfit-generation-entry: legacy-upload|legacy-generate`를 남기고, 같은 source/target을 구조화 로그로 기록한다.
- route page 자체도 동일 상수로 redirect하는 fallback을 유지한다. 구형 URL을 삭제하거나 404로 만들지 않았다.
- `WorkspaceWizard`는 계정별 IndexedDB 이미지 hydration이 끝난 뒤 `nextStep=generate`를 소비한다. 캐시 이미지가 있으면 생성 단계, 없으면 업로드 단계로 안전하게 돌아가고 URL을 `/workspace`로 정리한다.
- 웹 billing allowlist는 구형 `/generate` 복귀값도 `/workspace?nextStep=generate`로 정규화한다. Expo의 native `/generate` route 계약은 변경하지 않았다.
- not-found와 Styler empty CTA, trend email CTA는 `/workspace`를 사용한다. sitemap은 보호된 생성 시작 route를 광고하지 않고 robots는 `/upload`, `/workspace`, `/generate`를 모두 비공개 사용자 경로로 취급한다.
- 구형 route wrapper는 최소 두 번의 운영 release 동안 유지한다. 제거는 최근 30일 legacy hit가 generation entry의 0.5% 미만이고 관련 지원 incident가 없다는 로그 증거와 별도 deprecation 승인 뒤에만 한다.

## 2026-07-17 funnel analytics 후속

- 공통 계약은 `draft_started → accepted → terminal → result_opened` 네 이름과 순서를 단일 vocabulary로 고정한다. `generation_accepted`, `completed` 같은 화면별 alias는 analytics 이벤트로 허용하지 않는다.
- `generation_funnel_events`는 generation·사용자·단계별 unique key로 멱등 기록한다. 원격 분석 SDK가 없어도 퍼널 원본이 유실되지 않으며, RLS/권한은 `service_role` 전용이다.
- `draft_started`는 upload draft insert, `accepted`와 `terminal`은 generation 상태 전이 DB trigger가 기록한다. 브라우저나 앱을 닫아도 접수·완료 이벤트가 클라이언트 수명에 종속되지 않는다.
- `result_opened`만 인증된 소유자가 terminal 결과를 실제로 연 뒤 공용 endpoint로 보낸다. 웹과 Expo는 각각 `web`, `mobile` source를 사용하고 실패를 사용자 결과 조회 실패로 확대하지 않는다.
- migration은 root와 `my-app`에 동일하게 두었으며 실제 원격 적용과 funnel query/dashboard·경보는 Phase 13 운영 게이트로 남긴다.

## 제외 범위

- result ID route redirect
- 완료 이메일 발송 로직
- WorkspaceWizard 구조 분해
- 시각 디자인 전면 변경

## 예상 파일

- `my-app/app/workspace/page.tsx`
- `my-app/app/upload/page.tsx`
- `my-app/app/upload/layout.tsx`
- `my-app/app/generate/page.tsx`
- `my-app/app/sitemap.ts`
- `my-app/app/robots.ts`
- `my-app/app/styler/new/page.tsx`
- `my-app/lib/i18n/locales/ko.ts`
- `my-app/lib/i18n/locales/en.ts`
- `my-app/lib/canonical-generation-entry.ts`
- `my-app/lib/canonical-generation-entry.test.ts`
- `my-app/lib/billing-return-target.ts`
- `my-app/middleware.ts`

## 배포 순서

1. 모든 신규 CTA를 `/workspace`로 변경한다.
2. 구형 route에 draft handoff와 관측을 추가한다.
3. 내부 링크·sitemap·robots·메일 route를 교체한다.
4. 구형 route가 충분히 감소한 뒤 redirect를 강제한다.
5. 구형 page 삭제는 별도 deprecation 승인 후 진행한다.

## 수용 기준

- 모든 생성 시작 CTA가 같은 퍼널과 서버 command로 들어간다.
- 저장된 `/upload` bookmark와 구형 링크가 깨지지 않는다.
- 선택한 사진과 분석 draft가 redirect에서 유실되지 않는다.
- 인증이 필요하면 `/workspace` ResumeTarget으로 돌아온다.
- ID가 있는 `/generate/:id` 진행 route는 영향을 받지 않는다.
- sitemap과 robots가 구형 시작 route를 신규 유입 대상으로 광고하지 않는다.

## 검증

```powershell
npm run generation-entry:contract:test
npm run lint:all
npm run typecheck
npm run build
npm run mobile:sync
```

현재 generation-entry/funnel 계약 13/13, shared 계약 34/34, Expo 전체 100/100, 7-workspace typecheck와 변경 웹·Expo lint 오류 0이 통과했다. Expo 전체 lint에는 별도 범위의 기존 에프터케어 array-type 경고 1건만 남았다. 별도 `.next-funnel-validation` production build는 `BUILD_ID=yrUMwNyFGES_c010HpDE5`와 `/api/generations/[id]/events/route` manifest를 생성했다. 임시 PostgreSQL 18.4에는 선행 durable-acceptance 뒤 funnel migration을 실제 적용해 RLS enable/force `t|t`와 trigger 2개를 확인했다. analytics migration은 원격 적용하지 않았다. production 서버 HTTP에서 `/upload`는 307 `/workspace`, `/generate`는 307 `/workspace?nextStep=generate`와 각각 no-store·legacy source header를 반환했다. 이어지는 로그인 redirect는 canonical query 또는 generation UUID를 보존했고 robots/sitemap도 구형 진입을 광고하지 않았다.

인앱 브라우저 런타임은 로컬 커널 asset 경로 오류로 초기화되지 않아 이번 변경에서 visual/interaction E2E를 새 증거로 만들지 않았다. 인증된 IndexedDB draft handoff와 320/375/1440px 상호작용은 Phase 13 브라우저 E2E 대상으로 유지한다.

320/375/1440px에서 landing, home, Styler empty, mypage empty CTA를 직접 확인한다.

## 롤백·인계

- 구형 route wrapper와 단일 canonical helper를 유지해 redirect를 한곳에서 되돌릴 수 있다.
- Phase 09A에는 canonical progress/result URL을, Phase 13에는 funnel migration 적용·운영 query 증거를 넘긴다.
