# Phase 02A — 공통 상태·선택/확정 계약

- 상태: in_progress — 생성·Styler 공통 DTO, 웹·앱 adapter parity, additive 선택 필드 dual-read/write 완료; 에프터케어 DTO·인증 E2E 대기
- 우선순위: 필수 구조 계약
- 변경 게이트: `compatible`, `behavioral`, 필요 시 `breaking`
- 선행 페이즈: Phase 00
- 독립 배포: 호환 adapter와 dual-read가 있으면 가능

## 목표

웹과 앱이 생성 상태, 다음 route, 표시 tone, 선택과 최종 확정을 같은 의미로 해석하게 한다. React 컴포넌트를 공유하는 것이 아니라 DTO, selector, 상태 전이와 호환 규칙을 공유한다.

## 포함 범위

- [x] `GenerationStatus`와 `isGenerationTerminal`, `isGenerationProgressVisible`, `generationDestination` 정의
- [x] status → 사용자 label/tone/progress 의미 selector
- [x] `generated → selected → confirmed` 전이와 허용 명령 정의
- [x] `selectedVariantId`와 `confirmedHairRecord` 역할 분리
- [x] 확정 후 alternate selection을 거절하는 기존 `selection_locked_after_confirmation` 계약 유지
- [x] 기존 status alias와 후보 수를 해석하는 compatibility adapter
- [x] additive DB/public field와 명시적 dual-read·dual-write 기간
- [x] 크레딧 정책 selector와 헤어 사용 가능 횟수 계산을 공통화
- [ ] 생성·Styler·에프터케어 API DTO를 `packages/shared`와 `packages/api-client`에 정렬 — 생성·Styler 완료, 별도 범위 에프터케어 잔여
- [x] shared selector 단위 contract test
- [x] 웹·앱 소비 adapter parity test

## 제외 범위

- `/workspace` redirect
- 실제 selection/confirmation UI 재디자인
- 결제 quote와 차감 실행
- 클라이언트 store를 서버 SSoT로 전환
- DOM과 React Native view 공유

## 목표 구조

```text
packages/shared/src/generation/
  contract.ts
  selectors.ts
  state-machine.ts
packages/shared/src/billing/
  policy-selectors.ts
```

공유 selector는 route 문자열을 반환할 수 있지만 router 객체, React hook, API client를 import하지 않는다.

## 예상 파일

- `packages/shared/src/index.ts`
- `packages/api-client/src/index.ts`
- `my-app/lib/recommendation-types.ts`
- `my-app/lib/fashion-types.ts`
- `my-app/app/api/generations/[id]/route.ts`
- `my-app/store/useGenerationStore.ts`
- `apps/hairfit-app/lib/generation-flow.tsx`

## 호환·migration 전략

1. 새 의미 field와 selector를 additive로 추가한다.
2. 서버가 구형·신형 클라이언트를 함께 지원하는 dual-read/dual-write 기간을 둔다.
3. 기존 데이터는 backfill 또는 읽기 adapter로 해석한다.
4. 웹과 앱 사용처가 전환된 뒤 legacy field 제거를 별도 breaking phase로 승인받는다.

DB enum과 public field를 한 번에 rename하지 않는다.

배포 순서는 `20260717153000_generation_selected_variant_dual_field.sql` 적용 → column-first/JSON-fallback API 배포 → 웹·Expo 호환 버전 보급이다. `options.recommendationSet.selectedVariantId`는 최소 두 개의 호환 릴리스와 30일 mismatch 0 관측이 모두 충족될 때까지 제거하지 않는다. 그 전에는 DB trigger가 구형 JSON-only 쓰기와 신형 column-only 쓰기를 양방향 동기화하고, 한 요청에서 서로 다른 값을 보내면 명시적으로 거절한다.

## 수용 기준

- 같은 API fixture가 웹과 앱에서 같은 terminal 판정, label, tone, 다음 route를 만든다.
- `selected`를 사용자 문구에서 `확정`으로 부르지 않는다.
- `confirmedHairRecord`가 있을 때만 selection lock으로 판정한다.
- 확정 후 query string이나 stale store가 다른 variant를 표시하지 못한다.
- 모바일 사용 가능 횟수 계산에 `/5` 같은 비용 하드코딩이 필요 없다.
- 기존 데이터와 직전 앱 버전이 호환된다.

## 검증

```powershell
npm run typecheck
npm run build
npm run mobile:sync
npm run portone:audit
npm run portone:confirmation:test
# 신규: shared generation/state selector contract test
```

## 2026-07-15 진행 증거

- 생성 계약: `packages/shared/src/generation/contract.ts`
- 패션 세션 표시 계약: `packages/shared/src/styling/contract.ts`; `recommended`를 생성 `queued`와 분리
- 과금 selector: `packages/shared/src/billing/policy-selectors.ts`
- 부분 완료: DB `completed`와 후보 수를 조합해 `partial`/전체 실패 표시를 유도하고 recovery route를 유지
- contract test: 상태 route·가격·부분 완료·Styler 상태·선택 잠금 5/5 통과
- 모바일 채택: 홈과 마이페이지의 label/tone/route, 플랜의 서버 `creditPolicy`
- 미완료: 웹의 모든 생성·Styler·에프터케어 DTO를 shared로 이전, 확정 후 stale query 차단 E2E

## 2026-07-17 생성·Styler DTO와 parity 후속

- generation start/draft/accept/status/detail/selection response와 Styler profile/recommend/generate/list/session response를 `packages/shared`의 공통 wire DTO로 정의하고 `packages/api-client`의 중복 inline DTO를 제거했다.
- raw fetch를 쓰는 웹은 오류 envelope DTO를, 오류 응답을 예외로 바꾸는 Expo API client는 required success DTO를 사용한다. 웹의 구체 `AIEvaluationResult`는 generic DTO parameter로 보존해 shared의 `unknown`으로 약화하지 않았다.
- `resolveGenerationResultSelection`은 `confirmedHairRecord`만 잠금 근거로 삼는다. 확정 후 stale query variant와 존재하지 않는 query variant를 거절하며 웹 결과와 Expo 진행·결과 화면이 같은 resolver를 사용한다.
- 웹 결과 화면에 남아 있던 독자적 `requestedVariantId` fallback도 제거해 서버 선택이 없는 경우 stale query가 다시 표시되는 우회 경로를 막았다.
- shared 36/36, result UX·adapter parity 7/7, Expo 100/100, 7-workspace typecheck와 변경 범위 lint 오류 0을 확인했다. 별도 Next production build는 `BUILD_ID=jjPltgocS6BE1p9EyGq6R`를 생성했다.
- 별도 범위인 에프터케어 DTO 정렬과 인증 브라우저 stale query 재진입은 잔여 게이트다.

## 2026-07-17 additive 선택 필드 후속

- `generations.selected_variant_id`를 nullable additive field로 추가하고 기존 `options.recommendationSet.selectedVariantId`를 backfill했다. legacy JSON은 삭제하거나 rename하지 않았다.
- DB trigger는 JSON-only 구형 클라이언트와 column-only 신형 클라이언트의 쓰기를 양방향으로 동기화한다. 동시 상충 값과 recommendation variants에 없는 ID는 저장 전에 거절하며, 두 저장 위치가 일치한다는 검증된 check constraint를 둔다.
- generation detail API는 공개 column을 우선 읽고 legacy JSON으로 fallback한다. 응답에는 additive `selectedVariantId`를 노출하고 PATCH는 column과 JSON을 함께 쓴다. 확정 record가 있을 때의 `selection_locked_after_confirmation` 동작은 유지한다.
- 정적 result UX·호환 계약 10/10, shared 36/36, Expo 100/100, 전체 workspace typecheck와 변경 파일 lint가 통과했다. 최종 API fallback까지 포함한 별도 Next production build는 `BUILD_ID=w3g_S68p5bCajZn2546O0`를 생성했다. 임시 PostgreSQL 18.4에서는 기존 3행 backfill, trigger·validated constraint를 확인하고 JSON-only/column-only write, 상충 값·미등록 variant 거절 smoke를 transaction rollback으로 통과했다.
- root와 `my-app` migration SHA-256은 `B02D78B5934E7B845B8D6915BA3A3C7EF4EDDDDCD54C55A179EB658529D6981A`로 일치한다. 원격 migration 적용과 30일 mismatch telemetry는 아직 수행하지 않았다.

## 롤백·인계

- legacy field를 즉시 삭제하지 않아 신형 selector 채택만 되돌릴 수 있어야 한다.
- Phase 02B, 03, 07, 10A–10C에 DTO, selector, compatibility 기간을 넘긴다.
