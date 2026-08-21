# P50 — Phase 03 Fashion Product Truth·Freshness

- 기준일: 2026-08-20
- 상태: 로컬 구현 완료, 실 provider·원격 DB·배포 검증 대기
- 상위 아키텍처: [P46](./p46-ai-led-hair-commerce-fashion-personalization-architecture-2026-08-20.md)
- 선행 페이즈: [P49 — Hair 9안·AI Primary UX](./p49-phase-02-hair-nine-preview-primary-ux-cutover-2026-08-20.md)
- 후속 페이즈: [P51 — 온보딩 Fashion 개인화](./p51-phase-04-onboarding-fashion-personalization-ranker-2026-08-20.md)
- 범위: 실제 구매 가능 상품 source, offer 정규화, freshness, provenance, 품절 대체
- 증거 상태: 로컬 계약·fixture·RLS·fresh migration 통과; 공급자 계약·실데이터·원격 DB는 not_run

## 1. 목표

Fashion 추천을 추상 스타일명이나 뉴스 키워드가 아니라 국내에서 구매 가능성이 검증된 실제 상품 offer에 연결한다. 상품 진실 계층과 트렌드 신호 계층을 분리해 AI가 브랜드·가격·재고·링크를 창작하지 못하게 한다.

```text
공식·검증 판매자 source
  → 정규화 offer
  → 국내 배송·사이즈·재고·seller trust eligibility
  → immutable offer snapshot
  → Fashion rank·look plan
  → 생성 이미지와 실제 상품 카드 분리 표시
```

## 2. 포함·제외 범위

### 포함

- 공식 API·제휴 feed·판매자 제공 catalog adapter registry
- 상품·variant·seller·price·availability·shipping 정규화
- source freshness와 stale exclusion
- 추천 시점 immutable offer snapshot
- 링크 진입 직전 재검증과 품절·가격변동 대체
- 상품 이미지 권리·출처·제휴 표시
- 관리자 rebuild, source health, quarantine

### 제외

- robots/약관을 무시한 무단 scraping
- 제휴 계약이 없는 상품 이미지 재호스팅
- 실제 재고·가격을 영구 보장한다는 표현
- Fashion 이미지가 실제 상품을 픽셀 단위로 재현한다는 보장
- trend news를 product availability로 취급
- 개인화 ranker와 생성 UI 구현

## 3. Source 신뢰 계층

허용 순서:

1. 브랜드·판매자의 공식 product API
2. 계약된 affiliate·commerce partner feed
3. 판매자가 제공한 정형 catalog export
4. 운영자가 권리와 freshness를 확인한 수동 catalog

검색 결과, 뉴스 RSS, 소셜 게시물은 trend signal로만 사용할 수 있으며 `productUrl`, price, availability의 진실 source가 될 수 없다.

source registry는 다음을 가진다.

```ts
interface FashionProductSourceV1 {
  sourceId: string;
  sourceType: "official-api" | "partner-feed" | "seller-export" | "verified-manual";
  sellerId: string;
  territory: string[];
  refreshSlaMinutes: number;
  imageUsagePolicy: "link" | "licensed-cache" | "none";
  affiliateDisclosureRequired: boolean;
  enabled: boolean;
  lastHealthyAt: string | null;
}
```

## 4. 상품·offer 계약

```ts
interface FashionProductOfferV1 {
  schemaVersion: "fashion-product-offer-v1";
  offerId: string;
  sourceId: string;
  sellerId: string;
  sellerProductId: string;
  canonicalProductId: string;
  brandName: string;
  productName: string;
  category: string;
  colorFamily: string[];
  materialTags: string[];
  sizeSystem: string;
  availableSizes: string[];
  price: { amount: number; currency: "KRW" };
  listPrice: { amount: number; currency: "KRW" } | null;
  availability: "in-stock" | "low-stock" | "out-of-stock" | "unknown";
  shipsToKorea: boolean;
  productUrl: string;
  imageUrl: string | null;
  observedAt: string;
  expiresAt: string;
  sourceFingerprint: string;
}

interface FashionOfferSnapshotV1 extends FashionProductOfferV1 {
  snapshotId: string;
  capturedForConsultationId: string;
  recommendationRevision: number;
  immutable: true;
}
```

추천 eligibility:

```text
enabled source
AND trusted seller
AND shipsToKorea
AND availability in {in-stock, low-stock}
AND user-compatible size exists
AND observedAt within source SLA and platform maximum freshness
AND productUrl passes allowlisted host validation
```

기본 platform freshness 상한은 24시간으로 시작하되 source SLA가 더 짧으면 짧은 값을 사용한다. 최종 값은 실제 partner SLA와 운영 측정 후 정책 버전으로 확정한다.

## 5. 현재값과 과거 snapshot 분리

- `fashion_product_offers_v2`: 현재 관측값, source refresh로 갱신 가능
- `fashion_product_offer_snapshots_v2`: 상담 추천 당시 값, immutable
- report는 snapshot의 가격·재고·확인 시각을 표시
- 구매 링크를 누르기 직전 current offer를 재조회
- current가 stale·품절·size unavailable이면 원 snapshot을 지우지 않고 replacement revision을 제안

가격이 바뀐 경우 현재 가격과 `추천 당시 가격`을 구분한다. 과거 report를 최신 가격으로 조용히 덮어쓰지 않는다.

## 6. 수집·정규화 파이프라인

```text
source fetch
  → signature/auth 검증
  → raw schema validation
  → category/color/material/size normalization
  → URL host·image rights 검증
  → dedupe and canonical product mapping
  → freshness/stock state
  → current offer upsert
  → source health metric
```

- raw payload 전체를 장기 저장하지 않는다. 감사에 필요한 redacted receipt와 hash만 보존한다.
- adapter 오류가 다른 source의 offer를 중단시키지 않는다.
- 반복 오류 source는 quarantine하고 신규 추천에서 제외한다.
- refresh task는 lease·retry·idempotency를 가진다.

## 7. API·관리 기능

### 고객·상담 API

- `GET /api/v2/consultations/:id/fashion/offers`
- `POST /api/v2/consultations/:id/fashion/offers/revalidate`
- `POST /api/v2/consultations/:id/fashion/offers/:snapshotId/replace`

### 관리자 API

- `POST /api/admin/fashion/product-sources/:sourceId/rebuild`
- `GET /api/admin/fashion/product-sources/:sourceId/health`
- `POST /api/admin/fashion/product-sources/:sourceId/quarantine`

관리 route는 Clerk role과 server-side authorization을 모두 검증한다. 고객 API는 consultation owner만 snapshot을 읽을 수 있다.

## 8. 정확한 변경 지도

### 수정·분리

- `my-app/lib/fashion-catalog.ts`
- `my-app/lib/fashion-trend-research.ts`
- `my-app/lib/fashion-recommendation-generator.ts`
- `my-app/lib/fashion-types.ts`
- 기존 admin fashion rebuild route와 cycle 조회

### 신규 후보

- `packages/shared/src/consulting/fashion-product-truth.ts`
- `my-app/lib/fashion-product-source-registry.ts`
- `my-app/lib/fashion-product-offer-server.ts`
- `my-app/lib/fashion-product-freshness.ts`
- `my-app/lib/capabilities/fashion-product-source-service.ts`
- `my-app/app/api/v2/consultations/[consultationId]/fashion/offers/route.ts`
- product source admin routes

### DB

- `fashion_product_sources_v2`
- `fashion_products_v2`
- `fashion_product_offers_v2`
- `fashion_product_offer_snapshots_v2`
- `fashion_product_source_runs_v2`

실제 테이블명과 index는 구현 시 schema inventory 후 확정하며, 기존 migration 파일은 수정하지 않는다.

## 9. 보안·권리·표시

- provider credential은 server-only 환경변수와 secret store에서만 읽는다.
- product URL은 HTTPS와 source allowlist를 강제한다.
- affiliate 링크와 경제적 이해관계를 고객 카드에 표시한다.
- 상품 이미지의 사용 권리가 없으면 원격 링크도 UI에 표시하지 않는다.
- 판매자·브랜드가 제공하지 않은 설명을 사실처럼 생성하지 않는다.
- 상품 추천과 시뮬레이션 이미지를 별도 카드로 구분한다.
- `재고·가격은 확인 시각 이후 변경될 수 있음`을 표시한다.

## 10. 기능 플래그와 롤백

- `FASHION_PRODUCT_TRUTH_ENABLED`

OFF:

- 신규 실상품 look plan 접수를 중단
- 기존 추상 추천 경로는 legacy adapter로 유지
- 이미 저장된 offer snapshot과 report는 read-only로 표시
- source refresh task를 별도 운영 플래그로 중단 가능

롤백이 snapshot, 외부 link receipt, usage 기록을 삭제하지 않는다.

## 11. 구현 순서

1. 공급자 사용권·SLA·영역·이미지 정책을 source registry에 등록한다.
2. shared offer schema와 URL·freshness validator를 구현한다.
3. 첫 adapter 하나를 end-to-end로 구현한 뒤 다중 source로 확장한다.
4. current offer와 immutable snapshot 저장을 분리한다.
5. eligibility와 stale exclusion을 Fashion ranker 앞단에 연결한다.
6. 표시 시점과 링크 직전 revalidation·replacement를 구현한다.
7. source health·quarantine·관리 rebuild를 구현한다.
8. flag OFF와 provider 장애 복구를 검증한다.

## 12. 검증 계획

### 계약·정책

- official/partner 외 source 거부
- null brand·URL·price·observedAt offer 거부
- stale·품절·한국 배송 불가·호환 사이즈 없음 제외
- URL allowlist와 unsafe redirect 거부
- 동일 source item dedupe와 fingerprint replay
- current 변경이 과거 snapshot을 수정하지 않음

### API·DB

- owner/RLS/admin role matrix
- refresh lease·retry·quarantine
- revalidation 중 가격변동·품절 replacement
- migration mirror와 fresh database
- provider 장애 시 기존 snapshot report 유지

### 저장소 명령

```powershell
npm run typecheck
npm run lint
npm --prefix my-app run consulting:contract:test
npm run supabase:migrations:mirror:check
npm run supabase:migrations:fresh:check -- <repository-owned-arguments>
```

실공급자 검증은 로컬 fixture와 별도로 redacted evidence를 남긴다.

## 13. 종료 기준

- [x] 신규 실상품 추천 item을 immutable offer snapshot으로 캡처하는 서버 계약이 있다.
- [x] source·seller·상품·variant·가격·재고·배송·사이즈·observedAt이 추적된다.
- [x] stale·품절·한국 배송 불가·호환 사이즈 없음 상품은 신규 추천에 포함되지 않는다.
- [x] 링크 직전 revalidation과 append-only replacement revision이 동작한다.
- [x] 상품 진실과 뉴스·검색 trend signal이 저장·코드·정책에서 분리된다.
- [x] 과거 report snapshot이 현재 offer 변경으로 덮어써지지 않는다.
- [x] 상품 이미지·제휴·가격·재고 고지가 고객 API 카드 계약에 포함된다.
- [x] source quarantine·flag OFF rollback이 검증된다. 실제 provider 장애 drill은 not_run이다.

## 14. 종료 증거와 P51 인계

필수 증거:

- provider별 계약·SLA·이미지 권리 확인표
- redacted 실 offer ingest·normalize·snapshot trace
- stale·품절·가격변동·replacement fixture
- RLS·URL security·migration 결과
- source health와 rollback drill

P51에는 `FashionProductOfferV1`, eligibility reason code, snapshot ID, freshness policy version을 인계한다. 실공급자와의 사용권·SLA 검증이 없으면 로컬 fixture 완료만 보고하고 실서비스 완료로 판정하지 않는다.

## 15. 증거 경계

| 증거 층 | P50 종료에 필요 | 비고 |
|---|---:|---|
| 로컬 schema·fixture | 예 | 구현 후 |
| 로컬 DB·RLS | 예 | 구현 후 |
| 실제 provider feed | 실서비스 전 예 | 권한·계약 필요 |
| 실사용자 인증 | 구매 링크 E2E 전 예 | 별도 |
| 원격 DB | 배포 전 예 | 별도 승인 |
| Canary | 아니요 | P53 |

Docker는 필요하지 않다.
