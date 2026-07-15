# P2. Pilot Content & Sample Experience 상세 구현 계획

- 상태: planned
- 선행조건: P1 Exit Gate, 샘플 자산 사용 권리 승인
- 대상: D-AI-SIM, D-FACE, D-MEN, D-WOMEN
- 출력: C-03, C-04, S-04, Q-02, Q-03, Q-04
- 다음 Phase: [P3 Trust & Funnel Measurement](./phase-03-trust-funnel-measurement.md)

## 1. 목표와 비범위

검색 의도가 다른 4개 정적 랜딩에서 HairFit의 “사진 한 장으로 9가지 후보 비교” 경험을 샘플로 이해시키고 기존 `/workspace` 생성 플로우로 연결한다.

비범위:

- 랜딩 안에서 실제 사진 업로드·생성·결제 완료
- 사용자 생성물을 공개 샘플로 사용
- 근거 없는 얼굴형 점수·정확도·시술 보장
- 4개 페이지에 slug만 바꾼 동일 카피 복제

## 2. 페이지별 메시지 계약

| Page ID | Primary intent | Audience/문제 | 고유 증거 | Primary CTA |
| --- | --- | --- | --- | --- |
| D-AI-SIM | AI 헤어스타일 시뮬레이션 | 컷 전 여러 후보를 비교 | 3×3 전체 보드 | 9가지 헤어 비교하기 |
| D-FACE | 얼굴형 헤어스타일 | 얼굴형과 후보 관계를 이해 | 얼굴형별 설명+동일 인물 비교 | 얼굴형 기준으로 비교하기 |
| D-MEN | 남자 헤어스타일 시뮬레이션 | 남성 스타일 후보를 빠르게 비교 | 승인된 남성 sample set | 남자 스타일 비교하기 |
| D-WOMEN | 여자 헤어스타일 시뮬레이션 | 길이·앞머리 후보를 비교 | 승인된 여성 sample set | 여자 스타일 비교하기 |

각 message map은 audience, problem, outcome, proof, CTA, objection을 모두 가진다. “완벽”, “100%”, “실패 없음”, “실제 시술과 동일”은 금지한다.

## 3. 변경 파일

| 작업 | 경로 | 변경 |
| --- | --- | --- |
| P2-W01 | `my-app/lib/discovery/sample-manifests.ts` | C-03 승인 샘플 |
| P2-W02 | `my-app/lib/discovery/evidence-registry.ts` | C-04 증거·만료·상태 |
| P2-W03 | `my-app/lib/discovery/discovery-pages.ts` | 4개 message/sections/links |
| P2-W04 | `my-app/components/discovery/DiscoveryHero.tsx` | Hero와 CTA |
| P2-W05 | `my-app/components/discovery/SampleComparison.tsx` | 3×3 샘플 비교 |
| P2-W06 | `my-app/components/discovery/TrustSummary.tsx` | 결과·사진 처리 한계 |
| P2-W07 | `my-app/components/discovery/RelatedDiscoveryPages.tsx` | crawlable 내부 링크 |
| P2-W08 | `my-app/components/home/*` | 기존 홈 데모의 공용 primitive 추출 |
| P2-W09 | `my-app/public/discovery/*` | 승인된 정적 샘플 |
| P2-W10 | `docs/search-benchmark/reports/*` | Q-02/Q-03/Q-04 |

## 4. 자산과 증거 계약

```ts
interface DiscoverySampleManifest {
  id: string;
  status: "review" | "approved" | "expired" | "revoked";
  sourceType: "commissioned" | "licensed-stock" | "generated-demo";
  licenseRef: string;
  consentRef?: string;
  expiresAt?: string;
  original: DiscoveryImageAsset;
  grid: readonly DiscoveryImageAsset[]; // exactly 9
  shareImage: DiscoveryImageAsset;
  fallbackManifestId?: string;
}

interface MarketingEvidence {
  id: string;
  status: "draft" | "verified" | "revoked";
  claimType: "product-capability" | "policy" | "testimonial" | "metric";
  statement: string;
  sourceRef: string;
  verifiedAt: string;
  expiresAt?: string;
  owner: string;
}
```

Gate:

- grid는 정확히 9개이며 original과 동일 인물·승인된 변형 집합
- 경로는 `/public/discovery` 내부이고 원격 임의 URL 금지
- 모든 asset에 width, height, alt, format, bytes 기록
- evidence `verified`가 아니면 published page가 참조할 수 없음
- expired/revoked 자산은 fallback 없이는 build 실패

## 5. 작업 패키지

### P2-W01. 홈 데모 primitive 추출

현재 Hero의 3×3 데모에서 데이터와 표시 컴포넌트를 분리한다. 홈의 카피·레이아웃을 discovery가 역으로 제어하지 않도록 공용 primitive는 이미지 보드와 선택 상태만 담당한다.

회귀 기준:

- 홈의 초기 성별 탭, 이미지 순서, 링크 목적지가 유지됨
- 홈이 새 discovery registry 때문에 동적 DB 호출을 추가하지 않음
- 공용 컴포넌트가 랜딩별 H1·CTA·proof를 하드코딩하지 않음

### P2-W02. 샘플 경험

- 서버 렌더링으로 첫 sample 이미지와 설명을 제공
- 탭/선택 같은 최소 상호작용만 client island로 구현
- 3×3 이미지는 viewport 밖 lazy load, 정확한 `sizes` 사용
- 키보드 focus와 선택 상태를 텍스트로 전달
- 이미지 실패 시 크기가 유지되고 alt/fallback 제공

### P2-W03. CTA source 전달

모든 CTA는 allowlist된 `/workspace`를 사용하고 `landing_id`, `intent_id`, `cta_id`를 보존한다. P3 전에는 분석 전송을 하지 않더라도 URL 또는 first-party session handoff 계약을 먼저 고정한다.

```ts
interface DiscoveryHandoff {
  landingId: DiscoveryPageId;
  intentId: string;
  ctaId: "hero-primary" | "sample-primary" | "final-primary";
  sampleId?: string;
}
```

민감한 referrer, 이미지 URL, prompt는 query parameter로 전달하지 않는다. `/workspace`가 알 수 없는 parameter를 안전하게 무시하거나 읽는지 통합 테스트한다.

### P2-W04. 내부 링크

hub→4개 page, 각 page→2개 이상의 관련 page, home→hub 또는 대표 page의 crawlable `<a>`를 구성한다. 동일 primary intent 링크는 보조 설명이 있을 때만 연결하고 canonical 경쟁을 만들지 않는다.

### P2-W05. 카피·신뢰 검토

각 페이지의 copy inventory(title, description, H1/H2/H3, CTA, alt, FAQ)를 보고서에 저장한다. 사진 삭제·보존 문구는 현재 구현과 정책을 검증한 뒤 evidence ID로 참조한다. 제품에서 확인되지 않은 무료 횟수는 하드코딩하지 않고 plan display SSoT를 사용하거나 제거한다.

## 6. Browser Gate

| 환경 | 시나리오 | 통과 조건 |
| --- | --- | --- |
| 360×800 | 첫 진입, CTA focus | 정체성·가치·CTA·다음 섹션 힌트, overflow 0 |
| 390×844 | 3×3 선택 | 손가락·키보드 조작, 선택 상태 안내 |
| 768×1024 | FAQ·related links | focus 순서와 anchor 정상 |
| 1440×900 | Hero→demo hierarchy | 과도한 빈 공간·card nesting 없음 |
| JS 실패 | source content | 핵심 카피·링크·첫 sample 접근 가능 |
| image 실패 | fallback | layout shift 없이 alt 표시 |

각 finding은 ID, P0~P3, area, evidence, fix, status를 가진다. P0/P1을 수정한 뒤 같은 시나리오를 다시 실행한다.

## 7. Performance Gate

- mobile LCP 목표 2.5초 이하
- CLS 0.1 이하
- INP 목표 200ms 이하
- Hero priority image는 viewport당 1개
- client JS 증가분을 build report에 기록
- 샘플 이미지별 byte budget과 전체 첫 viewport budget을 Q-03에 확정

baseline과 같은 환경이 아니면 절대값과 함께 환경 차이를 기록한다. budget 초과는 소유자·완화책·기한이 없는 상태로 승인하지 않는다.

## 8. 테스트와 명령

```powershell
npm --prefix my-app run search:discovery:audit
npm --prefix my-app run lint
npm run typecheck
npm --prefix my-app run build
```

추가 테스트:

- manifest 정확히 9개·중복 ID·dangling file 검출
- revoked evidence 참조 시 실패
- 4페이지 title/H1/FAQ fingerprint 중복 경고
- CTA handoff 값이 workspace까지 유지
- 모든 related page가 published이고 reciprocal graph가 고립되지 않음

## 9. 출시·롤백

4개 페이지를 동시에 공개하지 않고 `D-AI-SIM`을 canary로 검증한 뒤 나머지 3개를 묶는다. 롤백은 registry status를 `review`로 바꾸고 sitemap에서 제거한다. 공유 자산 결함이면 manifest를 fallback으로 교체한다. 이미 노출된 URL은 redirect/noindex 결정을 Q-04에 명시한다.

## 10. Exit Gate

- [ ] 4개 페이지가 고유 message map·evidence·sample을 가짐
- [ ] 자산 권리·alt·crop·fallback 검토가 승인됨
- [ ] 홈 데모 회귀 없음
- [ ] Q-01, Q-02, Q-03 통과
- [ ] P0/P1 finding 0건
- [ ] CTA handoff가 workspace까지 보존되고 민감정보가 없음
- [ ] Q-04가 pilot 공개 또는 보류 결정을 명시함
