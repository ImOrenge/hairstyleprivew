# Phase 01A — 웹 피드백 UI 기반

- 상태: in_progress — 공통 컴포넌트·수동 overlay 전환·운영 Dialog 기반 리뷰/Styler/자동 공지 Playwright interaction·axe와 공개 visual·실제 Clerk 로그인·회원가입 진입 기준선 완료, 로그인 완료 뒤 인증 데이터 화면·실제 스크린리더 검증 대기
- 우선순위: 구조 기반
- 변경 게이트: `behavioral`, `compatible`, `style-contract`, `promotion`
- 선행 페이즈: Phase 00
- 독립 배포: 대표 사용처 1개만 적용한 뒤 가능

## 목표

기능마다 따로 만든 dialog, 오류, 비동기 상태, form field를 접근성 있는 공통 계약으로 만든다. 후속 과금·관리자·결과 개선이 각자 focus와 오류 처리를 다시 구현하지 않게 하는 것이 목적이다.

## 포함 범위

- [x] 웹 전용 `typecheck` script 추가
- [x] 웹 Playwright component interaction·axe·keyboard·visual regression 하네스 추가
- [x] `Dialog`: 초기 focus, focus trap, ESC, focus restore, scroll lock, title/description
- [x] `ConfirmActionDialog`: 대상, 변경 전후 값, 위험도, 확인 문구 slot
- [x] `AsyncBoundary`: loading, ready, empty, error의 상호 배타 상태
- [x] `InlineAlert`: info/success/warning/error와 live-region 계약
- [x] `FormField`: label, description, error, required, disabled 연결
- [x] blocking dialog 우선순위와 한 번에 하나만 여는 modal coordinator 계약
- [x] App Router `loading.tsx`, `error.tsx`, `not-found.tsx`의 최소 계약
- [x] 각 컴포넌트 Passport와 `candidate` 상태 기록
- [x] 하나의 저위험 dialog와 하나의 조회 panel에 대표 적용

## 제외 범위

- 기존 7개 dialog 전면 교체
- 대형 Wizard·MyPage·Styler 파일 분해
- 전역 palette override 일괄 삭제
- 과금·환불·권한 비즈니스 로직 변경

## 목표 경계

```text
page/feature controller
  -> semantic props
Dialog | ConfirmActionDialog | AsyncBoundary | InlineAlert | FormField
  -> native HTML semantics + global token/CSS contract
```

공통 컴포넌트는 API client, route param, Zustand store, feature schema를 직접 import하지 않는다.

## 예상 파일

- `my-app/components/ui/Button.tsx`
- `my-app/components/ui/Surface.tsx`
- 신규 `my-app/components/ui/Dialog.tsx`
- 신규 `my-app/components/ui/AsyncBoundary.tsx`
- 신규 `my-app/components/ui/InlineAlert.tsx`
- 신규 `my-app/components/ui/FormField.tsx`
- `my-app/app/globals.css`
- `my-app/package.json`
- 신규 interaction/a11y test

## 수용 기준

- keyboard로 dialog 진입·순환·ESC·닫은 뒤 원래 trigger 복원이 가능하다.
- 구독 안내와 계정 설정처럼 자동 dialog 두 개가 동시에 쌓이지 않는다.
- loading, empty, error가 동시에 렌더되지 않는다.
- field error가 label과 input에 연결되고 오류 요약에서 해당 field로 이동할 수 있다.
- 컴포넌트의 variant/state selector와 CSS namespace가 Passport에 기록된다.
- 대표 적용 화면은 변경 전 사용자 행동을 유지한다.
- 새 컴포넌트는 `candidate`이며 `stable`로 표기하지 않는다.

## 검증

```powershell
npm run lint
npm run build
npm run web:e2e:build
npm run web:e2e
npm --workspace my-app run typecheck
```

Dialog는 실제 브라우저 keyboard 확인까지 필요하다. unit 또는 snapshot만으로 완료하지 않는다.

## 2026-07-15 진행 증거

- 구현: `Dialog`, `ConfirmActionDialog`, `AsyncBoundary`, `InlineAlert`, `FormField`
- 대표 적용: 사진 업로드 가이드 `FaceGuideOverlay`를 공통 `Dialog`로 전환
- 고위험 적용: 관리자 회원 권한·크레딧과 환불 화면 2곳이 `ConfirmActionDialog`의 target/before/after/typed slot을 공유
- 전역 경계: `app/loading.tsx`, `app/error.tsx`, `app/not-found.tsx`
- CSS 계약: `.c-dialog-*`, `.c-inline-alert-*`, `.c-async-boundary-*`, `.c-form-field-*`
- 자동 검증: 웹 typecheck, lint, production build, `admin-high-risk:contract:test`의 Dialog focus trap·ESC·restore·ARIA 정적 계약 통과
- 미완료: 자동 interaction/axe harness, 인증 자동 공지 순서와 관리자·리뷰·Styler 실제 keyboard/스크린리더 증거

## 2026-07-17 수동 overlay 전환 증거

- `PortoneSubscriptionButton`의 웨잇리스트·로그인 모달, `AccountSetupPromptModal`, `FeedbackModal`, `StylerHairSelectionModal`을 공용 `Dialog`로 전환했다. `ActionToolbar`의 재생성 확인은 이미 `ConfirmActionDialog`를 사용하고 있어 문서의 잔여 대상으로만 잘못 남아 있었다.
- `Dialog`에 `sm/md/lg/xl` `size`와 `data-size` style contract를 추가했다. Styler의 넓은 선택 화면은 `xl`을 사용하고 feature 내부 ESC listener·`role="dialog"`·backdrop 구현을 제거했다.
- Styler의 목록 조회는 `AsyncBoundary`로 loading/error/empty/ready 우선순위를 단일화했고 선택 항목에 `aria-pressed`를 적용했다. 이 화면이 조회 panel 대표 적용이다.
- 리뷰 폼은 native radio group, `FormField`, `InlineAlert`를 채택했다. 리뷰·웨잇리스트 응답은 raw server message 대신 상태 코드 기반 사용자 안전 문구를 사용한다.
- `dialog-accessibility:contract:test` 8/8, `global-css:contract:test` 4/4, 대상 lint, 전체 workspace typecheck, Next production build가 통과했다.
- 공개 가격 화면의 Basic 웨잇리스트 Dialog에서 최초 닫기 버튼 focus, Shift+Tab/Tab 순환, ESC 닫기, trigger link focus 복원, body scroll lock/unlock을 확인했다.
- 320/375/768/1024/1440px에서 document와 dialog body 가로 overflow가 없었다. 320px에서 긴 플랜명이 form grid 최소폭을 밀던 문제를 발견해 control `min-width: 0`, select truncation, dialog `overflow-x: hidden`으로 수정한 뒤 다시 확인했다.
- `useCoordinatedModal`은 구독 결제 공지(priority 200)를 계정 설정 안내(priority 100)보다 먼저 노출하고, 닫힌 요청을 제외한 다음 요청을 자동으로 활성화한다. 순수 우선순위·동순위 request order 계약은 2개 단위 테스트로 고정했다.
- 남은 종료 게이트는 인증 홈에서의 공지 → 계정 설정 통합 순서, 인증 관리자 화면과 실제 스크린리더 검증이다.

## 2026-07-17 공개 웹 자동 E2E 증거

- [공개 웹 UI E2E 기준선](web-public-e2e-baseline-2026-07-17.md)과 production Playwright 15/15를 추가했다. 공개 reduced-motion, B2B 보안 token 만료·요청 단절 복구와 로그인·회원가입 안전 fallback axe를 포함한다.
- 별도 `playwright.auth.config.ts`는 `localhost:3101` Next 개발 런타임에서 테스트 Clerk 인스턴스의 실제 로그인·회원가입 폼을 로드한다. axe·keyboard field order·상호 인증 링크·320/375px overflow와 4개 screenshot을 8/8로 검증한다.
- 홈·B2B 문의·개인정보처리방침·이용약관의 axe serious/critical 위반 0, 자동 공지 ESC·skip link·데모 tablist·FAQ keyboard interaction을 확인한다.
- 320/375/768/1024/1440px screenshot baseline과 overflow 검사를 저장소에 고정했다.
- axe가 찾은 푸터 대비와 후기 scroll region keyboard 문제를 수정했고 B2B 전체 입력을 보이는 `FormField` label로 전환했다.
- 이는 로그인 완료 뒤 Workspace·결과·결제·관리자·살롱 화면, 실제 screen reader·200% 확대·실기기 증거를 대체하지 않는다.

## 2026-07-18 운영 Dialog 상호작용 E2E 증거

- 테스트 전용 `/e2e-harness/dialogs`는 `E2E_UI_HARNESS_ENABLED=true` 빌드에서만 열리고, 그 외 환경에서는 `notFound()`로 닫힌다. 검색 노출도 `noindex, nofollow`로 차단한다.
- 복제 마크업이 아니라 운영 `SubscriptionPaymentNoticeModal`, `AccountSetupPromptModal`, `FeedbackModal`, `StylerHairSelectionModal`을 직접 조합한다.
- 구독 공지(priority 200)가 계정 설정(priority 100)보다 먼저 하나만 열리고, ESC로 닫은 뒤 계정 설정이 이어지는 실제 렌더 순서를 확인했다.
- 리뷰는 최초 닫기 focus, 키보드 별점·후기 입력, 저장 성공 live 안내, ESC 닫기와 trigger focus 복원을 통과했다. Styler는 키보드 카드 선택, 선택 완료 status, 재진입 `aria-pressed=true`, 닫힌 뒤 trigger focus 복원을 통과했다.
- 리뷰·Styler·`ConfirmActionDialog` 범위의 axe serious/critical 위반은 0건이며, 320px light·375px dark Styler 도달성까지 포함한 전체 production Playwright는 21/21, Dialog 정적 계약은 11/11, E2E Next build는 static 97/97로 통과했다.
- `ConfirmActionDialog`는 확인 문구가 맞기 전 실행 잠금, 처리 중 버튼 비활성·`aria-busy`, ESC/닫기 차단, 완료 뒤 trigger focus 복귀와 live status를 실제 브라우저에서 통과했다.
- 이 하네스는 운영 컴포넌트 상호작용 증거지만, 실제 인증 홈 데이터·관리자 작업·VoiceOver/NVDA 같은 스크린리더 증거는 아니다.

## 롤백·인계

- 기능 화면은 대표 사용처부터 단계적으로 채택하고 기존 dialog를 한 번에 삭제하지 않는다.
- rollback 시 공통 컴포넌트 채택만 되돌리고 비즈니스 상태는 보존한다.
- Phase 04, 10A–10D, 11B–11C에 public API와 Passport를 넘긴다.
