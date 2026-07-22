# 회원 탈퇴 운영 Runbook

## 사용자 계약

- 웹: 마이페이지 `계정` 탭의 위험 영역에서 `계정 삭제`를 직접 입력해야 한다.
- Expo: 계정 화면 또는 마이페이지 `계정` 탭에서 OS 파괴적 확인을 거친다.
- 탈퇴가 완료되면 생성 사진, 생성·시술 확정·에프터케어·프로필·크레딧, Push 기기 연결과 진행 중 작업을 복구할 수 없다.
- Expo는 성공 직후 auth ResumeTarget, 현재 계정의 pending payment, Push opt-in·badge를 지우고 로컬 세션 종료를 시도한다.

## 서버 처리 순서

1. `request_account_deletion`이 사용자 해시 tombstone을 만들고 Storage 경로를 outbox에 적재한 뒤 `public.users`를 삭제한다.
2. FK `on delete cascade`로 Push 토큰과 사용자 소유 row를 함께 삭제한다.
3. 서버는 `storage.objects`를 직접 수정하지 않고 Supabase Storage API로 bucket별 객체를 삭제한다.
4. Storage 영수증이 모두 완료된 뒤 Clerk identity를 삭제한다.
5. Clerk 실패 시 tombstone이 `ensure_user_profile` 재생성을 차단하고 사용자는 같은 요청으로 재시도한다.
6. 완료된 tombstone과 Storage 영수증은 30일 뒤 `prune_account_deletion_tombstones`로 파기한다. `pg_cron`이 있으면 매일 03:17 UTC에 자동 등록된다.

## 운영 확인

```sql
select
  count(*) filter (where identity_deleted_at is null) as identity_pending,
  count(*) filter (where storage_cleanup_completed_at is null) as storage_pending,
  min(requested_at) filter (
    where identity_deleted_at is null or storage_cleanup_completed_at is null
  ) as oldest_pending_at
from public.account_deletion_tombstones;

select bucket, last_error_code, count(*)
from public.account_deletion_storage_outbox
where state = 'pending'
group by bucket, last_error_code
order by bucket, last_error_code;
```

- `storage_pending > 0`: Storage bucket 권한·object path·서비스 역할 환경을 확인하고 사용자의 같은 DELETE 요청 또는 운영 재시도를 수행한다.
- `identity_pending > 0`: Clerk Backend API 상태를 확인한다. 앱 데이터는 이미 삭제됐고 tombstone이 프로필 재생성을 차단한다.
- raw Clerk user ID, 이메일, Push token, Storage path를 애플리케이션 로그에 남기지 않는다.
- 원격 migration과 실제 Clerk 계정 삭제는 운영 승인·테스트 계정 없이 실행하지 않는다.

## 검증

```powershell
npm run account-deletion:contract:test
npm --workspace @hairfit/app test -- --runTestsByPath __tests__/account-deletion.test.ts __tests__/payment-resume.test.ts --runInBand
psql -v ON_ERROR_STOP=1 -f supabase/tests/account_deletion_privacy_cleanup_smoke.sql
npm run typecheck
```

SQL smoke는 DB cascade, 여섯 Storage 객체 수집, 재실행 멱등성, 프로필 재생성 차단, Push token 삭제, RLS·권한 차단, 30일 tombstone prune을 검사한다. 실제 Supabase Storage와 Clerk 삭제는 staging 테스트 계정으로 별도 확인한다.

## 롤백과 장애 경계

- migration을 롤백해 tombstone을 제거하면 삭제 요청 중 Clerk 계정이 남은 사용자의 프로필이 재생성될 수 있으므로, pending 행이 0인지 먼저 확인한다.
- Storage 삭제가 시작된 탈퇴 요청은 되돌리지 않는다. 같은 요청을 재시도해 완료한다.
- Clerk identity가 삭제된 뒤 DB 영수증 기록만 실패하면 사용자는 이미 탈퇴된 상태다. 운영에서 해시 tombstone 상태만 보정한다.
