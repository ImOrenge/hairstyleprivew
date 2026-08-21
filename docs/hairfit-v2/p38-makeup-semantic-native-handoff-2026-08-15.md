# HairFit V2 P38 Native handoff

- 작성일: 2026-08-15
- 상태: 구현 가능한 계약 고정, 물리 기기 검증 전
- 원칙: Native가 얼굴 기하를 재계산하지 않고 Web과 같은 서버 compiled projection을 소비한다.

## 입력 계약

Native는 `HairfitApiClient.getMakeupDirection()` 응답에서 다음을 읽는다.

- `snapshot.denseAtlas`: `MakeupDenseAtlasV3`
- `semanticMap`: `CapabilityResult<MakeupSemanticProjectionV3> | null`
- `semanticEnabled`, `denseAtlasEnabled`
- `revision`, `staleSourceReasons`

semantic 호출은 `dispatchMakeupSemanticMap()`과 `retryMakeupSemanticMap()`을 사용한다. 화면 진입 시 별도 Next나 분석 요청 버튼을 만들지 않는다. foundation을 먼저 그린 뒤 활성화된 semantic capability를 한 번 dispatch하고, 동일 fingerprint의 durable result를 polling/re-entry에서 재사용한다.

## 렌더 계약

`react-native-svg` 기반 렌더러는 서버 좌표를 `viewBox="0 0 1000 1250"`에만 사상한다.

```text
x = normalizedPoint.x * 1000
y = normalizedPoint.y * 1250
```

- `denseAtlas.lineSets[].points`와 `semanticMap.output.lineBundles[].points` 순서를 유지한다.
- 허용 primitive는 open `Path`와 `Line`뿐이다.
- `Circle`, `Ellipse`, `Polygon`, closed path, fill, marker를 쓰지 않는다.
- `vectorEffect="non-scaling-stroke"`와 `fill="none"`을 적용한다.
- FaceMesh 재실행, 좌우 복제, 평균화, 보간 topology 생성은 금지한다.
- GET 응답의 `semanticMap`만 현재 snapshot과 read-time 합성된 결과로 신뢰한다. 로컬에 캐시한 이전 projection은 GET의 task/result가 바뀌거나 사라지면 폐기한다.
- projection의 `sourceFingerprint`는 사진 hash·correction·context·module·palette를 묶은 semantic 전용 composite 값이므로 snapshot row의 `sourceFingerprint`와 직접 비교하지 않는다.
- semantic 실패·timeout·stale이면 `denseAtlas`, V3가 degraded이면 기존 V2 text/map fallback을 사용한다.

현재 `NativeMakeupDirectionV1`의 점 anchor map은 P33 호환 fallback이다. P38 Native renderer가 물리 기기 검증을 통과하기 전 이를 제거하거나 stable로 승격하지 않는다.

## 상태와 접근성

| 서버 상태 | Native 표시 | 동작 |
|---|---|---|
| null/queued/waiting/running | deterministic atlas + 진행 문구 | 화면 탐색·이탈 허용 |
| partial | accepted semantic + zone fallback | 누락 부위를 텍스트로 표시 |
| completed | semantic projection | 활성 모듈·스크롤·focus 유지 |
| retry_required/failed | deterministic atlas + 재시도 | 재시도는 terminal 뒤에만 노출 |

SVG는 장식 레이어로 숨기고 7개 모듈 표를 screen reader의 완전한 대체 정보로 유지한다. 44px target, 색상명 텍스트, reduced-motion, 비드래그 조정 수단을 보존한다.

## 동일성 검증

1. 동일한 shared snapshot/result JSON을 Web과 Native fixture에 주입한다.
2. 양쪽이 사용한 `lineBundles`를 `{zoneId,module,role,points,open,provenance}`로 canonical serialize한다.
3. SHA-256 fingerprint가 같아야 한다. 화면 구현이 좌표를 재계산하면 실패한다.
4. 390px Android, 작은 iPhone, tablet에서 잘림·가로 overflow·touch target을 확인한다.
5. Android TalkBack과 iOS VoiceOver에서 line map을 건너뛰고 모듈 표·상태·재시도에 접근할 수 있어야 한다.

## Native 종료 게이트

- `react-native-svg` renderer 구현과 shared fingerprint parity test 통과
- Android/iOS 실제 기기 1대 이상씩 50fps 목표 측정
- TalkBack/VoiceOver critical blocker 0
- 앱 background→foreground 뒤 동일 durable task 복원
- semantic flag OFF에서 provider 호출 0, deterministic fallback 100%

이 문서 작성과 API client 계약 반영은 rollout 준비 완료를 뜻하지만, Native 기능 완료나 물리 기기 검증 완료를 뜻하지 않는다.
