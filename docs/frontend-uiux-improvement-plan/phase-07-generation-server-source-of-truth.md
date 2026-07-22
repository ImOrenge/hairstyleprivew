# Phase 07 — 생성 조기 접수 상위 인덱스

- 상태: 분리 실행 중 — Phase 07A·07B 로컬 구현 완료, 운영·실기기 검증 대기
- 우선순위: P0
- 변경 게이트: `behavioral`, `breaking`
- 선행 페이즈: Phase 02A, Phase 03, Phase 05
- 독립 배포: 불가. 07A의 DB·API·Workflow와 07B의 클라이언트 계약을 같은 호환 창에서 배포해야 함

## 문서 역할

이 문서는 더 이상 서버 상태 머신과 클라이언트 업로드 UX를 한 번에 완료 판정하지 않는다. 생성 종료 안전성은 다음 두 페이즈가 모두 충족될 때만 성립한다.

| 하위 페이즈 | 단일 책임 | 현재 판정 |
| --- | --- | --- |
| [Phase 07A](phase-07a-durable-generation-acceptance.md) | private upload draft, 원자적 `acceptedAt`, Workflow outbox, 준비 작업 lease/fencing | 로컬 구현 완료 · 운영 DB/Worker 검증 대기 |
| [Phase 07B](phase-07b-client-preupload-and-acceptance-ux.md) | 웹·앱 사전 업로드, 접수 전/후 문구, 접수 receipt 복구와 메모리 정리 | 로컬 구현 완료 · 브라우저/실기기 검증 대기 |

완료 이메일과 재진입은 Phase 09A, Native push는 Phase 09B의 별도 책임이다.

## 종료 안전 경계

다음 서버 트랜잭션이 커밋되고 응답에 `acceptedAt`과 `generationId`가 포함된 뒤에만 “페이지나 앱을 닫아도 됩니다”를 표시한다.

1. 원본이 private storage에 저장된 upload draft가 유효하다.
2. generation과 사용자 소유권·스타일 대상·정책 snapshot이 저장된다.
3. `accepted_at`이 기록된다.
4. 같은 트랜잭션에서 generation별 유일한 Workflow outbox intent가 저장된다.

Cloudflare Workflow create 응답 자체는 종료 안전 경계가 아니다. 즉시 dispatch가 실패해도 DB outbox와 1분 dispatcher가 실행 의도를 보존한다. 반대로 사진 업로드만 끝나고 accept 트랜잭션이 끝나지 않은 상태에서는 종료 가능하다고 안내하지 않는다.

## 통합 완료 기준

### 로컬 구현

- [x] Phase 07A 서버 계약 구현
- [x] Phase 07B 웹·앱 계약 구현
- [x] 구형 prompt/start 경로를 동기 AI 작업 없이 durable accept로 수렴
- [x] 생성 상세/status가 `acceptedAt`, preparation, Workflow dispatch 상태를 노출
- [x] 완료 이메일을 generation 실행과 분리한 Phase 09A outbox 연동

### 운영·실기기 검증

- [ ] 배포 환경에 migration을 순서대로 적용하고 RPC·RLS·service-role 권한 probe
- [ ] 앱 API와 Workflow Worker의 callback secret·버전 호환 확인
- [ ] 웹 탭 종료, 브라우저 종료, iOS/Android 강제 종료 후 terminal 도달 증명
- [ ] offline 후 복귀, accept 응답 유실, 중복 accept, preparation retry의 staging 동시성 증명
- [ ] 실제 가입 이메일 1회와 인증 만료 후 같은 generation 재진입 증명

### 후속 범위

- [x] 실행 전 확정 quote와 실행 후 ledger receipt — Phase 03
- [x] accept 시점 credit reservation 또는 부족 잔액의 원자적 처리
- [x] 전체 실패 credit 복구와 재시도 포기·원본 보존기한 만료의 원자적 취소 — 로컬 DB·웹·Expo 계약 완료, 운영 migration·Storage consumer 관측 대기
- [ ] OS push, token, permission, badge — Phase 09B

## 중단 조건

- `acceptedAt` 없이 종료 가능 문구가 노출된다.
- Workflow create 실패 시 DB outbox 없이 요청이 유실된다.
- accept 재시도가 generation 또는 Workflow intent를 중복 생성한다.
- 운영 E2E 없이 “앱을 종료해도 완료 알림이 온다”고 출시 문구에 확정 표기한다.
- accept가 크레딧을 실제로 예약하지 않는데 잔액 부족 가능성이 없다고 문서화한다.

## 롤백·인계

- 이미 accepted된 generation은 새 Workflow/outbox consumer가 끝까지 처리해야 한다.
- DB 함수를 즉시 제거하는 down migration보다 enqueue 중지와 roll-forward를 우선한다.
- 구형 앱 compatibility adapter를 제거하는 시점은 활성 구버전 클라이언트가 없다는 증거 이후다.
- Phase 08에는 canonical 진입 경로, Phase 09A에는 terminal event와 generation URL, Phase 13에는 운영 배포 순서와 force-close 증거를 넘긴다.
