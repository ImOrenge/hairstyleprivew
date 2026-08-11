# P17 HairFit V2 최종 인계

- 기준일: 2026-08-11 KST
- 검증 소스: `1d66bd73665510793950cba405ccdb95544d8349`
- 상태: `blocked_external`
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
| production source deploy | 차단 | Cloudflare 무료 Worker 3 MiB 제한, 전체 gzip `3,406.17 KiB`; Workers Paid 이상 승인 또는 별도 analysis runtime 분리 필요 |
| OFF production smoke | 대기 | 신규 source version이 배포되지 않음 |
| Web canary 5→25→100% | 대기 | production source/빌드타임 frontend flag 미배포 |
| 실제 hair 3×3·partial/retry | 미실행 | 실제 사용량/비용을 소비하는 production canary 필요 |
| 실제 Fashion 9-look·selection | 미실행 | 동일 |
| actual service→Aftercare live | 미실행 | 승인된 테스트 시술 기록과 관찰 창 필요 |
| Expo 실기기 parity | 미실행 | development build와 실기기 필요 |
| rollback threshold 관찰 | 미실행 | canary가 시작되지 않음 |

## 재개 절차

1. Cloudflare Workers 10 MiB 한도 사용을 승인하거나 MediaPipe/TensorFlow 분석을 별도 production runtime으로 분리한다.
2. 최종 원격 develop SHA와 배포 SHA를 다시 일치시키고 모든 server flag OFF로 source deploy한다.
3. 공개 기존 경로와 V2 OFF 동작을 smoke한다.
4. build-time frontend flag와 server capability flag를 canary로 켠다.
5. 동일 consultation에서 실사진 분석, hair/Fashion generation, Brief/Aftercare, exit/resume를 검증한다.
6. Web 관찰 창과 Expo 실기기 증거가 모두 통과한 뒤에만 goal을 complete 처리한다.

## 보존 규칙

- 현재 production Worker와 기존 legacy 경로를 변경·삭제하지 않는다.
- additive migration 85개와 생성된 테스트 evidence는 운영 정책에 따라 보존한다.
- branch/worktree cleanup, main merge, tag와 release는 별도 승인으로 처리한다.
- 실분석 통과를 production 배포, 실제 사용자 사진 또는 유료 생성 통과로 확대하지 않는다.

