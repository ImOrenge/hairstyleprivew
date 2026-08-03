# HairFit 결제 상품 및 ID 카탈로그

기준일: 2026-08-03
서비스 브랜드: HairFit
상호: 제이코더랩
통화: KRW

이 문서는 현재 코드에 등록된 웹 PortOne 결제 상품을 정리한 운영용 카탈로그다. 단건 결제와 정기결제의 상품 키, 가격, 동적 결제 ID 규칙을 분리해 관리한다.

## 1. 결제 ID 규칙

PortOne 결제 ID와 빌링키 발급 ID는 결제 요청 시 서버에서 생성한다. 상품마다 미리 하나의 실결제 ID를 만들어 두는 방식이 아니다.

| 용도 | 생성 형식 | 코드 경로 | 제한 |
| --- | --- | --- | --- |
| 웹 정기결제 첫 결제 | `sub-{planCode}-{base36Timestamp}-{random}` | `my-app/lib/portone-payment-id.ts` | 32자 이하 |
| 모바일 PortOne 결제 | `mob-{planCode}-{base36Timestamp}-{random}` | `my-app/lib/portone-payment-id.ts` | 32자 이하 |
| 정기결제 갱신 계약 | `ren-{planCode}-{base36Timestamp}-{random}` | `my-app/lib/portone-payment-id.ts` | 32자 이하 |
| 추가 이용권 단건결제 | `use-{packCode}-{base36Timestamp}-{random}` | `my-app/lib/portone-payment-id.ts` | 32자 이하 |
| 빌링키 발급 요청 | `bki-{planCode}-{base36Timestamp}-{random}` | `my-app/lib/portone-payment-id.ts` | 40자 이하 |

플랜 코드는 `basic=b`, `standard=s`, `pro=p`다. 현재 웹 정기결제는 `sub`, 웹 추가 이용권은 `use`, 모바일 PortOne은 `mob` 경로를 사용한다. 결제 요청의 중복 방지와 웹훅 매칭을 위해 생성된 ID를 `payment_transactions.provider_order_id`에 기록한다.

## 2. PortOne 정기결제 상품

웹에서 카드 빌링키를 발급한 뒤 첫 결제를 처리하고, 이후 월 단위로 갱신한다. 아래 금액은 `my-app/lib/billing-plan.ts`의 기본값이며 `PRICING_<PLAN>_PRICE_KRW` 환경변수로 조정될 수 있다.

| 상품 | 상품 키 | 기본 금액 | 지급 크레딧 | 결제 ID |
| --- | --- | ---: | ---: | --- |
| Basic | `basic` | 9,900원/월 | 80 | `sub-b-...` |
| Standard | `standard` | 19,900원/월 | 200 | `sub-s-...` |
| Pro | `pro` | 49,900원/월 | 600 | `sub-p-...` |
| Salon | `salon` | 39,900원/월 | 500 | 직접 결제 불가, B2B 문의 |

정기결제 빌링키 발급 요청은 `bki-b-...`, `bki-s-...`, `bki-p-...` 형식의 `issueId`를 함께 생성한다. Salon은 `selfServe=false`이므로 일반 사용자 결제 카탈로그에서 제외한다.

## 3. 한달 이용 가능 확인사항

정기결제 첫 결제가 승인되었다고 바로 한달 이용이 끝난 것은 아니다. 아래 조건이 모두 맞아야 해당 플랜의 현재 이용 기간 동안 기능과 크레딧이 정상 제공된다.

| 확인 시점 | 확인 항목 | 통과 기준 | 기준 경로 |
| --- | --- | --- | --- |
| 결제 직후 | PortOne 결제 확정 | 결제 상태가 `PAID`이고 예상 금액/통화/사용자와 일치 | `confirmPortonePayment` |
| 구독 생성 직후 | 구독 권한 | `user_subscriptions.status=active`, `billing_provider=portone` | `my-app/app/api/payments/subscribe/route.ts` |
| 기간 계산 | 한달 이용 기간 | `current_period_start`부터 다음 달 같은 기준일의 `current_period_end`까지 기록 | `user_subscriptions` |
| 크레딧 지급 | 월 이용량 | 플랜별 80/200/600 크레딧이 첫 결제에 한 번만 지급 | `grant_subscription_credits` |
| 이용 중 | 권한 유지 | 현재 시각이 `current_period_end` 이전이고 구독 상태가 active/trialing | 구독 상태 조회 경로 |
| 만료 시점 | 갱신 또는 종료 | 갱신 결제 성공 시 다음 기간과 크레딧을 갱신하고, 실패/취소 시 권한을 연장하지 않음 | `cron-subscription-renewal`, 웹훅 |

운영 테스트에서는 첫 결제 응답의 `paymentId`, `payment_transactions.provider_order_id`, `user_subscriptions.current_period_end`, 현재 크레딧을 한 묶음으로 확인한다. 중복 웹훅이나 새로고침으로 크레딧이 두 번 지급되지 않는지도 확인한다.

## 4. PortOne 단건 결제 상품

추가 이용권은 활성 유료 구독자만 구매할 수 있다. 결제 준비 시 `use-30-...`, `use-80-...`, `use-200-...` 형식의 `paymentId`를 생성한다.

| 상품 | 상품 키 | 기본 금액 | 지급 크레딧 | 결제 ID |
| --- | --- | ---: | ---: | --- |
| 추가 이용권 30 | `usage30` | 5,900원 | 30 | `use-30-...` |
| 추가 이용권 80 | `usage80` | 13,900원 | 80 | `use-80-...` |
| 추가 이용권 200 | `usage200` | 29,900원 | 200 | `use-200-...` |

가격과 주문명은 `my-app/lib/usage-pack.ts`, 결제 준비/완료 경로는 다음과 같다.

- `POST /api/payments/usage-packs/prepare`
- `POST /api/payments/usage-packs/complete`

## 5. 운영 확인 사항

- Free는 결제 상품이 아니며 기본 10크레딧을 제공한다.
- PortOne 금액은 `PRICING_<PLAN>_PRICE_KRW` 환경변수가 설정되면 기본값과 달라질 수 있다.
- 동적 PortOne ID는 PDF에 실값을 고정하지 않고 생성 형식으로만 기록한다. 실결제 테스트 시 API 응답의 `paymentId`와 `payment_transactions.provider_order_id`를 대조한다.

## 기준 소스

- `my-app/lib/business-info.ts`
- `my-app/lib/billing-plan.ts`
- `my-app/lib/usage-pack.ts`
- `my-app/lib/portone-payment-id.ts`
- `my-app/app/api/payments/subscribe/route.ts`
- `my-app/app/api/payments/usage-packs/prepare/route.ts`
