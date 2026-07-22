# Phase 13 — 전체 E2E·안정성 승격·출시 준비

- 상태: in_progress — 로컬 자동 게이트와 PR/출시 후보 CI 구성을 완료, 첫 hosted green run·branch protection·운영·외부 서비스·실기기 E2E 미완료
- 우선순위: 최종 게이트
- 변경 게이트: `promotion`, `deprecation`, 출시 검증
- 선행 페이즈: 모든 필수 페이즈
- 독립 배포: 이 문서의 통과는 출시 후보 판정이며 merge·push·deploy 권한이 아님

## 목표

웹·앱·API·DB·Workflow·결제·메일의 전체 사용자 이야기를 실제 환경에서 증명한다. “로컬 구현 완료”, “출시 후보 준비”, “운영 배포 완료”를 서로 다른 상태로 유지하고, 증거를 충족한 컴포넌트만 `stable`로 승격한다.

## 2026-07-15 로컬 자동 증거

| 표면 | 현재 증거 | 판정 제한 |
| --- | --- | --- |
| generation 계약 | callback/secret fingerprint/preflight/site URL, AASA·Asset Links external preflight, variant lease, email/push notification outbox, Expo ticket/receipt, Resend ambiguity, durable acceptance, credit reservation/settlement, Supabase RPC receiver binding, 계정 결속과 stale async 회귀 계약 64/64 | 실제 운영 DB/Resend/Expo Push/Clerk가 아님 |
| generation canonical entry | `/upload`·ID 없는 `/generate` 307 수렴, owner-scoped image hydration 뒤 단계 handoff, billing allowlist와 DB 상태 전이 기반 4단계 funnel analytics 계약 13/13 | 인증 브라우저 IndexedDB, 운영 migration/query와 legacy traffic 증거가 아님 |
| paid-action Quote·execute | HMAC 전용 secret, 만료·변조·가격/잔액 변경·부족 잔액, migration mirror/RLS, Styler reserve·settle·refund·모호한 정산 재조회·lease 재시도, 에프터케어 first-free·30 debit·6 contents·replay와 웹 견적 카드 7상태·단일 갱신 행동 정적 계약 20/20 | 인증 브라우저·실기기와 운영 DB/외부 서비스 E2E가 아님 |
| 관리자 고위험 작업 | credit·role·refund expected-state/action-key, RLS·service-role 전용 audit receipt, refund processing claim·same-key lookup-only replay·webhook 원자 완료, typed dialog·receipt UI와 기존 role 조회 무변경·역할별 보호 E2E 계약 10/10. 운영 `ConfirmActionDialog`의 typed lock·pending ESC/중복 실행 차단·focus 복원·axe 실브라우저와 관리자 통계·회원 조회 목록 통과 | 운영 migration, PortOne sandbox, Clerk metadata, 인증 관리자 mutation route/API 결과 interaction이 아님 |
| 결과 의사결정 UX | 원본 placeholder 금지·삭제 설명, touch/keyboard 비교, 단일 주 CTA·계정 전용 링크·재생성 비용 확인, 웹·Expo 공통 selection resolver와 stale/unknown query parity 계약 11/11. 실제 production 결과 컴포넌트 Chromium 4/4에서 range keyboard, variant `aria-pressed`, 확정 잠금·live/atomic, keyboard 더보기, 320px light·375px dark 고정 CTA 비가림·axe·visual을 통과 | 승인된 인증 결과 데이터 재진입·원본 정리 서버 상태·실기기 touch·공개 snapshot 증거가 아님 |
| 운영 목록 | 관리자 회원·리뷰·수신/발신 메일·B2B·살롱 고객/매칭의 versioned cursor, deterministic compound sort, malformed fail-closed, 웹 abort+최신 요청 guard, 앱 request fencing·FlatList/bounded page, 비-에프터케어 label·조회/변경 경계 계약 13/13. 실제 운영 `CustomerListClient` 기반 production Chromium 4/4에서 125행 전체 도달·중복 0, 늦은 검색 응답 폐기, 320px light·375px dark overflow 0·axe serious/critical 0·visual baseline을 확인했다. 공용 native list의 bounded render batch 기본값·화면별 override와 Styler 선택 `extraData` 재렌더 interaction도 고정 | 승인된 인증 100+ 실데이터, 외부 analytics·통제되지 않은 실제 네트워크 순서 역전, iOS/Android frame·memory 성능은 별도 |
| 사용자 안전 오류·live 상태 | 비-에프터케어 웹·Expo 일반 예외/API provider 원문 차단, 상태·작업 기반 복구 문구, 웹 alert/status와 native assertive/polite live region 계약 4/4. 웹 관리자 작업 영수증·살롱 마법사와 Expo 관리자 목록 5개·살롱 고객/매칭 잔여 표면까지 심각도별 공지 계약에 포함; 정적 UI와 모델 생성 label·reason·분석·태그는 번역 실패도 한국어 fallback으로 닫고 접근성 label과 화면 표시를 일치시킴 | 자동 axe·인증 키보드·실제 VoiceOver/TalkBack·200% 글자·실제 번역 provider 품질·별도 에프터케어 inventory가 아님 |
| Styler 구조 | 웹·앱 new/session thin route, controller/view/modal 분리, Phase 03 Quote context, 웹 AbortController·앱 request sequence·3초 polling 계약 4/4 | 인증 브라우저·실기기 interaction, 연결 종료와 durable worker 증거가 아님 |
| shared 계약 | generation-entry, 확정 스타일 media, 선택·잠금 독립 fixture, durable 알림 7상태·legacy 호환, funnel vocabulary, 구독 정책·알림 보존정책과 한국어 표시 fail-closed resolver를 포함한 shared test 46/46 통과 | 브라우저·실기기 interaction 아님 |
| 결제 복구 | 계정별 pending·callback·terminal-only clear 집중 test 24/24, billing return allowlist 5/5, mobile prepare `appScheme`은 `hairfit`만 허용 | PortOne sandbox/webhook·실기기 callback 증거가 아님 |
| Expo 앱 | Expo Router root `Stack`, 확정 스타일 카드, push target/opt-in, auth resume v2 만료, MFA·비밀번호 재설정, 36-route shell migration, shared 결제 정책 disclosure, 긴 목록 batch/선택 재렌더, safe-area·keyboard·back 셸, reduced-motion·모델 생성 영문 fallback·offline reconnect 계약을 포함한 32 suites·145/145가 open handle 없이 exit 0; `expo-notifications` public config 확인; 최신 3플랫폼 export exit 0, Web 1,071·iOS 1,350·Android 1,372 modules | 실제 역할별 Stack/back, Clerk MFA/reset email, EAS project ID·APNs/FCM·physical device·실제 번역 provider 품질 증거가 아님 |
| 네트워크·세션 복구 | Expo 공용 network provider·offline alert·전이당 recovery token 1회, 홈/생성/결과/Styler read refresh, offline polling pause와 write-command 무재전송, 웹·앱 401 forced Clerk token refresh 후 1회 retry를 집중 9/9로 확인 | 실제 slow network·iOS/Android 비행기 모드·프로세스 종료·live Clerk 만료 세션 증거가 아님 |
| TypeScript | 7개 workspace typecheck exit 0 | 런타임·권한 동작은 별도 |
| lint | `lint:all` 오류 0, 범위에서 제외한 에프터케어 경고 1 | 접근성 E2E와 제외 범위 정리는 별도 |
| Next | 기존 DTO/parity·selected variant·push 격리 build에 이어 fail-closed Dialog·업로드·생성 진행·Workspace 단계/접수 완료·유료 작업 견적·정기결제 정책·구독 오픈 알림 폼·개인컬러 진행·MyPage 탭·Button·폼 피드백·운영 목록·결과 의사결정·Surface·AsyncBoundary E2E harness를 포함한 `.next-e2e`가 compile·TypeScript·static 111/111 exit 0. MyPage query·keyboard·모바일 local scroll 3건까지 추가한 production Playwright도 72/72 통과. `.next-*` 격리 산출물은 ESLint·Git 입력에서 제외해 PR lint 오염을 방지 | 배포 환경 실행은 별도. E2E harness는 명시적 빌드 플래그가 없으면 `notFound()` 경계만 렌더한다. OpenNext가 `proxy.ts`를 지원하기 전에는 Cloudflare 경로 보존을 위해 기존 `middleware.ts`를 유지하므로 Next deprecation 경고를 무리하게 제거하지 않음 |
| Worker | Wrangler 4.87.0 dry-run exit 0; upload 8.61 KiB/gzip 2.55 KiB, bindings/base URL 확인 | 명시적 dry-run이며 Cloudflare 배포·실행 증거가 아님 |
| PostgreSQL | 빈 PostgreSQL 18.4에 root/`my-app` 공통 73개 migration 전체 fresh-chain 적용 완료. variant lease → notification outbox → durable acceptance → credit settlement 순서를 명시적으로 검증하고, 그 스키마에서 10개 SQL smoke와 generation notification 8-session enqueue·claim·finish concurrency smoke를 통과했다. 알림 smoke는 한 outbox·한 lease·한 sent 전이, stale token no-op, payload 불변, fixture 잔여 0과 redacted JSON/Markdown artifact를 확인했다 | `pg_net`·`pg_cron` 설치는 Supabase hosted 전용이라 로컬 검사에서만 제외했다. 실행기는 staging host/명시적 write/SSL을 fail-closed하지만 실제 staging artifact URL과 운영 migration·실제 Expo provider·30일 mismatch telemetry·PortOne/Clerk 증거는 아직 없음 |
| migration mirror | 누락된 과거 43개를 복구해 root/`my-app` 전체 파일명과 정규화된 SQL이 73/73 일치하며 `npm run supabase:migrations:mirror:check`로 자동 차단한다. 개별 credit, notification, atomic paid-action, admin, funnel, selected variant, push migration hash 일치도 유지 | 원격 적용 증거가 아님 |
| CI 구성 | `.github/workflows/uiux-quality-gates.yml`에 contracts/build, PostgreSQL fresh-chain+10 smoke, Windows 공개 15+auth 진입 8 Playwright, Expo 3-platform export 4 jobs를 구성. `.github/workflows/release-candidate-external-gates.yml`은 승인된 environment에서 기존 `+clerk_test` 보호 화면, deployed generation callback/Resend sender, AASA·Asset Links, staging DB 동시성 smoke에 더해 원격 migration/schema·secret 이름·Worker 100% traffic version을 묶은 read-only 환경 preflight와 30일 artifact를 수동 실행 | YAML parse·로컬 source preflight만 확인했다. 운영 association 두 경로는 현재 404이며 첫 GitHub-hosted green run, 실제 staging/deployed artifact URL, branch protection required check 등록은 아직 없음 |
| 출시 중단·복구 계약 | `GENERATION_ACCEPTANCE_ENABLED`·`STYLING_ACCEPTANCE_ENABLED`로 새 접수만 중단하고 accepted/generating replay·상태 조회·정산·알림 drain은 유지하는 계약 5/5, 사용자 안전 오류·공통 FormField 라벨 연결 계약 4/4 통과 | 실제 environment 변경, queue drain, canary와 owner 공동 재개 승인은 운영 증거가 필요 |
| 의존성 보안 | Next 16.2.10·웹 React 19.2.7·Clerk Expo 2.19.42·Expo 55.0.28·OpenNext 1.20.1·Wrangler 4.112.0 패치, production과 전체 audit high/critical 0. Next/OpenNext 96/96, Expo 126 tests·3-platform export, Worker dry-run 통과 | moderate/low는 SDK 호환 검토가 필요하며 Expo doctor의 의도된 monorepo duplicate/custom Metro 경고 2개와 실기기 development build는 남음 |
| Component registry | JSON registry 48 components·48 passports·고유 ID 48·stable 13. `SubscriptionPolicyDisclosure`, `SubscriptionWaitlistForm`, `PersonalColorDiagnosisProgress`, `MyPageTabNavigation`은 정책 navigation, 신청 fencing/복구, truthful status·reduced-motion, roving keyboard·local horizontal scroll 브라우저 계약을 갖춰 `experimental`에서 `candidate`로 승격했다. 인증 checkout·실제 이메일·인증 개인컬러·인증 MyPage와 실제 screen reader 증거 전에는 stable로 올리지 않는다 | network provider는 실기기 offline/online 전환 전 `experimental`, `ConfirmActionDialog`는 인증 관리자 성공·충돌 결과 전 `experimental`, 인증 Quote/checkout/Workspace 통합·실제 메일·물리 카메라·스크린리더는 외부 잔여 위험이며 그 밖의 interaction·visual 부재 항목은 `candidate`/`experimental` 유지 |
| 공개·인증 진입 웹 브라우저 | Production Playwright 72/72; 기존 Workspace·견적·정기결제·구독 알림·개인컬러 흐름에 MyPage query 보존, 한 Tab 진입점, Arrow 순환·Home·End, active panel 연결과 1024px light·320px light·375px dark local scroll/visual/overflow/axe 3건을 추가했다. 별도 실제 테스트 Clerk 로그인·회원가입은 8/8이며 보호 화면은 역할별 14-test lane을 구성했다 | 승인된 Clerk/Supabase fixture green run, 실제 생성 accept receipt·메일 수신, 인증 Quote·checkout·개인컬러·MyPage 결제 복귀·mutation, Chrome/Safari zoom·실제 screen reader·slow network는 아직 아니다 |
| 웹 이미지 계약 | 비-에프터케어 TSX 원시 이미지 13개와 `next/image` 12개의 alt/src, raw async decoding, lazy/eager/high priority, aspect/min-height 예약을 AST 계약으로 전수 확인 | 실제 LCP·CLS·INP trace, 에프터케어·네이티브 이미지, 네트워크 payload 최적화 증거가 아님 |
| 생성 전 계정 설정 | 공통 entry decision 4/4, 웹 canonical/return integration 포함 generation-entry 계약 10/10, Expo 미완료 회원 사전 차단·저장 후 `/upload` 복귀 interaction 2/2 | 실제 Clerk 신규 계정·브라우저 interaction·iOS/Android 실기기 증거가 아님 |
| 모바일 정적 sync | `/forgot-password` route·MFA component·resume v2, 공용 reduced-motion과 network recovery hook/adoption 계약을 포함한 `mobile:sync` 259/259 통과 | runtime-verified route 0개 경고가 있어 실기기 route 증거가 아님 |
| Git diff | 현재 최종 로컬 후보 `git diff --check` exit 0 | 의미·제품 동작 검증은 별도 |
| 비로그인 HTTP | production 서버에서 `/upload` 307 `/workspace`, ID 없는 `/generate` 307 `/workspace?nextStep=generate`, no-store·legacy source header 확인; 다음 login redirect가 canonical query를 보존하고 `/generate/{uuid}`도 해당 UUID를 보존해 200 로그인 도달; robots/sitemap 구형 진입 제거 | 인증된 IndexedDB handoff·403·실제 접수 이후 UI는 미검증 |

위 표의 모든 항목은 “로컬 구현 검증”이다. 외부 이메일 수신, 앱 강제 종료, 운영 app-link, 실제 결제는 아직 완료로 승격하지 않는다.

## 최종 로컬 게이트

아래는 최종 로컬 후보 명령 집합이다. 현재 변경 기준으로 lint, 7-workspace typecheck, paid-action/generation/shared/Expo/결제 복구 계약, Next build, PostgreSQL smoke, Expo 3-platform export, Worker dry-run, 최종 diff check가 통과했다. 이는 release-ready 판정이 아니며 release candidate commit에서는 전부 다시 실행해 CI artifact로 보존한다.

```powershell
npm run lint:all
npm run typecheck
npm audit --audit-level=high
npm run supabase:migrations:mirror:check
# 완전히 빈 로컬 PostgreSQL URL만 사용
npm run supabase:migrations:fresh:check -- --databaseUrl=<local-empty-db-url>
npm run paid-action:contract:test
npm run generation-entry:contract:test
npm run admin-high-risk:contract:test
npm run result-ux:contract:test
npm run list-pagination:contract:test
npm run ui-shell:contract:test
npm run component-registry:validate
npm run web:e2e:build
npm run web:e2e
npm run web:auth-e2e
# 기존 개발 Clerk의 +clerk_test 고객 사용자가 my-app/.env.local에 설정된 환경에서 실행
npm run web:protected-e2e
npm --prefix my-app run generation-workflow:contract:test
npm --prefix my-app run build
npm run mobile:bundle
npm run mobile:sync
npm --workspace @hairfit/shared test -- --runInBand
npm --workspace @hairfit/app test -- --runInBand
npm run portone:audit
npm run portone:contract:test
npm run portone:refund:smoke
npm run portone:mobile:smoke
npx wrangler deploy --dry-run --config my-app/workers/generation-workflow/wrangler.jsonc
git diff --check
```

추가 필수 suite:

- [ ] staging 연결을 사용하는 PostgreSQL migration·동시성 smoke와 결과 artifact — host/confirm/SSL fail-closed 실행기, 8-session local PG18.4 증거와 release-candidate artifact upload는 구현; 승인된 staging 실제 run URL 대기
- [ ] web component interaction·axe·keyboard·visual regression — production Playwright 72/72에 stable 13개와 정기결제 정책·구독 알림 폼·개인컬러 진행·MyPage 탭 candidate의 정책·신청 복구·truthful status·reduced-motion·roving focus·local scroll keyboard/axe·1024/320/375px visual/runtime이 포함되고 실제 Clerk 인증 진입 8/8, 공개 5폭·인증 2폭 screenshot·B2B offline 복구가 통과했다. 보호 화면은 역할별 14-test lane과 read-only 사전검사를 구현했으나 승인된 실제 fixture green run이 남음
- [x] registry를 공식 validator 입력 형식인 JSON으로 정렬하고 저장소 validator·component-stabilizer 공식 validator 통과
- [ ] 핵심 사용자 여정 Playwright — 공개 홈·B2B·정책 interaction, 인증 소유 completed-generation 조회·foreign-generation 403 안전 복구, 관리자 통계/회원 조회와 살롱 고객/연결 조회·역할 거절은 자동화 목록 구성. 생성 접수/선택 변경·결제·관리자/살롱 mutation 여정과 승인 fixture green run은 남음
- [ ] PortOne sandbox 실제 SDK 결제·webhook 지연/중복과 DB receipt
- [ ] generation Workflow → Supabase → Resend external E2E
- [ ] iOS/Android physical device smoke

## P0 생성 종료·완료 알림 E2E 매트릭스

| 시나리오 | 웹 | iOS | Android | 서버/메일 증거 |
| --- | --- | --- | --- | --- |
| 업로드 중 종료 | [ ] | [ ] | [ ] | draft/original 정리 또는 복구 |
| accept 응답 직전 단절 | [ ] | [ ] | [ ] | 같은 draft replay, generation/outbox 1개 |
| `acceptedAt` 후 종료 | [ ] | [ ] | [ ] | terminal 도달, 원본 정책 일치 |
| complete | [ ] | [ ] | [ ] | 메일 1회, 같은 generation CTA |
| partial | [ ] | [ ] | [ ] | 성공 결과 보존, 실패 후보 무료 재시도, 메일 1회 |
| failed | [ ] | [ ] | [ ] | 실패 이유·10크레딧 refund receipt·정산 후 메일 1회 |
| Resend timeout/5xx | [ ] | 해당 없음 | 해당 없음 | generation 성공 유지, retry/unknown 격리 |
| 세션 만료 링크 tap | [ ] | [ ] | [ ] | 로그인 후 같은 UUID |
| 다른 계정 링크 tap | [ ] | [ ] | [ ] | 403, resource 비노출, 안전 CTA |
| 앱 cold start link | 해당 없음 | [ ] | [ ] | 운영 AASA/Asset Links 검증 |

## 전체 사용자 이야기

- [ ] 가입·온보딩·사진 선택·quote·생성 접수
- [ ] accepted 후 웹 종료·앱 강제 종료
- [ ] complete, partial, failed와 이메일 1회
- [ ] 이메일 링크 → 로그인 → 같은 generation
- [ ] 선택 → 시술 계획 확정 → 잠금
- [ ] Styler 20크레딧과 실패·재시도
- [ ] 첫 에프터케어 무료·추가 30·예약 메일
- [ ] 부족 잔액 → 모바일 결제 → fresh quote → 재확인
- [ ] 관리자 환불·role·credit 고위험 확인
- [ ] 살롱 초대·동의·철회·재발급
- [x] 100건 이상 목록·검색 race — production `CustomerListClient`와 API route fixture로 125행을 7페이지에서 모두 표시하고 중복 0, 700ms 늦은 이전 검색 응답이 최신 결과를 덮지 않음, 320/375px overflow·axe·visual을 Chromium 4/4로 검증. 승인된 인증 실데이터와 통제되지 않은 실제 회선은 외부 게이트로 유지
- [ ] keyboard·screen reader·200% 글자·slow/offline

## 운영·외부 서비스 게이트

- [ ] 배포 환경 migration 순서와 root/app hash 일치, Supabase migration·Worker/App coordinated deploy
- [ ] App/Workflow의 강한 callback secret과 base URL 일치
- [ ] Resend API key, verified domain, `HairFit <noreply@hairfit.beauty>` 확인
- [ ] 실제 수신함에서 generation·channel별 1회 증거
- [ ] Apple Team ID와 Android release cert SHA-256 association 200 응답
- [ ] 인증된 Chrome/Safari와 Clerk 실제 로그인·로그아웃·A→B 계정 전환·403 resource 비노출
- [ ] Workflow dispatcher/notification drain cron 실행과 queue age 관측 — generation dispatcher의 1분 지연·active lease 중복 차단·expired lease 재시작·retry budget은 로컬 PG18.4 rollback smoke 완료, 실제 cron 중지/재시작과 queue age 수집은 남음
- [ ] 외부 환경의 `retry_wait`, 만료 lease, `dead_letter`, `delivery_unknown` alert 수집·호출 E2E — 관리자 aggregate·drain 구조화 로그·운영 runbook 로컬 구현 완료
- [x] 개인정보 로컬 계약: 원본·rendered email payload·push token·회원 탈퇴 DB/Storage/Clerk 순서, 30일 해시 tombstone 파기와 계약/PG smoke
- [ ] 개인정보 운영 증거: 원격 migration, 실제 Supabase Storage·Clerk 테스트 계정 삭제, iOS/Android 로컬 저장소·Push 미수신 E2E
- [ ] 운영·staging에서 credit reservation/차감/전체 실패 환불 ledger·receipt·이메일 일치
- [ ] Phase 09B의 EAS project ID·APNs/FCM·permission/token·provider·iOS/Android Push 실기기 증거

## Component stable 승격 조건

2026-07-19 로컬 후보는 production Playwright 72/72, registry 48 components/48 passports·stable 13이다. `SubscriptionPolicyDisclosure`와 `SubscriptionWaitlistForm`은 정책 navigation, FormField·invalid focus·제출 fencing·429 복구를, `PersonalColorDiagnosisProgress`는 truthful status와 reduced motion을 확보했다. `MyPageTabNavigation`은 query 보존, roving tabindex, Arrow 순환·Home·End, active panel 연결과 모바일 local scroll을 같은 1024/320/375px visual·axe로 고정했다. 네 컴포넌트 모두 인증 통합·실제 이메일 또는 screen reader 증거가 없어 `candidate`까지만 승격했다. 인증 Quote API·결제 복귀·메일 수신·인증 개인컬러·인증 MyPage·실제 screen reader는 외부 게이트다.

### 2026-07-18 비-에프터케어 잔여 게이트 재감사

| 분류 | 현재 판정 | 다음 증거 |
| --- | --- | --- |
| 로컬 승격 가능 | `SubscriptionPolicyDisclosure`, `SubscriptionWaitlistForm`, `PersonalColorDiagnosisProgress`, `MyPageTabNavigation`의 interaction·visual 차단을 해소해 candidate로 승격했다. registry 48/48·stable 13, billing content 계약 10/10, 개인컬러 source 3/3, MyPage source 5/5·각 Chromium 3/3, Next static 111/111, 전체 production Playwright 72/72과 두 validator를 통과했다. 인증 checkout·실제 이메일·인증 개인컬러·인증 MyPage·screen reader 증거가 없어 stable은 보류했다. | 승인된 fixture로 실제 checkout 정책 순서·신청 저장/메일·개인컬러 요청 결과 전환·MyPage route/back-forward·200% 글자·screen reader를 검증한 뒤 stable 승격 여부를 재판정한다. |
| 승인 fixture 필요 | `web:protected-e2e:preflight`는 기존 `+clerk_test` 고객을 가리키는 `E2E_CLERK_USER_EMAIL`이 없어 fail-closed했다. 계정 자동 생성·인증 우회는 하지 않았다. | 승인된 고객·관리자·살롱 fixture와 owned/foreign completed generation을 environment에 제공한 뒤 14-test lane 실행. |
| 도구 연결 필요 | `web-perf` 스킬은 사용할 수 있지만 필수 Chrome DevTools MCP가 현재 도구 목록에 없어 LCP·CLS·INP trace를 시작하지 않았다. Lighthouse 추정값으로 대체하지 않았다. | `chrome-devtools-mcp` 연결 뒤 공개 production 홈 cold-load trace와 네트워크·접근성 snapshot을 artifact로 보존. |
| 제품 승인 필요 | 공개 공유 snapshot은 계정 전용 링크와 다른 개인정보·만료 정책 결정이 없어 발급하지 않는다. | 만료시간, 철회, 다운로드, 원본/결과 노출, abuse 대응을 승인한 뒤 별도 Phase 10A behavioral change로 구현. |
| 운영·실기기 필요 | migration·Worker/App·Resend·Expo Push·PortOne·association·실제 screen reader/zoom/slow network와 iOS/Android 종료 복귀는 로컬 계약으로 완료 처리하지 않는다. | release-candidate environment 승인, 배포 artifact, sandbox/실기기 증거. |

다음을 모두 만족한 항목만 registry에서 `stable`로 바꾼다.

- public props, slots, events 기록
- kind와 owner 기록
- global CSS/token/variant/state 계약
- feature business logic 독립
- loading, empty, error, disabled, focus, selected 상태
- 접근성 계약
- example/story/test 중 최소 하나와 interaction 증거
- 관련 사용자 E2E와 visual regression
- breaking change migration 정책

조건을 충족하지 못한 컴포넌트는 사용처가 많아도 `candidate`를 유지한다.

## CI·릴리스 준비

- [x] PR 필수 검사 workflow 구성: migration mirror, lint, 전체 typecheck, build, contract/component/shared/Expo tests, DB fresh-chain·smoke, 공개·인증 진입 web E2E, Expo export
- [x] 외부 서비스 E2E와 실기기를 release candidate gate로 분리 — 승인형 Clerk 보호 화면·generation callback/Resend·AASA/Asset Links preflight·staging DB 동시성 artifact와 실제 메일·Push·PortOne·실기기 수동 증거를 분리
- [ ] 첫 GitHub-hosted green run artifact를 확인하고 4개 job을 branch protection required check로 등록
- [ ] environment별 migration·secret·sender·Worker version 확인 — fail-closed read-only 통합 preflight와 redacted artifact 구현, source mode 73개 mirror·Wrangler 4.112.0 dry-run 통과; 승인된 staging/production 실제 run URL 대기
- [x] feature flag와 rollback owner 기록 — 신규 헤어/Styler acceptance pause, Push off, Quote/checkout rollback 경계와 역할 owner 정의
- [x] DB backward compatibility window 기록 — selected variant, canonical entry, notification outbox, Quote legacy, durable columns의 제거 조건 정의
- [x] 운영 관측 dashboard와 alert threshold 기록 — 이메일 15/5분과 즉시 critical 상태, dispatch·lease·credit·cleanup·Push 임계값 정의. 외부 dashboard 연결은 운영 게이트로 유지
- [x] 릴리스 노트와 고객 영향 작성 — 백그라운드 생성, 확정 스타일 카드, 비용 확인, 개인정보 보관, 기본 비활성 기능과 남은 증거 분리
- [x] Phase 09B 운영 비활성 시 이메일·인앱 fallback과 feature flag를 release note에 명시

CI job, environment secret, branch protection, 자동화 제외 범위는 [UI/UX CI·출시 후보 외부 게이트](ci-release-gates-2026-07-18.md)를 기준으로 한다.
기능 플래그·owner·DB 호환·경보·롤백은 [UI/UX 출시 거버넌스](release-governance-2026-07-18.md), 고객 영향 문구는 [출시 후보 안내](release-candidate-notes-2026-07-18.md)를 기준으로 한다.
의존성 패치·audit·Expo monorepo 경계는 [UI/UX 후보 의존성 보안 검토](dependency-security-review-2026-07-18.md)를 기준으로 한다.

## 수용 기준

- 모든 필수 phase 문서의 로컬 체크와 운영 체크가 각각 증거 링크를 가진다.
- P0 금전·권한·generation 종료·메일 시나리오에 미검증 항목이 없다.
- 웹 build, OpenNext/Cloudflare build, Expo bundle, iOS/Android physical device 결과가 있다.
- migration 누락·secret 불일치·association identifier 누락 환경이 배포 전에 차단된다.
- rollback이 중복 차감·중복 알림·accepted 작업 유실·권한 누락을 만들지 않는다.
- 로컬 구현된 Phase 09B는 운영 자격 증명·실기기 수신 증거 전까지 feature flag가 꺼져 있고 이메일·인앱 fallback이 유지된다.

## 배포 경계와 순서

이 페이즈의 성공은 “출시 후보 준비 완료”다. 실제 branch merge, tag, push, Cloudflare deploy, Supabase migration 적용, App Store/Play 배포는 각각 별도 권한과 preflight가 필요하다.

생성/메일 rollout은 신규 접수를 중지하고 active lease를 drain한 뒤 migration을 legacy → variant lease → notification outbox → durable acceptance → credit reservation/settlement 순서로 적용한다. App과 Workflow Worker가 모두 새 계약이 될 때까지 접수를 재개하지 않는다. canary force-close, credit ledger/receipt 일치, 실제 이메일 1회 중 하나라도 실패하면 rollout을 중단한다.

## 롤백·인계

- 이미 accepted된 generation과 outbox row는 삭제하지 않고 새 consumer로 drain한다.
- DB down migration보다 enqueue 중지·UI flag off·roll-forward를 우선한다.
- P0 시나리오가 실패하면 stable 승격과 출시 후보 판정을 함께 취소한다.
- 실제 배포 승인 시 phase별 증거를 release runbook 입력으로 넘기되 여기서 merge·push·deploy를 자동 실행하지 않는다.

## 완료 보고

- 최종 commit과 phase별 merge 관계
- 로컬 자동 검증, 외부 E2E, 실기기 결과
- stable/candidate/deprecated 목록
- migration·secret·sender·association·환경 상태
- rollback 절차와 잔여 위험
- 실제 publish/deploy 여부
