# UI/UX CI와 출시 후보 외부 게이트 — 2026-07-18

## 목적

로컬에서만 통과하던 UI/UX·DB·웹·Expo 검증을 PR마다 재현하고, 실제 계정·메일·외부 제공자 자격 증명이 필요한 검증은 승인된 출시 후보 환경에서만 실행한다. 이 구성은 merge, migration 적용, 배포 또는 외부 메시지 발송을 수행하지 않는다.

## PR·develop·main 결정적 게이트

`.github/workflows/uiux-quality-gates.yml`은 모든 PR, `develop/**`·`main` push, 수동 실행에서 다음 네 job을 독립 실행한다.

| Job | 검증 범위 | 외부 자격 증명 |
| --- | --- | --- |
| `contracts-and-build` | high/critical dependency audit, migration mirror, 전체 lint/typecheck, component registry, generation·결제·관리자·결과·목록·접근성 계약, shared·Expo test, Next production build | 없음 |
| `database-fresh-chain` | 빈 PostgreSQL 18에 73개 migration 전체 적용, durable generation 의존 순서 확인 후 `*_smoke.sql` 10개 실행 | 없음. `pg_net`·`pg_cron` 설치만 hosted 전용으로 제외 |
| `public-web-e2e` | Windows Chromium에서 공개 15개와 로그인·회원가입 진입 8개 axe·keyboard·viewport·visual E2E | 없음. 실패 artifact만 14일 보관 |
| `expo-bundle` | Expo web·iOS·Android production export | 없음 |

워크플로 토큰 권한은 `contents: read`뿐이며 같은 ref의 이전 실행만 취소한다. 공개 visual baseline은 저장소의 Windows 기준선과 렌더러 차이를 만들지 않도록 `windows-latest`에서 실행한다.

## 출시 후보 외부 게이트

`.github/workflows/release-candidate-external-gates.yml`은 `workflow_dispatch`로만 실행되고 GitHub `release-candidate` environment 승인을 요구한다.

### Clerk 보호 화면

필수 environment secrets:

- `E2E_CLERK_PUBLISHABLE_KEY`: 개발 Clerk의 `pk_test_` 키
- `E2E_CLERK_SECRET_KEY`: 개발 Clerk의 `sk_test_` 키
- `E2E_CLERK_USER_EMAIL`: 이미 존재하는 `+clerk_test` 고객 계정
- `E2E_CLERK_ADMIN_EMAIL`: 이미 존재하고 DB·Clerk role이 모두 `admin`인 `+clerk_test` 계정
- `E2E_CLERK_SALON_EMAIL`: 이미 존재하고 DB·Clerk role이 모두 `salon_owner`인 `+clerk_test` 계정
- `E2E_OWNED_GENERATION_ID`: 위 고객이 소유한 만료 전 completed generation UUID
- `E2E_FOREIGN_GENERATION_ID`: 위 고객이 아닌 다른 `+clerk_test` 전용 계정이 소유한 기존 generation UUID
- `E2E_SUPABASE_URL`
- `E2E_SUPABASE_ANON_KEY`
- `E2E_SUPABASE_SERVICE_ROLE_KEY`

preflight는 사용자를 만들거나 수정하지 않는다. 입력한 이메일과 정확히 일치하는 개발 Clerk 고객·관리자·살롱 계정의 metadata와 Supabase role, 고객 소유의 만료 전 completed generation, foreign generation과 소유자 계정의 `+clerk_test` 전용 여부, 로그인 고객과 foreign generation owner가 다름을 Supabase service role로 읽기만 해서 확인한다. 이후 고객 `/home`·`/mypage`·본인/타인 generation, 관리자 `/admin/stats`·`/admin/members`, 살롱 `/salon/customers`·`/salon/connections`의 역할별 세션·H1·serious/critical axe 0·375px overflow 0을 검사한다. 고객의 관리자 진입과 살롱의 관리자 진입도 역할별 안전 경로로 되돌아가야 한다. 결과 선택/PATCH와 관리자·살롱 mutation은 실행하지 않으며 live Clerk 키와 일반 사용자 소유 generation은 명시적으로 거부한다.

### 생성 완료 콜백·메일 설정

필수 environment secrets:

- `GENERATION_WORKFLOW_CALLBACK_SECRET`
- `GENERATION_WORKFLOW_CALLBACK_SECRET_FINGERPRINT`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL=HairFit <noreply@hairfit.beauty>`

입력한 공개 `app_url`의 notification drain에 read-only `HEAD` probe를 보내 App/Workflow secret 일치, callback fingerprint, Resend sender 형식을 확인한다. 메일을 생성하거나 발송하지 않는다.

### Universal Link·Android App Link association

필수 environment secrets:

- `HAIRFIT_APPLE_TEAM_ID`: 운영 Apple Developer Team ID
- `HAIRFIT_ANDROID_CERT_SHA256`: Play/App Signing 운영 인증서 SHA-256

`app_url`의 AASA와 `assetlinks.json`을 redirect 없이 직접 읽어 200·`application/json`, `com.hairfit.app`, `/generate/*`, 운영 Team ID·release fingerprint 일치를 확인한다. 식별자 값은 로그에 출력하지 않는다. 2026-07-18 현재 운영 URL 두 경로는 모두 redirect 없이 `404 text/html`이라 이 gate가 의도대로 실패한다.

### 생성 완료 알림 staging DB 동시성

기본값은 비활성이다. `run_generation_notification_staging_db_smoke=true`를 명시하고 `release-candidate` environment 승인을 받아야 실행된다.

필수 environment secrets:

- `STAGING_DATABASE_URL`: 전용 staging Postgres direct 또는 session-pooler 연결 문자열
- `STAGING_DATABASE_EXPECTED_HOST`: 위 URL과 정확히 일치해야 하는 hostname

실행기는 staging hostname 일치, `I_UNDERSTAND_THIS_WRITES_EPHEMERAL_FIXTURES` 확인, `sslmode=disable` 거부를 DB 연결 전에 검사한다. 고유 임시 user/generation을 만든 뒤 8개 독립 `psql` 세션으로 concurrent enqueue·claim·finish와 stale lease fencing을 검증하고, 성공·실패 모두 fixture cleanup을 시도한다. 결과에는 URL·사용자·비밀번호·fixture ID를 넣지 않고 hostname SHA-256 prefix, DB 이름, 서버 버전, check별 pass/fail만 JSON/Markdown으로 남긴다. GitHub artifact는 30일 보관한다.

이 gate는 실제 메일을 발송하지 않는다. 운영 DB URL을 staging secret으로 재사용하지 말고, 실패한 cleanup은 artifact의 `cleanup=failed`를 확인해 즉시 incident로 다룬다.

### 통합 환경 준비 상태

`run_environment_readiness_preflight=true`일 때 쓰기 없이 다음 계약을 한 번에 확인한다.

- root/`my-app` 73개 migration mirror와 source SQL digest
- 원격 `supabase_migrations.schema_migrations`의 전체 version 일치, 핵심 생성 테이블·RLS·`service_role` 조회 권한·RPC 존재
- 생성 완료 callback secret fingerprint, `HairFit <noreply@hairfit.beauty>` sender, 배포 App의 read-only `HEAD`
- AASA·Asset Links의 운영 Team ID·release fingerprint
- generation Workflow의 binding·cron·compatibility date와 Wrangler dry-run
- Cloudflare Worker의 필수 secret **이름** 2개와 입력한 Worker version ID의 100% traffic 여부

추가 필수 environment secrets는 `STAGING_DATABASE_URL`, `STAGING_DATABASE_EXPECTED_HOST`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`다. 실행 입력 `expected_worker_version_id`에는 검증할 Wrangler version ID를 명시한다. DB URL은 명령 인자나 artifact에 기록하지 않고 `PGPASSWORD` 등 `psql` 환경 변수로만 전달한다. Worker secret 값은 조회하거나 출력하지 않는다.

Supabase 원격 migration history는 적용된 version 목록만 증명하므로 root/`my-app` source hash 검사와 원격 schema probe를 함께 사용한다. 이 gate는 migration 적용, Worker 배포, DB write, 메일 발송을 수행하지 않는다. JSON/Markdown artifact에는 migration/Worker source digest, DB hostname fingerprint, 예상 Worker version ID와 check별 결과만 남기며 30일 보관한다.

## 자동화하지 않은 출시 증거

다음은 자격 증명 존재만으로 안전하게 자동 실행할 수 없거나 물리 장치가 필요하므로 수동 release candidate gate로 유지한다.

- 실제 Resend 수신함에서 생성 완료 메일 1회와 중복 0회 확인
- 실제 iOS/Android의 강제 종료 후 Expo Push 수신·탭·cold start 복귀
- PortOne sandbox SDK 결제, 지연·중복 webhook, ledger·receipt 대조
- 운영 Supabase migration 적용과 cron 등록
- iOS/Android 200% 글자, VoiceOver/TalkBack, 사진 권한, app-link 수명주기
- Cloudflare App·Workflow 실제 배포

이 항목이 없는 성공 run을 출시 완료나 운영 배포 완료로 해석하지 않는다.

## Branch protection 인계

첫 GitHub-hosted green run을 확인한 뒤 `main`과 활성 `develop/**` PR 규칙에 다음 required check를 등록한다.

- `Contracts, types, lint, and Next build`
- `PostgreSQL fresh chain and smoke tests`
- `Public and auth-entry web accessibility and visual E2E`
- `Expo three-platform export`

required check 등록은 저장소 설정 변경이므로 별도 publish/관리 권한으로 수행한다. 워크플로 파일 추가만으로 branch protection이 자동 설정되지는 않는다.

## 현재 로컬 검증

- 두 workflow YAML parse 성공: PR workflow 4 jobs, external workflow 5 jobs
- `npm ci --dry-run --no-audit --fund=false` exit 0
- `npm run lint:all` exit 0: 오류 0, 기존 에프터케어 파일 경고 1
- 공개 Playwright 목록 15개, 로그인·회원가입 진입 목록 8개 확인
- Clerk protected 목록 14개 확인: setup 4, 고객 화면·본인/타인 generation·관리자 거절 5, 관리자 조회 2, 살롱 조회·관리자 거절 3. generation-entry read-only fixture 계약은 14/14, 관리자 역할·조회 무변경 계약은 10/10 통과했다. 2026-07-18 로컬 preflight는 `E2E_CLERK_USER_EMAIL`에 기존 `+clerk_test` 고객이 없어 fail-closed했으며 승인된 실제 fixture 실행은 대기한다.
- 새 접수 pause·진행 중 작업 복구 계약 5/5와 사용자 안전 오류·공통 FormField 접근성 계약 4/4 통과
- 같은 변경 후보에서 7-workspace typecheck, Next 111/111 build, production Playwright 72/72, billing content 계약 10/10, 개인컬러 source 계약 3/3, MyPage source 계약 5/5, Expo 3-platform export, PostgreSQL 73 migration·10 SQL smoke와 generation notification 8-session concurrency smoke가 통과
- association external preflight 계약 3/3 통과, 운영 URL의 AASA·Asset Links `404`를 fail closed로 검출
- staging smoke 로컬 PG18.4 artifact: concurrent enqueue 1 row, claim winner 1, applied finish 1, stale lease no-op, fixture 잔여 0. synthetic staging 호출은 `expectedHost` 누락 시 연결 전에 exit 1
- 통합 환경 preflight source mode 통과: migration mirror 73개, generation notification source 계약 7개, Wrangler 4.112.0 Worker binding·cron·dry-run. 통합 계약은 69/69 통과했으며 redacted JSON/Markdown artifact를 생성했다.

GitHub-hosted runner의 실제 green run과 deployed mode artifact URL은 아직 없으므로 원격 DB·secret·sender·Worker version 확인 완료로 표기하지 않는다.
