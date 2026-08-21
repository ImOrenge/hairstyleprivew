# P28 — Personal Color V2 · Makeup Phase 00 기준선

## 목적

퍼스널 컬러 V2와 Makeup Direction 구현 전에 현재 legacy 결과와 API를 고정하고, 신규 계약·flag·telemetry가 꺼진 상태에서 기존 동작을 바꾸지 않도록 한다.

## 기준

- 패키지 기준 commit: `b33c33c6e0bc70413322a9af3be2f848500a1443`
- 실제 작업 기준: 현재 feature worktree HEAD와 같은 컨텍스트의 미커밋 컨설팅 변경
- rollout flag 기본값: `PERSONAL_COLOR_V2_WRITE=false`, `PERSONAL_COLOR_V2_READ=false`, `MAKEUP_DIRECTION_V1=false`
- 정본: 서버의 versioned snapshot/projection. 클라이언트 상태는 정본을 덮어쓰지 않는다.

## 도입 계약

- `@hairfit/shared/personal-color-v2`
  - 5축은 `value | null`, `confidence`, `evidenceIds`, `unavailableReason`을 분리한다.
  - Quick·Precision·legacy import를 구분한다.
  - capture quality와 profile confidence를 합치지 않는다.
- `@hairfit/shared/makeup`
  - base, brow, eyeshadow, eyeliner, blush, lip, lashes 7개 모듈을 고정한다.
  - gender는 context 값이며 module availability를 변경하지 않는다.
  - 좌표는 원본 이미지 기준 normalized `0..1`이다.
  - 얼굴 합성·morph·smoothing 계약은 포함하지 않는다.

## Legacy 기준선

- `/api/personal-color/analyze`는 Clerk 인증, owner profile 보장, `user_style_profiles` projection, `{ personalColor, capability }` 응답을 유지한다.
- 정상화 golden fixture는 실제 사용자 사진이나 data URL을 포함하지 않는다.
- normalizer의 fallback은 V2 측정값으로 간주하지 않는다. V2 profile로 import할 때는 `captureMode=legacy_unknown`과 unavailable 축을 사용한다.
- V2 write flag가 켜진 경우에만 canonical legacy projection SHA-256을 telemetry에 기록한다. 원본 data URL, asset path, 피부 sample, provider raw payload는 허용 목록에서 제거한다.

## Fixture governance

허용:

- 합성 JSON 결과
- 가상의 UUID·시간·모델명
- 색상 hex와 enum
- 공개 라이선스 또는 명시적으로 생성된 테스트 전용 이미지의 fingerprint

금지:

- 실제 고객 얼굴 이미지와 data URL
- Storage private path와 signed URL
- Clerk user ID, 이메일, 세션·토큰
- 원시 피부 RGB/Lab sample과 provider raw response

이미지가 필요한 후속 phase fixture는 저장소에 포함하기 전에 출처·라이선스·생성 방법·동의 범위·삭제 정책을 fixture manifest에 기록한다.

## Phase 00 종료 증거

- `npm run personal-color-v2:phase-00:test`
- `npm --workspace @hairfit/shared test`
- `npm --workspace @hairfit/shared run typecheck`
- `npm --prefix my-app run typecheck`
- `npm --workspace @hairfit/app run typecheck`
- `npm run supabase:migrations:mirror:check`
- feature flag off에서 legacy route 계약 및 기존 화면 회귀 없음

Phase 00은 위 검증이 모두 통과하기 전에는 완료로 표시하지 않는다. DB schema와 UI read 전환은 후속 phase에서 additive하게 수행한다.

## 2026-08-14 검증 결과

| Gate | 결과 | 증거 |
|---|---|---|
| Legacy API·normalizer golden | PASS | `personal-color-v2:phase-00:test` 6/6 |
| Shared contract·JSON Schema | PASS | `@hairfit/shared` 99/99, Ajv 2020-12 validation 포함 |
| Shared typecheck | PASS | `tsc -p packages/shared/tsconfig.json --noEmit` |
| Web import/typecheck | PASS | `my-app` typecheck |
| Expo import/typecheck | PASS | `@hairfit/app` typecheck |
| Redacted telemetry | PASS | 허용 hash 외 image/path/skin payload 제거 계약 테스트 |
| Feature flag off | PASS | 세 flag가 환경값 `true`일 때만 활성화되고 legacy response builder는 동일 shape 유지 |
| Migration mirror | PASS | 88개 root/my-app migration mirror 일치 |
| Migration fresh-chain | 해당 없음 | Phase 00은 migration delta가 없으며 Docker를 사용하지 않는다. 전체 SQL fresh-chain은 DB 변경이 시작되는 phase의 최종 Gate에서 실행한다. |
| Focused web lint | PASS | 변경된 route·normalizer·telemetry·계약 테스트 파일 |

UI component와 CSS는 Phase 00에서 변경하지 않았으므로 screenshot delta는 없다. 화면 검증은 V2 read UI가 처음 도입되는 phase에서 flag off/on을 나란히 기록한다.
