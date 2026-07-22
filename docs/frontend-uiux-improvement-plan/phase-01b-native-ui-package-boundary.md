# Phase 01B — 네이티브 UI 패키지 경계

- 상태: in_progress — 소스·test·bundle 경계 구현 완료, iOS/Android 실기기 확인 대기
- 우선순위: 구조 기반
- 변경 게이트: `breaking`, `behavioral`, `promotion`
- 선행 페이즈: Phase 00
- 독립 배포: 호환 export 유지 시 가능

## 목표

`@hairfit/ui-native`의 실제 package와 앱 내부 bridge에 중복된 `Screen`·Provider·테마 구현을 하나의 책임 구조로 정리한다. 이 페이즈는 전체 화면을 새 셸로 바꾸지 않고 package 원천과 호환 경계만 안정화한다.

## 포함 범위

- [x] `apps/hairfit-app/tsconfig.json` alias와 실제 package resolution 분석
- [x] package는 Button, TextField, Stack, Chip 같은 순수 native primitive만 소유
- [x] 패턴 배경·safe area·footer는 앱 전용 `AppScreen`, status bar와 navigation은 Expo Router layout 책임으로 정의
- [x] `apps/hairfit-app/lib/ui-native.tsx`의 compatibility export와 제거 순서 기록
- [x] 사용되지 않는 Header context와 `showHeader` API deprecation
- [x] React Native 0.83.6과 package peer range 정합화
- [x] native Button에 Pressable props, `accessibilityLabel`, `accessibilityState`, `testID`, loading 전달
- [x] TextField에 label, helper, error, disabled 접근성 계약
- [x] native component test와 Expo production bundle 검사 하네스 추가
- [x] 모바일 앱과 공통 package용 lint script를 추가해 `lint:all` 범위를 실제 전체 workspace로 확장
- [x] Passport와 `candidate`/`experimental` 상태 기록

## 제외 범위

- 전체 Expo route의 `Screen` 전면 교체(현재 `Screen` alias 소비 파일 29개)
- 역할별 Stack/Tabs 구축
- FlatList, keyboard avoidance, bottom safe-area migration
- 시각 테마 전면 변경

## 예상 파일

- `apps/hairfit-app/tsconfig.json`
- `apps/hairfit-app/lib/ui-native.tsx`
- `packages/ui-native/src/index.tsx`
- `packages/ui-native/package.json`
- `apps/hairfit-app/app/_layout.tsx`
- 신규 `apps/hairfit-app/components/app/AppScreen.tsx`
- 신규 native component test와 bundle script

## 호환 전략

1. package primitive public API를 먼저 확정한다.
2. 앱 bridge는 새 package와 `AppScreen`을 re-export하는 compatibility layer로 축소한다.
3. 화면 import를 단계적으로 package/AppScreen으로 이동한다.
4. 사용처가 0이 된 뒤 alias와 deprecated export를 별도 breaking change로 제거한다.

alias 제거와 전체 `Screen` 교체를 같은 배포에서 하지 않는다.

## 수용 기준

- primitive 구현 원천이 하나이고 package peer 범위가 앱 버전과 호환된다.
- `showHeader`와 Header context는 실제 소비 계약 또는 명시적 deprecation 상태를 가진다.
- Button과 TextField 접근성 props가 wrapper에서 유실되지 않는다.
- 기존 화면은 호환층을 통해 동일하게 빌드된다.
- Expo production bundle 또는 동등한 bundle 검사가 통과한다.
- `Screen`은 아직 `experimental`, primitive는 검증 수준에 따라 `candidate`다.

## 검증

```powershell
npm run typecheck
npm run mobile:sync
# 신규: native component interaction/a11y test
# 신규: Expo production bundle check
```

최소 Android와 iOS 한 화면에서 theme, safe area, button, field를 수동 확인한다.

## 2026-07-15 진행 증거

- 앱 셸 원천: `apps/hairfit-app/components/app/AppScreen.tsx`
- 호환층: `apps/hairfit-app/lib/ui-native.tsx`는 package primitive와 앱 `AppScreen` re-export만 유지
- package primitive: `packages/ui-native/src/index.tsx`
- native interaction: jest-expo + RNTL 2/2 통과
- 정적 검증: 앱·package typecheck, ESLint 오류 0개
- production export: Expo web/iOS/Android 모두 통과
- 미완료: 실제 iOS/Android에서 top/bottom safe area, keyboard, loading button, field error 수동 확인

## 롤백·인계

- compatibility export를 유지한 채 package resolution만 되돌릴 수 있어야 한다.
- Phase 06, 10B–10C, 11A에 안정화된 primitive API와 migration map을 넘긴다.
