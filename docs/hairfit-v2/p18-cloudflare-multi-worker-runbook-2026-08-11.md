# P18 Cloudflare OpenNext 멀티 워커 배포 런북

- 대상 애플리케이션: `my-app`
- 공개 라우터 Worker: `hairstyleprivew-router`
- 비공개 서버 Worker: `hairstyleprivew`
- 서버 원점 Custom Domain: `hairfit.beauty`, `www.hairfit.beauty`
- 공개 진입점: 위 두 hostname의 classic zone route가 `hairstyleprivew-router`를 호출한다.
- 비용 원칙: Workers Free 3 MiB gzip 한도 안에서 배포하며 플랜 업그레이드를 요구하지 않는다.

## 배경과 고정 계약

단일 OpenNext Worker는 서버와 미들웨어를 합칠 때 gzip `3,406.19 KiB`로 Free 한도를 넘었다. 전체 `@tensorflow/tfjs` 대신 FaceMesh에 필요한 `tfjs-core`와 CPU backend만 사용하고, OpenNext 공식 멀티 워커 구조로 미들웨어와 서버를 분리한다.

최종 dry-run 기준은 다음과 같다.

| Worker | gzip | 3 MiB 판정 |
|---|---:|---|
| `hairstyleprivew` server | `3,049.81 KiB` | 통과 |
| `hairstyleprivew-router` middleware/assets | `188.74 KiB` | 통과 |

라우터는 `DEFAULT_WORKER` service binding으로 서버를 호출한다. `Cloudflare-Workers-Version-Overrides` 헤더의 키는 binding 이름이 아니라 실제 Worker 이름인 `hairstyleprivew`이며, 값은 이번 배포에서 업로드한 서버 version ID다. 서버 config의 `keep_vars: true`와 Wrangler의 secret 보존 계약으로 기존 비밀값을 삭제하지 않는다.

두 Worker는 OpenNext 공식 멀티 워커 예제와 동일하게 `nodejs_compat`, `allow_importable_env`, `global_fetch_strictly_public` compatibility flag를 사용한다. 특히 라우터의 Clerk 설정은 middleware module 초기화 시 import 가능한 env가 필요하므로 `allow_importable_env`를 제거하면 안 된다.

라우터 wrapper는 위 4개 인증 binding만 매 요청 `process.env`에 동기화한 뒤 컴파일된 Next middleware를 지연 로드한다. warm isolate에 이전 version의 키가 남아도 현재 encrypted binding으로 교체하며 provider·결제·callback/admin secret은 이 경로에 포함하지 않는다.

## 배포 전 게이트

1. feature와 `develop/2026-08-08-hairfit-v2-backend`가 동일한 원격 SHA여야 한다.
2. feature worktree가 clean이어야 한다.
3. `npm run typecheck`, `npm --prefix my-app run consulting:contract:test`, `npm --prefix my-app run cf:multi:server:dry-run`, `npm --prefix my-app run cf:multi:router:dry-run`이 통과해야 한다.
4. 서버 flag 25개는 OFF, `PROMPT_VISION_MODEL=gpt-4o`, 필수 secret 이름은 `32/32`여야 한다.
5. 라우터에는 인증 미들웨어 실행에 필요한 정확히 4개(`CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)만 등록한다. provider·결제·callback/admin secret은 복제하지 않는다.
6. 현재 production deployment ID, 두 Custom Domain의 대상 `hairstyleprivew`, 두 classic route의 대상 Worker를 증거에 기록한다.

## 무중단 배포 순서

아래 명령은 `my-app`에서 실행한다. `<...>` 값은 실행 로그에서 받은 UUID이며 문서나 채팅에 secret 값을 기록하지 않는다.

0. `hairstyleprivew-router`가 아직 존재하지 않는 최초 1회에만 자기 참조 service binding을 제외한 부트스트랩 설정으로 Worker를 생성한다. Custom Domain은 연결하지 않으므로 공개 트래픽에는 영향이 없다.

   `npm run cf:multi:router:bootstrap -- --var WORKER_VERSION_ID:<CURRENT_SERVER_ID>`

   Worker가 이미 존재하면 이 단계는 건너뛴다. 이후 모든 라우터 버전은 정식 `wrangler.middleware.jsonc`를 사용해 자기 참조 binding을 복원한다.

   최초 생성 뒤 또는 인증키 회전 시 HairFit 운영 live Clerk 키가 있는 승인 환경 파일을 사용해 `npm run cf:multi:router:auth-sync -- --apply --confirm=HAIRFIT_ROUTER_AUTH_SECRETS --env-file=<HAIRFIT_PRODUCTION_ENV> --server-version-id=<NEW_SERVER_ID>`를 실행한다. test Clerk 키는 거부한다. 스크립트는 값을 출력하지 않고 위 4개가 포함된 새 라우터 version만 업로드하며 자동 배포하지 않는다. generation callback과 catalog admin 요청은 서버 handler가 자체 secret 검증을 수행하는 정확한 경로만 라우터 wrapper에서 직접 전달한다.

1. 서버 새 version을 업로드한다.

   `npx wrangler versions upload --config workers/open-next-multi/wrangler.server.jsonc --keep-vars --var HAIRFIT_SOURCE_REVISION:<SOURCE_SHA> --message "HairFit V2 <SOURCE_SHA> server"`

2. 기존 서버 version을 100%, 새 서버 version을 0%로 배포한다. 새 version이 현재 deployment에 포함되어야 version override가 작동한다.

   `npx wrangler versions deploy <CURRENT_SERVER_ID>@100% <NEW_SERVER_ID>@0% -y --config workers/open-next-multi/wrangler.server.jsonc`

3. 라우터 version을 새 서버 ID로 업로드한다.

   `npx wrangler versions upload --config workers/open-next-multi/wrangler.middleware.jsonc --var WORKER_VERSION_ID:<NEW_SERVER_ID> --message "HairFit V2 <SOURCE_SHA> router"`

4. 라우터 version을 100% 배포한다. 이 시점에는 classic route가 기존 대상을 가리키므로 공개 트래픽은 바뀌지 않는다.

   `npx wrangler versions deploy <NEW_ROUTER_ID>@100% -y --config workers/open-next-multi/wrangler.middleware.jsonc`

5. Custom Domain은 항상 서버 `hairstyleprivew`에 둔다. Cloudflare Workers Routes API의 단일-route update로 다음 두 classic route의 `script`만 `hairstyleprivew-router`로 바꾼다. route ID를 먼저 읽어 pattern과 일치함을 확인하고, 각 update 직후 다시 조회한다. API 토큰 또는 OAuth 값은 출력하거나 문서에 남기지 않는다.

   - `hairfit.beauty/*`
   - `www.hairfit.beauty/*`

   route update 요청 본문은 각 route에 대해 `{"pattern":"<EXACT_PATTERN>","script":"hairstyleprivew-router"}`다. Custom Domain을 라우터로 옮기거나 `wrangler triggers deploy`를 라우터 config에 실행하지 않는다. classic route가 Custom Domain보다 먼저 요청을 받아 라우터가 server service binding으로 원점을 호출하는 구조다.
6. 공개 `/`, `/login`, `/workspace`, `/consulting/new`, 정적 asset, 인증 redirect, API 상태를 즉시 smoke한다. `/.well-known/hairfit-deployment`는 `cache-control: no-store`와 고정한 source revision을 반환해야 하며, 이를 0% 서버 version affinity의 직접 증거로 남긴다.
7. smoke 통과 후 서버 새 version을 100%로 확정한다.

   `npx wrangler versions deploy <NEW_SERVER_ID>@100% -y --config workers/open-next-multi/wrangler.server.jsonc`

## 즉시 롤백

다음 중 하나라도 발생하면 5분 안에 롤백한다.

- 공개 경로 5xx 또는 정적 asset 404
- Clerk 로그인 redirect 실패
- service binding 또는 version override 실패
- consultation 읽기/생성 실패
- 오류율 또는 지연이 기준선을 넘음

롤백 순서:

1. 두 classic route를 같은 Workers Routes API로 갱신해 `script`를 `hairstyleprivew`로 되돌린다. Custom Domain은 이미 서버에 있으므로 건드리지 않는다.
2. 필요하면 `npx wrangler versions deploy <CURRENT_SERVER_ID>@100% -y --config workers/open-next-multi/wrangler.server.jsonc`로 기존 서버를 100% 복원한다.
3. 공개 smoke와 Worker deployment status를 다시 확인한다.
4. 라우터 Worker 삭제는 별도 승인 없이는 수행하지 않는다.

## 종료 증거

- source SHA, server/router version ID, 이전 production version ID
- 두 Custom Domain이 계속 서버를 가리킨다는 증거와 classic route의 전환 전후 script
- server/router 실제 upload gzip 크기
- OFF production smoke, canary 단계별 결과, rollback 관찰 창
- secret 값이 아닌 이름/개수만 포함한 readiness 결과
- 비인증 보호 API가 `401`이며 `Authentication is not configured` 503 또는 handler 500이 아니라는 probe

## 2026-08-11 전환 리허설에서 확인한 주의점

- 라우터 Custom Domain 전환과 기존 classic route가 동시에 존재하면 기존 route가 먼저 적용되어 예상과 다른 Worker가 응답할 수 있다.
- classic route를 제거한 뒤 라우터 Custom Domain만 남기는 방식은 service binding 원점 경로에서 `522`를 만들 수 있으므로 사용하지 않는다.
- 실제 리허설에서 두 route를 서버로 복원해 `/`, `/login`, `/workspace`, `www`를 정상화한 뒤, Custom Domain은 서버에 둔 채 두 route의 script만 라우터로 바꾸는 방식으로 성공했다.
- 운영 probe는 `/.well-known/hairfit-router`의 pinned server version과 `/.well-known/hairfit-deployment`의 source revision을 모두 `no-store` 응답으로 확인한다.
