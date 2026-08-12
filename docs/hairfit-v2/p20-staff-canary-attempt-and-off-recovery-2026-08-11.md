# P20 HairFit V2 스태프 카나리 시도와 OFF 복구 결과

- 실행일: 2026-08-11 KST
- 최초 안전장치 Git SHA: `c4763844af9496d68759b07aa8907183c0902b41`
- 판정: `staff_canary_version_ready / override_not_applied / production_off_recovered`

## 수행 범위

유료 hair·Fashion 생성과 실제 사용자 사진은 호출하지 않았다. 공개 트래픽을 변경하지 않는 0% version과 version override만 사용했다.

1. 운영 live 공개 설정과 `NEXT_PUBLIC_CONSULTATION_FRONTEND_V2=true`로 ON bundle을 빌드했다.
2. server flag 25개 중 legacy entitlement bridge만 `false`, 나머지는 `true`로 고정한 server version `4261e17e-6bc6-410d-a8c2-e3c371721f4b`를 업로드했다.
3. live prefix와 Clerk API 최소 조회를 통과한 인증 4개만 포함하고 위 server를 pin한 router version `c8940822-33e7-4efc-93bb-b3504f105161`를 업로드했다.
4. 기존 OFF server/router는 100%, 새 ON server/router는 0%인 deployment를 만들었다.

## 카나리 판정

Cloudflare 공식 version override 헤더를 운영 도메인 요청에 적용했지만 router probe와 source probe가 모두 기존 OFF version으로 fallback했다. 0% version이 실제로 선택됐다는 증거가 없으므로 5% 공개 단계와 실인증 여정은 시작하지 않았다. Preview URL은 해당 Worker 설정에서 제공되지 않았다.

## OFF 복구

기존 server version 재선택은 canary version에 포함된 secret 변경 때문에 Cloudflare가 강제 rollback 없이는 거부했다. 강제 rollback은 사용하지 않았다. 대신 다음 순서로 복구했다.

1. 같은 원격 SHA를 모든 build-time·server rollout flag가 `false`인 OFF bundle로 다시 빌드했다.
2. version secret API를 사용하는 upload로 OFF server `52c8f342-a9af-4f3f-807b-18ed3a4c8862`를 만들었다.
3. Clerk API 검증을 다시 통과한 router `1b759a85-a42f-44e7-942c-d02ac9900112`가 새 OFF server를 pin하도록 만들었다.
4. 두 version을 각각 100% 단일 deployment로 고정했다.
5. router/source exact probe 5회 연속, root/www/login `200`, workspace 비인증 `307`, V2 생성 API 비인증 `401`을 확인했다.

이 첫 복구 직후 production은 source `c4763844af9496d68759b07aa8907183c0902b41`, server `52c8f342-a9af-4f3f-807b-18ed3a4c8862`, router `1b759a85-a42f-44e7-942c-d02ac9900112`의 OFF 상태였다. 현재 최종 production은 아래 두 번째 시도의 최신 OFF 쌍이다.

## 남은 종료 게이트

- Expo 실기기 parity

2026-08-12 사용자 승인으로 운영 실인증·실사진, 실제 유료 hair/Fashion generation, actual service 이후 Brief/Aftercare 실증은 종료 게이트에서 패스했다. 이는 미실행 항목을 통과로 바꾸는 것이 아니라 최종 판정 범위에서 제외하고 정적·로컬·원격 비비용 증거만 보존한다는 뜻이다. 남은 Expo 실기기 parity가 닫히기 전 전체 Goal을 완료로 선언하지 않는다.

## 후속 안전장치

첫 시도에서 기존 OFF version 재선택이 secret 변경으로 거부된 문제를 반영해 server upload 도구를 `canary`와 `off` 두 mode의 version API 전용 경로로 통합했다. 이후 카나리는 ON upload 뒤 더 최신 OFF server/router를 먼저 준비하고, active deployment에 OFF 100%와 ON 0%를 함께 등록한다. 따라서 override 검증 실패 시 secret bulk나 강제 rollback 없이 최신 OFF version 단독 100%로 복구할 수 있다.

두 번째 시도에서는 source `19b5d682088bbd71083ce273e8efc0b8a06b18c2`로 ON server `e66fe68f-2e5f-413c-8621-75b7b7f0065b`·router `f0e03b6f-180f-4562-8883-608c5a28428d`를 만들고, 더 최신 OFF server `82eabfb8-3016-4216-9dd8-7e8e24f71d42`·router `8221300d-eace-4332-9c69-4f22f43420d9`를 준비했다. OFF 100%·ON 0% active deployment와 OFF baseline 5회 연속 수렴을 확인한 뒤에도 version override는 60초·12회 모두 OFF router로 fallback했다. 전파 지연으로 보지 않고 계정/플랫폼 측 override 미적용으로 판정했으며, 공개 비율을 올리지 않고 최신 OFF 쌍 단일 100%로 복귀했다. OFF exact router/source/API 경계는 5회 연속 통과했다.

후속 verifier는 ON router가 ON server를 pin하고 source SHA도 일치하는 경우에만 PASS한다. 둘 중 하나라도 60초 동안 일치하지 않으면 fail-closed로 종료해 공개 canary를 차단한다.

0% version override 대신 `workers_dev=false`와 `preview_urls=true`를 함께 사용해 새 router/server version의 고유 Preview URL을 production traffic 변경 없이 검증한다. Preview URL에서 exact server pin·source revision·비인증 경계가 통과한 뒤에만 Web canary를 검토한다.

## 2026-08-12 후속 완료

source `64829d74793ec5be77841596184406bc103f1d8f`, server `32f0a81d-304e-451f-940c-23c9a3e9f56a`, router `37d268c1-e43f-4d64-91d3-0efc2149f636`으로 Preview atomic 검증 5/5를 통과했다. 이어서 공개 traffic을 5→25→100%로 올렸고 각 100/100/50 표본에서 ON/OFF source와 pinned server mismatch가 0이었다. 최종 server/router는 각각 ON 100%이며 상세 결과와 fail-closed 복구 기록은 `p21-preview-and-public-canary-result-2026-08-12.md`를 따른다.
