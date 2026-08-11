# HairFit V2 P14 관측·개인정보·운영·Rollback Runbook

## 상태와 경계

- 이 문서는 로컬 구현 계약이다. `20260811052530_consultation_observability_operations.sql`은 원격에 적용하지 않았다.
- 관측의 권위 저장소는 기존 `hairfit_v2_domain_events`다. 사진, 입력 원문, prompt, provider 응답, URL, token과 사용자 식별자를 payload에 저장하지 않는다.
- `user_id`와 `consultation_id`는 서비스 역할이 기록하는 관계 키이며 고객 응답과 애플리케이션 로그에 출력하지 않는다.
- 기능 플래그 OFF는 신규 durable 접수만 레거시/인라인 adapter로 우회한다. 이미 저장된 V2 결과와 진행 중 서버 작업은 삭제하거나 취소하지 않는다.
- 사용자에게 유료 생성 확인 단계를 노출하지 않는다. entitlement·usage 확인과 복구는 서버 내부 운영 상태다.

## 수집 이벤트

Capability는 `queued`, `running`, `completed`, `failed`, `replayed`를 기록한다. payload는 capability, task ID, attempt, 상태, 완료 단위, engine/source/prompt/cycle version, 정산 receipt 상태만 허용한다.

Discovery와 Fashion 인터뷰는 `opened`, `resumed`, `topic_confirmed`, `confirmed`, `exited`, `save_failed`를 기록한다. 질문 답변 대신 interview kind, topic ID, revision, 분류된 오류 코드만 기록한다. 이벤트 API는 Clerk 인증 후 상담 소유권을 다시 확인한다.

분석 evidence와 preview board의 기존 이벤트를 함께 사용해 다음 시간을 계산한다.

- 상담 생성 → 첫 analysis evidence: time-to-first-evidence
- preview board queued → 첫 accepted preview: time-to-first-preview
- board별 completed/ready slot 수: ready-count
- capability completed/replayed 비율과 failed/retry_required 비율

## 운영 스냅샷과 정산

관리자 GET `/api/admin/hairfit-v2/reconciliation`은 최근 실행 기록과 24시간 operations snapshot을 반환한다. snapshot은 이벤트/작업 상태 수, stale lease 수, receipt 상태, engine/source/prompt/cycle 조합을 포함한다.

관리자 POST body `{ "scope": "capability-receipts", "limit": 100 }`는 terminal capability의 receipt를 `entitlement_consumptions_v2`와 대조하고, grant의 `quantity_consumed`와 실제 consumed row 수를 다시 대조한다. `consumption_receipt_missing`, `consumption_state_mismatch`, `grant_balance_mismatch`는 자동 보정하지 않고 운영 확인 대상으로 남긴다.

## 장애 처리

1. `staleLeaseCount > 0`: worker/Workflow 상태를 확인한다. 같은 idempotency key 재접수로 만료 lease를 fencing token과 함께 재획득한다.
2. `retry_required` 증가: error code, provider, model, engine/prompt version 조합을 확인하고 실패 task만 재시도한다.
3. terminal task의 receipt가 `reserved` 또는 `unknown`: capability receipt reconciliation을 실행한다. 결과와 입력 snapshot은 보존한 채 consumption을 consumed/restored 중 하나로 수렴시킨다.
4. dead-letter 또는 최대 20회 도달: 자동 재접수를 멈추고 task ID·error code·version만 운영 티켓에 기록한다. prompt, 사진, provider payload를 첨부하지 않는다.
5. partial batch: 완료 slot을 유지하고 미완료 slot만 dispatch한다.

## 보존과 계정 삭제

- domain event 기본 보존은 90일이다. `prune_consultation_observability_v2(90, 7)`로 event를 삭제하고 terminal task/attempt의 상세 오류 문구는 7일 뒤 제거한다.
- 보존 인자는 event 30~365일, 오류 상세 1~30일만 허용한다.
- capability task/attempt/result와 interview draft는 사용자 및 consultation FK cascade에 포함된다.
- 실제 이미지 삭제는 기존 account deletion storage outbox가 `generation-results`, `profile-body-photos`, `styling-results`, `aftercare-photos`를 처리한다.
- 결과 데이터는 일반 retention으로 임의 삭제하지 않는다. 상담 삭제 또는 계정 삭제 lifecycle을 따른다.

## 독립 Rollback 순서

필요한 기능만 OFF로 바꾼다.

```text
CONSULTATION_DISCOVERY_INTERVIEW_ENABLED
CONSULTATION_FASHION_INTERVIEW_ENABLED
CONSULTATION_INTERVIEW_AI_SUMMARY_ENABLED
CONSULTATION_PERSONAL_COLOR_CAPABILITY_ENABLED
CONSULTATION_SALON_BRIEF_CAPABILITY_ENABLED
CONSULTATION_AFTERCARE_CAPABILITY_ENABLED
CONSULTATION_HAIR_PREVIEW_BATCH_ENABLED
CONSULTATION_FASHION_BATCH_ENABLED
CONSULTATION_LIVENESS_V2_ENABLED
```

1. 해당 플래그를 OFF로 바꿔 신규 접수만 legacy/inline adapter로 우회한다.
2. 이미 accepted/running인 작업은 상태 조회와 callback을 유지해 완료 또는 복구시킨다.
3. V2 저장 결과와 legacy adapter read는 유지한다.
4. 정산 reconciliation에서 reserved/consumed/restored가 수렴했는지 확인한다.
5. migration down/drop은 수행하지 않는다.

## 로컬 검증과 미실행 게이트

```powershell
npm run consulting:contract:test
npm run hairfit-v2:contract:test
npm run supabase:migrations:mirror:check
npm --prefix my-app run typecheck
npm run component-registry:validate
```

원격 migration, pgTAP 확장 harness, 관리자 실인증 호출, provider 장애 주입, 실제 계정 entitlement 소비·복구는 명시적 승인 전까지 `not_run`이다. Docker 없이 native PostgreSQL에서 85개 migration fresh-chain과 로컬 RLS/RPC·entitlement 경쟁·Capability lease/fence/retry·9-slot 정산·삭제 cascade는 통과했다.
