# Phase 10D — 대형 Feature 컴포넌트 분해

- 상태: 10D-1~10D-4 로컬 구조 분해 완료 — 고객·살롱 Workspace, 웹·앱 MyPage, 웹·앱 Styler의 controller/view 경계를 독립 유지; 인증 interaction·visual·실기기 증거는 Phase 13 게이트로 유지
- 우선순위: 구조 안정화
- 변경 게이트: `patch`, `breaking` 가능성이 없는 `refactoring`
- 선행 페이즈: Phase 01A, Phase 02A, Phase 10A–10C
- 독립 배포: 각 작업 패키지별로 가능

## 목표

사용자 행동을 바꾸지 않고 대형 feature의 API, 상태 전이, route, dialog, rendering 책임을 분리한다. 행동 변경과 파일 이동을 같은 PR에서 수행하지 않는다.

## 공통 목표 경계

```text
page
  -> auth/route orchestration
feature adapter
  -> customer/salon/API differences
headless controller
  -> async state and commands
view components
  -> plain props and semantic events
```

## 포함 범위

아래 네 작업 패키지의 behavior-preserving 분해와 관련 Passport·회귀 검증만 포함한다.

## 작업 패키지

각 패키지는 별도 diff·검증·rollback 단위다.

### 10D-1 고객 WorkspaceWizard

- [x] `useCustomerGenerationController`
- [x] customer API adapter
- [x] plain-prop step nav
- [x] plain-prop variant grid, status panel
- [x] Zustand 직접 구독 범위 축소

대상: `my-app/components/workspace/WorkspaceWizard.tsx`

### 10D-2 SalonWorkspaceWizard

- [x] `useSalonGenerationController`
- [x] salon consent/visit API adapter
- [x] 고객에게 노출되는 단계·후보 view만 추출
- [x] 살롱 비즈니스 규칙은 feature에 유지

대상: `my-app/components/salon/SalonWorkspaceWizard.tsx`

### 10D-3 MyPageDashboardTabs와 모바일 MyPage

- [x] panel별 파일 분리
- [x] formatter와 route selector 분리
- [x] panel별 AsyncBoundary
- [x] tab 접근성 계약 유지

대상: `my-app/components/mypage/MyPageDashboardTabs.tsx`, `apps/hairfit-app/app/mypage.tsx`

### 10D-4 웹·모바일 Styler

- [x] fetch/controller/modal/view 분리
- [x] quote·receipt는 Phase 03 contract만 사용
- [x] request cancellation과 polling controller 분리

대상: `my-app/app/styler/new/page.tsx`, `apps/hairfit-app/app/styler/new.tsx`

## 제외 범위

- 문구·CTA·상태 전이 변경
- 새로운 variant·기능 추가
- 전역 CSS palette override 삭제
- 공통 DOM/React Native renderer 생성

## Component Passport

- Wizard와 MyPage는 `feature/experimental`을 유지한다.
- plain-prop composite만 재사용 후보가 될 수 있다.
- API client, route param, domain store를 직접 import하면 design-system으로 승격하지 않는다.

## 수용 기준

- 각 패키지 전후 핵심 여정 E2E가 동일하다.
- API 요청 횟수, idempotency key, route, analytics event가 바뀌지 않는다.
- controller와 view의 상태 소유권이 문서화된다.
- view는 plain props로 렌더되고 API client를 직접 호출하지 않는다.
- 고객·살롱 규칙을 억지로 하나의 generic controller로 합치지 않는다.
- 모든 package를 한 번에 합치지 않고 독립적으로 rollback할 수 있다.

## 검증

```powershell
npm run lint
npm run typecheck
npm run build
npm run mobile:sync
# 기존/신규 핵심 여정 Playwright
# 해당 controller contract/interaction test
```

## 롤백·인계

- 파일 이동 중 compatibility re-export를 사용하고 사용처 0 확인 후 제거한다.
- Phase 12A에는 채택된 component namespace와 남은 legacy CSS 사용처를 넘긴다.
- Phase 13 전까지 feature는 `experimental`을 유지한다.

### 2026-07-15 구조 감사

- `WorkspaceWizard` 999줄, `SalonWorkspaceWizard` 1,140줄, `MyPageDashboardTabs` 1,101줄, 웹 Styler new 1,068줄로 분해 필요성은 여전히 유효하다.
- 이번 결과·pagination 행동 변경과 대형 파일 이동을 같은 diff에 넣지 않았다.
- 각 10D-1~4는 API 호출 수와 idempotency key를 고정하는 controller contract test를 먼저 추가한 뒤 독립 rollback 단위로 진행한다.

### 2026-07-17 10D-1 착수

- `WorkspaceStepNavigation`으로 데스크톱·모바일 단계 표시를 추출하고, 단계 활성화 상태와 semantic event만 plain props로 전달한다.
- 새 컴포넌트는 router, API, generation store를 import하지 않으며 `feature` controller로 승격하지 않는 `composite/experimental` 경계를 유지한다.
- `workspace-decomposition:contract:test`가 단계 순서, 금지 의존성, Workspace의 기존 fetch 2회·`runGridPipeline` 1회 명령 소유권을 고정한다.
- 후속 단위에서 command/route 계약을 먼저 확장한 뒤 controller/adapter 경계를 도입하도록 순서를 고정했다.

### 2026-07-17 10D-1 controller/adapter 경계

- `WorkspaceWizard`에서 `useGenerationStore`, `useGenerate`, `useUpload`, `useRouter`, `useSearchParams`, 직접 `fetch`를 제거하고 렌더링·합성 책임만 유지했다.
- `useCustomerGenerationController`가 owner-scoped 이미지 hydration, draft/quote 준비, 단계 전이, 생성 접수, 후보 선택과 route command를 소유한다.
- 25개의 개별 Zustand 구독을 controller 내부의 `useShallow` 단일 selector 경계로 축소했다. 동기 owner snapshot은 기존 계정 전환 fence를 유지하기 위해 controller에서 `getState()`로 확인한다.
- `customerGenerationAdapter`가 개인컬러 조회와 선택 후보 PATCH의 두 HTTP 호출 및 기존 409 오류 문구를 소유한다.
- `workspace-decomposition:contract:test`는 view의 금지 의존성, controller의 단일 store 구독/생성 명령 1회, adapter의 HTTP 호출 2회와 route를 고정한다.
- 다음 독립 단위는 variant grid와 generation/status panel의 plain-prop 추출이다.

### 2026-07-17 10D-1 plain-prop view 완료

- `WorkspaceGenerationSubmission`과 `WorkspaceAcceptedGenerationStatus`가 접수 준비·견적·pipeline overlay와 백그라운드 접수 영수증 UI를 각각 plain props와 semantic command events로 렌더링한다.
- `WorkspaceVariantSelection`이 후보 카드, 선택 상태, 결과/Styler route, 에프터케어 진입 event를 렌더링하며 API·store·router hook을 직접 사용하지 않는다.
- `WorkspaceWizard`에는 헤더, 업로드/개인컬러 안내, 하위 view 조합만 남겼다. 에프터케어 dialog 계약과 사용자 문구·CTA·단계 전이는 변경하지 않았다.
- 두 view의 금지 의존성과 핵심 문구/선택 접근성은 `workspace-decomposition:contract:test`에 추가했다.
- 로컬 타입·린트·정적 계약과 Next production build를 통과했다. 인앱 브라우저의 비인증 `/workspace`는 `/login?redirect_url=%2Fworkspace`로 정상 이동했고 재로드 이후 새 console error는 0건이었다.
- 인증 세션의 업로드→접수→진행→선택 interaction/visual 회귀 증거는 아직 없어 `experimental`을 유지한다.

### 2026-07-17 10D-2 살롱 controller/adapter/view 완료

- `SalonWorkspaceWizard`를 1,168줄에서 456줄의 화면 조합기로 축소하고 직접 `fetch`, `useRouter`, `useUpload`, quote expiry hook을 제거했다.
- `useSalonGenerationController`가 고객 동의·사진·살롱 견적 request fencing·접수·3.5초 상태 polling·CRM 저장과 살롱 전용 방문 필드를 소유한다. 고객 Workspace controller와 generic controller로 합치지 않았다.
- `salonGenerationAdapter`가 고객 조회, 견적, draft, 생성 status/detail, 살롱 추천 접수, CRM confirm의 기존 HTTP 호출 7개와 request body 계약을 소유한다.
- `SalonWorkspaceStepNavigation`과 `SalonWorkspaceVariantGrid`만 plain-prop view로 추출했다. 살롱 결제·동의·방문·기존 사후관리 생성 옵션은 feature/controller에 남겼다.
- `workspace-decomposition:contract:test`가 view 금지 의존성, API 호출 수와 route, quote 재확인, polling, 접수 단계 전이, CRM 저장 필드를 고정한다.
- 타입체크와 generation workflow 45개 계약을 통과했다. 인증된 살롱 오너의 사진→견적→접수→진행→CRM 저장 interaction/visual 증거는 아직 없어 `experimental`을 유지한다.

### 2026-07-17 10D-3 웹·앱 MyPage 분해 완료

- 웹 `MyPageDashboardTabs`를 1,101줄에서 151줄의 헤더·지표·탭·active panel 합성기로 축소하고, 6개 panel과 tab navigation, formatter, subscription selector, route selector를 독립 파일로 분리했다.
- 웹 각 panel은 기존 `id`·`role="tabpanel"`·`aria-labelledby` 연결을 유지한 채 `AsyncBoundary`를 소유한다. server data는 이미 resolve된 props로 전달되므로 현재 빈 상태·문구·CTA 동작은 변경하지 않았다.
- Expo `mypage.tsx`를 691줄에서 188줄로 축소하고, 6개 panel, 네이티브 async boundary, tab navigation, formatter/route selector를 `components/mypage`와 `lib/mypage.ts`로 분리했다.
- Expo tab은 기존 active variant와 route를 유지하면서 `accessibilityRole="tab"`과 selected state를 명시했다. `getMobileMe`, customer dashboard, style profile, account setup 호출 수와 generation/billing route는 정적 계약으로 고정했다.
- `mobile-sync-verify.mjs`는 한 route가 여러 feature 파일로 분해된 구조를 검증하도록 related-file marker를 지원한다. 생성 상세의 stale 이메일 문구 marker는 실제 진행 상태 copy인 `백그라운드 생성 중`으로 교체했다.
- `mypage-decomposition:contract:test` 4/4, 웹 shell 2/2, Expo Jest 52/52, 웹·앱 typecheck·target lint, `mobile:sync` 108/108, Next.js production build와 Expo web/iOS/Android production export를 통과했다. 인증 웹 tab keyboard/viewport와 iOS·Android 실기기 interaction·visual 증거는 Phase 13까지 남긴다.

### 2026-07-19 10D-3 웹 MyPage 탭 후보 안정화

- `MyPageTabNavigation`에 활성 탭만 `tabIndex=0`인 roving tab stop을 적용하고 ArrowLeft·ArrowRight 순환, Home·End 포커스 이동을 추가했다. 링크의 query 보존·Enter 활성화 계약은 유지했다.
- 렌더되지 않은 비활성 panel을 가리키던 `aria-controls`는 활성 탭에만 부여하고, 활성 탭의 `aria-current=page`와 panel label 연결을 고정했다.
- 첫 320/375px 검증에서 662px 탭 목록이 문서 전체를 가로로 미는 문제를 발견했다. navigation과 tablist에 `min-width: 0`·폭 경계를 적용해 문서 overflow 대신 목록 내부 스크롤로 수정했다.
- fail-closed production harness, source 계약 5/5와 Chromium 3/3에서 query 보존·keyboard·active panel, 1024px light·320px light·375px dark visual, overflow 0, axe serious/critical 0을 확인했다. 인증 고객 MyPage의 실제 route 이동·뒤로가기와 screen reader·200% 글자 증거 전에는 `candidate`를 유지한다.

### 2026-07-17 10D-4 웹·앱 Styler 분해 완료

- 웹 새 추천 route를 1,068줄에서 19줄, 세션 route를 531줄에서 7줄로 축소했다. `StylerNewFeature`·`StylerSessionFeature`가 controller와 plain-prop view를 합성하고 헤어 선택 modal, formatter/route/model을 독립 파일로 분리한다.
- Expo 새 추천 route를 806줄에서 5줄, 세션 route를 419줄에서 5줄로 축소했다. `MobileStylerNewFeature`·`MobileStylerSessionFeature`가 API client·photo picker·navigation·화면 렌더링의 소유권을 분리한다.
- 웹 controller는 profile·선택 variant·헤어 목록·추천·생성 요청을 `AbortController`로 정리하고, 세션 controller는 3초 polling timer와 session/quote/generate request sequence를 소유한다. Expo controller는 취소 신호를 받지 않는 API client의 늦은 응답을 요청 ID 무효화로 차단하고 3초 polling을 route 밖에서 소유한다.
- Quote는 양쪽 controller가 `normalizePaidActionQuote`, `outfit_generation`, `customer`, session subject를 계속 검증하며, receipt와 실패 재시도·billing 복귀 route 및 기존 문구/CTA는 변경하지 않았다.
- `styler-decomposition:contract:test` 4/4가 route thin boundary, API 호출 수, Phase 03 Quote context, 웹 abort/polling, 앱 request sequence/polling, modal 접근성과 view 금지 의존성을 고정한다. registry는 Styler feature·session·modal 6개 Passport를 추가해 35개 component/35개 Passport가 파싱된다.
- 기존 paid-action 계약 17/17과 Expo Jest 52/52, `mobile:sync` 108/108, 전체 7개 workspace typecheck, 전체 lint 오류 0(기존 비대상 경고 10), Next.js production build 89/89, Expo web/iOS/Android production export를 통과했다.
- 인증된 320/375px 웹 interaction·visual, iOS/Android modal·사진 권한·polling·연결 종료, durable Styler worker 증거는 Phase 10B/12B/13 게이트로 남긴다.
