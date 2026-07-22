# Phase 05 — 인증·온보딩·안전한 복귀 대상

- 상태: generation·salon invite·결제·MFA·비밀번호 재설정 복귀와 업로드 전 필수 프로필 가드 로컬 구현 — 운영 Clerk/app-link·실기기 검증 대기
- 우선순위: P1, 생성 완료 재진입의 필수 선행
- 변경 게이트: `behavioral`, 일부 `breaking`
- 선행 페이즈: Phase 00
- 독립 배포: 웹 내부 redirect는 가능, Universal/App Link는 association 파일과 스토어 서명 정보가 함께 준비돼야 함

## 목표

로그인 세션이 만료되거나 앱이 종료돼도 사용자가 열려던 generation ID를 잃지 않게 한다. 임의 URL 문자열은 신뢰하지 않고, 허용된 내부 resource만 복귀 대상으로 사용한다.

## 현재 구현 계약

shared `ResumeTarget`은 임의 URL 대신 소유 자원을 식별하는 generation과 salon invite 두 종류만 허용한다.

```ts
type ResumeTarget =
  | Readonly<{ kind: "generation"; generationId: string }>
  | Readonly<{ kind: "salon-match"; inviteCode: string }>;
```

직렬화 형식은 `generation:{uuid}` 또는 `salon-match:{code}`다. 저장 envelope v2는 생성 시각과 24시간 만료를 가지며, 검증된 v1 값만 v2로 이관한다. 외부 URL, protocol-relative URL, 역슬래시, query/hash, 잘못된 UUID·invite code는 거절한다. 웹 Clerk helper는 검증된 내부 query/hash를 보존하되 `/generate/*` pathname에 shared UUID 검증을 추가한다.

## 로컬 구현 완료

- [x] `@hairfit/shared` generation ResumeTarget 생성·serialize·parse·path validation
- [x] 웹 Clerk return path의 외부 origin·protocol-relative·다중 encode·제어문자 방어
- [x] 비인증 generation 상세에서 검증된 `/login?redirect_url=...` 생성
- [x] 웹 generation API의 401과 resource 권한 403 UX 분리
- [x] Expo pending target을 SecureStore 우선으로 저장하고 잘못된 값 자동 제거
- [x] 모바일 로그인·가입·OAuth·SSO callback 성공 후 pending generation path 복원
- [x] 모바일 generation 상세의 401 로그인 복귀와 403 다른 계정/권한 안내 분리
- [x] iOS `applinks:hairfit.beauty`와 Android verified `/generate/` intent filter 구성
- [x] Apple AASA와 Android Asset Links를 환경 변수로 생성하는 `/.well-known` route
- [x] Apple Team ID·Android SHA-256 형식이 없거나 잘못되면 association route가 `503 no-store`로 fail closed
- [x] 외부 association preflight가 HTTPS origin, 200, JSON, redirect 없음, `com.hairfit.app`, `/generate/*`, 운영 Team ID·release fingerprint 일치를 fail closed로 확인하고 release-candidate environment gate에 연결
- [x] shared/web/mobile/app-link validation test
- [x] 웹 `/workspace`가 DB 우선 계정 상태로 닉네임·성별·온보딩 완료를 확인한 뒤 미완료 회원을 계정 설정으로 이동
- [x] Expo `/upload`가 `/api/mobile/me` 확인 전 사진 선택을 노출하지 않고 미완료 회원·살롱 역할을 각각 안전한 화면으로 이동
- [x] 계정 설정 저장 후 `generation-upload`·`generation-submit` enum continuation으로 웹·Expo의 원래 생성 단계 복귀
- [x] 홈 계정 설정 안내는 계속 둘러볼 수 있는 선택 안내로 유지하고 실제 사진 선택 진입에서만 필수 설정을 차단
- [x] 살롱 invite code를 shared ResumeTarget으로 검증하고 로그인·가입·SSO 뒤 동의 화면 복귀
- [x] 결제 pending을 사용자 ID별 SecureStore에 분리하고 유료 행동 자동 실행 없이 결제 확인 뒤 fresh quote 화면 복귀
- [x] Expo 로그인에서 email/SMS/TOTP/backup-code second factor 선택·준비·검증과 안전 오류·focus 처리
- [x] Expo 이메일 비밀번호 재설정 코드 → 새 비밀번호 확인 → 다른 세션 종료 → 필요 시 MFA → 원래 ResumeTarget 복귀
- [x] pending ResumeTarget v2 24시간 만료·미래 시각 거절·v1 호환 이관·소비 후 삭제
- [x] 일반 계정 로그아웃은 세션 종료 성공 뒤 auth ResumeTarget을 삭제하며, 계정 전환용 generation 복귀와 계정별 결제 복구는 보존
- [x] 웹·Expo 회원 탈퇴 확인 UX, DB cascade·Storage API outbox·Clerk 순차 삭제, auth ResumeTarget·현재 계정 pending payment·Push 로컬 상태 삭제 계약

## 운영·실기기 검증 대기

- [ ] `HAIRFIT_APPLE_TEAM_ID`에 운영 Apple Team ID 설정
- [ ] `HAIRFIT_ANDROID_CERT_SHA256`에 Play/App Signing 운영 인증서 SHA-256 설정
- [ ] `https://hairfit.beauty/.well-known/apple-app-site-association`의 200, JSON, redirect 없음 확인 — 2026-07-18 live probe는 redirect 없이 `404 text/html`; 현재 작업 트리의 route가 아직 배포본에 없음
- [ ] `https://hairfit.beauty/.well-known/assetlinks.json`의 200, JSON, 운영 package/signature 일치 확인 — 2026-07-18 live probe는 redirect 없이 `404 text/html`; 운영 release fingerprint secret 설정과 route 배포 필요
- [ ] 실제 완료 이메일 → 로그아웃 상태 → Clerk 로그인 → 같은 generation 웹 복귀
- [ ] iOS terminated 앱에서 Universal Link tap → 로그인 → 같은 generation 복귀
- [ ] Android terminated 앱에서 verified App Link tap → 로그인 → 같은 generation 복귀
- [ ] 다른 계정으로 로그인한 경우 403 설명과 안전한 이력/홈 CTA 확인 — 고객·관리자·살롱 `+clerk_test` 계정과 본인 completed generation·foreign generation을 읽기 전용으로 사전검사하고, 고객 본인 조회 `200`·API `403`·결과 이미지 0·다른 계정 로그인/홈 CTA를 확인하는 역할별 14-test protected lane에 포함; 승인된 실제 fixture green run 대기
- [ ] 실제 Clerk 테스트 계정 삭제와 iOS/Android 실기기 확인 — 로컬 삭제 정책·DB cascade·재시도 tombstone·계정별 저장소 정리는 구현

## 후속 범위 — 아직 완료 아님

- [x] MFA와 비밀번호 재설정의 성공·취소·실패 후 복귀 로컬 흐름 — 실제 Clerk MFA 계정과 메일 수신 E2E 대기
- [x] 살롱 invite code ResumeTarget
- [x] paid action과 billing 복귀 — auth target과 섞지 않고 account-scoped payment resume로 구현
- [x] 필수 프로필을 업로드 전에 확인하는 route guard — 웹 server gate와 Expo bootstrap gate 적용
- [x] 필수/선택 계정 설정과 첫 홈 blocking modal 조정 — 홈 안내는 닫기 가능, 생성 진입은 설정 완료 전 차단
- [x] 실제 모바일 onboarding route와 포트 맵 정합성 — 별도 `/onboarding`을 만들지 않고 `/mypage?tab=account&setup=1`을 canonical 설정 경로로 기록
- [x] ResumeTarget 24시간 client-side 만료와 v1→v2 호환 정책 — 서버 저장·서명 token은 현재 두 allowlisted resource에 불필요

위 항목은 generation 완료 이메일 재진입의 로컬 기반이 구현됐다는 이유로 완료 처리하지 않는다.

## 제외 범위

- 결제 실행과 quote
- 생성 Workflow 실행
- 완료 이메일 발송·재시도
- OS push token·권한·badge
- 살롱 데이터 공유 동의 내용

## 수용 기준

### generation 복귀 경로

- shared parser가 유효한 UUID generation만 허용한다.
- 외부 domain, protocol-relative, 역슬래시, 다중 encode payload는 거절된다.
- 웹과 앱 모두 인증 성공 후 같은 generation ID를 연다.
- 인증된 계정이 resource 소유자가 아니면 결과를 노출하지 않고 403 설명을 제공한다.
- production association identifier가 없으면 검증되지 않은 app-link 파일을 200으로 제공하지 않는다.

### Phase 05 전체 완료

- MFA, 비밀번호 재설정, invite, billing, onboarding까지 각 로컬 복귀 계약과 운영 E2E가 있다.
- 인증 후 유료 행동은 자동 실행되지 않고 최신 quote를 다시 확인한다.
- 앱 cold start와 웹 세션 만료를 포함한 실기기/브라우저 증거가 있다.

## 검증

```powershell
npm --workspace @hairfit/shared test -- --runInBand
npm --workspace @hairfit/app test -- --runInBand
npm run generation-entry:contract:test
npm --prefix my-app run generation-workflow:contract:test
npm run app-links:external:check
npm run typecheck
npm run build
npm run mobile:bundle
```

공통 ResumeTarget·generation-entry, Expo auth resume/recovery model, 로그인·비밀번호 재설정 interaction, 계정 설정 진입·복귀를 자동 검증한다. 운영 domain association, Clerk 실제 MFA·reset email·세션, 앱 종료 상태 복귀는 Phase 13의 외부/실기기 게이트다.

회원 탈퇴 추가 검증은 계정 삭제 계약 3/3, Expo 전체 25 suites·126/126, shared 44/44, Next production 96 routes build, PostgreSQL 18.4 targeted migration·복잡한 restrict 영수증 cascade smoke를 통과했다. migration mirror SHA-256은 `2B033D7063BE22C71C5B7361AD1980F79C22B8B13BBEE5F37AA7F7BC532268A9`다. 이후 루트와 앱 migration을 73/73으로 동기화했고, 빈 PostgreSQL 18.4에서 전체 fresh-chain과 현재 SQL smoke 10개를 통과했다.

## 주요 파일

- `packages/shared/src/auth/resume-target.ts`
- `packages/shared/src/auth/resume-target.test.ts`
- `packages/shared/src/auth/generation-entry.ts`
- `packages/shared/src/auth/generation-entry.test.ts`
- `my-app/lib/clerk.ts`
- `my-app/lib/clerk.test.ts`
- `my-app/lib/app-link-association.ts`
- `my-app/scripts/check-app-link-associations.mjs`
- `my-app/app/.well-known/apple-app-site-association/route.ts`
- `my-app/app/.well-known/assetlinks.json/route.ts`
- `apps/hairfit-app/lib/auth-resume.ts`
- `apps/hairfit-app/lib/account-deletion.ts`
- `apps/hairfit-app/components/mypage/MobileAccountDeletionPanel.tsx`
- `my-app/app/api/account/route.ts`
- `my-app/lib/account-deletion.ts`
- `supabase/migrations/20260718061201_account_deletion_privacy_cleanup.sql`
- `docs/account-deletion-operations-runbook.md`
- `apps/hairfit-app/app/upload.tsx`
- `apps/hairfit-app/components/mypage/panels/MobileMyPageAccountPanel.tsx`
- `apps/hairfit-app/app/(auth)/login.tsx`
- `apps/hairfit-app/app/(auth)/forgot-password.tsx`
- `apps/hairfit-app/app/(auth)/signup.tsx`
- `apps/hairfit-app/components/auth/AuthSecondFactorPanel.tsx`
- `apps/hairfit-app/lib/auth-second-factor.ts`
- `apps/hairfit-app/lib/auth-password-reset.ts`
- `apps/hairfit-app/app/sso-callback.tsx`
- `apps/hairfit-app/app.json`

## 롤백·인계

- 운영 association identifier가 없으면 `503 no-store`를 유지하고 custom scheme 또는 웹 링크로 안전하게 fallback한다.
- pending target storage version을 바꿀 때 구형 값을 검증 후 폐기하는 compatibility 기간을 둔다.
- Phase 07B에 401/403와 generation route 계약을, Phase 09A에 email CTA path를, Phase 09B에 cold-start link 기반을 넘긴다.
