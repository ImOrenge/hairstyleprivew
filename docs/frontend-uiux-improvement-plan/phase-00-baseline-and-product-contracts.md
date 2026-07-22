# Phase 00 — 기준선과 제품 계약 확정

- 상태: in_progress — 컴포넌트 registry·Passport·상태/가격/선택/잠금/알림 fixture 기준선 작성, 인증 시각·실기기 기준선은 계속 진행
- 우선순위: 필수 선행
- 변경 게이트: `promotion`, `compatible`, 문서·테스트 기반
- 선행 페이즈: 없음
- 독립 배포: 사용자 행동 변경 없이 가능

## 목표

후속 작업이 서로 다른 의미를 구현하지 않도록 상태, 과금, 실패, 알림, 검증 기준을 먼저 고정한다. 이 페이즈는 기능을 고치는 단계가 아니라 현재 행동과 목표 계약을 비교 가능한 증거로 만드는 단계다.

## 반드시 확정할 제품 계약

- `selectedVariantId`: 변경 가능한 대표 스타일 선택
- `confirmedHairRecord`: 시술 계획 확정과 선택 잠금의 서버 근거
- Styler 자격: `selected`만 필요한지 실제 `confirmed`가 필요한지 한 가지로 결정
- 고객 확정과 살롱 방문 확정은 별도 도메인 상태로 유지
- 헤어 10, Styler 20, 첫 에프터케어 무료·추가 30크레딧
- 전체 실패, 부분 성공, 무료 재시도, 환불·복구 정책
- `acceptedAt`: 원본 저장, 과금 승인 또는 예약, 내구성 Workflow 접수가 모두 끝난 시점
- 살롱 작업의 `billingScope`와 비용 부담 계정
- 필수 완료 채널은 이메일, Native push는 선택 확장

## 포함 범위

- [x] `docs/plan-benefit-credit-policy-design.md`와 실제 서버 상수·ledger reason 대조
- [x] 생성 상태·route와 크레딧 추정 fixture 작성
- [x] 선택·잠금·알림 fixture를 독립 데이터 fixture로 분리하고 웹 알림 legacy 호환 매핑까지 공통 계약에 연결
- [x] 고객 웹, 모바일, 살롱, 관리자 핵심 route/state matrix 작성
- [x] `Button`, `Surface`, native `Button`, `TextField`, `AppScreen`, `PipelineStatusIndicator` Passport 초안
- [x] 공식 validator 입력과 맞춘 `docs/components/component-registry.json` registry
- [x] `.open-next`, `src_legacy_scaffold`, route page를 재사용 컴포넌트 집계에서 제외하는 스캔 기준
- [ ] 현재 320/375/768/1024/1440px 공개 웹 screenshot baseline은 확보, 인증 웹과 iOS/Android 핵심 화면 baseline은 미확보
- [x] 테스트 도구 선택 기록: 순수 계약, 웹 interaction, native interaction, 웹 E2E, 실기기 smoke
- [x] 현재 알림 브랜치 commit과 migration·Worker·메일 계약을 기준선에 기록

## 제외 범위

- 사용자 문구·route·결제·생성 동작 변경
- 컴포넌트 `stable` 승격
- UI 리디자인 또는 전역 CSS 삭제
- migration 적용, 외부 서비스 배포

## 예상 파일

- `docs/frontend-uiux-flow-component-architecture-analysis-2026-07-14.md`
- `docs/plan-benefit-credit-policy-design.md`
- `docs/mobile-port-map.md`
- 신규 `docs/components/component-registry.json`
- 신규 `docs/components/passports/*`
- 신규 계약 fixture와 검증 script

## 수용 기준

- 모든 후속 페이즈가 참조할 상태·가격·실패·알림 결정에 미정 표시가 없다.
- 현재 동작을 재현하는 fixture와 최소 자동 검사가 존재한다.
- 현재 `stable` 컴포넌트는 0개로 기록하고 승격 조건을 명시한다.
- 시각 baseline을 얻지 못한 화면은 이유와 필요한 계정·환경을 기록한다.
- 기준선 작성 때문에 제품 행동이 바뀌지 않는다.

## 검증

현재 명령의 실제 범위를 기록하면서 실행한다.

```powershell
npm run lint
npm run typecheck
npm run build
npm run mobile:sync
npm run portone:audit
npm run portone:contract:test
npm run portone:confirmation:test
```

실패는 숨기지 않고 known baseline과 새 회귀로 분류한다.

## 2026-07-15 진행 증거

- registry: `docs/components/component-registry.json`
- 판정 기록: `docs/components/component-baseline-2026-07-15.md`
- 제품 계약·route matrix: `docs/frontend-uiux-product-contract-baseline-2026-07-15.md`
- Passport: `docs/components/passports/*.yaml`
- 현재 판정: `candidate` 7개, `experimental` 35개, `stable` 0개
- 독립 fixture: `packages/shared/src/fixtures/generation-selection.ts`, `generation-selection-lock.ts`, `generation-notification.ts`
- 자동 계약: shared 상태·가격·선택·잠금·알림·인증·과금·살롱 계약 37/37, native primitive 2/2, generation Workflow 계약 58/58
- 알림 호환 계약: durable outbox 7상태를 fixture가 전부 한 번씩 포함하며 `retry_wait`·`dead_letter`·`delivery_unknown`의 legacy `failed` 매핑과 `delivery_unknown` 자동 재발송 금지를 검증한다.
- 공개 웹 baseline: `tests/web-e2e/__screenshots__/public-ui.spec.ts`의 5개 viewport 이미지와 [검증 기록](web-public-e2e-baseline-2026-07-17.md)
- 미완료: 인증 웹 viewport, iOS/Android 실기기 baseline, 알림 migration·Worker·메일 운영 증거

## 롤백·인계

- 문서·fixture·test harness만 추가하므로 코드 동작 롤백은 없다.
- 후속 페이즈에는 확정된 계약 문서, fixture, Passport 상태, baseline 증거 위치를 넘긴다.
- 제품 결정이 바뀌면 Phase 00 문서와 해당 계약 test를 먼저 갱신한 뒤 후속 구현을 바꾼다.
