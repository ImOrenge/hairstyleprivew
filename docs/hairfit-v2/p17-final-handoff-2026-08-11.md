# P17 HairFit V2 최종 인계

- 기준일: 2026-08-12 KST
- 검증 소스: `64829d74793ec5be77841596184406bc103f1d8f`
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
- 개발 인증 fixture 기반 분석·원격 evidence·landmark overlay 검증

## 닫히지 않은 종료 기준

| 종료 기준 | 상태 | 차단 원인/다음 행동 |
|---|---|---|
| production source deploy | 통과 | OpenNext server/router 분리, Free 한도 내 upload와 source probe 일치 |
| OFF production smoke | 통과 | root/login/www, workspace redirect, 보호 API 401을 연속 확인 |
| Web canary 5→25→100% | 통과 | atomic ON/OFF 판정 5/95, 33/67, 50/0; mismatch·root·API 오류 0 |
| 실제 hair 3×3·partial/retry | 사용자 패스 | 2026-08-12 사용자가 실사용 비용 게이트를 종료조건에서 제외함. 미실행 사실은 유지 |
| 실제 Fashion 9-look·selection | 사용자 패스 | 2026-08-12 사용자가 실사용 비용 게이트를 종료조건에서 제외함. 미실행 사실은 유지 |
| actual service→Aftercare live | 사용자 패스 | 2026-08-12 사용자가 실제 시술·관찰 게이트를 종료조건에서 제외함. 미실행 사실은 유지 |
| Expo 실기기 parity | 부분 | Android AVD development build·keyboard·작은 화면 smoke는 통과. Android/iOS 물리 기기 필요 |
| rollback threshold 관찰 | 통과 | 잘못된 probe hostname에서 즉시 OFF 100% 복구 후 운영 OFF source/API를 확인하고 카나리를 재시작함 |

## 재개 절차

1. Worker Preview에서 ON router/server pin과 source revision을 5/5 검증했다.
2. production Web을 5→25→100%로 관찰했으며 최종 server/router를 각각 ON 100%로 고정했다. 상세 표본은 `p21-preview-and-public-canary-result-2026-08-12.md`에 보존한다.
3. 실인증·실사진, 유료 hair/Fashion generation, 실제 시술 기반 Aftercare는 2026-08-12 사용자 패스로 종료조건에서 제외했다. 실행·통과로 간주하지 않는다.
4. Expo 실기기 증거가 통과하거나 사용자가 종료조건에서 명시적으로 제외한 뒤에만 goal을 complete 처리한다.

Android AVD 중간 증거와 development client native dependency 수정은 `p22-expo-development-build-emulator-result-2026-08-12.md`를 따른다.

## 보존 규칙

- 현재 production Worker와 기존 legacy 경로를 변경·삭제하지 않는다.
- additive migration 85개와 생성된 테스트 evidence는 운영 정책에 따라 보존한다.
- branch/worktree cleanup, main merge, tag와 release는 별도 승인으로 처리한다.
- 실분석 통과를 production 배포, 실제 사용자 사진 또는 유료 생성 통과로 확대하지 않는다.
