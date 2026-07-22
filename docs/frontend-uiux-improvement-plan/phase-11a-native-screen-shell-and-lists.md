# Phase 11A — 네이티브 화면 셸·폼·목록

- 상태: 부분 로컬 구현 — Expo Router root `Stack`, 상태바·상하 safe area·`VirtualizedListScreen`·keyboard-safe `FormScreen`·역할별 지속 navigation·고위험 Android back·대표 폼 오류 focus와 공용 primitive 큰 글씨 계약, 36개 route migration map과 비-에프터케어 `AppScreen` 직접 이행을 로컬 적용; 에프터케어 `Screen` alias 2개·실기기 계약은 미완료
- 우선순위: P1
- 변경 게이트: `behavioral`, `breaking`
- 선행 페이즈: Phase 01B, Phase 05
- 독립 배포: 화면 그룹별로 가능

## 목표

모든 화면을 하나의 ScrollView로 처리하는 구조를 목적별 셸로 나누고, safe area, status bar, keyboard, Android back, 긴 목록을 기기 계약으로 해결한다.

## 목표 셸

- `PageScaffold`: safe area, status bar, 역할별 navigation
- `ScrollScreen`: 짧은 읽기 화면
- `FormScreen`: KeyboardAvoidingView, submit footer, 오류 focus
- `VirtualizedListScreen`: FlatList/SectionList, refresh, pagination

## 포함 범위

- [x] 고객·살롱·관리자 역할별 지속 navigation과 공통 계정·로그아웃 진입 — Expo Router root `Stack`이 상세 화면과 back stack을 소유하고 바깥 `RoleNavigationScaffold`가 역할별 tablist를 지속 노출한다. 실제 역할 계정·실기기 검증은 미완료
- [x] hidden StatusBar 정책 제거 또는 화면별 명시
- [x] top/bottom safe area와 홈 인디케이터 대응
- [x] keyboard avoidance와 submit footer — `FormScreen`과 로그인 대표 화면 적용, 나머지 form migration·실기기 검증은 미완료
- [x] Android hardware back와 modal/back stack 계약 — 업로드·생성·결제·Styler 대표 고위험 흐름과 네이티브 modal 로컬 적용, Android 실기기 검증은 미완료
- [x] 긴 목록을 FlatList/SectionList로 이전 — 관리자 회원·살롱 고객 대표 목록
- [x] pull-to-refresh와 offline → online refresh — 대표 목록의 수동 복구 경로
- [ ] 200% 글자 크기와 dynamic type — 공용 텍스트·입력·버튼·밀집 Row/Metric의 확대 대응과 단위 계약은 적용, iOS/Android 200% 실기기 여정은 미검증
- [x] 36개 Expo route의 화면 그룹별 migration map과 `Screen`/`FormScreen`/`VirtualizedListScreen` compatibility wrapper·TS/Metro 동일 alias 계약

## 제외 범위

- 결제·생성·살롱 비즈니스 규칙 변경
- UI package 원천 재정의
- 모든 화면을 한 번에 교체
- native theme 전면 리디자인

## 예상 파일

- `apps/hairfit-app/app/_layout.tsx`
- `apps/hairfit-app/lib/ui-native.tsx`
- 신규 `apps/hairfit-app/components/app/*`
- customer/salon/admin list·form screens
- `packages/ui-native/src/index.tsx`

## migration 순서

1. 읽기 전용 짧은 화면
2. 단일 form 화면
3. 고객 기록 목록
4. 살롱·관리자 긴 목록
5. 생성·결제처럼 상태가 복잡한 화면

각 그룹은 별도 실기기 smoke 후 다음으로 진행한다.

## 수용 기준

- iPhone 홈 인디케이터와 Android navigation bar가 CTA를 가리지 않는다.
- 키보드가 마지막 field와 submit CTA를 가리지 않는다.
- Android back이 앱을 예기치 않게 종료하거나 결제를 재실행하지 않는다.
- 100개 이상 목록이 virtualized되고 현재 위치·선택을 유지한다.
- 200% 글자 크기에서도 핵심 CTA와 label이 잘리지 않는다.
- 고객·살롱·관리자 영역에서 계정과 로그아웃으로 이동할 수 있다.

## 검증

```powershell
npm run typecheck
npm run mobile:sync
# 신규: Expo production bundle
# 신규: native shell/component tests
```

최소 iPhone 1대와 Android 1대에서 keyboard, back, safe area, 큰 글씨, offline, 긴 목록을 확인한다.

### 2026-07-15 로컬 구현 증거

- root `StatusBar hidden`을 제거하고 `AppScreen`이 top/bottom safe area를 소유하도록 바꿨다.
- `AppScreen scroll={false}` 계약을 추가해 FlatList 화면에 ScrollView가 중첩되지 않게 했다.
- Expo 관리자 회원·살롱 고객 목록을 FlatList, refresh control, load-more로 이전했다.
- 목록은 현재 노출 수/전체 수를 분리하고 오류 후 다시 시도할 수 있다.
- 7-workspace typecheck와 대상 ESLint는 통과했다. iOS/Android home indicator, keyboard, hardware back, 200% 글자 크기는 실기기 종료 게이트로 남는다.

### 2026-07-17 FormScreen 대표 적용 증거

- `FormScreen`을 `AppScreen scroll={false}` 위에 구성해 iOS `padding`, Android `height` keyboard avoidance를 플랫폼 계약으로 분리했다.
- 본문은 독립 `ScrollView`로 유지하고 제출 footer를 같은 `KeyboardAvoidingView`의 일반 흐름에 배치해 절대 위치 footer와 키보드가 겹치지 않게 했다.
- 로그인·회원가입 화면의 주 제출 CTA를 `FormScreen` footer로 이전하고 Google 인증·이메일 인증 코드·인증 복귀 규칙은 그대로 유지했다.
- `form-screen.test.tsx`에서 본문·footer·field 노출, 제출 interaction, 증가하는 요청 토큰에 따른 첫 오류 field focus를 검증한다. iOS/Android 실기기의 실제 키보드 높이와 200% 글자 크기는 종료 게이트로 남는다.
- Expo 앱 Jest 54/54, 7-workspace typecheck, 전체 lint 오류 0(기존 경고 10), mobile sync 108/108, web/iOS/Android production export를 통과했다. 실기기 runtime 검증은 아직 확보하지 않았다.

### 2026-07-17 역할별 지속 navigation 로컬 구현

- root `Slot`을 `RoleNavigationScaffold`로 감싸 고객 4개, 살롱 3개, 관리자 4개의 역할별 주요 경로를 지속 노출한다.
- 탭 전환은 `router.replace`를 사용해 주요 화면 왕복이 Android back stack에 반복해서 쌓이지 않게 했다.
- `/account`를 고객·살롱·관리자 공통 계정 화면으로 추가해 현재 역할, 계정 정보, 역할 홈, 고객 상세 설정, 로그아웃에 접근할 수 있다.
- 인증, 생성·결과, Styler, 결제, 퍼스널컬러, 에프터케어, 살롱 매칭은 집중 작업 또는 이번 범위 제외 화면이므로 지속 navigation을 숨긴다.
- 공용 `Button`이 소비자가 전달한 `accessibilityRole="tab"`을 덮어쓰던 문제를 수정하고, 역할·경로 판정과 selected tab·route replace interaction을 Jest로 고정했다.
- Expo 앱 Jest 58/58, 7-workspace typecheck, 전체 lint 오류 0(기존 경고 10), mobile sync 126/126, web/iOS/Android production export를 통과했다.
- 실제 고객·살롱·관리자 Clerk 계정, Android hardware back 실기기 동작, iOS/Android 200% 글자 크기와 하단 safe area는 실기기 종료 게이트로 남는다.

### 2026-07-18 Expo Router root Stack 전환

- root layout의 직접 `Slot`을 Expo Router `Stack`으로 교체하고 앱 shell이 헤더를 소유하므로 navigator header는 숨겼다. 역할별 tablist는 Stack 바깥의 `RoleNavigationScaffold`에 유지되어 상세 화면 전환과 지속 navigation의 책임이 겹치지 않는다.
- Push·network recovery·generation flow provider는 Stack 바깥에 한 번만 설치해 화면 교체로 상태가 초기화되지 않는다. 주요 역할 탭은 기존처럼 `replace`, 상세 기능은 각 화면의 `push`/안전 back 계약을 유지한다.
- `root-router-layout.test.ts`가 Stack 소유권·Slot 제거·provider 순서를 고정하고 mobile sync가 root Stack marker를 검사한다. Expo 전체 32 suites·145/145, 앱 typecheck·quiet lint, mobile sync 259/259와 Web 1,071·iOS 1,350·Android 1,372 modules production export가 통과했다. 실제 Android gesture/3-button back과 역할별 iOS/Android 화면 전환은 실기기 종료 게이트다.

### 2026-07-17 Android 고위험 back stack 로컬 구현

- `useSafeBackNavigation`이 화면 focus 중 Android `hardwareBackPress`를 구독하고, visible back CTA도 동일한 history-or-fallback 또는 replace 계약을 사용한다.
- 사진 보안 업로드·생성 접수·결제 서버 검증·헤어 결과 열기/재시도·Styler 저장/추천/생성 중에는 뒤로가기를 소비하고 현재 작업 상태 안내를 갱신한다.
- 생성 접수 완료·생성 상태·Styler·결제 검증 완료 화면은 `router.replace` 기반 안전 복귀를 사용해 비워진 업로드 상태나 오래된 결제 callback이 back stack에서 다시 열리지 않게 했다.
- PortOne 결제창을 닫으면 준비된 주문과 복구 정보는 보존하고, 기존 주문의 서버 상태를 확인하도록 안내한다.
- `AccountSetupModal`과 `MobileStylerHairSelectionModal`은 Android `onRequestClose`를 닫기 동작에 연결하고 accessibility escape도 같은 동작을 사용한다.
- `safe-back-navigation.test.ts`가 history, fallback, blocked, screen-consumed, replace 5개 결정 계약을 검증한다. Android 실기기의 시스템 back·PortOne SDK·modal 우선순위는 종료 게이트로 남는다.
- Expo 앱 Jest 63/63, 7-workspace typecheck, 전체 lint 오류 0(기존 경고 10), mobile sync 153/153, web/iOS/Android production export를 통과했다.

### 2026-07-17 인증 오류 focus·대표 dynamic type 로컬 구현

- `FormScreen`에 consumer `TextInput` ref와 증가형 focus 요청 토큰 계약을 추가해 같은 field 오류가 반복되어도 첫 오류로 다시 이동한다.
- 로그인·회원가입은 비어 있는 필드가 있어도 CTA를 숨겨 비활성화하지 않고 제출 시 모든 필수 오류를 표시한 뒤 첫 오류를 focus한다. Clerk 오류는 email/password/code별 안전 문구로 매핑하며 raw provider message를 노출하지 않는다.
- `TextField`는 실제 `TextInput` ref를 전달하고 helper/error를 `aria-describedby`·`aria-errormessage`로 연결한다.
- 공용 텍스트·입력·버튼은 글자 확대를 허용하고, `Row`와 `MetricTile`은 큰 font scale 또는 좁은 폭에서 세로로 재배치한다.
- 단위·화면 계약은 로컬 테스트로 고정했지만 iOS/Android 200% 글자 크기, TalkBack/VoiceOver 읽기 순서와 실제 키보드 focus 이동은 종료 게이트로 남는다.
- Expo 앱 Jest 78/78, 7-workspace typecheck, 전체 lint 오류 0(기존 경고 10), mobile sync 182/182, Next production build와 Expo web/iOS/Android export를 통과했다.

### 2026-07-18 화면 migration map·긴 목록 셸

- `native-screen-migration.ts`가 `_layout`을 제외한 Expo route 36개를 `route-alias`, `short-scroll`, `form`, `virtualized-list`, `complex-flow`로 빠짐없이 분류한다. 비-에프터케어 22개 `AppScreen` 소유자를 직접 이행해 현재 판정은 alias 4, compatibility 2, migrated 30이다.
- `VirtualizedListScreen`이 `AppScreen scroll={false}`와 `FlatList`의 단일 scroll ownership을 캡슐화한다. 관리자 B2B·수신함·회원·리뷰와 살롱 고객 목록 5개를 직접 이행했으며 기존 refresh·cursor·empty/error/footer 계약은 그대로 전달한다.
- `@hairfit/ui-native` 앱 bridge는 `Screen`, `FormScreen`, `VirtualizedListScreen` rollback export를 유지한다. TypeScript path와 Metro resolver가 같은 bridge를 가리키고 primitive subpath만 package 원천을 사용한다.
- route 파일 완전성·중복 0·실제 shell owner·긴 목록 중첩 ScrollView 금지·alias 일치를 정적 테스트로, FlatList header/item 전달을 interaction 테스트로 고정했다. `Screen` alias는 이번 목표에서 제외한 에프터케어 목록·상세 2개에만 남기고 bridge rollback export는 제거하지 않았다. 집중 migration Jest 4/4, 전체 Expo Jest 115/115, 7-workspace typecheck, 앱 lint 오류 0(제외 범위 에프터케어 경고 1), `mobile:sync` 246/246, registry 44/44를 통과했다. Expo production export도 Web 1,058·iOS 1,337·Android 1,360 modules로 통과했으며 실기기 검증은 후속 게이트다.

### 2026-07-18 bottom safe area·keyboard·hardware back 후속 계약

- `AppScreen`은 고정 CTA 유무에 따라 bottom safe area 소유자를 외부 셸 또는 footer로 하나만 선택한다. 일반·목록 scroll owner에는 iOS 자동 keyboard inset, 플랫폼별 dismiss, handled tap 정책을 공통 적용했다.
- `FormScreen`의 KeyboardAvoidingView와 생성·업로드·결제·Styler의 focus-scoped Android hardware back 차단을 함께 재검증했다. 집중 셸·back Jest 11/11, Expo 전체 130/130, 앱 typecheck·quiet lint, mobile sync 246/246, registry/passport 45/45와 Web 1,063·iOS 1,343·Android 1,366 modules production export가 통과했다.
- 이 로컬 계약은 실제 iPhone 홈 인디케이터·Android gesture/3-button navigation·제조사별 키보드 resize 증거를 대체하지 않으므로 컴포넌트 상태는 `experimental`을 유지한다.

## 롤백·인계

- compatibility wrapper와 `native-screen-migration.ts`의 화면별 `rollbackExport`로 이전 셸로 돌아갈 수 있어야 한다.
- Phase 11C와 12B에 scaffold API와 실기기 matrix를 넘긴다.
