# HairFit 결제 상품 카탈로그

기준일: 2026-08-03
서비스 브랜드: HairFit
상호: 제이코더랩
통화: KRW

이 문서는 현재 코드에 등록된 웹 PortOne 결제 상품을 정리한 카탈로그다. 정기결제와 단건 결제 상품을 서비스 기간 기준으로 분류하며, 각 상품이 최대 한 달 이용에 해당하는지도 함께 표시한다.

## 1. PortOne 정기결제 상품

웹에서 카드 빌링키를 발급한 뒤 첫 결제를 처리하고, 이후 월 단위로 갱신한다. 아래 금액은 `my-app/lib/billing-plan.ts`의 기본값 기준이다.

| 상품 | 상품 키 | 기본 금액 | 지급 크레딧 | 서비스 기간 | 최대 1개월 여부 |
| --- | --- | ---: | ---: | --- | --- |
| Basic | `basic` | 9,900원/월 | 80 | 결제일 기준 1개월 | 예 |
| Standard | `standard` | 19,900원/월 | 200 | 결제일 기준 1개월 | 예 |
| Pro | `pro` | 49,900원/월 | 600 | 결제일 기준 1개월 | 예 |
| Salon | `salon` | 39,900원/월 | 500 | 결제일 기준 1개월 | 예 |

Salon은 `selfServe=false`이므로 일반 사용자 직접 결제에서는 제외하며 B2B 문의로 운영한다.

## 2. PortOne 단건 결제 상품

추가 이용권은 활성 유료 구독자만 구매할 수 있다. 이 상품은 기간형 구독이 아니라 크레딧을 소진하는 상품이므로, 정기결제의 한 달 이용 기간에는 포함하지 않는다.

| 상품 | 상품 키 | 기본 금액 | 지급 크레딧 | 서비스 기간 | 최대 1개월 여부 |
| --- | --- | ---: | ---: | --- | --- |
| 추가 이용권 30 | `usage30` | 5,900원 | 30 | 기간 없음(크레딧 소진형) | 해당 없음 |
| 추가 이용권 80 | `usage80` | 13,900원 | 80 | 기간 없음(크레딧 소진형) | 해당 없음 |
| 추가 이용권 200 | `usage200` | 29,900원 | 200 | 기간 없음(크레딧 소진형) | 해당 없음 |

가격과 주문명은 `my-app/lib/usage-pack.ts`, 결제 준비/완료 경로는 다음과 같다.

- `POST /api/payments/usage-packs/prepare`
- `POST /api/payments/usage-packs/complete`

## 3. 서비스 기간 분류 요약

| 상품 분류 | 서비스 기간 | 최대 1개월 여부 | 분류 기준 |
| --- | --- | --- | --- |
| 정기결제 Basic/Standard/Pro/Salon | 결제일 기준 1개월 | 예 | 한 번의 결제로 한 달 이용 권한과 월 크레딧 제공 |
| 추가 이용권 30/80/200 | 기간 없음(크레딧 소진형) | 해당 없음 | 활성 유료 구독자에게 별도 크레딧 제공 |
| Free | 결제 및 서비스 기간 없음 | 해당 없음 | 기본 10크레딧 제공 |

## 기준 소스

- `my-app/lib/business-info.ts`
- `my-app/lib/billing-plan.ts`
- `my-app/lib/usage-pack.ts`
- `my-app/lib/usage-pack-eligibility.ts`
- `my-app/app/api/payments/subscribe/route.ts`
- `my-app/app/api/payments/usage-packs/prepare/route.ts`
