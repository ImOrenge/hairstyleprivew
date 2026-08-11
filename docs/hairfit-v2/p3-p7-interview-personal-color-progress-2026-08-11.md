# P3-P7 진행 증거 - 인터뷰 기반과 퍼스널 컬러 자동 연결

- 기준일: 2026-08-11
- 브랜치: `feat/2026-08-08-hairfit-v2-backend`
- 상태: 로컬 구현 진행 중, 실환경 검증 전
- 유료 생성 UX 경계: 별도 유료 생성 여부·결제·견적 승인 질문 없음
- Photo 입력: 얼굴 위치 기반 4:5 crop transform, 사용자 가로·세로 위치 조정, 별도 private 자연광 보조 draft를 지원한다. 보조 사진은 서버 사전검사 통과 시 Personal Color에만 사용하고 얼굴·헤어 분석 원본은 정면 사진으로 유지한다.

## 이번 범위에서 구현된 내용

1. `ConsultationInterviewShell`, `InterviewQuestionRenderer`, `InterviewCoverageIndicator`, `InterviewSummaryDrawer`, `InterviewSaveStatus` 공용 기반을 추가했다.
2. 공용 기반은 도메인 DTO, API 호출, lifecycle 이동, `currentStep`/질문 index를 소유하지 않는다.
3. Discovery를 7개 정보 주제 인터뷰로 연결하고 기존 전체 폼을 flag OFF fallback으로 유지했다.
4. Fashion 방향을 7개 정보 주제 인터뷰로 연결하고 확정 헤어, 퍼스널 컬러, Discovery 회피 조건을 먼저 재사용한다.
5. Fashion 방향 확인 뒤 서버 entitlement를 자동 판정하고, 별도 유료 생성 확인 없이 기존 9-slot 배치 접수 흐름을 호출한다.
6. 사진 사용 범위에 `personalColor`가 포함되면 얼굴 분석과 Personal Color capability를 병렬 실행한다.
7. 얼굴 분석 evidence 저장 뒤 Personal Color evidence를 연결하며, 컬러 실패가 얼굴 분석 전체를 실패시키지 않는다.
8. Personal Color 동의가 없으면 Analysis 화면은 저장된 legacy 진단을 임의로 불러와 완료처럼 표시하지 않는다.
9. 여섯 legacy 엔진에 UI 독립적인 Capability Service facade를 추가했고, 사진 분석과 legacy Personal Color route는 공용 facade를 사용한다.
10. Fashion의 생성별 견적·승인·`/api/styling/generate` 브라우저 반복을 제거했다. 방향 확인 뒤 서버가 entitlement와 9-slot 총량을 판정하고 `begin_styling_execution` RPC 및 outbox dispatch를 수행한다.
11. 배치 재개도 브라우저 생성 loop가 아니라 단일 `dispatch` 요청으로 미완료 slot만 재접수하며 완료·진행 중 slot은 보존한다.
12. Fashion 추천 세션 9개 생성도 브라우저 fan-out에서 서버 단일 접수로 옮겼다. 서버가 확정 헤어·프로필·카탈로그를 공유하고 공용 Fashion Capability로 슬롯을 준비하며 unique 충돌은 기존 세션을 재사용한다.
13. lifecycle migration의 강제 RLS, role 권한, `SKIP LOCKED`, fencing token, active unique index와 특정 task 재획득 권한을 검증하는 pgTAP 27항목을 추가했다. Docker를 사용하지 않고 native PostgreSQL에서 같은 구조 계약과 실제 lease 만료·stale fence 거부·retryable failure 재획득·결과 단일 저장을 직접 SQL로 검증했다. 로컬 설치에 pgTAP 확장이 없어 pgTAP harness 자체 실행만 `not_run`이다.
14. durable Capability runtime을 추가해 V2의 얼굴 분석, Personal Color, hair blueprint, 디자이너 브리프, Fashion 추천, Aftercare 완료 결과를 fingerprint·idempotency key로 저장·재사용한다. 동시 중복은 엔진을 다시 실행하지 않고 기존 task를 반환하며, retryable failure와 만료 lease는 최대 20회 범위에서 특정 task를 원자적으로 재획득하고 새 fencing token으로 복구한다.
15. generation preparation은 헤어 블루프린트와 디자이너 브리프 엔진을 직접 호출하지 않고 Capability Service를 사용하며, workflow 시작·outbox도 Hair Preview Capability 경계를 통한다.
16. Brief Scene은 진입 즉시 확정 헤어의 생성된 디자이너 브리프를 서버 버전으로 자동 연결한다. 사용자는 최초 생성 버튼을 누르지 않고 이후 편집·공유만 수행한다.
17. Aftercare는 실제 시술을 먼저 멱등 저장한 뒤 legacy Aftercare Capability가 오늘 행동과 D+3/W+2/W+6/W+10을 자동 생성한다. 실패해도 실제 시술 원본을 삭제하지 않으며 우측에 생성 행동·체크포인트·주의사항을 표시한다.

## 로컬 검증

- Web TypeScript: 통과
- 컨설팅 계약: 37/37 통과
- 변경 TSX/TS ESLint: 오류 0
- component registry: 53 components / 53 passports / 13 stable, 통과
- production E2E build: 통과
- interview browser smoke: Discovery/Fashion 390px, question focus, summary focus return, reduced motion, 금지 문구 부재 1/1 통과
- Fashion browser smoke: 한 번의 방향 확정, 9-slot 서버 배치 접수, 생성별 견적 승인 CTA 부재 1/1 통과
- Fashion request-budget smoke: 방향 POST 1회, 브라우저 `/api/styling/recommend` 요청 0회, 서버 9-slot 준비·dispatch 1/1 통과
- Salon Brief browser smoke: 사용자 저장 클릭 없이 서버 자동 생성·우측 출력 1/1 통과
- Aftercare browser smoke: 실제 시술 우선 CTA·사전 수동 관리 입력 없음·생성 후 풍부한 우측 출력 1/1 통과
- 상담 Scene 전체 production Chromium 회귀: 11 Scene, 독립 스크롤, 인터뷰, exit, partial/waiting/recovery, landmark, Fashion 9-slot, Brief, Aftercare, 390/768px 접근성 17/17 통과
- native PostgreSQL: 85개 migration fresh-chain, V2 이전 fixture upgrade probe, RLS/RPC·entitlement 경쟁·9-slot 정산·Capability lease/fence/retry·선택 replay·삭제 cascade 통과
- `git diff --check`: 통과

## 아직 완료로 주장하지 않는 항목

- pgTAP 확장 기반 27항목 harness 자체 실행. 동일 구조 항목과 더 넓은 RPC 행동 검증은 native PostgreSQL에서 통과했다.
- 인터뷰 기본 focus·390px·reduced-motion smoke는 통과했으나 200% zoom, autosave, offline, 409, exit/resume 전체 회귀는 미완료
- Personal Color live provider 호출과 실제 evidence row 확인
- Fashion 실제 provider 기반 부분 실패·재접수 검증. DB 수준 entitlement 경쟁·9-slot 정산·중복 소비 방지는 통과했다.
- 원격 migration, 실인증, entitlement 소비, live AI, canary, 배포

이 문서는 중간 증거다. 위 미완료 항목이 남아 있으므로 `implementation_complete` 또는 `goal_complete` 증거로 사용하지 않는다.
