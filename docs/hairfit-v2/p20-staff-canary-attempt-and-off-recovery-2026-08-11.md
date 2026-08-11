# P20 HairFit V2 스태프 카나리 시도와 OFF 복구 결과

- 실행일: 2026-08-11 KST
- 고정 Git SHA: `c4763844af9496d68759b07aa8907183c0902b41`
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

현재 production은 source `c4763844af9496d68759b07aa8907183c0902b41`, server `52c8f342-a9af-4f3f-807b-18ed3a4c8862`, router `1b759a85-a42f-44e7-942c-d02ac9900112`의 OFF 상태다.

## 남은 종료 게이트

- version override가 적용되지 않은 원인 해소 또는 인증된 staff 전용 라우팅 수단 확보
- 운영 실인증 Discovery→Photo→AI analysis→landmark→exit/resume
- 실제 유료 hair/Fashion generation의 partial/retry/selection
- actual service 이후 Brief/Aftercare
- Expo 실기기 parity

위 항목이 닫히기 전 전체 Goal을 완료로 선언하지 않는다.
