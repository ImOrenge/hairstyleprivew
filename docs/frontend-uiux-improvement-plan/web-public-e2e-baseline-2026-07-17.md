# 공개 웹 UI E2E 기준선 — 2026-07-17

## 판정

비-에프터케어 공개 웹의 자동 Playwright·axe·keyboard·visual regression 기준선과 200%-equivalent·reduced-motion 공개 홈, B2B offline 복구 게이트를 확보했다. Production 로그인·회원가입은 안전 fallback을 검사하고, 실제 테스트 Clerk UI는 별도 인증 E2E lane에서 검증한다. 로그인 완료 뒤 고객·관리자·살롱 보호 화면은 제3의 fail-closed lane으로 구성했지만 승인된 세 역할 fixture 실행 완료 증거는 아직 없다. 이 증거는 실제 브라우저 zoom, 실제 스크린리더와 실기기를 포함하지 않으므로 Phase 13 전체 완료 증거가 아니다.

## 실행 계약

```powershell
npm run web:e2e:install
npm run web:e2e:build
npm run web:e2e
```

- 검증 전용 Next 산출물: `my-app/.next-e2e`
- 검증 서버: `127.0.0.1:3100`
- 기존 개발 서버와 `.next`를 공유하지 않는다.
- 실패 trace·video·report는 `.artifacts/playwright`에만 남기고 Git에 포함하지 않는다.
- 실제 테스트 Clerk 로그인·회원가입은 `playwright.auth.config.ts`, `localhost:3101`, `.next-auth-e2e`, `.artifacts/playwright-auth`를 사용하고 `npm run web:auth-e2e`로 분리한다.
- 로그인 완료 뒤 역할별 화면은 `playwright.protected.config.ts`, `localhost:3102`, `.next-protected-e2e`, `.artifacts/playwright-protected`를 사용한다. `E2E_CLERK_USER_EMAIL`·`E2E_CLERK_ADMIN_EMAIL`·`E2E_CLERK_SALON_EMAIL`·`E2E_OWNED_GENERATION_ID`·`E2E_FOREIGN_GENERATION_ID`가 없으면 인증을 우회하거나 사용자를 만들지 않고 setup/preflight 단계에서 실패한다.
- `npm run web:protected-e2e:preflight`는 개발 Clerk의 정확한 test customer/admin/salon owner와 Supabase의 동일 role, 고객의 만료 전 completed generation, 다른 `+clerk_test` 소유 generation을 읽기 전용으로 확인한다. 이메일·사용자·generation 식별자는 출력하지 않고 계정이나 DB row를 생성·수정하지 않는다.

## 자동 범위

- production axe WCAG A/AA serious·critical 0: `/`, `/b2b/contact`, `/login`, `/signup`, `/privacy-policy`, `/terms-of-service`; test key production 거절로 auth 두 경로는 안전 fallback 범위
- keyboard: 자동 결제 공지 최초 focus·ESC, skip link → `main`, 데모 성별 tab의 방향키·Home·End, FAQ Enter 토글
- viewport: 320, 375, 768, 1024, 1440px에서 document 가로 overflow 0
- visual regression: 위 5개 폭의 공개 홈 첫 viewport 기준 이미지 비교
- 200%-equivalent: 640 CSS px·DPR 2에서 document overflow 0, 공지 ESC, skip link → `main`, tablist·FAQ keyboard, focus target viewport 가시성
- reduced-motion: 공개 홈 후기 roll과 Hero 연속 애니메이션 4종이 `no-preference`에서는 실행되고 `reduce`에서는 computed `animation-name: none`
- token/offline recovery: B2B 문의의 mock Turnstile token 만료 안내·제출 차단·재확인, 첫 요청 단절 후 안전 오류·필수 입력 유지, 같은 폼 두 번째 201 접수와 성공 후 입력 초기화

기준 이미지는 `tests/web-e2e/__screenshots__/public-ui.spec.ts/` 아래 `home-320.png`부터 `home-1440.png`까지 저장한다.

별도 인증 lane은 실제 테스트 Clerk 로그인·회원가입의 axe, keyboard field order와 상호 링크, 320/375px overflow를 검사한다. 기준 이미지는 `tests/web-e2e/__screenshots__/auth-ui.spec.ts/`의 4개 파일이며 Next 개발 indicator는 제품 UI가 아니므로 캡처에서 제외한다.

보호 화면 lane은 Clerk 공식 `@clerk/testing` 프로젝트 setup에서 기존 고객·관리자·살롱 `+clerk_test` 사용자를 이메일로 로그인하고 역할별 storage state를 저장하도록 구성했다. 고객 `/home`·`/mypage`·본인/타인 generation, 관리자 `/admin/stats`·`/admin/members`, 살롱 `/salon/customers`·`/salon/connections`의 H1·axe serious/critical 0·375px overflow 0과 역할 거절 경로를 검사한다. 조회 요청에서 브라우저 write request가 없어야 하며 기존 사용자 role 조회는 프로필 초기화 RPC를 호출하지 않는다. 개발 키만 허용하며 실제 계정 생성·MFA 우회용 제품 코드·운영 live key 사용은 거절한다.

## 검사로 발견하고 수정한 문제

- 푸터 사업자정보 label이 밝은 화면에서 WCAG 대비를 충족하지 못해 `--app-muted`로 보정했다.
- 후기 가로 스크롤 영역이 keyboard focus를 받을 수 없어 focusable region과 visible outline을 추가했다.
- 데모 성별 tab이 click만 지원해 roving `tabIndex`, 방향키, Home, End, tabpanel 관계를 추가했다.
- B2B 문의의 placeholder-only 입력을 보이는 `FormField` label로 교체하고 필수 항목·autocomplete·입력 예시를 구분했다.
- Turnstile mount의 이름 없는 generic region을 label이 있는 group으로 정리했다.
- fetch 실패를 처리하지 않아 접수 상태가 멈출 수 있던 경로를 `catch/finally`로 복구하고, Turnstile token callback이 네트워크 오류까지 지우지 않도록 보안 오류 상태만 선택적으로 해제한다.

## 남은 경계

- 승인된 고객·관리자·살롱 `+clerk_test` fixture로 보호 화면 14개 setup/검사 실제 green run
- Clerk 로그인 뒤 Workspace·생성 접수/선택 변경·관리자/살롱 mutation 화면의 keyboard/visual/API 결과
- 실제 Chrome/Safari 200% 확대·reduced-motion, 실제 slow/offline 회선·Turnstile provider, 인증 token 만료
- VoiceOver/TalkBack과 iOS/Android physical device
- 실제 PortOne·Supabase·Resend 사용자 여정
