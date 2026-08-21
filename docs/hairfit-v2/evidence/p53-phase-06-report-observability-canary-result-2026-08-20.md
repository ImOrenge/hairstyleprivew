# P53 Phase 06 Result·PDF·Observability·Canary 검증 결과 — 2026-08-20

## 판정

로컬 계약·Web/Native Result·PDF projection·provenance·migration·관측·rollout/off dry-run 종료 기준을 충족했다. AI가 한 개를 기본 권장하더라도 생성 결과를 숨기지 않는다. Hair는 recommendation revision의 9개 전부, Fashion은 batch가 요청한 3·6·9개 전부를 같은 report projection으로 Web·Native·PDF에 전달한다.

실사용자 Clerk 왕복, 실제 Hair/Fashion provider 비용 집행, 실상품 원격 source, 원격 Supabase, 물리 기기, 배포 Canary는 사용자 요청으로 패스했다. 로컬 fixture와 dry-run 결과를 외부 실행 증거로 간주하지 않는다.

## 구현 범위

- Hair 9개와 Fashion 3·6·9개 전체를 보존하는 `ConsultingResultProvenanceV3`
- AI primary/recommended와 고객 confirmed/selected를 별도 표식으로 유지
- 같은 projection builder를 사용하는 Web Result, Native Result, PDF
- Hair/Fashion 생성 ID·requested/terminal count·snapshot/revision을 묶는 source fingerprint
- Fashion batch가 3→6→9로 확장되면 기존 immutable PDF를 덮지 않고 새 source snapshot을 생성하는 uniqueness 계약
- 상품 추천 당시 offer snapshot 전체와 현재 가격·재고 재확인 경계
- 원문·사진 URL·credential을 제외한 aggregate observability event
- Product Truth → Onboarding Personalization → Trend → Adaptive Fashion → AI-led Hair 순서의 rollout/off 계약
- report projection mismatch reconciliation과 관리자 scope

## 검증 결과

| 검증 | 결과 |
|---|---|
| P53 report/observability focused | PASS — 10/10 |
| consultation regression | PASS — 129/129 |
| Shared regression | PASS — 156/156 |
| Native focused Jest | PASS — 9/9 |
| Web typecheck | PASS |
| Shared typecheck | PASS |
| API client typecheck | PASS |
| Native typecheck | PASS |
| focused Web ESLint | PASS — error/warning 0 |
| focused Native ESLint | PASS — error/warning 0 |
| component registry/passports | PASS — 64/64 |
| migration mirror | PASS — 107/107 |
| empty PostgreSQL fresh chain | PASS — 107/107 |
| existing-schema upgrade probe | PASS — legacy row `legacy-v1`, new unique index, RLS/FORCE RLS 유지 |
| browser Hair 전체 노출 | PASS — 9/9 |
| browser Fashion 전체 노출 | PASS — 9/9 |
| browser product snapshot | PASS — 추천 당시 상품명·가격·재고·사이즈·관측 시각·링크 노출 |
| browser responsive overflow | PASS — 390/768/1440, horizontal overflow 0 |
| browser console | PASS — app error 0; 로컬 Clerk development-key 경고만 존재 |
| canary upload dry-run | PASS — 37 flags, production traffic changed `no` |
| OFF upload dry-run | PASS — 37 flags all false, production traffic changed `no` |
| Docker | 사용하지 않음 |

## 생성 내용 전체 노출 증거

- Hair 탭은 `data-report-generated-gallery="hair-all"` 아래 9개 카드를 표시한다.
- 각 Hair 카드에는 rank, grid role, generation state, AI primary, 고객 confirmed 상태가 유지된다.
- Fashion 탭은 `data-report-generated-gallery="fashion-all"` 아래 현재 batch의 9개 fixture 카드를 표시했다.
- 각 Fashion 카드에는 role, generation state, AI recommended, 고객 selected 상태가 유지된다.
- terminal 실패도 projection에서 제거하지 않으며 image가 없으면 상태 placeholder로 남긴다.
- Native는 `reportHairSection.payload.candidates`와 `reportFashionSection.payload.looks`를 필터링하지 않고 순회한다.
- PDF renderer도 같은 배열과 provenance fingerprint를 사용한다.
- 추천 당시 실제 상품은 생성 시뮬레이션과 별도 영역에서 모든 offer snapshot을 표시한다.

## Migration·불변성 증거

- `consultation_report_snapshots_v2.source_fingerprint`는 `legacy-v1` 기본값과 길이 제약을 가진다.
- source uniqueness는 consultation/result/renderer 조합에 fingerprint를 추가한다.
- 같은 source fingerprint는 기존 immutable report를 재사용한다.
- Fashion batch 확장처럼 generated ID/count가 바뀌면 fingerprint가 달라져 새 report snapshot이 생성된다.
- 기존 report row는 backfill 이후에도 유지되며 RLS와 FORCE RLS가 모두 활성 상태다.

## Rollout·rollback 증거

- canary dry-run은 신규 5개 플래그를 포함한 37개 server flag 계획만 출력했고 secret value와 production traffic을 변경하지 않았다.
- OFF dry-run은 동일 37개 flag를 모두 false로 계획했다.
- 플래그 순서는 Product Truth, Onboarding Personalization, Trend, Adaptive Fashion, AI-led Hair다.
- rollback은 신규 접수를 차단하되 snapshot, artifact, report, usage receipt를 삭제하지 않는다.

## 증거 경계

| 증거층 | 상태 |
|---|---|
| 로컬 contract/runtime | passed |
| Web fixture UI | passed |
| Native static interaction/type/lint | passed |
| 로컬 PDF projection parity | passed |
| 로컬 migration/RLS | passed |
| rollout/off dry-run | passed_no_traffic_change |
| 실사용자 Clerk | waived_by_user |
| 실제 유료 Hair/Fashion provider | waived_by_user |
| 실상품 원격 source | waived_by_user |
| 물리 기기 | waived_by_user |
| 원격 DB/배포 Canary | waived_by_user |

## 변경 권한 경계

커밋·merge·push·원격 migration·배포·트래픽 변경은 수행하지 않았다. 기존 더티 변경을 보존했고 P47~P53 작업은 현재 개발 worktree에만 남아 있다.
