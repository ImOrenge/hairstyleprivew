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

### 누락·충돌·구버전 해소 정책

- `styleTarget`은 `member_profiles.style_target`의 male/female만 채택하며 누락·구버전 값은 추론하지 않고 neutral로 고정한다.
- 헤어 결정 충돌은 confirmed `StyleSelectionSnapshotV2`가 상담 snapshot의 active style보다 우선한다. confirmed selection에 없는 세부 시술·디자인 값만 동일 상담 active style로 보완한다.
- 얼굴형·랜드마크와 퍼스널 컬러는 서버 evidence가 화면 snapshot보다 우선하며, evidence가 없으면 화면 값을 근거로 가장하지 않고 미확인 상태를 유지한다.
- 실제 시술은 최신 `actual_services_v2`가 우선하며, 없을 때만 상담 snapshot의 confirmed actual service를 사용한다.
- 이전 Salon Brief·Aftercare 레코드는 읽기 adapter에서 schemaVersion, neutral target, legacy fingerprint를 명시한다. 새 생성 경로는 계약 검증을 통과하지 못하면 저장하지 않는다.
- fingerprint는 위 우선순위를 적용한 정규화 payload 전체에서 다시 계산하므로 충돌 해소 결과가 달라지면 출력 연결 키도 달라진다.

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
| shared unit/contract | 92/92 통과 |
| consulting contract | 91/91 통과 |
| HairFit V2 contract | 15/15 통과 |
| global CSS/component contract | 9/9 통과 |
| migration mirror | 86개 통과 |
| production E2E build | 130 routes 생성 통과 |
| consulting browser regression | 20/20 통과 |
| `git diff --check` | 통과 |

브라우저 fixture는 fashion 완료 수량을 2 → 5 → 9로 변화시키고 첫 결과를 즉시 표시한다. 부분 완료 상태에서 새로고침한 뒤 서버 batch와 이미지를 복원하고, 수동 dispatch와 polling으로 9개까지 계속되는 것을 검증한다. 실제 provider 호출, 실제 entitlement 소비, 실인증, 원격 migration, canary와 배포는 실행하지 않았다.

## 9. 종료조건 증거 감사

| 종료조건 | 권위 증거 | 로컬 판정 |
|---|---|---|
| 2개에서 멈추지 않음 | `fashion-batch-runtime.test.ts`의 2/9 partial 및 9/9 terminal 테스트, 브라우저의 2 → 5 → 9 진행 | 충족 |
| 중복 없이 후속 dispatch | `selectDispatchableFashionSessions`, live/retrying 제외 테스트, `23505` 동시 요청 replay | 충족 |
| 부분 실패·정체 복구 | 만료 lease의 stalled 전환, 실패 슬롯 재접수, 완료 슬롯 보존 테스트 | 충족 |
| 새로고침·재진입 복원 | 서버 batch GET 이후 partial 이미지 복원과 후속 9/9 완료 브라우저 테스트 | 충족 |
| 남녀 styleTarget 전달 | member profile → snapshot → hair prompt와 fashion context → 최종 outfit provider prompt의 male/female 실행 테스트 | 충족 |
| neutral fallback | 누락된 구 입력을 neutral/legacy로 명시하는 실행 테스트 | 충족 |
| 브리프 필수 내용 | `validateSalonBriefV2`가 저장 전에 필수 섹션과 recommendation source mapping을 fail-closed 검증 | 충족 |
| 공통 snapshot 사용 | Hair prompt는 전체 snapshot, Brief/Fashion/Aftercare는 동일 fingerprint·target·provenance projection 사용 | 충족 |
| 원격 운영 증거 | migration 적용, 실인증, 실제 AI 생성, canary와 배포 | 승인 대기 |

## 10. 구 브리프 대비 누락 대조

| 구 `HairDesignerBrief` 항목 | V2 대응 | 미해결 |
|---|---|---:|
| headline / consultationSummary | `summary`, 상담 목표, 현재 모발 | 0 |
| cutDirection | `cut`, `details.services.cut`, 길이 | 0 |
| volumeTextureDirection | `volumeTexture`, 볼륨·질감·앞머리·가르마 | 0 |
| stylingDirection | `styling`, 관리 시간·난이도·유지 주기 | 0 |
| cautionNotes | `cautions`, 회피 조건, 미확인 항목 | 0 |
| salonKeywords | 선택 근거, 분석 근거, 퍼스널 컬러, 디자이너 메모의 구조화 필드 | 0 |
| 구 엔진에 없던 V2 확장 | perm/color, Aftercare, 패션 연계, actual service, section별 provenance | 0 |

새 브리프는 각 주요 권고에 `recommendationSources`를 저장하고 화면에서도 source map을 노출한다. 데이터가 없으면 권고를 꾸며내지 않고 `미확인` 또는 `unresolved`로 남긴다.
