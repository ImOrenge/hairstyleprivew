# Google Play Billing 출시 런북

## 구현 범위

- Android 앱은 `expo-iap`을 통해 Google Play Billing을 사용한다. iOS와 웹의 기존 PortOne 경로는 유지한다.
- 구독 상품은 `hairfit_basic`, `hairfit_standard`, `hairfit_pro`이며 base plan은 모두 `monthly-auto`다.
- 소모성 상품은 `hairfit_usage_30`, `hairfit_usage_80`, `hairfit_usage_200`이다.
- 서버가 15분 유효 purchase intent를 발급하고 Google Developer API 검증을 통과한 구매만 기존 결제·구독·크레딧 원장에 반영한다.
- `GOOGLE_PLAY_BILLING_ENABLED`는 아래 외부 검증이 끝날 때까지 `false`로 둔다.

## 가격 및 상품 설정

| 상품 ID | 유형 | 기준 가격 | 지급 크레딧 |
|---|---|---:|---:|
| `hairfit_basic` | 월 구독 | 11,400원 | 80 |
| `hairfit_standard` | 월 구독 | 22,900원 | 200 |
| `hairfit_pro` | 월 구독 | 57,400원 | 600 |
| `hairfit_usage_30` | 소모성 | 6,800원 | 30 |
| `hairfit_usage_80` | 소모성 | 16,000원 | 80 |
| `hairfit_usage_200` | 소모성 | 34,400원 | 200 |

Play Console에서 앱 `com.hairfit.app`을 등록하고 결제 프로필을 연결한다. 세 구독에는 `monthly-auto` 자동 갱신 base plan을 만들며, 세 단건 상품은 소비 가능한 인앱 상품으로 만든다. 앱 화면은 위 기준가를 fallback으로만 사용하고 Play가 반환한 현지화 가격을 표시한다. 출시 전에 Google Play 15% 서비스 수수료 프로그램 가입 상태와 각 국가별 실판매 가격을 콘솔 증거로 남긴다.

## 서비스 계정과 RTDN

1. Google Cloud 서비스 계정을 만들고 Play Console의 API 액세스에 연결한다.
2. 해당 계정에 주문·구독 조회, acknowledge, consume에 필요한 최소 권한만 부여한다.
3. Pub/Sub topic을 Play Console의 실시간 개발자 알림에 연결한다. 구독, 단건, voided purchase 알림을 모두 활성화한다.
4. 인증된 push subscription의 endpoint를 `https://hairfit.beauty/api/payments/google-play/rtdn`으로 설정한다.
5. push용 서비스 계정에 endpoint 호출 권한을 주고 audience와 이메일을 서버 secret에 동일하게 설정한다.
6. RTDN은 상태 변경 신호로만 취급한다. endpoint가 수신할 때마다 Developer API를 다시 조회한 뒤 원장을 갱신한다.

필수 서버 환경 변수는 다음과 같다.

- `GOOGLE_PLAY_BILLING_ENABLED=false`
- `GOOGLE_PLAY_PACKAGE_NAME=com.hairfit.app`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_PLAY_TOKEN_ENCRYPTION_SECRET`: PortOne billing key secret과 분리한 32바이트 이상의 랜덤 secret
- `GOOGLE_PLAY_PUBSUB_AUDIENCE`
- `GOOGLE_PLAY_PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL`

purchase token 원문은 클라이언트 응답과 로그에 남기지 않는다. DB에는 암호문과 HMAC hash만 저장한다.

## DB와 배포 순서

1. `20260722120000_google_play_billing.sql` migration을 테스트 DB fresh chain에 적용한다.
2. contract test, audit, workspace typecheck·lint, Expo Jest와 Android export/prebuild를 통과시킨다.
3. `apps/hairfit-app`에서 `eas init`을 실행해 실제 EAS project ID를 연결한다. project ID는 저장소에서 임의 생성하지 않는다.
4. Windows에서는 EAS 원격 빌드를 사용한다.
   - 개발 클라이언트: `eas build --platform android --profile development`
   - 내부 트랙 AAB: `eas build --platform android --profile internal`
   - 운영 AAB: `eas build --platform android --profile production`
5. 첫 Play 업로드의 `versionCode`는 1이며 이후 EAS remote version과 production `autoIncrement`로 단조 증가시킨다.
6. 내부 테스트가 끝날 때까지 운영 환경의 `GOOGLE_PLAY_BILLING_ENABLED=false`를 유지한다.

## 내부 트랙 수용 시험

- 라이선스 테스터 실기기에서 여섯 상품의 실제 Play 가격과 구매를 확인한다.
- 무료 사용자의 단건 구매가 서버에서 차단되고 활성 유료 구독자는 구매 가능한지 확인한다.
- `mob-` PortOne 1개월권은 잔여 크레딧을 보존한 채 Play 첫 달 크레딧이 지급되는지 확인한다.
- billing key가 있는 웹 자동결제 구독은 Play 구독 intent 발급이 차단되는지 확인한다.
- 앱 강제 종료 직후 재실행·구매 복원, pending 승인, 테스트 갱신, 해지, grace period, on hold, paused, expired를 확인한다.
- 같은 callback, RTDN message ID, purchase token, order ID를 반복 전달해도 한 번만 지급되는지 확인한다.
- 단건 지급 후 consume, 구독 지급 후 acknowledge가 완료되는지 확인한다.
- 환불·void 알림 후 기존 회수 원장이 실행되고 Play 주문, 결제 거래, 구독, credit lot, 앱 잔액이 일치하는지 확인한다.
- Play 결제 내역에는 PortOne 환불 UI가 없고 Play 구독 관리와 지원 안내만 표시되는지 확인한다.

외부 콘솔 설정과 실결제 증거가 모두 확보된 뒤에만 `GOOGLE_PLAY_BILLING_ENABLED=true`로 전환한다. 플래그 전환, 배포, Play Console 작성은 별도 승인 작업으로 수행한다.
