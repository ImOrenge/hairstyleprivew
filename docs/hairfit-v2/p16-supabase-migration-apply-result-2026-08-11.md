# P16 Supabase migration 원격 적용 결과

- 실행일: 2026-08-11 KST
- 승인 범위: 정확한 3개 migration 적용과 즉시 read-only 구조/Data API 검증
- 대상 표기: `sha256:d31e06fb131f`
- 판정: `migration_gate_pass`
- 비밀값·project ref·사용자 row 출력: 없음

## 적용 결과

fail-closed 실행기가 linked fingerprint, root/my-app mirror, remote baseline 82, dry-run exact 3을 다시 확인한 뒤 적용했다.

| 항목 | 결과 |
|---|---|
| remote migration | `82 -> 85` |
| 승인 migration | `3 / 3` |
| 예상 밖 migration | 없음 |
| destructive/down SQL | 없음 |
| Cloudflare flag/model/source deploy | 변경 없음 |

적용 migration은 `p16-supabase-migration-apply-readiness-2026-08-11.md`에 고정한 순서와 SHA를 따른다.

## 원격 SQL 구조 검증

`supabase/tests/hairfit_v2_remote_post_apply_contract.sql`을 read-only transaction으로 실행했고 `hairfit_v2_remote_post_apply_contract_passed`를 확인했다.

- migration history 85와 세 version 존재
- 신규 내부 table 7개 존재
- 신규 RPC 5개 존재
- 7개 table forced RLS
- anon/authenticated table grant 없음
- service role table CRUD grant 존재
- anon/authenticated RPC execute 없음
- service role RPC execute 존재
- exposed RPC 5개 모두 `SECURITY INVOKER`
- 필수 index 19개 존재

## PostgREST schema cache와 Data API

| 검증 | 결과 |
|---|---|
| service-role 신규 table 조회 | `7 / 7` |
| anon 신규 table 거부 | `7 / 7`, PostgreSQL `42501` |
| service-role operations snapshot RPC | 성공 |
| anon operations snapshot RPC | `42501` 거부 |
| `PGRST002` / `PGRST205` | 발생 없음 |
| 비밀값·row data 출력 | 없음 |

첫 검증에서 anon `HEAD` 요청이 실제 `401` 거부였지만 빈 HTTP body 때문에 PostgreSQL code를 읽지 못했다. 권한 성공으로 오판하지 않고 중단했다. anon 검증을 row data를 반환하지 않는 `GET + limit(0)`으로 바꿔 JSON 오류 본문의 `42501`을 확인했고 contract fixture를 추가했다.

## Advisor

- security global WARN: 1, 기존 `public.citext` extension 위치 문제이며 이번 migration과 무관
- HairFit 신규 객체 security WARN: 0
- HairFit 신규 table security INFO: 7개 `rls_enabled_no_policy`; anon/auth grant를 제거한 service-role-only 내부 table 설계와 일치
- performance global WARN: 42, 적용 전과 동일
- HairFit 신규 객체 performance WARN: 0
- HairFit 신규 index INFO: `unused_index`; 생성 직후 운영 트래픽이 없는 상태로 삭제 근거가 아님

기존 global WARN의 공식 remediation은 <https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public>이다.

## 주변 불변

| 항목 | 결과 |
|---|---|
| Cloudflare required server names | `31 / 32` |
| 남은 이름 | `PROMPT_VISION_MODEL` |
| `/` | HTTP 200 |
| `/workspace` | HTTP 307, login redirect |
| `/consulting/new` | HTTP 404 |

이번 승인은 Cloudflare flag ON, model 등록, source deployment, 실인증·실사진·live provider·canary를 포함하지 않았으며 실행하지 않았다.

## 다음 승인 경계

P16 전체는 아직 완료가 아니다. 다음 분리 gate는 `p16-cloudflare-model-registration-readiness-2026-08-11.md`의 `PROMPT_VISION_MODEL=gpt-4o` 단일 이름 등록이다. 그 뒤 canary 환경 고정과 실인증·실사진·live AI/provider 호출 비용을 수반하는 검증에 다시 별도 승인이 필요하다.
