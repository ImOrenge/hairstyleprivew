# P17 HairFit V2 최종 인계

- 기준일: 2026-08-11 KST
- 검증 소스: `c4763844af9496d68759b07aa8907183c0902b41`
- 상태: `in_progress_live_gates`
- 완료 선언: 하지 않음

## 완료된 범위

- 11 Scene 비마법사 lifecycle workspace와 standalone Discovery/Fashion interview
- 좌측 user input·우측 AI output/system data 독립 스크롤, 입력 구분선, 축소 title 영역
- 저장 후 공통 Next 제거, lifecycle recommended/allowed/completed/active task 모델
- 자동 Photo preflight→landmark→AI analysis→evidence→Analysis handoff
- 대기·complete·retry·partial·resume·exit 연출과 접근 가능한 motion 제어
- legacy hair blueprint, personal color, Salon Brief, Aftercare, Fashion capability facade 연결
- `gpt-4o` vision routing과 user option prompt 반영
- Supabase additive migration 85개 원격 수렴, RLS/grant/schema cache 검증
- feature/develop 원격 SHA 고정과 ff-only 통합
- 실인증·실분석·원격 evidence·landmark overlay 검증

## 닫히지 않은 종료 기준

| 종료 기준 | 상태 | 차단 원인/다음 행동 |
|---|---|---|
| production source deploy | 통과 | OpenNext server/router 분리, Free 한도 내 upload와 source probe 일치 |
| OFF production smoke | 통과 | root/login/www, workspace redirect, 보호 API 401을 연속 확인 |
| Web canary 5→25→100% | 대기 | 0% ON version은 준비했으나 운영 도메인 version override가 OFF로 fallback하여 공개 비율을 올리지 않음 |
| 실제 hair 3×3·partial/retry | 미실행 | 실제 사용량/비용을 소비하는 production canary 필요 |
| 실제 Fashion 9-look·selection | 미실행 | 동일 |
| actual service→Aftercare live | 미실행 | 승인된 테스트 시술 기록과 관찰 창 필요 |
| Expo 실기기 parity | 미실행 | development build와 실기기 필요 |
| rollback threshold 관찰 | 부분 | route/server 복원 리허설과 복구는 통과, 공개 canary 관찰 창은 미실행 |

## 재개 절차

1. 현재 OFF 배포 SHA와 server/router version을 유지한 채 승인된 staff-only ON build를 별도 version으로 준비한다.
2. build-time frontend flag와 server capability flag를 5→25→100% 기준으로 관찰하되 유료 생성은 별도 비용 승인을 받기 전 실행하지 않는다.
3. 동일 consultation에서 실사진 분석, hair/Fashion generation, Brief/Aftercare, exit/resume를 검증한다.
4. Web 관찰 창과 Expo 실기기 증거가 모두 통과한 뒤에만 goal을 complete 처리한다.

## 보존 규칙

- 현재 production Worker와 기존 legacy 경로를 변경·삭제하지 않는다.
- additive migration 85개와 생성된 테스트 evidence는 운영 정책에 따라 보존한다.
- branch/worktree cleanup, main merge, tag와 release는 별도 승인으로 처리한다.
- 실분석 통과를 production 배포, 실제 사용자 사진 또는 유료 생성 통과로 확대하지 않는다.
