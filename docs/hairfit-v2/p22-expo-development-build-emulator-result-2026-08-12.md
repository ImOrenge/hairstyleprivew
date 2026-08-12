# P22 Expo development build 에뮬레이터 결과

- 실행일: 2026-08-12 KST
- 검증 소스: `f5048b15179ed753bb94510affaf11fcf40a53a3`
- 대상: Android API 36 x86_64 AVD
- API: `https://hairfit.beauty`
- V2 mobile flag: ON
- 판정: `emulator_pass / physical_device_not_run`

## 발견 및 수정

최초 development APK는 빌드·설치됐지만 `expo-dev-launcher`가 시작 시 요구하는 `expo.modules.splashscreen.SplashScreenManager`를 찾지 못해 오류 화면으로 전환됐다. 앱에 `expo-splash-screen ~55.0.23`을 직접 선언하고 manifest 회귀 테스트를 추가했다. 수정 뒤 동일 New Architecture x86_64 APK가 정상 빌드·설치·실행됐다.

Windows 검증 환경은 C 드라이브 공간 부족과 260자 CMake 경로 제한이 있어 저장소 밖 D 드라이브 캐시와 짧은 detached verification worktree를 사용했다. 제품 source, build architecture, runtime contract는 변경하지 않았다. Docker는 사용하지 않았다.

## 빌드 및 설치 증거

| 항목 | 결과 |
|---|---|
| Expo SDK | 55 |
| Android compile/target SDK | 36 / 36 |
| ABI | x86_64 |
| `app:assembleDebug` | 통과, 415 tasks |
| APK 크기 | 68.5 MiB |
| APK SHA-256 | `7611eac7dd870651ac6fbb74f33e3504b37aafd31649697ffeeb93c93ca5e8fc` |
| ADB install | Success |
| package | `com.hairfit.app` |

## 런타임 smoke

- development client와 Metro를 통해 `MainActivity`가 정상 포커스를 획득했다.
- 홈과 로그인 화면이 기존 black/gold 공개 CSS 시각 언어에 대응하는 native token으로 렌더링됐다.
- 로그인 CTA, 뒤로가기, 강제 종료 후 재실행이 crash 없이 동작했다.
- `hairfit://consulting` 딥링크의 비인증 접근은 로그인 화면으로 이동했다.
- 이메일 입력에서 Android IME가 표시됐고 입력 폼과 주요 동작이 가려지지 않았다. 실제 이메일·OTP·사용자 ID는 사용하지 않았다.
- 1080×2424 / density 420과 720×1280 / density 320에서 화면을 확인했다. 작은 화면에서도 폼이 스크롤되고 회원가입과 고정 로그인 CTA에 접근 가능했다. 검증 뒤 AVD 화면 설정을 원래 값으로 복원했다.
- 검증 구간의 `FATAL EXCEPTION`, JS fatal error, `ClassNotFoundException`, bundle load error는 0이었다.

## 검증 명령

- `npm --workspace @hairfit/app run typecheck`: 통과
- `npm --workspace @hairfit/app run test`: 41 suites, 176 tests 통과
- splash native dependency contract: 3/3 통과
- 수정 APK `app:assembleDebug`: 통과

## 종료 판정

Android development build의 빌드·설치·부팅·비인증 navigation·keyboard·작은 화면 smoke는 통과했다. 다만 AVD는 물리 기기가 아니며 카메라/사진 선택, 실제 인증 session, 실제 consultation resume, offline 전환, 409 상호작용, iOS 기기 동등성을 증명하지 않는다. 실인증은 사용자 패스 범위라 우회하지 않았다. 따라서 Expo 물리 기기 parity 종료 게이트는 여전히 `not_run`이다.
