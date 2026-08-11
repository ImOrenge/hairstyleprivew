# P16 원격 Read-only 진단 증거

- 실행일: 2026-08-11 KST
- 사용자 승인 범위: 원격 read-only 진단
- 연결 대상 fingerprint: `sha256:d31e06fb131f`
- 판정: `read_only_pass / migration_not_applied / live_not_run`
- 원격 변경·migration 적용·데이터 수정·provider 호출·배포: 없음

## 승인 경계

이번 승인은 migration history 조회, `db push --dry-run`, advisor 조회와 system catalog `SELECT`만 포함한다. migration 적용, flag 변경, 실인증, 사진 upload, AI/provider 비용, canary와 Expo 실기기는 포함하지 않는다.

## 연결 확인

- 로컬 Supabase link marker와 `NEXT_PUBLIC_SUPABASE_URL`의 project ref가 일치한다.
- project ref 원문은 출력하거나 증거 문서에 기록하지 않고 SHA-256 prefix만 사용했다.
- Supabase CLI: `2.111.0`

## Migration history와 dry-run

| 항목 | 결과 |
|---|---:|
| 원격 적용 migration | 82 |
| 로컬 mirror migration | 85 / 85 |
| 원격 미적용 | 3 |
| `supabase db push --linked --dry-run` | exit 0, 실제 push 없음 |

dry-run이 제시한 migration은 정확히 다음 3개다.

1. `20260809111554_consultation_lifecycle_tasks.sql`
2. `20260811052530_consultation_observability_operations.sql`
3. `20260811154500_hairfit_v2_fk_indexes.sql`

예상 밖 migration, seed, role 변경은 없었다.

## 현재 원격 HairFit 구조

현재 적용된 다음 테이블은 모두 RLS가 켜져 있고 `anon`·`authenticated` grant 없이 `service_role`만 접근한다.

- `consultation_sessions`
- `consultation_shortlists_v2`
- `salon_brief_versions_v2`
- `actual_services_v2`
- `aftercare_programs_v2`
- `fashion_preview_sets_v2`
- `hairfit_v2_domain_events`

이 테이블들의 policy count 0은 public access 누락이 아니라 service-role-only 저장소 계약과 일치한다. Supabase 공식 문서가 설명하듯 grant가 객체 접근 여부를 정하고 RLS가 접근 가능한 role의 row 범위를 정한다. 이번 대상은 `anon`·`authenticated` grant 자체를 제거했다.

공식 참고: [Securing your API](https://supabase.com/docs/guides/api/securing-your-api)

## 미적용 구조 확인

다음 대상은 원격에 아직 없으며 첫 번째 pending migration이 생성한다.

- `consultation_analysis_runs_v2`
- `fashion_preview_batches_v2`
- `hairfit_v2_engine_source_manifests`
- `consultation_capability_tasks_v2`
- `consultation_capability_attempts_v2`
- `consultation_capability_results_v2`
- `consultation_interview_drafts_v2`

다음 service-role-only 함수도 아직 없으며 pending migration 적용 전 상태와 일치한다.

- `claim_consultation_capability_tasks_v2`
- `claim_consultation_capability_task_v2`
- `complete_consultation_capability_task_v2`
- `consultation_operations_snapshot_v2`
- `prune_consultation_observability_v2`

## Storage

다음 4개 bucket은 모두 `public = false`다.

| Bucket | 제한 | MIME |
|---|---:|---|
| `generation-results` | 16 MB | WebP, PNG, JPEG |
| `profile-body-photos` | 8 MB | WebP, JPEG, PNG |
| `styling-results` | 12 MB | WebP, PNG, JPEG |
| `aftercare-photos` | 8 MB | WebP, JPEG, PNG |

## Advisor

### Security

- INFO 51: RLS enabled/no policy. service-role-only 테이블을 포함한 기존 원격 전체 진단이다.
- WARN 1: `citext` extension이 `public` schema에 설치됨.
- HairFit pending migration에 의해 새로 발생한 security WARN은 아직 없다.

`citext` WARN은 3개 HairFit pending migration과 무관한 기존 전역 부채다. migration 적용 전에 즉석에서 이동하지 않으며 별도 호환성·영향도 작업으로 분리한다.

공식 remediation: [Extension in Public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)

### Performance

- WARN 42: 기존 원격 전체의 multiple permissive policies와 auth connection 설정.
- HairFit 범위 WARN: 0.
- HairFit INFO 3: `hairfit_v2_domain_events`의 correlation/consultation/user index 미사용. 아직 실운영 트래픽이 거의 없는 상태와 일치하며 삭제 근거로 사용하지 않는다.

세 번째 pending migration은 로컬 fresh-chain에서 발견한 V2 FK index 6개를 보강한다. 원격에는 해당 table 자체가 아직 없으므로 적용 전 advisor에 나타나지 않는 것이 정상이다.

## 결론과 다음 경계

연결 대상, migration drift, 기존 RLS/grant, private Storage와 advisor를 read-only로 확인했다. 예상 밖 drift나 HairFit-scoped WARN은 없다. 따라서 별도 승인을 받으면 세 migration 적용 단계로 진행할 수 있다.

다만 현재 실행 환경 preflight는 `PROMPT_VISION_MODEL` 미고정과 rollout flag 18개 미명시 때문에 `NOT READY`다. migration 적용 승인과 live/canary 승인은 서로 분리하며, migration을 적용하더라도 실인증·provider·배포를 자동 시작하지 않는다.

## Cloudflare Web Worker 환경 Read-only 보완

후속 승인으로 실제 OpenNext Web Worker의 secret 이름과 공개 route 상태만 확인했다. secret 값, Worker source, account 정보와 로그는 읽지 않았다.

- Web 배포 대상: OpenNext Cloudflare Worker
- Wrangler: `4.112.0`
- HairFit V2 필수 서버 secret 이름: 5 / 31 존재
- 누락: `PROMPT_VISION_MODEL`과 25개 서버 rollout flag
- `NEXT_PUBLIC_` 4개 항목은 build-time 값이므로 Worker secret 이름 검사 대상에서 제외
- `/`: HTTP 200
- `/workspace`: HTTP 307, 로그인으로 이동
- `/consulting/new`: HTTP 404

따라서 현재 공개 배포에는 AI Consultant 신규 진입 경로가 열려 있다는 증거가 없다. 404만으로 build-time flag OFF와 구 revision 배포를 구분할 수 없으므로 둘 중 하나를 추정해 통과 처리하지 않는다. Cloudflare 환경은 `remote_env_not_ready`다.

서버 flag가 단순 누락 상태여도 core V2 API는 정확한 `true`를 요구하므로 활성화되지 않지만, 독립 rollback과 배포 재현성을 위해 OFF 단계에서도 값을 명시해야 한다. 다음 변경 단계는 별도 승인 아래 server flag를 명시적 `false`로 등록하고, 그 상태를 재조회한 뒤 migration 적용 여부를 판단한다.
