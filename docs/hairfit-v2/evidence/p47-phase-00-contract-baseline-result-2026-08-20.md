# P47 Phase 00 계약 기준선 구현 결과

- 기준일: 2026-08-20
- 브랜치: `feat/2026-08-12-discovery-scroll`
- 통합 대상: `develop/2026-08-08-hairfit-v2-backend`
- 시작 HEAD: `72b442045112c52c52dfa34dfb0e29526801f0d6`
- 구현 상태: 로컬 계약 기준선 완료
- 원격 DB·실인증·provider·배포: `not_run` — P47 범위 아님

## 구현 결과

- Hair 3×3·9개 생성 불변식과 AI primary decision 계약 추가
- Hair `9 accepted + 9 terminal + eligible primary + confirmed revision` 완료 predicate 추가
- Hair 추가 질문 예산 1개, fingerprint·revision·supersede 검증 추가
- legacy Fashion 9-slot과 분리된 Adaptive Fashion `3 | 6 | 9` 계약 추가
- Fashion `2/3`, `5/6`, `8/9` 미완료 판정과 3개 단위 확장 계약 추가
- 온보딩 Fashion 정책, 상담 context, immutable 합성 snapshot 계약 추가
- Fashion Product Truth source·offer·snapshot·eligibility 계약 추가
- P46 기능 플래그 6개를 기본 OFF로 등록하고 `.env.local.example`에 명시
- 기존 Hair preview board의 `requestedCount: 9`와 기존 Fashion 9-slot 타입은 변경하지 않음
- DB migration은 추가·변경하지 않음

## 검증 결과

| 검증 | 결과 |
|---|---|
| 신규 Hair/Fashion/Product/Personalization 단위 테스트 | PASS |
| `npm --prefix packages/shared test` | PASS — 153/153 |
| `node --test my-app/lib/consulting/p46-feature-flags.test.ts` | PASS — 2/2 |
| `npm --prefix my-app run consulting:contract:test` | PASS — 112/112 |
| `npm run typecheck` | PASS — Web, Native, API client, shared 포함 |
| `npm run lint` | PASS |

## 종료 기준 판정

- [x] Hair와 Fashion requested-count validator가 별도 타입·테스트로 존재한다.
- [x] Hair 신규 완료조건이 `9 accepted/terminal + AI primary + confirmed revision`으로 고정됐다.
- [x] legacy shortlist completion과 신규 AI primary completion은 별도 계약이다.
- [x] 기능 플래그는 값이 없을 때 모두 OFF이며 exact `true`만 활성화한다.
- [x] revision·fingerprint·supersede·source ID 불변식이 validator로 검증된다.
- [x] 기존 migration 파일을 P47에서 수정하지 않았다.
- [x] 기존 shared·consulting 회귀 테스트가 통과했다.
- [x] 실상품 provider나 원격 실행을 구현 완료로 오표시하지 않았다.

## 변경 파일

- `packages/shared/src/consulting/hair-recommendation.ts`
- `packages/shared/src/consulting/fashion-generation.ts`
- `packages/shared/src/consulting/fashion-personalization.ts`
- `packages/shared/src/consulting/fashion-product-truth.ts`
- 위 계약의 단위 테스트 4개
- `packages/shared/src/index.ts`
- `packages/shared/package.json`
- `packages/shared/src/v2/feature-flags.ts`
- `my-app/lib/consulting/feature-flag.ts`
- `my-app/lib/consulting/p46-feature-flags.test.ts`
- `my-app/.env.local.example`

## 인계

P48은 `HairRecommendationDecisionV1`, `HairRankedPreviewV1`, `HAIR_GRID_ROLES`, 9안 batch invariant와 `CONSULTATION_HAIR_RANKER_SHADOW_ENABLED`를 사용한다. P48은 실제 preview board 9개가 accepted 상태가 된 뒤에만 최종 rank decision을 만들 수 있다.

이 결과는 로컬 계약 기준선 증거다. 실 이미지 provider 품질, 실사용자 인증, 원격 migration, Canary를 증명하지 않는다.
