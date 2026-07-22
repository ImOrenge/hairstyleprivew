# UI/UX 출시 거버넌스 — 2026-07-18

## 목적과 권한 경계

생성·Styler·알림·결제 UI/UX 변경을 장애 없이 중지·재개하고, DB 호환 계약과 운영 임계값을 한 문서에서 판단한다. 아래 owner는 개인 이름이 아니라 교대 가능한 운영 역할이다. 플래그 변경, migration, Worker/App 배포, branch protection, 실제 메시지 발송은 각각 별도 승인 작업이며 이 문서는 실행 권한을 부여하지 않는다.

## 기능 플래그와 owner

| 표면 | 기본값 | Rollout owner | 새 접수 중단 | 진행 중 작업·사용자 fallback | 재개 조건 |
| --- | --- | --- | --- | --- | --- |
| 헤어 생성 | `GENERATION_ACCEPTANCE_ENABLED=true` | App + Generation Workflow | `false`로 바꾸면 아직 accepted되지 않은 draft만 `503 GENERATION_ACCEPTANCE_PAUSED`, `Retry-After: 300` | 이미 accepted된 draft replay, Workflow dispatch, 상태 조회, credit settlement/refund, 이메일 drain은 계속 | queue age 정상, callback secret/version 일치, canary 1건 terminal·ledger 확인 후 `true` |
| Styler 룩북 | `STYLING_ACCEPTANCE_ENABLED=true` | App + Styling Workflow | `false`로 바꾸면 `draft/recommended/failed` 세션의 신규·재시도 접수만 `503 STYLING_ACCEPTANCE_PAUSED` | `generating` replay, 완료 결과 조회, settlement/refund, 완료 이메일 drain은 계속 | outbox/lease 정상, canary 1건 완료 또는 실패 환불 확인 후 `true` |
| 유료 Quote | `PAID_ACTION_QUOTES_REQUIRED=true` | Billing + Data | 기본 fail-closed 유지 | `false`는 구형 client 긴급 호환용이며 가격·잔액 재확인 약화가 고객 금전 위험을 만든다 | incident ID·담당자·종료 시각을 기록한 최대 24시간 window에서만 사용하고 `true` 복구 후 ledger/receipt 대조 |
| 생성 Push | `GENERATION_PUSH_ENABLED=false` | Mobile Release + Messaging | `false`면 Push outbox를 provider가 claim하지 않음 | 생성 작업 현황·인앱 상태·완료 이메일 유지. Push 실패가 이메일을 막지 않음 | EAS project ID, APNs/FCM, `EXPO_ACCESS_TOKEN`, iOS/Android 수신·token rotation·탈퇴 후 미수신 증거 후 `true` |
| 구독 checkout | `SUBSCRIPTION_ACCESS_MODE=waitlist` | Billing + Product | `waitlist`로 결제 진입을 대기 신청으로 전환 | 기존 구독·결제 webhook·receipt 조회는 유지 | PortOne sandbox 결제·중복 webhook·환불과 운영 secret probe 후 `checkout` |

`HAIRFIT_LOCAL_GENERATION_WORKFLOW`는 개발 서버 전용 실행기 선택값이며 production 장애 롤백 플래그로 사용하지 않는다. production에서 이를 바꿔 Cloudflare Workflow를 우회하거나 동기 생성으로 fallback하지 않는다.

## 중단 순서

1. 장애 표면에 맞는 acceptance 플래그만 `false`로 바꾸고 새 mutation을 막는다.
2. accepted/generating queue와 active lease를 삭제하지 않고 dispatcher·settlement·notification consumer로 drain한다.
3. credit reservation, execution receipt, generation/styling terminal 상태가 일치하는지 확인한다.
4. `delivery_unknown`은 수신함/Resend event 대조 전 재발송하지 않는다.
5. UI rollback은 additive DB와 legacy field를 유지한 채 App만 roll-forward 또는 이전 호환 버전으로 되돌린다.
6. DB down migration, row 수동 삭제, credit 직접 보정, outbox 강제 완료는 기본 롤백 수단으로 사용하지 않는다.

## DB backward compatibility window

| 계약 | 호환 기간 | 제거·종료 조건 | 롤백 방식 |
| --- | --- | --- | --- |
| `generations.selected_variant_id` + legacy JSON | 최소 호환 릴리스 2회와 연속 30일 mismatch 0 | 모든 지원 웹·Expo가 column-first/dual-write이고 conflict 0 | column/trigger/legacy JSON 유지, 신형 selector만 rollback |
| `/upload`, ID 없는 `/generate` canonical redirect | 최소 운영 릴리스 2회 | 최근 30일 legacy hit가 전체 generation entry의 0.5% 미만이며 지원 incident 0, 별도 deprecation 승인 | 307 wrapper와 source header 유지 |
| legacy notification state + durable outbox | App·Workflow가 같은 계약이 된 뒤 legacy active lease 0, old pending/sending 0까지 | terminal mirror·중복 0과 실제 메일 1회 canary | 신규 enqueue 중단 후 기존 outbox drain; outbox row 삭제 금지 |
| paid-action Quote 없는 legacy client | 기본 허용 안 함. incident당 최대 24시간 | 지원 client 보급 또는 incident 종료, ledger/receipt drift 0 | `PAID_ACTION_QUOTES_REQUIRED=false` 후 종료 시각 내 `true` 복구 |
| additive durable generation/Styler columns·outbox | 최소 현재+직전 App/Worker가 모두 읽을 수 있는 2개 배포 | 운영 queue 0과 rollback candidate 종료 | DB down migration 대신 client/consumer roll-forward |
| account deletion tombstone/outbox | 영구 API 계약; tombstone 개인정보 해시는 완료 후 30일 | 제거 대상 아님 | idempotent retry 후 Clerk identity를 마지막에 삭제 |

호환 기간 시작·종료는 운영 배포 시각과 version을 release evidence에 기록한다. 기간이 지났다는 이유만으로 field, trigger, route wrapper를 자동 삭제하지 않는다.

## 운영 dashboard와 alert threshold

| 지표 | Warning | Critical | 1차 owner와 조치 |
| --- | --- | --- | --- |
| 이메일 oldest actionable queue age | 15분 이상 | 30분 이상 또는 증가 지속 | Messaging: 5분 drain, Resend, DB claim lease 확인 |
| 이메일 retry overdue | available 시각보다 5분 이상 | 15분 이상 | Messaging: cron 최근 실행, retry budget, sender domain 확인 |
| `delivery_unknown` | 없음 | 1건 이상 즉시 | Messaging: 자동 재발송 금지, Resend event·수신함 대조 |
| `dead_letter` | 없음 | 1건 이상 즉시 | Messaging + App: 마지막 오류, 수신자·sender 상태, 명시적 복구 기록 |
| expired sending lease | 없음 | 1건 이상 즉시 | Workflow: 중복 consumer와 callback secret 확인 |
| generation/styling dispatch queue age | 3분 이상 | 10분 이상 | Workflow: 1분 dispatcher, binding/version, poison row 확인; 필요 시 해당 acceptance pause |
| preparation active lease age | 15분 접근 | lease 만료 후 5분 미회수 | Generation Workflow: retry budget·원본 보존 상태 확인 |
| credit reservation without terminal settlement | 10분 이상 | 30분 이상 | Billing + Data: generation terminal, ledger, receipt를 같은 ID로 대조 |
| original cleanup queue | 30분 이상 | 2시간 이상 또는 24시간 retention 초과 위험 | Storage Ops: bucket 권한, lease, dead-letter 확인; row를 수동 완료하지 않음 |
| Push invalid token | 단일 token은 revoke | 급증 또는 계정 삭제 뒤 수신 1건 | Mobile Release: device revoke, token rotation, Push flag off; 이메일 fallback 유지 |

현재 관리자 화면은 이메일 15분/5분과 `delivery_unknown`·`dead_letter`·expired lease를 계산한다. 그 밖의 지표는 구조화 로그/DB query를 외부 수집기에 연결하기 전까지 “threshold 정의 완료, dashboard 연결 미완료”로 표기한다.

## 배포·롤백 수용 기준

- 배포 전 두 acceptance 플래그가 의도한 값인지 App runtime에서 확인한다.
- migration mirror 73/73, fresh-chain, SQL smoke, App/Workflow callback fingerprint를 확인한다.
- 신규 접수 pause 상태에서도 accepted/generating replay와 상태 조회가 503으로 막히지 않는다.
- canary는 terminal 상태, credit ledger/receipt, 이메일 수신을 같은 generation/session ID로 대조한다.
- 실패 시 새 접수만 중단하고 진행 중 queue를 보존한다.
- 재개는 queue와 경보가 정상화되고 canary가 통과한 뒤 owner 두 역할이 함께 승인한다.

실제 environment 값, 변경 시각, 변경자, incident/release ID, canary ID는 비밀값 없이 release evidence에 남긴다.
