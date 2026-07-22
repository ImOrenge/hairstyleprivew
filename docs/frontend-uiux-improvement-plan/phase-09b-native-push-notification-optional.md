# Phase 09B — 네이티브 Push·인앱 알림 확장

- 상태: implemented_pending_external — 권한 UX·기기 등록·채널별 outbox·ticket/receipt·탭 복귀를 로컬 구현, EAS/APNs/FCM·실기기 증거 대기
- 우선순위: 선택 확장
- 변경 게이트: `behavioral`, 개인정보·외부 인프라
- 선행 페이즈: Phase 05, Phase 07A, Phase 07B, Phase 09A
- 독립 배포: 이메일 fallback을 유지할 때 가능

## 목표

알림 권한을 허용한 앱 사용자에게 생성 terminal 상태를 OS push로 알리고 generation deep link로 복귀시킨다. 권한 거부·token 만료·push 실패 시 이메일과 인앱 상태가 계속 작동해야 한다.

## 현재 확보된 선행 기반

- [x] generation UUID ResumeTarget과 로그인 후 복귀
- [x] iOS associated domain과 Android verified `/generate/` intent filter 선언
- [x] 환경 기반 AASA/Asset Links route와 잘못된 identifier의 fail-closed 응답
- [x] Phase 09A email outbox와 인앱 generation 상태 fallback

위 항목은 push permission, token, provider 발송을 구현한 것이 아니다.

## 시작 전 필수 조건

- EAS project ID
- APNs와 FCM 자격 증명
- `expo-notifications` 의존성과 app plugin 설정
- 개인정보 처리방침의 push token·알림 선호도 항목
- iOS·Android 실제 테스트 기기

위 조건이 없으면 이 페이즈를 완료로 표시하지 않는다.

## 로컬 구현

- [x] `expo-notifications`·`expo-device` 설치, app plugin, foreground notification handler와 Android high-importance channel
- [x] 계정 화면의 명시적 opt-in, 승인·거부 안내, 영구 거부 시 OS 설정 이동, 이메일·인앱 fallback 안내
- [x] 로그인 사용자에서만 호출하는 기기 등록·조회·해제 API와 service-role 전용 migration/RPC
- [x] 앱 시작 시 opt-in 기기의 token 재등록, 로그아웃 전 revoke, `DeviceNotRegistered` receipt의 invalid cleanup
- [x] 이메일 outbox와 독립된 기기별 terminal push outbox, send lease, Expo ticket, 15분 뒤 receipt 확인과 재시도/dead-letter
- [x] foreground banner/list, background tap listener, terminated cold-start response와 로그인 후 정확한 `/generate/{uuid}` 복귀 코드
- [x] 앱 badge 설정과 알림 tap 시 badge·last response 정리
- [x] push 비활성·권한 거부·provider 실패가 생성 terminal 상태나 이메일 outbox를 변경하지 않는 fallback 계약

## 운영·실기기 검증 대기

- [ ] EAS project ID와 APNs/FCM 운영 자격 증명
- [ ] iOS physical device foreground/background/terminated 수신
- [ ] Android physical device foreground/background/terminated 수신
- [ ] release signing 기반 Universal/App Link tap
- [ ] offline 후 online, 실제 token rotation, 로그아웃, 계정 전환, 계정 삭제
- [ ] provider failure 시 이메일·인앱 fallback과 중복 억제

## 포함 범위

- [x] 알림 권한 설명과 승인·거부·설정 이동 UX
- [x] 사용자·기기별 push token 저장, 재등록, revoke, invalid token cleanup
- [x] 기기별 completion channel opt-in preference
- [x] terminal outbox의 email/push channel별 idempotency
- [x] complete, partial, failed payload와 generation deep link
- [x] foreground 알림 banner/list, background tap, cold start 처리 코드
- [x] 앱 badge와 알림 응답 정리
- [x] 계정 삭제 시 DB cascade로 모든 사용자 기기 token 삭제, Expo opt-in·badge 로컬 정리
- [ ] 계정 삭제 후 실제 iOS/Android 기기에 이전 사용자 알림이 도착하지 않는 운영 E2E
- [x] push 실패 시 이메일·인앱 fallback

## 제외 범위

- 마케팅 push
- 위치·행동 기반 캠페인
- 이메일 채널 제거
- Android/iOS 자격 증명 자동 생성·배포

## 구현 파일

- `apps/hairfit-app/package.json`
- `apps/hairfit-app/app.json`
- `apps/hairfit-app/app/_layout.tsx`
- `apps/hairfit-app/lib/push-notifications.ts`
- `apps/hairfit-app/components/app/PushNotificationProvider.tsx`
- `apps/hairfit-app/app/account.tsx`
- `my-app/app/api/mobile/push-devices/route.ts`
- `my-app/lib/generation-push-notifications.ts`
- `supabase/migrations/20260717213520_generation_push_notifications.sql`
- `supabase/migrations/20260718061201_account_deletion_privacy_cleanup.sql`
- `docs/account-deletion-operations-runbook.md`

## 수용 기준

- 권한 허용 사용자는 background·강제 종료 상태에서도 terminal 알림을 받는다.
- 알림 tap은 인증 후 정확한 generation을 연다.
- 권한 거부 사용자는 반복 강요 없이 이메일·인앱 fallback을 사용한다.
- 같은 terminal event가 같은 채널에서 중복 발송되지 않는다.
- invalid token은 정리되고 다른 사용자의 기기에 알림이 가지 않는다.
- 로그아웃·계정 삭제 후 이전 사용자 알림이 기기에 도착하지 않는다.

## 검증

- 로컬: Expo Jest 102/102, 웹·Expo·shared·API client typecheck, 변경 파일 lint 오류 0
- DB: PostgreSQL 18.4 fresh targeted apply와 등록 재할당·enqueue·ticket·receipt·invalid token·email 독립 smoke
- migration mirror SHA-256: `BFB737E94D133614547F275FE178AAFF4325DB8D4ED4725531FE4C1B0C410567`
- 실제 iOS APNs와 Android FCM device test
- foreground, background, terminated, offline 후 online, token rotation
- 로그인 만료, 다른 계정 로그인, 알림 권한 거부·영구 거부
- email/push 중복 억제와 fallback

`mobile:sync`와 Expo Metro 시작만으로 완료하지 않는다.

로컬 테스트는 실제 OS 수신 증거가 아니다. 현재 저장소에는 EAS project ID와 APNs/FCM 운영 자격 증명이 없으므로 앱은 설정 미완료를 안전하게 알리고 이메일·인앱 상태를 계속 사용한다. 서버 발송은 `GENERATION_PUSH_ENABLED=true`일 때만 활성화하고 production에서는 `EXPO_ACCESS_TOKEN`이 없으면 DB row를 claim하지 않는다.

## 롤백·인계

- push channel feature flag를 끄면 이메일과 인앱 상태만 유지한다.
- token table은 개인정보 삭제 정책을 유지하며 무조건 삭제하지 않는다.
- Phase 13에는 APNs/FCM 환경별 증거와 rollback 절차를 넘긴다.
