# HairFit V2 P1-P2 contract and fixture evidence

기준 시각은 2026-08-11 KST다. 이 증거는 P1 기준선과 P2 shared contract 완료 범위만 다룬다. schema, capability facade, 인터뷰 UI 및 live 실행 완료를 주장하지 않는다.

## 추가한 정본

- `packages/shared/src/consulting/capability.ts`
  - 6개 capability ID
  - request/result/task receipt
  - input/output fingerprint, engine/source/provider/model/prompt/catalog provenance
  - entitlement·usage receipt
  - queued/waiting/running/partial/completed/retry/failed/cancelled transition
  - public receipt sanitizer
- `packages/shared/src/consulting/interview.ts`
  - domain-independent question·answer schema
  - revisioned draft, topic coverage, skip, unknown, conflict, summary confirmation
  - `currentStep`, question index, total step 거부
- `packages/shared/src/fixtures/consulting-v2.ts`
  - capability별 success/partial/failed 18개 receipt
  - Discovery·Fashion legacy form/interview normalized parity
  - 11 Scene route
  - Photo pass/warning/block signal
  - 9-slot partial/retry/usage restore
  - feature flag OFF rollback snapshot

기존 `PersonalColorEvidenceV2`, `SalonBriefV2`, `AftercareProgramV2`, V2 analysis·selection·preview 계약은 `@hairfit/shared/v2`의 기존 정본을 유지한다. `ConsultationInputProfile`과 `FashionDirectionSnapshot`에는 optional unknown/provenance/conflict/revision metadata만 additive하게 확장했다.

## 이번 실행 증거

| 검증 | 결과 |
|---|---:|
| shared typecheck | pass |
| shared 전체 test | `83 / 83` |
| Web typecheck | pass |
| Expo typecheck | pass |
| consulting contract | `26 / 26` |
| 변경 TSX/API/shared targeted ESLint | error `0` |
| 변경 경로 `git diff --check` | pass |

공개 capability receipt 직렬화 테스트는 prompt, provider raw response, service-role metadata가 포함되지 않음을 검증한다. 인터뷰 테스트는 unknown provenance 보존, optimistic revision conflict, skip coverage, open conflict blocker와 wizard cursor 거부를 검증한다.

## 기준선과 이번 실행을 구분한 항목

다음 값은 착수 전 기록이며 이번 P1-P2 실행에서 재검증하지 않았다.

- global CSS contract `9 / 9`
- migration mirror `83 / 83`
- catalog-v4 blueprint `182`
- consultation browser `14 / 14`
- production build

이 검증은 P15 최종 종합 검증에서 현재 테스트 수와 함께 다시 실행한다. 과거 기록을 이번 통과 증거로 재사용하지 않는다.

## 자동 생성 확인 제거의 현재 경계

- Hair preview는 전략 확정 후 Previews 진입 시 서버 이용 권한을 자동 확인하고 생성 접수를 시작한다.
- Fashion은 방향 확인 CTA 한 번 뒤 서버가 9-slot 이용 권한을 확인하고 자동 실행한다.
- 유료 생성 여부나 견적 승인을 묻는 별도 CTA와 API action은 제거했다.
- 이용 권한이 없으면 저장된 전략·인터뷰를 유지하고 `/billing`으로 안내한다.
- quote snapshot과 usage receipt는 중복 소비·복구용 서버 내부 증거로 남는다.

Fashion의 9개 provider 접수 loop는 아직 browser에 있으므로 P11 server batch 완료로 판정하지 않는다. P4 capability facade와 P11 durable server dispatcher에서 이동해야 한다.

## rollback

- `NEXT_PUBLIC_CONSULTATION_FRONTEND_V2=false`이면 기존 workspace entry를 유지한다.
- 신규 shared field는 optional이라 기존 Web·Expo 소비자가 무시할 수 있다.
- capability public contract는 schema v1이며 private execution record를 public response로 직접 반환하지 않는다.
- 신규 V2 row를 삭제하는 rollback은 허용하지 않는다.
