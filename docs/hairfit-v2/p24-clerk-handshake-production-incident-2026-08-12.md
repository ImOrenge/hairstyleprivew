# P24 Clerk handshake 운영 장애 및 수정 증거

## 장애 현상

- `hairfit.beauty`의 일반 공개 요청은 `200`이었지만 `__clerk_handshake` 쿼리가 포함된 문서 요청은 `500`을 반환했다.
- 사용자에게 전달된 handshake 토큰은 진단·테스트·문서에 재사용하거나 저장하지 않았다.
- 별도의 비민감 invalid probe로 동일한 `500`을 재현해 사용자 계정이나 상담 데이터와 무관한 middleware 문제임을 확인했다.
- `/favicon.ico`의 `404`는 인증 handshake 실패와 독립된 정적 자산 문제로 분리했다.

## 원인

Next.js는 `NEXT_PUBLIC_*` 참조를 middleware 빌드 시 치환한다. 기존 Cloudflare router wrapper는 요청 직전에 live binding을 `process.env`에 복사했지만, `clerkMiddleware()`는 옵션을 받지 않아 SDK가 빌드 시 캡처한 Clerk 상수를 사용할 수 있었다.

그 결과 다음 혼합 상태가 발생했다.

- 클라이언트 `ClerkProvider`: live publishable key
- router middleware: 개발 빌드 상수
- 잘못되거나 오래된 개발 handshake: 개발 SDK 예외가 운영 응답의 `500`으로 노출

동일 Clerk SDK probe에서 live 키 조합은 invalid handshake를 signed-out으로 안전하게 처리했고, test 키 조합은 token verification 예외를 발생시켰다. 운영 router의 응답은 후자와 일치했다.

## 수정

1. router가 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` live binding을 서버 전용 `CLERK_PUBLISHABLE_KEY` runtime alias에도 주입한다.
2. `clerkMiddleware(handler, optionsResolver)`에 매 요청 `publishableKey`와 `secretKey`를 명시한다.
3. SDK의 빌드 상수보다 runtime binding이 우선되는 계약 테스트를 추가한다.
4. 운영 `.env.assets`로 OpenNext bundle을 빌드하고 실제 key type만 검사한다. 키 값은 출력하지 않는다.

## 로컬 검증

- `npm --prefix my-app run auth:return-target:test`: 5/5 통과
- `npm --prefix my-app run consulting:contract:test`: 78/78 통과
- `npm --prefix my-app run typecheck`: 통과
- `npm --prefix my-app run lint -- middleware.ts lib/clerk.test.ts lib/consulting/consultation-contract.test.ts`: 통과
- `npm --prefix my-app run cf:multi:build`: 통과
- `npm --prefix my-app run cf:multi:server:dry-run`: 통과
- `npm --prefix my-app run cf:multi:router:dry-run`: 통과
- middleware bundle 실제 키 검사: `pk_live=1`, `pk_test=0`, `sk_live=0`, `sk_test=0`

## 운영 종료 기준

- 비민감 invalid handshake 문서 요청이 `5xx`가 아니어야 한다.
- `/`, `/login`, `/.well-known/hairfit-deployment`가 정상 응답해야 한다.
- deployment probe의 pinned server version과 source revision이 같은 응답에서 일치해야 한다.
- Preview 검증 후 router/server를 단계적으로 전환하고, 문제가 재현되면 직전 router/server version pair로 즉시 되돌린다.

