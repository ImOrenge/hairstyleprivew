# UI/UX 후보 의존성 보안 검토 — 2026-07-18

## 판정

웹·Expo의 서로 다른 React 호환 범위를 유지하면서 같은 메이저·SDK 안의 보안 패치를 적용했다. 현재 `npm audit`은 production과 전체 의존성 모두 high/critical 0이며, PR CI는 `npm audit --audit-level=high`로 새 high/critical 공지를 차단한다.

## 적용 범위

| 표면 | 이전 | 현재 | 이유 |
| --- | --- | --- | --- |
| Next.js | 16.2.4 | 16.2.10 | 16.2.5/16.2.6 이전 RSC·Proxy 관련 공지 범위 제거 |
| 웹 React/React DOM | 19.2.3 | 19.2.7 | React Server Components 후속 보안 패치 이상 유지 |
| Clerk Next | 6.39.3 | 6.39.6 | 같은 major patch 정렬 |
| Clerk Expo | 2.19.31 | 2.19.42 | 조직·결제·재검증 조합의 authorization bypass 공지 범위 제거 |
| Expo | 55.0.18 | 55.0.28 | SDK 55 안에서 CLI·Router·native module patch 정렬 |
| Expo React/React DOM | 19.2.0 | 19.2.0 유지 | Expo SDK 55의 공식 React 기준을 유지하고 Metro가 앱 로컬 복사본을 사용 |
| Resend | 6.12.2 | 6.17.2 | vulnerable Svix 전이 경로 제거 |
| OpenNext/Wrangler | 1.19.5 / 4.87.0 | 1.20.1 / 4.112.0 | Next 16.2.10 호환과 patched `undici` 7.28.0 사용 |
| `ws` / `shell-quote` / `form-data` | 8.20.0 / 1.8.3 / 4.0.5 | 8.21.1 / 1.10.0 / 4.0.6 | high/critical 개발·전이 공지 제거 |

React 공식 보안 공지는 RSC 사용 웹에는 patched release를 요구하고, React Native는 모노레포에서 실제 RSC 패키지가 설치된 경우만 해당 패키지를 갱신하도록 구분한다. Expo SDK 55는 React 19.2.0을 기준으로 하므로 웹 버전을 Expo 앱에 강제로 합치지 않는다.

- React 공지: https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components
- Expo SDK 55 기준: https://docs.expo.dev/versions/v55.0.0/

## 로컬 증거

- `npm audit --omit=dev --audit-level=high`: high 0, critical 0
- `npm audit --audit-level=high`: high 0, critical 0
- `npm ci --dry-run --no-audit --fund=false`: exit 0
- 7-workspace typecheck: exit 0
- `lint:all`: 오류 0, 기존 에프터케어 경고 1
- Next 16.2.10 production build: 96/96
- OpenNext 1.20.1 Cloudflare bundle: 완료
- Expo 테스트: 25 suites, 126 tests 통과
- shared 테스트: 44/44 통과
- Expo 55.0.28 web/iOS/Android export: 1,064 / 1,343 / 1,366 modules
- generation Workflow Wrangler 4.112.0 dry-run: 완료

## 남은 경계

`expo-doctor`의 SDK patch mismatch는 모두 해소했다. 남은 두 진단은 다음과 같이 출시 전 실기기에서 확인한다.

1. 모노레포의 웹 React 19.2.7과 Expo React 19.2.0, native package 중복 경고: Expo Metro `extraNodeModules`가 앱 로컬 React·React DOM·React Native·safe-area를 고정한다. 무조건 dedupe하면 Expo 공식 React 기준을 깨므로 현재는 분리 유지한다.
2. custom Metro `watchFolders` 경고: workspace 패키지 소스와 앱 전용 UI adapter를 해석하기 위한 기존 구성이다. 웹/iOS/Android export는 통과했지만 iOS/Android development build와 실기기 cold start 증거 전에는 해제하지 않는다.

moderate/low 공지는 자동 강제 수정하지 않는다. 각 direct/transitive 경로와 SDK 호환을 검토해 같은 호환선의 패치가 나오면 갱신하며, `npm audit fix --force`는 사용하지 않는다.
