# P16 승인형 실환경 검증 실행 패킷

- 작성일: 2026-08-11 KST
- 범위: HairFit V2 원격 migration, 실인증, live AI/provider, canary, Expo 실기기 검증
- 현재 상태: `migration_pass / server_flags_off / vision_model_registered / local_live_analysis_pass / production_deploy_size_blocked`
- 원격 변경: 승인된 migration 3개, server rollout flag 25개 OFF, `PROMPT_VISION_MODEL=gpt-4o`, feature/develop source push. Worker source version 교체는 Cloudflare 3 MiB 제한으로 거부됨
- 제품 경계: 사용자에게 유료 생성 여부·견적·결제 승인을 묻지 않는다. entitlement·사용량·멱등·복구는 서버 내부에서 검증한다.

## 1. 현재 비파괴 준비 결과

원격 read-only 결과는 `p16-read-only-remote-diagnostic-2026-08-11.md`를 따른다. 원격 82개와 로컬 85개의 차이는 예상한 3개 migration뿐이며 dry-run, 기존 HairFit RLS/grant, private Storage와 advisor 확인을 통과했다.

승인된 후속 단계에서 `p16-cloudflare-off-registration-2026-08-11.md`와 같이 서버 rollout flag 25개를 명시적 `false`로 등록했다. 이어 별도 승인으로 정확한 3개 Supabase migration을 적용해 remote `82 -> 85`로 수렴했고 SQL 구조·PostgREST schema cache·service-role/anon 분리·advisor를 통과했다. 다시 분리 승인으로 `PROMPT_VISION_MODEL=gpt-4o` 한 이름을 등록해 OpenAI vision credential을 포함한 필수 서버 이름은 32/32 READY가 됐다. 모델 적용 결과는 `p16-cloudflare-model-registration-result-2026-08-11.md`에 고정했다. rollout flag·source deployment·provider 호출은 변경하지 않았고 공개 `/consulting/new`는 계속 404다.

`npm run hairfit-v2:live:preflight -- --mode=inventory --env=.env.local`은 값 자체를 출력하지 않고 다음만 확인한다.

- Supabase CLI `2.111.0` 설치
- linked project marker 존재
- root/my-app migration mirror `85 / 85` 일치
- Supabase, Clerk, Google·OpenAI provider 핵심 credential은 값 비노출 기준으로 구성됨
- `PROMPT_VISION_MODEL` 미고정
- 26개 rollout flag 중 8개만 명시됨
- 원격 migration 이력·RLS·Storage·advisor는 아직 조회하지 않음

따라서 현재 로컬 설정을 그대로 P16 canary에 사용하지 않는다. provider model과 모든 rollout flag를 대상 환경에서 명시한 뒤 preflight가 `READY`일 때만 원격 진단으로 진행한다.

## 2. 승인 전에 필요한 입력

- 원격 read-only 진단 승인
- migration 적용 승인: 완료
- 실인증·실사진·live provider 호출 승인
- Web canary와 Expo development build smoke 승인
- 테스트 계정과 entitlement 준비 여부
- 실제 사진 사용 동의와 보존·삭제 정책
- hair/Fashion 호출 비용 상한
- canary 담당자와 rollback 판단 담당자

승인은 한 번에 묶거나 단계별로 나눌 수 있다. read-only 진단 승인은 migration 적용이나 provider 비용 승인을 포함하지 않는다.

## 3. 비밀정보 규칙

- `.env.local`, access token, service-role key, Clerk secret, provider key의 값은 출력·로그·문서·채팅에 남기지 않는다.
- 이메일, user ID, project ref, 원본 Storage path는 redacted fingerprint 또는 내부 evidence ID로만 기록한다.
- `NEXT_PUBLIC_`에는 publishable URL/key만 허용하며 service-role이나 provider secret을 두지 않는다.
- 사용자 수정 가능 metadata를 RLS 권한 판정에 사용하지 않는다.
- public schema 신규 table은 RLS·권한을 함께 확인하고, Storage upsert는 INSERT·SELECT·UPDATE 정책을 모두 확인한다.

## 4. 승인 후 실행 순서

### Gate A — 대상 환경 inventory

```powershell
npm run hairfit-v2:live:preflight -- --mode=inventory --env=<approved-env-file>
supabase migration list --linked
supabase db push --linked --dry-run
supabase db advisors --linked --type security --level warn --fail-on error
supabase db advisors --linked --type performance --level warn --fail-on error
```

이 단계는 read-only 승인 범위다. migration 예상 목록이 정확히 3개가 아니거나 기존 remote history와 충돌하면 중단한다.

### Gate B — flag OFF smoke

대상 환경 snapshot을 별도 보관하고 master frontend와 consultation session을 명시적으로 `false`로 둔다.

```powershell
npm run hairfit-v2:live:preflight -- --mode=off --env=<approved-off-env-file>
```

기존 workspace, deep link, 저장 결과, 결제·entitlement 경로가 유지되는지 확인한다. 이 단계에서 V2 신규 접수가 발생하면 중단한다.

### Gate C — migration 적용

Gate A의 dry-run, advisor, backup/복구 확인과 별도 적용 승인이 모두 있을 때만 실행한다.

```powershell
npm run hairfit-v2:supabase:apply
npm run hairfit-v2:supabase:apply -- --apply --confirm=HAIRFIT_V2_SUPABASE_3_MIGRATIONS
```

첫 명령은 정확한 대상 fingerprint, `82 -> 85`, 승인된 3개 파일과 제외 범위만 출력하고 원격에 접근하지 않는다. 두 번째 명령은 별도 적용 승인 후에만 실행한다. 실행기는 linked project fingerprint, root/my-app migration mirror, 적용 전 remote 82개, dry-run의 정확한 3개 순서, 적용 후 remote 85개와 세 version 존재를 fail-closed로 검증한다. 예상과 하나라도 다르면 `db push` 전 또는 적용 직후 실패한다.

적용 후에는 `supabase/tests/hairfit_v2_remote_post_apply_contract.sql`을 read-only transaction으로 실행해 migration history 85개, 신규 table/RPC, forced RLS, service-role-only grant, security-invoker와 필수 index를 검증한다. 이어 다음 명령으로 PostgREST schema cache와 Data API 권한을 검증한다.

```powershell
npm run hairfit-v2:supabase:post-apply
npm run hairfit-v2:supabase:post-apply -- --run --confirm=HAIRFIT_V2_SUPABASE_POST_APPLY_READ_ONLY
```

기본 명령은 원격 접근 없이 계획만 출력한다. 실행 모드는 service role로 신규 내부 table 7개와 운영 snapshot RPC가 schema cache에 반영됐는지 읽기 확인하고, anon 요청은 모두 PostgreSQL `42501`로 거부되는지 확인한다. migration 마지막에는 공식 PostgREST 절차인 `NOTIFY pgrst, 'reload schema'`를 포함한다. 실행기가 출력하는 `COMPLETE`는 migration history 확인이며 SQL 구조 계약과 Data API 계약까지 모두 통과해야 Gate C가 닫힌다. down/drop migration은 사용하지 않는다.

### Gate C.5 — vision model 이름 등록

별도 모델 등록 승인 후에만 실행한다. 상세 안전 계약은 `p16-cloudflare-model-registration-readiness-2026-08-11.md`를 따른다.

```powershell
npm run hairfit-v2:cloudflare:model
npm run hairfit-v2:cloudflare:model -- --apply --confirm=HAIRFIT_V2_PROMPT_VISION_MODEL_GPT_4O
```

이 gate는 `PROMPT_VISION_MODEL=gpt-4o` 한 항목만 등록하며 rollout flag, source deployment와 provider 호출은 변경하지 않는다. 얼굴 분석 실행기는 해당 값에서 OpenAI Responses API를 선택하며 `OPENAI_API_KEY`는 별도 값 변경 없이 기존 secret 이름 존재만 확인한다.

### Gate C.6 — source revision 고정과 Cloudflare bundle

`p16-source-deployment-readiness-2026-08-11.md`를 따른다. OpenNext 로컬 bundle은 통과했지만 현재 source가 미커밋이므로 commit SHA, bundle manifest, remote branch SHA가 연결되기 전에는 배포하지 않는다. Git 고정, push, deploy, canary는 각각 승인 경계를 유지한다.

### Gate D — canary 설정과 실제 여정

```powershell
npm run hairfit-v2:live:preflight -- --mode=canary --env=<approved-canary-env-file>
```

다음 순서를 같은 consultation ID로 검증한다.

1. Clerk 실제 로그인과 상담 생성
2. Discovery 인터뷰 autosave·이탈·재진입
3. 사진 upload→시스템 preflight→landmark→live AI evidence→overlay
4. Personal Color provenance
5. hair 방향 확정→서버 entitlement 검증→9-slot→partial/retry→ready
6. Compare→Decision→자동 Salon Brief
7. Fashion 인터뷰→방향 확정→서버 entitlement 검증→9-look batch→selection
8. 실제 시술 기록→Aftercare→check-in
9. browser close 동안 task 지속과 resume
10. reservation·consume·restore·replay와 balance reconciliation

사용자에게 유료 생성 확인 화면이나 추가 승인 CTA를 삽입하지 않는다.

### Gate E — canary와 Expo

- Web 5%→25%→100%는 단계별 관찰 창과 rollback threshold를 통과할 때만 증가시킨다.
- Expo development build에서 로그인, 같은 consultation resume, Photo, Analysis overlay, partial result와 exit를 검증한다.
- 실기기 증거 없이 Expo 완료로 기록하지 않는다.

## 5. 즉시 중단 조건

- 예상 밖 migration 또는 destructive SQL
- RLS/Storage가 다른 사용자 row/object 접근을 허용
- service-role/provider secret이 client bundle이나 로그에 노출
- 같은 idempotency key의 중복 비용·중복 result
- accepted 결과 유실 또는 partial retry가 완료 slot을 재생성
- landmark/evidence가 다른 photo revision과 연결
- entitlement balance 불일치가 자동 reconciliation으로 수렴하지 않음
- canary 오류율·지연·비용이 승인된 threshold 초과

## 6. Rollback

1. 문제 capability flag만 `false`로 바꿔 신규 접수를 legacy/inline adapter로 우회한다.
2. 이미 accepted/running인 task는 조회·callback·복구를 유지한다.
3. V2 row와 legacy read adapter는 보존한다.
4. reservation·consumed·restored 상태를 reconciliation한다.
5. 필요하면 master frontend와 consultation session을 모두 `false`로 내린다.
6. migration down/drop이나 데이터 삭제는 별도 승인 없이 수행하지 않는다.

## 7. 증거 형식

각 gate는 `timestamp`, source HEAD, migration 목록 hash, flag snapshot hash, redacted account fingerprint, consultation evidence ID, 비용 상한/실사용, 결과, rollback 여부를 남긴다. 비밀값·이메일·원본 경로·사진은 보고서에 포함하지 않는다.

P16 종료는 원격 migration·RLS·Storage, 실인증 분석·overlay, hair/Fashion 실제 생성과 복구, actual service·Aftercare, exit/resume, canary, Expo 실기기 증거가 모두 있을 때만 가능하다.

## 8. Supabase 근거

- Data API는 object grant와 RLS를 별도 계층으로 적용하므로 둘을 각각 확인한다: <https://supabase.com/docs/guides/api/securing-your-api>
- exposed schema의 `SECURITY DEFINER` 함수는 피하고 필요한 role에만 `EXECUTE`를 부여한다: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- schema 변경 후 PostgREST cache reload는 `NOTIFY pgrst, 'reload schema'`를 사용한다: <https://supabase.com/docs/guides/troubleshooting/refresh-postgrest-schema>
