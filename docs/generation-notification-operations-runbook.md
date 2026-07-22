# 생성 완료 이메일 운영 Runbook

## 목적과 안전 원칙

이 문서는 `generation_notification_outbox`의 `retry_wait`, `dead_letter`, `delivery_unknown`과 만료된 발송 lease를 운영자가 판정하고 복구하는 절차다. 생성 결과의 성공·부분 성공·실패와 이메일 전달 상태는 서로 독립이며, 이메일 장애를 이유로 generation 상태를 변경하지 않는다.

가장 중요한 원칙은 `delivery_unknown` 자동 재발송 금지다. Provider가 요청을 수신했는지 확정할 수 없는 상태이므로, 확인 없이 재발송하면 사용자에게 같은 완료 메일이 중복 도착할 수 있다.

## 관측 표면

- 관리자 `/admin/stats`의 `생성 완료 알림 큐`
- 5분 drain 응답의 `operations`
- 구조화 로그 `event=generation_notification_operation_alert`
- 상태별 건수: `pending`, `sending`, `retry_wait`, `sent`, `skipped`, `dead_letter`, `delivery_unknown`
- 지연 지표: 처리 가능한 재시도 수, 만료된 `sending` lease 수, 가장 오래된 처리 가능 건의 큐 체류 시간

기본 경고 기준은 큐 체류 15분, 재시도 가능 시각 초과 5분이다. 환경별로 다음 서버 변수를 설정할 수 있다.

```text
GENERATION_NOTIFICATION_QUEUE_AGE_WARNING_MINUTES=15
GENERATION_NOTIFICATION_RETRY_OVERDUE_WARNING_MINUTES=5
```

외부 로그 수집에서는 `severity=critical`을 즉시 호출 경보로, `severity=warning`을 근무 시간 대응 경보로 연결한다. 실제 수집·호출 채널의 연결 여부는 배포 환경에서 별도 확인한다.

## 첫 대응 순서

1. 신규 generation 접수와 전체 generation 상태가 정상인지 확인한다. 알림 문제만으로 접수를 즉시 중지하지 않는다.
2. `/admin/stats`에서 경보 코드, 상태별 건수, 가장 오래된 큐 체류 시간을 기록한다.
3. Workflow의 5분 notification drain 최근 실행과 HTTP 상태를 확인한다.
4. App과 Workflow의 `GENERATION_WORKFLOW_CALLBACK_SECRET`, App base URL, 배포 버전이 같은지 확인한다.
5. Resend sender domain과 API 상태를 확인한다. 수신자 주소나 rendered payload 전문을 공용 로그에 복사하지 않는다.
6. 아래 상태별 절차로 판정한 뒤 ticket 또는 incident에 복구 기록을 남긴다.

## 상태별 판정과 복구

### `retry_wait`

- `available_at` 이전이면 정상 대기다.
- `available_at`을 5분 이상 지났다면 5분 drain·callback secret·DB claim 오류를 확인한다.
- Provider 호출 전 실패가 확실하면 정상 consumer가 같은 idempotency key로 재시도하도록 drain을 복구한다.
- `delivery_uncertain=true` 또는 Provider attempt가 기록된 건은 임의로 pending으로 되돌리지 않는다.

### 만료된 `sending` lease

- 같은 outbox를 처리 중인 consumer가 실제로 종료됐는지 먼저 확인한다.
- 정상 drain이 만료 lease를 회수하는지 한 주기 동안 관찰한다.
- 계속 남으면 App/Workflow 버전, claim RPC, DB 함수 권한과 clock 차이를 확인한다.
- lease token을 우회하거나 DB 행을 직접 `sent`로 바꾸지 않는다.

### `dead_letter`

- `last_error_kind`, 시도 횟수, sender domain, 수신자 존재 여부를 확인한다.
- Provider 호출 전 영구 실패인지, 주소·정책 오류인지 분류한다.
- 원인이 제거된 뒤에도 자동 상태 변경은 하지 않는다. 승인된 보정 도구가 준비되기 전에는 DB 직접 수정 대신 사용자에게 앱 내 결과 확인 경로를 안내한다.
- 복구 기록에 generation ID, outbox ID, 원인, 확인자, 사용자 영향, 재발 방지 항목을 남긴다. 이메일 주소와 본문 전문은 남기지 않는다.

### `delivery_unknown`

- 자동 재발송 금지. 수동 drain, 상태 초기화, 새 idempotency key 발급도 금지한다.
- Resend event·request ID·idempotency key와 실제 수신함을 대조한다.
- 전달이 확인되면 중복 발송 없이 운영 기록만 완료한다.
- 미전달이 확정된 경우에만 별도 승인된 수동 복구 절차로 진행한다. 현재 저장소에는 이 상태를 재발송하는 자동 도구가 없다.
- 판정할 수 없으면 `delivery_unknown`을 유지하고 앱 내 결과 조회 경로를 고객지원에 제공한다.

## 경보 종료 조건

- 만료된 `sending` lease가 0이다.
- 처리 가능한 `retry_wait`가 다음 drain 주기 안에 감소한다.
- `dead_letter`마다 원인과 사용자 영향이 기록돼 있다.
- `delivery_unknown`마다 Provider/수신함 대조 결과 또는 미판정 사유가 기록돼 있다.
- generation terminal 상태와 결과 조회는 이메일 복구와 무관하게 정상이다.

## 개인정보 보존과 정리

`generation_notification_outbox`와 `styling_notification_outbox`는 같은 정책을 사용한다. 재시도 가능한 `pending`, `sending`, `retry_wait`의 고정 payload는 전달 안정성 때문에 정리하지 않는다.

- `sent`, `skipped`: terminal 시각부터 30일 뒤 수신자 이메일·표시명, 렌더링 HTML/text, event payload, 오류 전문을 제거한다.
- `dead_letter`, `delivery_unknown`: Provider 대조와 중복 발송 방지 판정을 위해 90일 보관한 뒤 같은 필드를 제거한다.
- 비식별 상태, terminal 시각, Provider·멱등성 식별자는 최대 365일 보관한 뒤 outbox row를 삭제한다.
- 정리는 `apply_notification_outbox_retention`이 batch와 `skip locked`로 수행한다. 처리 중 row나 아직 보존기간 안에 있는 row를 직접 수정하지 않는다.
- 일일 pg_cron은 extension이 있는 환경에서만 `notification-outbox-retention-daily` 이름으로 등록된다. 배포 후 job 존재, 최근 실행, redaction 건수를 별도로 확인한다.

원격 적용 전에는 대상 건수를 상태·terminal 날짜별 aggregate로만 확인하고 이메일 주소나 본문을 출력하지 않는다. 이미 redaction 또는 삭제가 끝난 데이터는 rollback으로 복구할 수 없으므로 migration 적용과 첫 cron 실행을 분리해 승인한다.

로컬 검증:

```powershell
npm run notification-retention:contract:test
# fresh local DB에 전체 migration 적용 후
psql $env:LOCAL_DATABASE_URL -f my-app/supabase/tests/notification_outbox_retention_smoke.sql
```

## 원본 사진 보존·삭제 아웃박스

- 접수된 private 원본은 `accepted_at`부터 최대 24시간 보관한다. 모든 후보 완료 시 즉시, partial/failed는 사용자의 무료 재시도 포기 또는 기한 만료 시 삭제를 요청한다.
- `request_generation_original_cleanup`, `abandon_generation_retry`, draft 만료 함수가 generation/draft 상태와 `generation_original_cleanup_outbox`를 한 트랜잭션으로 전이한다.
- App consumer만 Supabase Storage API로 객체를 삭제한다. `storage.objects`를 SQL로 직접 수정하거나 DB 상태를 먼저 `deleted`로 바꾸지 않는다.
- claim은 outbox row별 lease token으로 fencing한다. Storage 삭제 성공 뒤 같은 token으로 `finish_generation_original_cleanup`을 호출하며, 실패하면 `retry_generation_original_cleanup`으로 exponential backoff한다.
- `cleanup_queued`가 된 시점부터 신규 무료 재시도는 차단한다. Storage 장애로 실제 삭제가 지연돼도 원본을 새 생성에 사용하지 않는다.
- `dead_letter`는 Storage 장애와 권한·bucket 설정을 확인한 뒤 정상 consumer로만 복구한다. DB row나 원본 marker를 수동으로 삭제 완료 처리하지 않는다.

로컬 검증:

```powershell
npm run generation:original-retention:contract:test
psql $env:LOCAL_DATABASE_URL -f my-app/supabase/tests/generation_original_retention_smoke.sql
```

## 배포 전·후 확인

App과 Workflow에는 동일한 강한 `GENERATION_WORKFLOW_CALLBACK_SECRET`과 다음 domain-separated SHA-256 지문을 설정한다. 지문은 비밀값이 아니지만 설정 비교 용도로만 사용하며, 원본 secret은 로그·티켓·채팅에 출력하지 않는다.

```powershell
# 현재 env 파일의 callback secret을 읽고 지문 한 줄만 출력한다.
npm run generation:notification:preflight --workspace my-app -- --printFingerprint
```

출력값을 App과 Workflow의 `GENERATION_WORKFLOW_CALLBACK_SECRET_FINGERPRINT`에 동일하게 설정한다. Workflow는 secret과 지문이 다르면 실행을 fail-closed하고, App의 production callback 인증도 같은 지문 검사를 통과해야 한다.

```powershell
npm run generation:notification:ops-check --workspace my-app
npm run notification-retention:contract:test --workspace my-app
npm run generation-workflow:contract:test --workspace my-app
npm run typecheck --workspace my-app
npm run generation:notification:preflight --workspace my-app

# 권한 있는 배포 창에서만 실행한다. callback secret을 해당 HTTPS App의 HEAD probe로 전송한다.
npm run generation:notification:preflight --workspace my-app -- --mode=deploy --appUrl=https://hairfit.beauty
```

로컬 preflight는 메일 payload와 원본 사진 retention을 포함한 필수 migration 7개의 루트·앱 미러, App/Workflow fingerprint 계약과 read-only HEAD probe 구현을 검사한다. deploy mode는 강한 secret과 지문 일치, 공개 HTTPS App URL, Resend key, 정확한 sender 주소를 검사한 뒤 배포 App의 인증 계약을 확인한다. `--skipAppProbe`는 합성 테스트나 설정 검토에만 사용하고 운영 승인 근거로 사용하지 않는다.

배포 환경에서는 migration/RPC/RLS의 실제 적용, Workflow secret 이름과 canary callback, Resend verified domain, 5분 cron, 관리자 aggregate 조회, 구조화 로그 수집과 호출 경보 연결을 추가 확인한다. 실제 메일의 정확히 1회 수신과 브라우저·앱 종료 후 재진입은 별도 외부 E2E 증거로 남긴다.

## Staging DB 동시성 smoke

운영 DB가 아닌 전용 staging DB에서만 실행한다. Supabase Connect 패널의 direct 또는 session-pooler URL을 사용하고 SSL을 유지한다. 실행 전 GitHub `release-candidate` environment 승인과 정확한 staging hostname을 이중 확인한다.

```powershell
npm run generation:notification:staging-db-smoke -- `
  --databaseUrl=$env:STAGING_DATABASE_URL `
  --environment=staging `
  --expectedHost=$env:STAGING_DATABASE_EXPECTED_HOST `
  --confirmStagingWrite=I_UNDERSTAND_THIS_WRITES_EPHEMERAL_FIXTURES `
  --artifactDir=.artifacts/generation-notification-staging
```

검증 항목은 concurrent enqueue의 단일 outbox 수렴, concurrent claim의 단일 lease 발급, stale prepare/begin token no-op, concurrent finish의 단일 `sent` 적용, rendered payload 불변, generation legacy mirror, fixture cleanup이다. artifact에는 연결 문자열·비밀번호·이메일·fixture UUID를 기록하지 않는다.

- `cleanup=completed`: 임시 user cascade로 generation/outbox까지 제거됨
- `cleanup=completed_after_failure`: 검증은 실패했지만 보상 cleanup은 성공함
- `cleanup=failed`: 추가 실행을 중단하고 staging에서 `notification_staging_smoke_%` 사용자 잔여를 제한된 관리자 연결로 확인한다. 일반 운영 쿼리나 공용 로그에 이메일·payload를 출력하지 않는다.

실제 staging run artifact URL이 없으면 Phase 09A/13의 staging 증거를 완료로 표시하지 않는다. 이 smoke는 Resend provider 호출과 실제 수신을 검증하지 않으므로 외부 메일 E2E를 대체하지 않는다.
