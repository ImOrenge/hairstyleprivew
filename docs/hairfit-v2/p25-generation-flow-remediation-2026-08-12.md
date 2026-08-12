# P25 — 생성 흐름·공통 입력·브리프 복구 구현 기록

기준일: 2026-08-12
범위: 사용자 프로필 → 상담 입력 → 헤어 결정 → 퍼스널 컬러 → 패션 생성 → Salon Brief → Aftercare
운영 경계: Docker 미사용, 유료 생성 확인 UI 제외, 원격 migration·push·merge·배포·비용 발생 호출은 별도 승인 전 미실행

## 1. 확인된 원인

패션 배치가 스타일 2개 뒤 멈춘 문제는 다음 세 조건이 겹친 결과였다.

1. `fashion-generation` readiness가 `completedCount >= 2`를 전체 완료로 판정했다.
2. 대기 화면은 readiness가 참이 되면 polling을 중단했다.
3. reconcile은 숫자만 다시 세고 남은 outbox를 drain하거나 만료 lease를 재접수하지 않았다.

따라서 2개는 비교 가능 최소 수량일 뿐, 9-slot 배치의 종료조건이 아니다. 새 종료조건은 `completed + 최대 재시도에 도달한 명시적 실패 = requestedCount`다.

## 2. 공통 입력 계약

서버 권위 계약은 `consultation-generation-input-v1`이다.

- 식별: consultation ID/version, capturedAt, SHA-256 input fingerprint
- 프로필: `styleTarget = male | female | neutral`
- 상담: 현재 모발, 목표, 관리 시간·난이도·방문 주기, 회피 조건
- 분석: 얼굴형 blend와 근거, 퍼스널 컬러 evidence
- 결정: immutable hair selection과 길이·앞머리·가르마·볼륨·질감·컬러
- 패션: 단독 인터뷰 방향과 body profile
- 후속: actual service
- 출처: source, sourceId, capturedAt, fieldPaths provenance

헤어 prompt는 전체 입력의 projection을 사용하고, Salon Brief·Fashion final set·Aftercare는 `projectConsultationGenerationInputV2`로 동일 fingerprint·styleTarget·provenance를 저장한다. 화면별로 서로 다른 임시 입력을 재조합하지 않는다. 구 레코드는 neutral target과 `legacy-*` fingerprint로 명시적으로 정규화한다.

## 3. 생성 상태 전이

| 상태 | 서버 의미 | 사용자 표시 | 후속 동작 |
|---|---|---|---|
| queued | 아직 실행 lease 없음 | 큐 연결 중 | reconcile이 접수 |
| running | 유효 lease로 실행 중 | 생성 중 | polling·outbox drain |
| partial | 완료 결과가 있으나 terminal 미달 | 준비된 결과 우선 표시 | 나머지 계속 생성 |
| stalled | reserved lease 만료 | 정체 감지·복구 중 | 제한 자동 재접수 |
| retrying | 실패/정체 슬롯 재접수 | 실패 슬롯만 다시 생성 | 완료 결과 보존 |
| failed | 최대 시도 도달 개별 슬롯 | 명시적 실패 | 배치 terminal 산입 |
| completed | 개별 결과 저장 완료 | 이미지·선택 UI | 즉시 사용 가능 |

전체 배치는 9개 슬롯이 terminal일 때만 ready다. 첫 완료 결과부터 workbench로 진입할 수 있으며, 이 동작은 task를 완료로 변조하지 않는다. 재진입 후에도 DB batch와 slot progress가 권위다.

## 4. 구 엔진 재사용 매핑

| 구 엔진 자산 | 재사용 | 제외 |
|---|---|---|
| 헤어 blueprint/catalog prompt | 순수 추천·provider prompt·designer brief | Wizard cursor·route state |
| Personal Color | evidence와 팔레트 projection | 구 화면 진행 상태 |
| Salon designer brief | cut, volume/texture, styling, caution | 구 폼 자체 |
| Aftercare capability | actual service 기반 guide 생성 | 시술 전 가짜 완료 단계 |
| Fashion recommendation/image | 추천 구조·최종 이미지 provider | 슬롯별 수동 Wizard |

Salon Brief 상세 출력은 상담 목표, 현재 모발, 결정 근거, 분석·컬러 근거, cut/perm/color, 길이·볼륨·앞머리·가르마·질감, 관리·유지, Aftercare, 패션 연계, 디자이너 메모, 미확인 항목을 한 구조화 결과로 제공한다. 데이터가 없으면 추측하지 않고 `미확인` 또는 unresolved로 남긴다.

## 5. 속도와 관측성

- 추천과 독립 슬롯 접수는 `Promise.all`로 병렬화한다.
- outbox는 한 reconcile에서 최대 20개를 drain해 9-slot을 포괄한다.
- 준비된 이미지는 전체 완료를 기다리지 않고 즉시 표시한다.
- `[styling-workflow-timing]`은 queue, input load, provider, persistence, total 시간을 분리한다.
- `[fashion-batch-reconcile-timing]`은 terminal 상태가 화면에 관찰되기까지 polling visibility lag를 기록한다.
- timing 로그에는 사용자 원문, user ID, 이미지 URL, 인증정보를 넣지 않는다.

## 6. DB와 운영

additive migration `20260812183000_fashion_batch_runtime_progress.sql`은 다음을 추가한다.

- `slot_progress jsonb`
- `last_heartbeat_at timestamptz`
- `retry_count integer`
- heartbeat index

루트와 Web migration mirror는 동일해야 한다. 원격 적용 전에는 새 서버 코드를 live에 배포하지 않는다. rollback은 새 코드를 이전 버전으로 되돌리는 방식이며 새 컬럼과 완료 결과는 삭제하지 않는다.

## 7. 검증 계약

- shared: generation input schema/provenance/target projection, prompt compiler
- Web unit: expired lease, 2-result partial, 9-terminal ready, 부분 실패 재시도
- contract: 공통 snapshot이 hair/fashion/brief/aftercare에 연결되는지 정적 경계 검사
- E2E: 2 → 5 → 9 부분 결과 진행, 첫 이미지 즉시 노출, transition에서 결과 우선 보기, 9-slot 완료
- regression: 단독 Fashion 인터뷰, 분석 사진 좌측, 성별별 한국 기준 얼굴형 chart, CSS token contract
- final: typecheck, lint, build, migration mirror, component passport

실인증·실제 외부 AI·비용 집행·원격 migration·배포는 로컬 완료 증거와 구분하며 별도 승인과 결과 문서 없이는 통과로 기록하지 않는다.

## 8. 로컬 검증 결과

2026-08-12 최종 로컬 검증:

| 검증 | 결과 |
|---|---:|
| 전체 workspace typecheck | 통과 |
| Web ESLint | 통과 |
| shared unit/contract | 88/88 통과 |
| consulting contract | 85/85 통과 |
| HairFit V2 contract | 15/15 통과 |
| global CSS/component contract | 9/9 통과 |
| migration mirror | 86개 통과 |
| production E2E build | 130 routes 생성 통과 |
| consulting browser regression | 20/20 통과 |
| `git diff --check` | 통과 |

브라우저 fixture는 fashion 완료 수량을 2 → 5 → 9로 변화시키고 첫 2개를 즉시 표시한 뒤 polling이 9개까지 계속되는 것을 검증한다. 실제 provider 호출, 실제 entitlement 소비, 실인증, 원격 migration, canary와 배포는 실행하지 않았다.
