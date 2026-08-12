# P21 HairFit V2 Preview 및 공개 카나리 결과

- 실행일: 2026-08-12 KST
- 배포 소스: `64829d74793ec5be77841596184406bc103f1d8f`
- server version: `32f0a81d-304e-451f-940c-23c9a3e9f56a`
- router version: `37d268c1-e43f-4d64-91d3-0efc2149f636`
- 최종 상태: server/router 각각 ON version 100%

## 비비용 Preview 게이트

두 Worker는 일반 `workers.dev` 공개를 끈 채 version Preview만 활성화했다. Preview URL은 공개 식별자이므로 이 문서에 보존하지 않는다. 최종 router Preview에서 한 HTTP 응답의 `x-hairfit-pinned-server-version` 헤더와 `/.well-known/hairfit-deployment` JSON을 함께 판정했다.

| 검증 | 결과 |
|---|---|
| atomic server pin + source revision | 5/5 일치 |
| `POST /api/v2/consultations` 비인증 경계 | 401 |
| `/`, `/login`, `/consulting/new` | 200 |
| `/workspace` 비인증 | 307 login redirect |

Preview에서는 유료 생성, 실제 사용자 사진, 실인증 컨설팅을 실행하지 않았다.

## 공개 카나리

각 표본은 서로 다른 router/source 요청을 합치지 않고, 단일 deployment 응답의 source와 router가 추가한 pinned server 헤더를 원자적으로 비교했다. 각 단계에서 root 20회와 비인증 V2 API 20회도 별도로 확인했다.

| 단계 | atomic 표본 | ON | OFF | mismatch | 진단 오류 | root 오류 | API 경계 오류 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 5% | 100 | 5 | 95 | 0 | 0 | 0 | 0 |
| 25% | 100 | 33 | 67 | 0 | 0 | 0 | 0 |
| 100% | 50 | 50 | 0 | 0 | 0 | 0 | 0 |

100% 전환 후 server 기본 deployment도 ON version 100%로 수렴시켰다. 이어서 atomic source/pin 20/20, `www` 200, root/login 200, workspace 307, consulting/new 200, 비인증 API 401을 다시 확인했다.

## Fail-closed 기록

첫 5% 관찰 시 잘못된 hostname을 사용한 probe가 네트워크 오류를 반환했다. 기능 실패와 구분할 수 없는 관측 실패였으므로 router를 즉시 기존 OFF 100%로 복구하고 운영 hostname의 OFF source와 API 401을 확인했다. 올바른 hostname으로 다시 시작한 5→25→100 카나리만 위 통과 표본에 포함했다.

그보다 앞선 관찰기는 router probe와 source probe를 별도 요청으로 보내 서로 다른 traffic bucket을 한 쌍으로 오판할 수 있었다. 최종 카나리에서는 `x-hairfit-pinned-server-version`과 source JSON을 같은 응답에 담아 이 결함을 제거했다.

## 종료 판정 범위

- Web Preview, 5→25→100 공개 카나리, rollback threshold 관찰은 통과했다.
- 실사용자 인증·실제 사진, 유료 Hair/Fashion 생성, 실제 시술 이후 Aftercare 관찰은 사용자 패스로 종료조건에서 제외했다. 실행 또는 통과로 기록하지 않는다.
- 남은 종료 게이트는 Expo development build의 실제 기기 parity다.
