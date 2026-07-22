# Phase 12A — 전역 CSS 계약 축소

- 상태: 로컬 구현·검증 완료 — palette compatibility override 동결 유지
- 우선순위: 구조 안정화
- 변경 게이트: `style-contract`, `deprecation`
- 선행 페이즈: Phase 01A, Phase 10D
- 독립 배포: selector 묶음별로 가능

## 목표

Tailwind palette class를 전역 `!important`로 재해석하는 숨은 계약을 의미 컴포넌트와 token 계약으로 단계적으로 옮긴다. 전면 삭제나 시각 리디자인은 하지 않는다.

## 포함 범위

- [x] `globals.css` token, `.app-*`, palette override, specificity inventory
- [x] selector·class·CSS variable 사용처 `rg` 검색
- [x] layer order와 component/feature namespace 문서화
- [x] Button, Surface, Dialog, InlineAlert, FormField부터 semantic variant 채택
- [x] `data-variant`, `data-tone`, `data-state`, ARIA selector 계약
- [x] `PointerGlowProvider`의 문자열 selector 결합 완화
- [x] 하드코딩 stone/white 등 theme 우회 값 token화
- [x] 사용처가 0이고 visual baseline을 통과한 override만 제거
- [x] deprecated selector와 migration note 기록
- [x] 각 변경의 dark/light·breakpoint visual regression

## 제외 범위

- 새 브랜드·색상·타이포그래피 디자인
- `!important` 일괄 삭제
- feature behavior 변경
- 사용처 검색 없이 class rename

## 예상 파일

- `my-app/app/globals.css`
- `my-app/components/providers/PointerGlowProvider.tsx`
- `my-app/components/ui/*`
- Phase 01A Passport와 registry
- 신규 visual baseline/test

## 실행 순서

1. 현재 CSS 계약과 usage snapshot을 고정한다.
2. 채택된 semantic component 사용처만 새 selector로 이동한다.
3. visual regression을 통과한다.
4. legacy selector 사용처가 0인지 다시 확인한다.
5. 해당 selector만 제거하고 deprecation 기록을 갱신한다.

## 수용 기준

- 각 삭제 selector에 사용처 0과 visual 증거가 있다.
- dark/light와 320/375/768/1440px에서 의도하지 않은 변화가 없다.
- primitive가 feature CSS를 import하거나 feature selector에 의존하지 않는다.
- runtime 측정값 외 inline style을 새로 늘리지 않는다.
- global token과 variant/state contract가 Passport에 기록된다.

## 검증

```powershell
npm run global-css:contract:test
npm run typecheck
npm --prefix my-app run lint -- --max-warnings=20
npm run build
```

## 롤백·인계

- selector 묶음별 commit으로 되돌릴 수 있어야 한다.
- legacy compatibility layer는 사용처 0 확인 전 삭제하지 않는다.
- Phase 12B와 13에 final CSS contract와 visual baseline을 넘긴다.

### 2026-07-15 inventory 증거

- `globals.css`는 1,154줄, `!important` 42회, `.app-*` selector match 43회, `data-variant/tone/state` selector 4회다.
- palette compatibility override는 804줄 이후 `bg-white/stone`, `text-stone/white`, amber/rose/emerald 계열을 전역 token으로 재해석한다.
- 사용처 0과 dark/light·breakpoint visual diff가 없는 selector가 아직 증명되지 않아 override를 삭제하지 않았다.
- 다음 작업은 Button/InlineAlert/Dialog/FormField consumer를 semantic data selector로 옮기는 묶음부터 별도 style-contract diff로 수행한다.

### 2026-07-17 구현·검증 증거

- `globals.css`는 1,127줄로 축소됐고 `!important`는 기존과 동일한 42회다. palette compatibility override는 시각 기준선이 충분하지 않아 동결 상태로 유지했다.
- 사용처가 0인 `.app-panel-muted`, `.app-card-plain`, `.app-inverse-card-strong`, `.app-status` 네 selector만 제거했다.
- `Button`, `Surface`, `Dialog`, `InlineAlert`, `FormField`가 `data-variant`, `data-surface`, `data-tone`, `data-state`, ARIA 상태를 명시한다.
- `PointerGlowProvider`는 legacy class 이름 목록 대신 `[data-pointer-glow="surface"]` 계약만 사용한다. legacy surface consumer에는 해당 의미 attribute를 이행했다.
- semantic danger foreground의 하드코딩 white를 `--app-on-danger` token으로 옮겼다.
- [전역 CSS 계약](../components/global-css-contract.md)에 layer 순서, namespace, 상태 attribute, deprecated selector, palette override 동결, migration 규칙을 기록했다.
- `npm run global-css:contract:test` 4/4, 전체 workspace `npm run typecheck`, web lint, Next production build가 통과했다.
- `/privacy-policy`를 light/dark 각각 320/375/768/1440px에서 확인했다. 모든 폭에서 `scrollWidth === clientWidth`, overflow offender 0이었고 모바일·데스크톱 화면에서 의도하지 않은 레이아웃·색상 회귀가 없었다.
- Phase 12B에는 이 계약과 baseline을 넘기며, 동결된 palette compatibility override의 추가 삭제는 별도 시각 증거가 있을 때만 수행한다.
