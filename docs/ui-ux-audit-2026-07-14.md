# HairFit 웹·앱 UI/UX 감사

- 감사일: 2026-07-14
- 범위: Next.js 고객·살롱·관리자 화면 전체, Expo Router 33개 경로, 생성·결과·결제·마이페이지 핵심 여정
- 방법: 라우트/상태/오류/접근성/반응형/웹·앱 일관성 정적 감사와 프로덕션 빌드 검증
- 제한: 실제 운영 계정 브라우저 시각 회귀, iOS/Android 실기기, 원격 DB·메일 수신 E2E는 수행하지 않음

## 이번에 해결한 P0

1. 브라우저와 앱이 직접 9개 이미지를 순차 생성하던 구조를 Cloudflare Workflows 기반 서버 작업으로 전환했다.
2. 고객 웹, 살롱 웹, 모바일이 동일한 `/api/generations/start` 계약을 사용한다.
3. 원본 사진을 private Supabase Storage에 저장해 페이지나 앱이 종료되어도 서버가 작업을 이어갈 수 있게 했다.
4. 웹·앱은 가벼운 status API를 재조회하고 `updatedAt`이 바뀔 때만 상세 결과와 signed URL을 갱신한다.
5. 완료·부분 완료·전체 실패 시 가입 이메일을 발송한다. DB claim과 Resend idempotency key로 재시도 중복을 억제한다.
6. 정상 완료 원본은 즉시 삭제하고, 24시간 이상 남은 terminal/abandoned 원본은 예약 작업으로 정리한다.
7. 생성 중 수동 재시도를 막아 Workflow와 같은 후보를 동시에 생성하지 않게 했다.
8. 업로드 검증 결과와 생성 진행 상태에 live status/progress 접근성 정보를 추가했다.
9. 생성 중인 마이페이지 기록은 결과 화면이 아니라 진행 보드로 연결한다.

## 남은 웹 우선순위

### P1

- 내구성 있는 작업 경계는 얼굴 분석과 추천 보드 저장 이후다. 결과 보드로 이동하기 전 분석 단계에서는 화면/앱을 유지해야 하며, 완전한 즉시 종료 보장은 prompt 준비 단계까지 Workflow로 옮기는 후속 작업이 필요하다.
- 결과 조회 실패가 placeholder 이미지로 가려져 정상 결과처럼 보일 수 있다: `my-app/app/result/[id]/page.tsx`.
- 공유 버튼이 인증 전용 결과 URL을 복사해 수신자가 열 수 없다: `my-app/components/result/ActionToolbar.tsx`.
- 홈·마이페이지·에프터케어 일부 데이터 오류가 빈 상태로 변환되어 장애와 데이터 없음이 구분되지 않는다.
- 퍼스널컬러 진행 수치가 실제 서버 진행률이 아닌 시뮬레이션 값이다.
- Styler 네트워크 오류에서 무한 로딩이 생길 수 있는 경로가 있다: `my-app/app/styler/new/page.tsx`.
- KO/EN 전환과 무관하게 생성·결과·관리 화면의 문구가 혼재한다.

### P2

- 결과 비교는 hover/focus 중심이라 모바일 터치 비교 조작이 부족하다.
- 기능별 모달에 공용 focus trap, ESC 닫기, focus 복원, scroll lock 계약이 없다.
- 일부 `Link`와 `Button`, `main` 요소가 중첩된다.
- 전역 loading/error/not-found 경계와 skip link, 현재 메뉴 `aria-current`가 부족하다.
- 관리자·살롱 폼에 placeholder-only 입력과 테마 토큰을 우회한 고정 색상이 남아 있다.

## 남은 모바일 우선순위

### P1

- 마이페이지 생성 가능 횟수가 `credits / 5`로 계산되어 서버 기본 비용 10과 다르다.
- 에프터케어의 유료 전환 비용과 확인 단계가 결과 화면에 충분히 드러나지 않는다.
- 공통 내비게이션, bottom safe area, 키보드 회피가 화면마다 일관되지 않다.
- 모바일 결과 화면은 웹의 원본 비교, 디자이너 브리프, 평가, 공유, 다운로드 기능과 격차가 크다.
- MFA, 비밀번호 재설정, 인증 후 return URL 복원이 불완전하다.
- Styler 선택 모달은 작은 화면 스크롤과 밝은 패널 대비 문제가 있다.
- 결제 CTA, 서버 가격 계약, 약관·개인정보 내용 일치 여부를 정리해야 한다.
- 살롱·관리자 모바일 화면은 다수 기능이 조회 전용이며 긴 목록에 pagination/virtualization이 없다.

### P2

- 선택형 컨트롤의 `accessibilityState`, 이미지 설명, 동적 오류 live region이 부족하다.
- 반복 애니메이션에 reduced-motion 대응이 부족하다.
- 권한 영구 거부 시 OS 설정으로 이동하는 복구 CTA가 없다.
- 개발자용 문구와 한국어·영어가 사용자 화면에 혼재한다.

## 생성 완료 알림 운영 조건

1. Supabase migration을 적용한다.
2. 앱 Worker와 Workflow Worker에 동일한 `GENERATION_WORKFLOW_CALLBACK_SECRET`를 등록한다.
3. Resend API key, `HairFit <noreply@hairfit.beauty>` 발신 도메인, `NEXT_PUBLIC_SITE_URL`을 확인한다.
4. Workflow Worker를 먼저 배포하고 앱 Worker를 배포한다.
5. 인증 사용자로 생성 직후 브라우저 종료와 앱 강제 종료를 각각 수행해 DB terminal 상태, 이메일 1회, 링크 재진입을 확인한다.

Native push는 EAS project ID, APNs/FCM 자격 증명, 권한 동의, push token 저장이 없는 상태라 이번 범위에서는 이메일을 공통 완료 채널로 사용한다.
