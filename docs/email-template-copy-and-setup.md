# HairFit 이메일 템플릿 카피 및 적용 지점

## 공통 레이아웃

- 브랜드명: `HairFit`
- 기본 톤: 한글, 운영 메일, 과장 없는 안내
- CTA: 앱과 같은 검정 버튼, 3px radius
- 푸터:
  - 본 메일은 HairFit 서비스 이용과 관련해 발송되었습니다.
  - 문의가 필요하시면 마이페이지 또는 고객지원 메뉴를 이용해 주세요.
  - HairFit / 내 스타일을 미리 확인하는 헤어 시뮬레이션 서비스

## 앱 코드에서 발송하는 메일

구현 위치: `my-app/lib/resend.ts`

| 템플릿 | 제목 | 주요 CTA | 호출 위치 |
| --- | --- | --- | --- |
| 가입 완료 | `[HairFit] 가입이 완료되었습니다` | 헤어 추천 시작하기 | `my-app/app/api/account/route.ts` |
| 살롱 가입 완료 | `[HairFit] 살롱 워크스페이스가 준비되었습니다` | 살롱 홈 열기 | `my-app/app/api/account/route.ts` |
| 결제 완료 | `[HairFit] 결제가 완료되었습니다` | 마이페이지에서 확인하기 | `my-app/app/api/payments/subscribe/route.ts`, `my-app/app/api/mobile/payments/complete/route.ts` |
| 구독 갱신 | `[HairFit] {플랜} 구독이 갱신되었습니다` | 구독 상태 확인하기 | `my-app/app/api/payments/webhook/route.ts`, `my-app/supabase/functions/cron-subscription-renewal/index.ts` |
| 결제 실패 | `[HairFit] 구독 결제를 완료하지 못했습니다` | 결제 상태 확인하기 | `my-app/app/api/payments/webhook/route.ts` |
| 환불 완료 | `[HairFit] 환불 처리가 완료되었습니다` | 환불 내역 확인하기 | `my-app/app/api/payments/webhook/route.ts` |
| 부분 환불 검토 | `[HairFit] 환불 요청을 검토 중입니다` | 고객지원 확인하기 | `my-app/app/api/payments/webhook/route.ts` |

## Clerk 이메일 인증 코드

Clerk `email_code` 인증 메일은 앱 코드가 아니라 Clerk 대시보드의 이메일 템플릿에서 관리한다.

권장 제목:

```text
[HairFit] 이메일 인증 코드를 입력해 주세요
```

권장 프리헤더:

```text
아래 인증 코드는 잠시 후 만료됩니다.
```

권장 본문:

```text
이메일 인증 코드를 입력해 주세요

HairFit 계정 생성을 완료하려면 아래 인증 코드를 입력해 주세요.

{{code}}

이 코드는 보안을 위해 잠시 후 만료됩니다.
본인이 요청한 가입이 아니라면 이 메일을 무시해 주세요.
```

적용 위치:

1. Clerk Dashboard 접속
2. HairFit production instance 선택
3. Email templates에서 email verification code 또는 sign-up verification code 템플릿 선택
4. 제목, 프리헤더, 본문을 위 카피로 교체
5. 발신 도메인과 로고가 HairFit 운영 도메인과 맞는지 확인

## 검증 체크리스트

- 모든 앱 발송 메일은 HTML과 text fallback을 함께 가진다.
- 결제 완료 메일은 결제 확정과 크레딧 지급이 끝난 뒤 발송된다.
- 결제 실패, 환불, 부분 환불 메일은 PortOne 웹훅 재전송 시 중복 발송되지 않도록 기존 거래 상태와 webhook event를 확인한다.
- Edge Function 갱신 메일은 Next 런타임 코드를 import하지 않고 Deno 내부 HTML 렌더링으로 동일 문구를 유지한다.
