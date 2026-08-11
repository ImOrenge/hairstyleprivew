# P16 Supabase migration 적용 준비 증거

- 확인일: 2026-08-11 KST
- 상태: `ready_for_separately_approved_apply`
- 원격 변경: 없음
- 대상 표기: project ref 대신 승인된 `sha256:d31e06fb131f` fingerprint만 사용

## 원격 read-only 재확인

보안 수정 이후 linked project에 대해 migration list와 `db push --linked --dry-run`만 다시 실행했다.

| 항목 | 결과 |
|---|---|
| remote migration | 82 |
| local migration | 85 |
| pending | 정확히 3개 |
| 예상 밖 remote-only/pending | 없음 |
| migration apply | 실행하지 않음 |

승인된 pending 순서와 현재 SHA-256은 다음과 같다.

| 순서 | migration | SHA-256 |
|---:|---|---|
| 1 | `20260809111554_consultation_lifecycle_tasks.sql` | `df603c4c9e048188fcb566794bd91bfdabbc5e60600ec0bbdaf063c1ef5d03c8` |
| 2 | `20260811052530_consultation_observability_operations.sql` | `383236397d0adf335df5fa951ee191a42081bbe5b03e4f4d70c3cd256633554b` |
| 3 | `20260811154500_hairfit_v2_fk_indexes.sql` | `f1907f5c9436d3236ae5e76422fd475987d963924cc3348d334289253b6a4f89` |

## 적용 전 보안 수정

- exposed `public` schema의 신규 운영 RPC 2개는 service-role 전용이며 별도 권한 상승이 필요하지 않다.
- `consultation_operations_snapshot_v2(interval)`과 `prune_consultation_observability_v2(integer, integer)`를 `SECURITY INVOKER`로 고정했다.
- 모든 신규 내부 table은 forced RLS이며 anon/authenticated object grant를 제거한다.
- 모든 신규 RPC는 anon/authenticated execute를 제거하고 service role에만 부여한다.
- 마지막 migration에 `NOTIFY pgrst, 'reload schema'`를 넣어 신규 table/function schema cache 반영을 요청한다.

## 실행기 실출력 검증

Supabase CLI `2.111.0`의 실제 `migration list` stdout은 `migrations` 배열 JSON이며 legacy migration version에는 12자리와 14자리가 함께 존재한다. 최초 실행기 parser가 ASCII 표와 14자리만 가정하면 remote count를 0 또는 47로 오판하는 문제를 적용 전에 발견했다.

현재 parser는 다음을 모두 지원한다.

- CLI JSON `migrations[].remote`
- ASCII `|`와 Unicode `│` 표 fallback
- ANSI escape 제거
- legacy 8~14자리 remote version
- 새 pending 파일은 정확한 14자리 파일명 3개만 허용

unit fixture 5/5와 linked 실제 stdout에서 remote `82`, 마지막 remote `202608090004`를 확인했다. 따라서 승인 후 baseline count 검사가 잘못된 parser 때문에 apply 전에 거부되는 문제를 제거했다.

## 로컬 DB 재검증

Docker 없이 고정 임시 native PostgreSQL 18.4에서 수행했다.

- 85개 migration fresh-chain 통과
- RLS/RPC privilege 통과
- entitlement idempotency·경쟁 통과
- accepted 9-slot 정산 통과
- Capability lease reclaim·fencing·retry·result replay 통과
- selection replay·account deletion cascade 통과
- 임시 서버 정상 종료
- 임시 data directory는 Windows 휴지통으로 이동해 현재 경로와 포트가 남지 않음

## 적용 후 필수 검증

적용 실행기의 `COMPLETE`만으로 Gate C를 닫지 않는다.

1. remote migration history가 85이고 세 version이 모두 존재하는지 확인
2. `supabase/tests/hairfit_v2_remote_post_apply_contract.sql`을 read-only transaction으로 실행
3. 7개 신규 table, 5개 RPC, forced RLS, role grant, security-invoker, 19개 index 확인
4. PostgREST에서 service role의 7개 table·운영 snapshot RPC 성공 확인
5. anon의 동일 접근이 모두 PostgreSQL `42501`로 거부되는지 확인
6. schema cache 오류 `PGRST002`/`PGRST205`가 없는지 확인

## 승인 경계

다음 정확한 승인 전에는 적용하지 않는다.

`P16 Supabase 3개 migration 원격 적용 승인`

이 승인은 위 SHA의 3개 migration 적용과 즉시 read-only 구조/Data API 검증만 포함한다. Cloudflare flag ON, `PROMPT_VISION_MODEL`, 소스 배포, 실인증·실사진·live provider·canary는 포함하지 않는다.
