# P50 Phase 03 Fashion Product Truth 검증 결과 — 2026-08-20

## 판정

로컬 구현과 로컬 DB 종료 기준은 충족했다. 실제 commerce provider 계약·feed, 실사용자 Clerk 세션, 원격 Supabase 적용, 배포/Canary는 실행하지 않았으므로 실서비스 완료 증거로 해석하지 않는다.

## 구현 범위

- 공용 계약: source SLA 기반 freshness, HTTPS allowlist, 이미지 사용권, revalidation/disclosure
- DB: source/product/current offer/immutable snapshot/source run 5개 테이블
- 수집: verified-manual end-to-end adapter, source registry, 정규화, fingerprint, idempotent run
- 고객 API: snapshot 조회, 링크 전 재검증, append-only replacement
- 관리자 API: Clerk DB admin role 기반 rebuild/health/quarantine
- 안전 경계: trend research는 Product Truth 쓰기 경로와 분리, service-role-only RLS
- rollback: FASHION_PRODUCT_TRUTH_ENABLED=false에서 신규 API가 404로 fail closed

## 검증 결과

| 검증 | 결과 |
|---|---|
| shared contract tests | PASS — 155/155 |
| P50 focused contract tests | PASS — 5/5 |
| Web TypeScript | PASS |
| migration mirror | PASS — 104 |
| empty local PostgreSQL fresh chain | PASS — 104/104 |
| local DB FORCE RLS/ACL | PASS — 5개 테이블 |
| immutable snapshot UPDATE trigger | PASS |
| Docker | 사용하지 않음 |

## 핵심 증거

- provider expiry가 남아 있어도 source SLA 60분을 넘으면 offer-stale
- 품절·사이즈 불일치·한국 배송 불가·비신뢰 URL·격리 source는 신규 추천에서 제외
- 현재 가격 변경은 과거 snapshot을 수정하지 않고 price-changed
- 구매 불가 상태는 replacement-required, 대체는 새 revision과 replacement_of_snapshot_id
- anon·authenticated는 current offer 테이블 직접 SELECT 불가
- snapshot UPDATE는 DB에서 FASHION_OFFER_SNAPSHOT_IMMUTABLE로 차단
- 상품 카드 계약은 확인 시각, 가격/재고 변경 가능성, 제휴 표시, 이미지 권리, 시뮬레이션 분리 고지를 포함

## 증거 경계

| 증거층 | 상태 |
|---|---|
| 로컬 schema·fixture | passed |
| 로컬 DB·RLS | passed |
| 실제 provider feed/SLA/이미지 계약 | not_run |
| 실사용자 인증·구매 링크 | not_run |
| 원격 Supabase | not_run |
| 배포/Canary | not_run |

## P51 인계

P51은 eligible current offer를 직접 복사하지 않고 captureFashionOfferSnapshotsV2가 만든 immutable snapshot ID만 rank/generation 입력에 사용한다. 실제 provider adapter가 없는 source는 adapterConnected=false이며, verified-manual 외 payload ingest는 fail closed다.
