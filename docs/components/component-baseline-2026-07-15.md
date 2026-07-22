# HairFit 컴포넌트 기준선 결정 기록

- 관찰일: 2026-07-15
- 브랜치: develop/2026-07-14-generation-completion-notifications
- HEAD: eb77c7f5421b9b8ac44e540e66931573f4097a41
- 작업 트리: dirty
- 범위: 웹 Button·Surface·PipelineStatusIndicator, 네이티브 Button·TextField·AppScreen
- 변경 성격: 문서와 governance 기준선만 추가하며 제품 동작은 바꾸지 않음

이 기록은 HEAD만의 스냅샷이 아니라 2026-07-15 현재 작업 트리의 구현을 관찰한 결과다. 따라서 소스 변경이 커밋되거나 되돌려지면 registry와 Passport도 함께 다시 대조해야 한다.

## 1. 판정

| 컴포넌트 | kind | 상태 | 현재 판정 근거 | stable 전 필수 증거 |
| --- | --- | --- | --- | --- |
| 웹 Button | primitive | candidate | feature 의존 없이 native button 속성과 variant를 전달하며 웹 소스 12개 파일에서 import | loading/busy 계약, interaction test, 시각 회귀, 전용 CSS namespace 또는 명시적 utility 계약 |
| 웹 Surface | layout | candidate | AppPage·Panel·Card 계열이 전역 app-* selector로 웹 소스 23개 파일에서 사용 | polymorphic prop 타입 보강, CSS layer/hidden glow 계약 정리, 반응형 시각 회귀 |
| PipelineStatusIndicator | feedback | experimental | status·progressbar·alert와 reduced motion을 지원하지만 generation PipelineStage에 직접 결합 | 상태 matrix, screen reader와 시각 회귀, 현지화 가능한 label 계약 |
| 네이티브 Button | primitive | candidate | Pressable props, loading, busy/disabled 상태를 전달하고 앱 소스 27개 파일에서 사용 | focused test 통과 기록, iOS/Android interaction·visual 증거, theme 선택 계약 |
| 네이티브 TextField | primitive | candidate | label/helper/error/editable 계약과 오류 live region을 제공하고 앱 소스 11개 파일에서 사용 | non-string label과 helper/error 연결, focused test 통과 기록, iOS/Android 증거 |
| AppScreen | layout | experimental | 패턴·top safe area·scroll·footer를 앱 전용 소스로 분리했지만 모든 화면을 한 ScrollView 정책으로 묶음 | 화면 유형 분리, bottom safe area·keyboard·footer 계약, 실기기 검증, compatibility 제거 계획 |

stable 컴포넌트 수는 0개다. 사용처가 많다는 사실은 candidate 판정 근거일 수 있지만, 접근성·interaction·visual·CSS 계약 증거를 대신하지 않는다.

## 2. 책임 경계

- packages/ui-native는 Button, TextField, Stack처럼 앱 route와 safe area를 모르는 네이티브 primitive를 소유한다.
- apps/hairfit-app/components/app/AppScreen.tsx는 패턴 배경, safe area, scroll, footer 같은 HairFit 앱 셸 정책을 소유한다.
- apps/hairfit-app/lib/ui-native.tsx의 Screen export는 마이그레이션용 compatibility alias다. 새 design-system API로 간주하지 않는다.
- PipelineStatusIndicator는 generation 상태 모델에 직접 의존하므로 공용 feedback primitive가 아니라 feature feedback으로 유지한다.
- 웹 Surface의 app-* selector와 Button이 참조하는 --app-* 토큰은 public style contract다. selector·token 제거는 style-contract 변경으로 다룬다.

## 3. 스캔 기준

집계 대상은 my-app/app, my-app/components, apps/hairfit-app의 app·components·lib, packages/ui-native/src의 소스다.

다음 항목은 재사용 후보 집계와 usage 근거에서 제외한다.

- .open-next, .next, .expo, dist, node_modules
- Android와 iOS build 산출물
- src_legacy_scaffold
- 생성된 bundle과 source map
- route page 파일 자체를 신규 재사용 컴포넌트 후보로 세는 행위

route page에서 registry 대상 컴포넌트를 import하거나 렌더링하는 사실은 usage 근거에는 포함한다.

## 4. 검증 표면 결정

| 목적 | 기준 도구 | 이 기준선의 상태 |
| --- | --- | --- |
| 순수 상태·선택·가격 계약 | Node 내장 test 또는 workspace test | 별도 공통 계약 페이즈에서 실행 결과 기록 |
| 웹 primitive·feedback interaction | 웹 component test와 접근성 검사 | 하네스와 focused test 필요 |
| 네이티브 primitive interaction | jest-expo와 React Native Testing Library | focused 파일은 존재하며 실행 결과는 Phase 01B에서 기록 |
| 웹 route E2E와 responsive baseline | 브라우저 E2E 및 320/375/768/1440px screenshot | 미확보 |
| 네이티브 화면·safe area·keyboard | iOS/Android production bundle과 실기기 smoke | 미확보 |

문서 존재나 정적 문자열 검사는 브라우저·스크린리더·실기기 증거로 대체하지 않는다.

## 5. 변경 게이트

- 이번 registry와 Passport 도입은 promotion-documentation 게이트다. 상태를 stable로 올리는 promotion은 아니다.
- prop 추가는 compatible, focus·loading·disabled·scroll·keyboard 변화는 behavioral로 분류한다.
- app-* selector, --app-* token, variant utility 변경은 style-contract로 분류하고 usage 검색과 시각 검증을 요구한다.
- Screen alias 제거, Surface export/prop 변경, variant 제거는 breaking으로 분류하고 migration note를 요구한다.

## 6. 남은 기준선 공백

- 웹 viewport baseline screenshot과 인증·결제·관리자 계정 기반 화면이 없다.
- iOS/Android safe area, 키보드, footer overlay 실기기 증거가 없다.
- 웹 Button, Surface, PipelineStatusIndicator의 focused test가 없다.
- 네이티브 focused test는 파일 존재와 실제 통과 기록을 분리해 관리해야 한다.
- 전역 CSS는 cascade layer 없이 utility override와 app-* selector가 함께 동작하므로 Phase 12A 전에는 hidden contract를 삭제하지 않는다.
