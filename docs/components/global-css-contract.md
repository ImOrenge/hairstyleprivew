# HairFit 전역 CSS 계약

- 적용일: 2026-07-17
- 소유자: `web-ui`
- 변경 게이트: `style-contract`, `deprecation`

## 순서와 소유권

`globals.css`는 token/theme → element 기본값과 compatibility utility → `@layer components`의 semantic component → 임시 legacy alias → 동결된 palette compatibility override 순서로 관리한다. 기능 전용 selector는 해당 기능 가까이에 두며 primitive가 feature selector를 참조하지 않는다.

| namespace | 역할 | 신규 사용 |
| --- | --- | --- |
| `c-*` | 의미 컴포넌트와 그 내부 element | 허용, 기본값 |
| `app-*` | 기존 화면 호환 alias | 금지, 기존 사용처만 축소 |
| `hf-*` | 초기 웹 alias | 금지, 제거 전 사용처 검색 필수 |
| feature-local | 특정 기능의 레이아웃과 상태 | 기능 폴더 안에서만 허용 |

## 의미 속성 계약

| 컴포넌트 | selector/속성 | 값 |
| --- | --- | --- |
| Button | `.c-button[data-variant]` | `primary`, `secondary`, `ghost`, `inverse` |
| Button | `data-state` | `enabled`, `disabled`, `loading` |
| Surface | `.c-surface[data-surface]` | `page`, `panel`, `card`, `inverse`, `inverse-card` |
| Surface/Dialog | `data-pointer-glow` | 포인터 효과 대상은 `surface` |
| Dialog | `data-state`, `data-dismissible` | `open`; `true`, `false` |
| InlineAlert | `data-tone`, `data-state` | `info`, `success`, `warning`, `danger`; `visible` |
| FormField | `data-state` | `ready`, `invalid`, `disabled` |

ARIA는 스타일 속성의 대체물이 아니다. Dialog는 `role=dialog`, `aria-modal`, label/description 연결을 유지하고, InlineAlert는 위험도에 따라 `status/polite` 또는 `alert/assertive`와 원자적 갱신을, FormField는 `aria-invalid`, `aria-errormessage`, `aria-describedby`와 오류의 `polite`·원자적 갱신을 사용한다.

## Legacy selector 폐기 기록

2026-07-17 usage audit와 light/dark·320/375/768/1440px 기준선 확인 대상으로 `app-panel-muted`, `app-card-plain`, `app-inverse-card-strong`, `app-status`를 runtime CSS에서 제거했다. 새 코드는 이 이름을 다시 만들지 않는다. 동일 표현이 필요하면 `Surface` variant 또는 의미 컴포넌트를 사용한다.

`app-page`, `app-panel`, `app-card`, `app-inverse`, `app-inverse-card`, `hf-page`, `hf-panel`, `hf-panel-inverse`는 아직 호환 alias다. 사용처 0과 화면 기준선이 모두 확보되기 전에는 제거하지 않는다.

## 동결 영역

`globals.css` 후반의 Tailwind palette compatibility override와 기존 `!important` 42개는 시각 기준선 없이 수정하거나 확대하지 않는다. 새 컴포넌트는 stone/white palette class 대신 `--app-*` token을 사용한다. 현재 의미 컴포넌트의 위험 동작 텍스트는 `--app-on-danger`로 token화했다.

## 검증과 마이그레이션

1. selector와 token 사용처를 `rg`로 확인한다.
2. `npm run global-css:contract:test`, `npm run typecheck`, `npm run lint`, `npm run build`를 통과한다.
3. light/dark 각각 320/375/768/1440px에서 overflow, 대비, surface 경계, focus 상태를 확인한다.
4. legacy class를 지울 때는 같은 변경에서 semantic component/속성으로 옮기고 폐기 기록을 갱신한다.
