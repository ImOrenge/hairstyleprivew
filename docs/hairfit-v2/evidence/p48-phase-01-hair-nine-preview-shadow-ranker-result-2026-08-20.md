# P48 Phase 01 Hair 9안 Shadow Ranker — 로컬 종료 증거

- 검증일: 2026-08-20 KST
- 브랜치: `feat/2026-08-12-discovery-scroll`
- 시작 HEAD: `72b442045112c52c52dfa34dfb0e29526801f0d6`
- 범위: 결정론적 9안 ranker, owner-scoped API, idempotent revision 저장, RLS migration, legacy 선택 비교 계측
- 제외: 원격 migration, 실제 이미지 provider 9안, 실사용자 인증, 배포·canary

## 구현 증거

- `HairRecommendationDecisionV1`은 정확히 9개 accepted/terminal artifact에서만 `primary-ready`가 된다.
- fingerprint는 generation input, board version, accepted attempt와 output fingerprint, policy version을 결합한다.
- ranker는 hard failure 및 image/identity/instruction 품질 임계 미달 결과를 primary에서 제외한다.
- 질문 예산은 cycle당 최대 1개이며, shadow flag 기본값은 OFF다.
- customer shortlist/compare/selection 흐름은 유지되고, 기존 선택과 shadow primary 비교 실패는 selection을 차단하지 않는다.
- DB는 `(consultation_id, input_fingerprint, policy_version)`으로 replay를 멱등 처리한다.

## 검증 결과

| 검증 | 결과 |
|---|---:|
| ranker + shadow contract | PASS — 9/9 |
| app typecheck | PASS |
| workspace typecheck | PASS — Web, Native, shared 포함 |
| app lint | PASS |
| 기존 consulting contract | PASS — 112/112 |
| migration mirror | PASS — 102개 |
| 임시 로컬 PostgreSQL fresh-chain | PASS — 102/102 |
| RLS/force RLS | PASS — `true:true` |
| anon/service_role SELECT | PASS — `false:true` |

실행 명령:

```powershell
node --test lib/consulting/hair-recommendation-policy.test.ts lib/consulting/hair-recommendation-shadow-contract.test.ts
npm run typecheck
npm run lint
npm --prefix my-app run consulting:contract:test
npm --prefix my-app run supabase:migrations:mirror:check
npm --prefix my-app run supabase:migrations:fresh:check -- --databaseUrl=<ephemeral-local-postgres>
```

## fresh-chain 복구 기록

첫 실행은 `20260816095830_consultation_report_v2_versions.sql`이 snapshot base table보다 먼저 실행되는 기존 순서 오류에서 중단됐다. 적용 이력을 변경하지 않고 idempotent `20260816090000_consultation_report_snapshot_base.sql`을 양쪽 mirror에 추가했으며, 이후 전체 102개 migration이 통과했다.

검증용 PostgreSQL은 Docker 없이 Windows 로컬 실행 파일로 일회성 구동했다. 검증 후 서버를 중지하고 임시 디렉터리를 휴지통으로 이동했다.

## 미실행 증거와 P49 gate

- 원격 Supabase migration: `not_run`
- 실사용자 인증 API: `not_run`
- 실제 provider Hair 9개 생성과 품질 검증: `not_run`
- 배포/운영 canary: `not_run`

따라서 P49의 로컬 UI 구현은 진행할 수 있으나, AI-led UI를 실서비스에서 ON으로 전환하는 종료조건은 위 세 외부 증거가 확보될 때까지 닫혀 있다.
