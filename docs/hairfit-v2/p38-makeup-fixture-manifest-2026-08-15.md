# HairFit V2 P38 메이크업 라인 맵 fixture manifest

- 작성일: 2026-08-15
- 데이터 등급: 합성 계약 fixture + 저장소 내 세미리얼 모델 자산
- 실제 고객 사진: 사용하지 않음
- 목적: 기하 정확도, 표현 범위, 가림 fallback, 렌더링 회귀를 재현 가능하게 검증

## 고정 자산

| 자산 | SHA-256 | 용도 |
|---|---|---|
| `my-app/public/images/consulting/models/hairfit-semi-real-model-v1.png` | `99858c12d9d30be0c2f1cbb63eeeebf335b7884e68b6b42fa25be4b332f67225` | Web 골든 원본 |
| `packages/shared/src/makeup/fixture-landmarks-v3.ts` | `a0ad9f5fc857d73b795ba3bf7eb5cc87c4429a3ac179980ed3a5f405ebf177e2` | MediaPipeFaceMesh 478점 골든 |
| `docs/hairfit-v2/evidence/p06-makeup-zone-direction-desktop.png` | `8bc97614e46b4547290ece120fcb2128728ae6e9b7fb86f809b6ceff069a52c8` | 1440px 축소 캔버스·9개 비중첩 컬러 칩·눈매 국소 가이드 기준 |
| `docs/hairfit-v2/evidence/p08-makeup-tablet-accessibility.png` | `c8ac35ce7511ea93ebacd4d86100ba1e875e12f31e613ae0e0153216db0b6e0f` | 768px reduced-motion·접근성 기준 |
| `docs/hairfit-v2/evidence/p09-makeup-mobile-accessibility.png` | `f4fb0f3d0656e85a07cbae3ede932f7414b2cd3d50cd3d371c961e32e48c6b2e` | 390px 무가로-overflow·고객용 상세 패널 제거 기준 |

원본 모델에서 478점 골든을 다시 뽑아야 할 때만 `my-app/scripts/extract-makeup-fixture-landmarks.mjs`를 실행한다. 재추출은 위 hash와 시각 기준을 의도적으로 갱신하는 변경으로 취급한다.

## 30개 계약 fixture

`packages/shared/src/makeup/fixtures-v3.ts`의 `MAKEUP_P38_FIXTURE_CASES`가 실행 가능한 manifest의 원본이다. ID는 `makeup-p38-01`부터 `makeup-p38-30`까지 고정한다.

| 축 | 값 | 분포 규칙 |
|---|---|---|
| 피부톤 표현 그룹 | `tone-1`~`tone-6` | 각 5개 |
| 얼굴형 | oval, round, square, long, heart | 각 6개 |
| presentation/gender 입력 | female, male, nonbinary, not_provided | 순환 배치, 모듈 gating 금지 |
| 가림 | none, glasses, fringe, partial-side, hand-near-jaw | 각 6개 |
| 포인트 수 | 468, 478 | 468 20개, 478 10개 |

피부톤·얼굴형·gender 값은 representation coverage label이며 비전 추론 목표가 아니다. 모든 fixture에서 동일한 7개 모듈 계약을 유지한다.

## 자동 수용 기준

- fixture 수 30개
- 478점 골든 atlas: line set 46개, 고유 source point 260개, segment 388개, precision tick 420개
- 고객 적용 모드: 얼굴 위 atlas·semantic·application guide·landmark tick을 모두 숨기고 서로 겹치지 않는 컬러 칩 9개, 부위명, precision atlas v3 앵커 기반 연결선 9개와 아이라인·속눈썹 국소 가이드만 렌더링한다. 하단 색상 상세 카드와 기술 매트릭스는 고객 화면에 렌더링하지 않는다.
- 커넥터: 구형 토폴로지 앵커보다 precision atlas v3의 존별 최근접 실제 점을 우선하며 아이섀도·아이라인·속눈썹을 독립 슬롯으로 분리한 source-aligned 커넥터 9개를 렌더링
- 구조 모드: 핵심 구조선 14개를 원본 포인트 직선 구간으로 연결하고 중복 source segment를 한 번만 렌더링
- 정밀 모드: 46개 전체 line set과 300~420개 tick을 유지
- 모든 30개 계약 fixture: line set 40개 이상, 고유 source point 200개 이상, segment 180개 이상, precision tick 300~420개
- 468/478 모두 정상, 468 미만은 명시적 degraded fallback
- deterministic atlas compile p95 100ms 이하
- foundation compiler p95 300ms 이하
- accepted semantic line의 snap mean 2px 이하, p95 5px 이하
- 최종 projection의 보호 영역 관통 0건

검증 명령:

```powershell
node --no-warnings --test packages/shared/src/makeup/contract.test.ts
npx playwright test tests/web-e2e/makeup-direction.spec.ts tests/web-e2e/personal-color-makeup-quality.spec.ts --project=chromium
```

## 증거 경계

이 manifest는 정적·합성·저장소 자산 검증이다. 실제 provider 정확도, 실제 고객 사진의 품질, 운영 지연·비용, 물리 기기 렌더링을 증명하지 않는다. 그 증거는 동의된 staff canary와 Web/Native 기기 검증에서 별도로 수집한다.
