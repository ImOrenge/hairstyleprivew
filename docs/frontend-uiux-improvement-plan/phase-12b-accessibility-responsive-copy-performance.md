# Phase 12B — 접근성·반응형·문구·성능 검증

- 상태: 부분 로컬 구현 — 공개 웹과 운영 Dialog 기반 리뷰·Styler·자동 공지 Playwright keyboard/axe, 5폭 visual regression·200%-equivalent·reduced-motion·B2B offline 복구, 실제 Clerk 로그인·회원가입 axe/keyboard/2폭 visual, 비-에프터케어 웹·Expo 이미지 inventory와 모바일 reconnect·웹/앱 401 token refresh 계약을 통과, 인증 데이터 화면·실제 저속 회선·스크린리더·실기기·실측 CWV는 미완료
- 우선순위: P1/P2
- 변경 게이트: `behavioral`, `style-contract`, `patch`
- 선행 페이즈: Phase 08–12A의 관련 화면
- 독립 배포: 문제 묶음별로 가능

## 목표

앞선 페이즈에서 만든 계약을 키보드, 스크린리더, 터치, 작은 화면, 큰 글씨, 느린 네트워크에서 검증한다. 이 페이즈는 접근성을 마지막에 처음 추가하는 단계가 아니라 전체 회귀를 닫는 단계다.

## 포함 범위

웹·모바일의 접근성, 반응형, 사용자 문구, 권한 복구와 성능 회귀를 아래 matrix로 검증하고 수정한다.

## 웹 포함 범위

- [x] root skip link와 단일 `main` landmark 적용, 확인된 중첩 `main` 제거
- [x] 확인된 upload 화면 `Link > Button` 중첩 제거
- [x] Header와 role navigation의 현재 메뉴 `aria-current`
- [ ] dialog focus 진입·trap·ESC·복원 — 확인된 웹 수동 overlay를 모두 공용 `Dialog`/`ConfirmActionDialog`로 전환했다. 공개 결제 공지·구독 신청, 운영 리뷰·Styler와 고위험 확인의 focus·keyboard·ESC/pending dismissal·복원, 자동 공지 → 계정 설정 우선순위를 Playwright로 통과했고 고위험 확인은 320px light·375px dark screenshot·가로 넘침 0까지 고정했다. Workspace 모바일 단계 메뉴는 단계 선택 뒤 자동으로 닫혀 본문을 가리지 않도록 interaction으로 고정했다. 실제 인증 화면 통합·관리자 API 결과·스크린리더 검증만 남음
- [x] Workspace·살롱 후보의 `aria-pressed`, Expo 생성 결과의 selected state 적용
- [x] touch 가능한 결과 비교 — range input 기반 touch·keyboard 조작과 현재 비율 설명 적용
- [ ] loading/status/error live region — 유료 Quote·업로드/접수·결제 복구·리뷰·웨잇리스트·Styler 선택 조회에 더해 비-에프터케어 계정·운영·살롱·생성 오류 표면을 보강했다. `GenerationJobProgressCard`·`PipelineStatusIndicator`에 이어 `WorkspaceAcceptedGenerationStatus`의 단일 polite/atomic 접수 공지를 고정하고 정적 완료 알림의 중첩 status를 제거했다. 운영 하네스에서 axe serious/critical 0건을 확인했으며 실제 VoiceOver/TalkBack 전체 화면 감사만 남음
- [ ] 320, 375, 768, 1024, 1440px visual matrix — 공개 홈 5폭과 실제 Clerk 로그인·회원가입 320/375px, 운영 `CustomerListClient`, 결과 선택/잠금·고정 CTA, `ConfirmActionDialog`, `UploadArea`/`ValidationCheck`, 생성 진행 카드·파이프라인, Workspace 4단계·접수 완료 표면의 1024px light·320px light·375px dark screenshot regression·가로 넘침 0 통과. 모바일 접수 완료의 세 CTA는 고정 단계 바가 있는 상태에서 trial click 도달성을 확인하고 단계 바/본문 시각 기준을 분리했다. 승인된 로그인 완료 데이터 화면과 Clerk 768px 이상 비교는 남음
- [ ] 200% zoom과 keyboard-only 핵심 여정 — 공개 홈은 1280px 화면의 200% 확대와 동등한 `640 CSS px + DPR 2` 환경에서 overflow 0·공지 ESC·skip link·tablist·FAQ keyboard와 포커스 가시성을 통과, 실제 Chrome/Safari zoom과 인증 핵심 여정은 남음
- [ ] reduced motion — 공개 홈의 후기·Hero 연속 애니메이션을 실제 Chromium computed style로 정지 확인했고 개인컬러 웹 애니메이션·메시지 타이머와 AsyncBoundary spinner 제거도 production Chromium으로 확인했다. 인증 화면과 실제 Chrome/Safari matrix는 미검증
- [ ] offline → online, slow network, token 만료 — 공개 B2B 문의의 Turnstile token 만료 안내·재확인과 요청 단절 시 안전 오류·입력 보존·같은 폼 재접수는 자동화했다. 보호 화면 fetch는 401일 때 Clerk token을 캐시 없이 한 번 갱신하고 같은 요청을 한 번만 재시도한다. 실제 slow network·Turnstile provider·live Clerk 만료 세션은 미검증
- [ ] axe 중대 위반 0 — production의 홈·B2B·로그인/회원가입 fallback·정책 2경로, 운영 살롱 고객 목록과 결과 선택/잠금·고정 CTA의 320/375px, 별도 개발 Clerk 실제 로그인·회원가입 폼 serious/critical 0. 승인된 로그인 완료 실제 데이터 화면은 남음
- [ ] Core Web Vitals와 이미지·고정 toolbar 성능 — 비-에프터케어 웹 TSX 이미지 25개(원시 13·`next/image` 12)의 alt·공간 예약·로딩 정책은 계약화. 2026-07-18 재시도에서도 `web-perf`가 요구하는 Chrome DevTools MCP가 도구 목록에 없어 실측 trace와 고정 toolbar 영향은 미검증

## 모바일 포함 범위

- [ ] VoiceOver/TalkBack label, hint, role, state — 생성 결과 선택 control과 결과 image에 우선 적용, 전체 화면·실기기 감사 남음
- [x] 비-에프터케어 image 설명 또는 decorative 처리 — Expo 홈·업로드·개인컬러·생성·결과·Styler의 의미 이미지 전수 label/role 계약 완료; 에프터케어는 별도 범위
- [ ] 200% 글자 크기와 screen reader order — 공용 primitive와 대표 인증 폼 단위 계약 적용, 실기기 핵심 여정은 미검증
- [ ] iOS 홈 인디케이터, Android keyboard/back — 공용 AppScreen의 고정 footer가 bottom safe area를 단독 소유하고 일반/목록 ScrollView에 iOS keyboard inset·플랫폼별 dismiss·handled tap 기본값을 적용했다. 생성·업로드·결제·Styler의 Android hardware back 차단 계약도 확인했으며 실기기 키보드·gesture navigation은 남음
- [x] 권한 영구 거부 후 OS 설정 CTA — Expo의 사진 권한 진입점 3곳(업로드·퍼스널컬러·Styler)을 전수 확인해 `canAskAgain=false`일 때 공용 OS 설정 CTA 노출
- [ ] reduced motion — 개인컬러 진단 애니메이션·타이머와 비-에프터케어 Expo의 animated modal 2곳(홈 계정 설정 fade·Styler 선택 slide)을 공용 OS preference로 정지했다. 생성/견적의 정확성 타이머는 유지하며 실제 iOS/Android 설정 전환은 실기기 미검증
- [ ] offline → online, slow network, token 만료 — `expo-network` 공용 provider가 offline을 알리고 offline → online 전이마다 read-model recovery token을 한 번 발급한다. 홈·생성 현황·결과·Styler 조회를 다시 읽고 생성 polling은 offline 동안 멈췄다가 재개하며, 추천·생성·유료 실행 명령은 자동 재전송하지 않는다. 모바일 API도 401에서 Clerk token을 강제 갱신해 한 번만 재시도한다. 실제 저속 회선·비행기 모드 실기기·live Clerk 만료 세션은 미검증
- [ ] 긴 목록 성능과 선택 상태 유지 — 공용 `VirtualizedListScreen`에 소비자가 재정의 가능한 bounded render batch 기본값을 적용하고 Styler 선택 목록은 `selectedVariantId`를 `extraData`로 전달해 재렌더 뒤 선택 상태를 유지한다. 125건 cursor fixture·선택 전환 interaction은 통과했으며 iOS/Android frame·memory 실측은 남음

## 문구 포함 범위

- [x] KO/EN 사용자 행동·오류 문구 분리 — 비-에프터케어 웹·Expo의 소유 정적 문구와 모델 생성 label·reason·분석·태그를 한국어 표시 경계로 통합했다. 번역 실패 시에도 영어 원문 대신 맥락별 한국어 fallback을 사용하며, 사용자 요청으로 분리한 에프터케어 전용 감사만 별도 범위로 남긴다.
- [x] 개발자용 API/base64 설명 제거 — base64는 사진 처리 구현 내부에서만 사용하고, 고객 결제·마이페이지·운영 확인 표면의 `PG`, provider, webhook, API, raw code 설명은 상태·다음 행동 문구로 교체
- [x] `Live/실시간 계산`처럼 실제 데이터가 아닌 애니메이션의 표현 수정 — 웹·Expo 개인컬러를 `Analysis Preview/팔레트 비교 과정`으로 바꾸고 수치가 실제 측정값·진행률이 아님을 명시
- [x] `선택`, `확정`, `잠금`, `비용`, `재시도`, `결제 복귀` 용어 사전 적용 — [사용자 행동 문구 계약](copy-terminology-contract.md)과 `copy-terminology:contract:test` 5/5로 선택/시술 계획 확정, 변경 불가, 실패 복구/새 작업, 결제 후 최신 비용 재확인을 분리
- [x] raw error.message를 사용자 안전 오류 mapper로 변환 — 비-에프터케어 웹·Expo 사용자 표면에서 일반 예외와 API/provider `error` 원문을 상태·작업 기반 문구로 전환했다. 에프터케어 전용 표면은 사용자 요청에 따라 별도 범위로 유지한다.

## 제외 범위

- 신규 제품 기능
- 전면 디자인 리뉴얼
- Phase 09B를 완료하지 않은 상태에서 Push 접근성 완료 주장

## 수용 기준

- 키보드·VoiceOver/TalkBack·200% 글자 크기로 고객 핵심 여정을 완료한다.
- small viewport와 mobile OS UI가 CTA를 가리지 않는다.
- 오류와 빈 상태를 구분하고 재시도할 수 있다.
- 실제 진행 데이터가 아닌 수치를 실시간 계산처럼 표현하지 않는다.
- 언어 전환과 무관한 KO/EN 혼용이 사용자 행동·오류에 남지 않는다.
- performance regression budget을 넘는 변화는 원인과 승인 기록이 있다.

## 검증

- Playwright keyboard, responsive, screenshot, axe suite
- iOS/Android 실기기 VoiceOver/TalkBack
- 200% 글자 크기, reduced motion, slow/offline network
- LCP, INP, CLS와 긴 목록 frame/memory 관찰

`mobile:sync`, typecheck, snapshot만으로 완료하지 않는다.

### 2026-07-15 로컬 접근성 패치 증거

- root layout에 skip link와 `main#main-content`를 하나만 두고 auth·salon·aftercare·정책·B2B 화면의 중첩 landmark를 제거했다. `ui-shell:contract:test` 2/2로 literal/delegated 중첩 `main`과 skip target을 고정했다.
- upload의 확인된 `Link > Button` 두 곳을 단일 interactive element로 바꿨다.
- Header·role navigation에 `aria-current="page"`, 웹 후보 카드에 `aria-pressed`, Expo 결과 선택에 selected state를 추가했다.
- Expo 결과 image에 동적 접근성 label과 image role을 추가했다.
- 구독 결제 공지와 Workspace 에프터케어 수동 overlay를 공용 `Dialog`로 옮겨 기존 focus trap·ESC·닫힌 뒤 focus 복원 계약을 재사용했다.
- component registry는 12 components/12 passports를 파싱하며 `stable` 승격은 0개로 유지했다.
- 대상 ESLint, 7개 workspace typecheck, `git diff --check`는 통과했고 전체 lint는 오류 0·기존 경고 14다.
- `localhost` Playwright에서 공개 랜딩 320/375/768/1024/1440px 가로 넘침 없음, 단일 `main`·단일 `h1`, 첫 Tab의 skip link 노출과 Enter 후 `main#main-content` focus를 확인했다.
- 같은 브라우저에서 결제 공지 Dialog 최초 focus, Shift+Tab/Tab 순환, ESC 닫기, body scroll unlock·이전 `main` focus 복원을 확인했고, 375px 로그인·고객지원·B2B 문의·결제 알림 화면도 가로 넘침 없이 단일 `main`·`h1`을 확인했다.

초기 인앱 브라우저는 커널 자산 경로 오류로 열리지 않았지만 후속 Playwright localhost 검증은 성공했다. 다만 이 증거는 공개 웹의 대표 코드·interaction 검증이며, 인증된 생성·결제·살롱 화면 전체, axe, screenshot diff, VoiceOver/TalkBack, 200% 글자 크기와 실기기 callback 종료 게이트를 대체하지 않는다. B2B 문의 콘솔의 경고·오류는 Cloudflare Turnstile 개발 iframe에서 발생했고 앱 자체 런타임 오류로 판정하지 않았다.

### 2026-07-17 비-에프터케어 접근성 착수 증거

- 구독 버튼, 계정 설정, 결과 리뷰, Styler 헤어 선택의 자체 backdrop/`role="dialog"`/ESC 구현을 제거하고 `Dialog`의 focus trap·ESC·복원·scroll lock 계약으로 통일했다.
- 구독 결제 공지와 계정 설정 안내는 `useCoordinatedModal`의 명시적 priority로 한 번에 하나만 활성화한다. 높은 우선순위 공지가 닫히면 계정 설정 요청이 이어지는 순수 계약을 단위 테스트로 고정했다.
- 리뷰는 native radio group, `FormField`, `InlineAlert`, `aria-busy`를 사용하며 raw API 오류를 직접 표시하지 않는다. Styler 선택 조회는 `AsyncBoundary`와 `aria-pressed`를 사용한다.
- 구독 웨잇리스트 form은 성공을 polite status, 오류를 assertive alert로 알리고 긴 select option이 작은 Dialog를 밀지 않도록 shrink 계약을 고정했다.
- 공개 가격 화면 구독 Dialog의 keyboard interaction과 320/375/768/1024/1440px overflow를 실제 브라우저로 확인했다. 모바일 320px에서 발견한 내부 가로 스크롤은 수정 후 document/body overflow 0으로 재검증했다.
- 자동 axe, 200% zoom, reduced motion, 인증 리뷰·Styler, VoiceOver/TalkBack·실기기·CWV는 아직 완료 증거가 아니다.

### 2026-07-17 인증 폼·개인컬러 접근성 후속 증거

- Expo 로그인·회원가입은 제출 시 전체 필수 오류를 표시하고 첫 오류 field로 focus하며, Clerk의 code/param을 email/password/code별 사용자 문구로 매핑한다.
- 네이티브 `TextField`는 helper/error 설명 관계와 invalid 상태를 input에 연결하고, 공용 텍스트·버튼·통계 레이아웃의 큰 글씨 재배치 계약을 단위 테스트로 고정했다.
- 웹·Expo 개인컬러의 가상 점수 숫자와 `Live/실시간 계산` 표기를 제거했다. 분석 애니메이션은 실제 측정 점수나 진행률이 아닌 미리보기임을 밝히고 screen reader에서 장식 영역을 제외했다.
- 웹은 `prefers-reduced-motion`, Expo는 `AccessibilityInfo.isReduceMotionEnabled`를 사용해 애니메이션과 자동 메시지 전환을 멈춘다.
- 이 로컬 계약은 실제 브라우저 reduced-motion, 200% zoom, iOS/Android 200% 글자, VoiceOver/TalkBack 증거를 대체하지 않는다.
- 웹 개인컬러 source contract 2/2, Expo 앱 Jest 78/78, 7-workspace typecheck, lint 오류 0(기존 경고 10), mobile sync 182/182, registry/passport 41/41, Next production build와 Expo web/iOS/Android export를 통과했다.

### 2026-07-17 사진 권한 영구 거부 복구 로컬 구현

- Expo의 `requestMediaLibraryPermissionsAsync` 사용처를 전수 검색해 사진 업로드, 퍼스널컬러, Styler 전신 사진 3곳을 공통 권한 상태 계약으로 이전했다.
- 권한이 다시 요청 가능한 거부인지 `canAskAgain=false`의 설정 전용 복구 상태인지 구분한다. 설정 전용 상태에는 원인 설명과 `앱 설정 열기` CTA를 노출하고 `Linking.openSettings` 실패도 안전 문구로 처리한다.
- 업로드·퍼스널컬러의 사진 선택 행동과 오류를 한국어로 통일하고, 사진·분석·보안 업로드 실패에서 서버 raw message를 노출하지 않는다.
- 사진 preview에 image role과 목적 label을 추가하고 상태 문구는 polite live region으로 알린다.
- 공통 classifier·설정 열기·안전 오류 mapper와 CTA interaction, 세 사용처 adoption을 Jest로 고정했다. 실제 iOS/Android 설정 이동·복귀와 권한 변경 반영은 실기기 종료 게이트로 남는다.
- Expo 앱 Jest 92/92, 7-workspace typecheck, lint 오류 0(기존 경고 10), mobile sync 212/212, registry/passport 42/42와 Expo web/iOS/Android production export를 통과했다.

### 2026-07-17 Styler 한국어·개인정보·오류 복구 후속 구현

- Expo 새 Styler 마법사의 프로필·장르·견적/생성 3단계, 헤어 선택 modal, 룩북 세션 결과의 정적 영문 행동·상태 문구를 한국어로 통일했다. 3단계 명칭은 결과만 암시하던 `Lookbook/추천 확인` 대신 `견적·생성`으로 바꿨다.
- body shape, fit, exposure, length, correction focus, personal color, generation status와 item slot의 raw enum을 사용자용 한국어 formatter로 표시한다.
- 프로필·선택 variant·헤어 목록·추천·견적·생성·세션 조회 오류는 raw `error.message` 대신 인증/권한/용량/요청 제한/서버/네트워크 상태와 작업별 복구 문구를 사용한다. 실패 세션의 저장된 원문 오류도 그대로 표시하지 않는다.
- 헤어 목록 오류는 전체 메시지의 영문 substring으로 추론하지 않고 controller의 전용 `hairListError` 상태로 modal에 전달한다.
- Styler 헤어/전신/룩북 이미지에 목적 label과 image role을 추가하고, modal loading/error와 세션 실패를 live region으로 알린다.
- 웹·Expo 실행 화면에 비공개 저장소, 임시 서명 링크, 교체 시 이전 파일 삭제, 직접 삭제 전 보관 정책을 표시했다. Expo는 확인 대화상자와 기존 삭제 API를 연결했다.
- formatter·한국어 상태와 `FlatList` modal 선택/닫기/안전 오류 interaction을 Jest 4개 계약으로 고정했다. 전체 Expo Jest 96/96, 7-workspace typecheck, lint 오류 0(기존 경고 10), Styler 구조 계약 4/4, mobile sync 230/230, registry/passport 42/42, Next production build와 Expo web/iOS/Android export를 통과했다. 인증 실기기 VoiceOver/TalkBack·작은 화면·다크 모드 증거는 종료 게이트로 남는다.

### 2026-07-17 비-에프터케어 사용자 안전 오류·live region 후속 구현

- 웹 공용 `mapWebUserError`/`mapWebResponseError`는 로그인 만료, 권한, 사진 용량, 요청 제한, 서버, 네트워크 오류를 사용자 문구로 분류하고 그 외 예외의 `message`와 API/provider `error` 원문은 화면에 전달하지 않는다. 애플리케이션이 소유한 검증 문구만 `UserSafeError`로 보존한다.
- 결제·환불·구독, 결과·개인컬러·Styler·Workspace, 고객지원·B2B·계정, 관리자 회원/환불/통계/FAQ와 살롱 고객/초대/연결 화면을 공용 매퍼로 이전했다. Expo는 기존 `mapMobileUserError`를 계정·홈·관리자·살롱·생성·결과·마이페이지에 확장했다.
- Expo 생성 후보 재시도의 `Retry requires...`, prompt token 누락, rendering/variant 완료 문구를 복구 행동이 드러나는 한국어로 교체했다.
- 새 오류는 웹 `role="alert"`, 성공·진행은 `role="status"`/polite live region으로 연결했다. Expo 계정·관리자 통계·생성·마이페이지·살롱 고객 오류에는 assertive alert, 홈·연결·초대·SSO 진행에는 polite live region을 적용했다.
- 인앱 브라우저에서 공개 홈 320/375/768/1024/1440px의 가로 넘침 0, 단일 `main`·단일 `h1`을 재확인했다. 375px B2B 문의에서 이름 없는 select 3개와 8px 가로 넘침을 발견해 `관심 플랜`·`도입 희망 시점`·`예산 범위` label과 grid child `min-w-0`를 적용했고 overflow 0으로 재검증했다.
- `user-safe-error:contract:test` 4/4가 provider 원문 차단, 소유 문구 보존, 비-에프터케어 화면의 raw `error.message`/API payload 비노출과 웹·native live announcement를 검사한다. 7-workspace typecheck, 전체 lint 오류 0(제외 범위 에프터케어 경고 1), Expo Jest 96/96, mobile sync 230/230, Next static 95/95와 Expo Web 979·iOS 1,261·Android 1,283 modules export를 통과했다.
- 자동 axe, 인증 keyboard/screenshot, 실제 VoiceOver/TalkBack, 200% 글자, 네이티브·에프터케어 이미지 inventory와 CWV는 여전히 운영·실기기 종료 게이트다.

### 2026-07-17 비-에프터케어 결제·생성 문구 계약 후속 구현

- [사용자 행동 문구 계약](copy-terminology-contract.md)에 `선택`, `시술 계획 확정`, `변경 불가`, `비용`, `재시도`, `다시 생성`, `결제 후 복귀`의 의미와 금지 표현을 고정했다.
- 웹·Expo 결제와 구독 오픈 알림에서 `PortOne Checkout`, 카드 빌링키, `PG 연동`, webhook/API, 서버 검증 같은 구현 설명을 제거했다. 결제 확인·중복 결제 방지·원래 작업 복귀·최신 비용 재확인처럼 사용자가 판단할 수 있는 상태와 다음 행동으로 교체했다.
- 마이페이지 결제·구독·환불 실패는 provider message/code를 직접 표시하지 않는다. 알 수 없는 plan/status enum도 원문 대신 `정보 확인 필요`·`상태 확인 중`으로 표시한다.
- Expo 생성 결과의 `Recommendation Board`, `Retry`, raw status/error 등 정적 영문과 provider 후보 오류를 한국어 상태·복구 행동으로 교체했다. 실패한 후보의 재시도와 비용이 드는 새 작업의 다시 생성을 구분한다.
- 웹 생성 결과도 Ready/Failed/Analysis/Retry와 기장·보정 enum을 한국어로 바꾸고 preparation/variant provider 원문을 차단했다. 계정·홈·관리자·개인컬러·살롱·고객지원의 비-에프터케어 정적 kicker와 Expo 업로드의 `멱등`, 결제 `callback`, Styler `임시 서명 링크`, 웹 Clerk/Turnstile 환경 변수 안내도 사용자 상태·행동 문구로 교체했다.
- `copy-terminology:contract:test` 5/5, 기존 `user-safe-error:contract:test` 4/4, 7개 workspace typecheck, 전체 lint 오류 0·범위 제외 에프터케어 경고 1, Expo Jest 96/96, `mobile:sync` 230/230, Next static 95/95와 Expo Web 979·iOS 1,261·Android 1,283 modules export를 통과했다. 모델 생성 자유 텍스트와 별도 범위 에프터케어 KO/EN inventory는 종료 게이트로 남는다.

### 2026-07-17 공개 웹 Playwright·axe·visual 후속 증거

- 별도 `.next-e2e` production build와 3100번 서버를 사용하는 [공개 웹 UI E2E 기준선](web-public-e2e-baseline-2026-07-17.md)을 추가해 기존 3000번 개발 세션과 산출물을 분리했다.
- Production Playwright 15/15가 공개 6경로 axe serious/critical 0, 자동 공지 ESC·skip link·데모 tablist·FAQ keyboard, 5개 폭 overflow 0·screenshot diff, `640 CSS px + DPR 2` 200%-equivalent keyboard, 공개 홈 reduced-motion과 B2B offline 복구 게이트를 검증한다.
- 검사에서 발견한 푸터 사업자정보 label 대비, 후기 가로 scroll keyboard 접근, 데모 tab 방향키, B2B placeholder-only 입력을 수정했다.
- 공개 경로 범위이며 viewport/DPR emulation은 실제 브라우저 zoom 자체가 아니다. 따라서 인증 생성·결과·결제·관리자·살롱 화면, 실제 Chrome/Safari 200% 확대, screen reader와 실기기 게이트는 계속 미완료다.

### 2026-07-18 비-에프터케어 웹 이미지 계약

- `web-image-contract.test.ts`가 `app`·`components`의 TSX를 TypeScript AST로 전수 조사하고 에프터케어 소유 화면을 명시적으로 제외한다.
- 원시 동적 이미지 13개는 모두 목적에 맞는 `alt`, `decoding="async"`, `loading="lazy|eager"` 또는 `fetchPriority="high"`와 `aspect-*`/`min-height` 공간 예약을 가져야 한다. 결과·룩북 핵심 이미지는 높은 요청 우선순위, 카드·모달 이미지는 지연 로딩으로 분리했다.
- `next/image` 12개도 `alt`와 `src` 누락을 함께 검사하며, 이미지 사용처 수가 달라지면 새 표면의 정책 검토 없이 기준이 자동 통과하지 않는다.
- `web-image:contract:test` 1/1, 웹 typecheck, lint 오류 0, `git diff --check`, Next production compile·TypeScript·static 96/96을 통과했다.
- 이 계약은 CLS 예방 조건과 브라우저 요청 힌트를 검증하지만 실제 LCP·CLS·INP 측정은 아니다. `web-perf`가 요구하는 Chrome DevTools MCP가 현재 구성되지 않아 실측 trace는 후속 게이트로 유지한다.

### 2026-07-18 공개 홈 200%-equivalent keyboard 게이트

- `public-zoom.spec.ts`는 1280px 물리 폭을 200%로 본 것과 동등한 640 CSS px·DPR 2 context를 별도로 만들고 해당 값 자체를 assertion으로 고정한다.
- document 가로 overflow 0에 더해 공지 닫기, skip link에서 main 이동, 성별 tab 전환, FAQ 토글을 keyboard-only로 수행한다. 각 작은 focus target은 viewport 안에 완전히 보여야 하고, main처럼 viewport보다 큰 landmark는 viewport와 교차해야 한다.
- 전용 Next production build는 compile·TypeScript·static 96/96, targeted zoom test 1/1, 전체 공개 Playwright 15/15를 통과했다. 기존 middleware deprecation 경고는 유지된다.
- 이 증거는 actual browser zoom, Safari, 인증 경로, screen reader 또는 OS 200% 글자 크기 증거가 아니다.

### 2026-07-18 공개 reduced-motion·offline 복구 게이트

- `public-resilience.spec.ts`는 공개 홈을 `no-preference`로 시작해 후기 roll과 Hero의 live dot·scan line·workflow step·grid card가 실제로 움직이는지 확인한 뒤 `prefers-reduced-motion: reduce`로 전환해 다섯 computed `animation-name`이 모두 `none`인지 검증한다.
- B2B 문의는 제출 전 Turnstile mock token을 만료시켜 안내와 제출 차단을 확인하고, token 재확인 뒤 첫 `/api/b2b/lead`를 `ERR_INTERNET_DISCONNECTED`로 중단한다. 네트워크 안전 오류가 보이는 동안 살롱명·담당자·이메일·문의 내용을 유지하고, 다시 발급된 token으로 같은 폼의 두 번째 요청을 201로 완료한 뒤에만 입력을 비운다.
- 검증 중 Turnstile callback이 새 토큰을 받으면서 네트워크 오류까지 즉시 지우는 결함을 발견했다. 보안 확인 전용 오류만 callback에서 해제하도록 상태 경계를 분리했다.
- 전용 Next production build compile·TypeScript·static 96/96, resilience 2/2, 전체 공개 Playwright 15/15, 대상 lint와 웹 typecheck가 통과했다.
- 이 증거는 실제 저속 회선, 실제 Cloudflare Turnstile provider의 만료 callback, 인증 세션 token 만료, 모바일 offline 복구와 실제 Chrome/Safari reduced-motion 증거가 아니다.

### 2026-07-18 실제 Clerk 인증 진입 E2E 게이트

- Production E2E는 test Clerk key를 의도적으로 거절하므로 `/login`·`/signup`의 안전 fallback만 검증한다. 운영 키 제한을 완화하지 않고 `playwright.auth.config.ts`와 `localhost:3101`의 격리된 Next 개발 런타임을 추가해 실제 테스트 Clerk UI를 별도로 로드한다.
- `auth-ui.spec.ts`는 로그인·회원가입 폼 각각의 axe serious/critical 0, 이메일→계속 또는 이메일→비밀번호→표시→계속→상호 인증 링크 keyboard 순서, 320/375px overflow 0과 4개 screenshot baseline을 검증한다.
- 인증 screenshot에서는 제품 UI가 아닌 Next 개발 indicator를 CSS로 제외하고, Header·Clerk card·footer가 포함된 실제 첫 viewport를 비교한다. 320px 이미지를 직접 확인해 입력과 CTA가 잘리지 않는 것도 확인했다.
- `npm run web:auth-e2e` 8/8과 production `npm run web:e2e` 15/15가 통과했다. 테스트 Clerk 개발 인스턴스 경고와 기존 middleware deprecation 경고는 예상 범위다.
- 이 증거는 실제 계정 제출, MFA·비밀번호 재설정 이메일, 로그인 완료 뒤 보호 화면, live Clerk key, Chrome/Safari matrix와 실제 screen reader 증거가 아니다.

### 2026-07-18 로그인 완료 뒤 보호 화면 E2E 기반

- 운영용 live-key 제한과 기존 인증 진입 8-test lane을 유지한 채 `playwright.protected.config.ts`의 3102번 개발 런타임을 별도로 추가했다.
- Clerk 공식 `@clerk/testing`의 project setup, testing token, `clerk.signIn({ emailAddress })`, storage state 재사용 계약을 적용했다.
- setup은 `pk_test_`/`sk_test_`와 기존 `+clerk_test` 사용자만 허용한다. 자격 증명이 없거나 운영 키이면 건너뛰기·제품 인증 우회·사용자 자동 생성을 하지 않고 실패한다.
- 고객 `/home`·`/mypage`·본인 completed generation·foreign generation 403·관리자 거절 5개, 관리자 통계·회원 조회 2개, 살롱 고객·연결 조회와 관리자 거절 3개를 구성했다. 역할별 storage setup 4개를 포함한 14-test 목록, axe serious/critical 0·375px overflow·조회 중 브라우저 write request 0과 기존 role 조회의 profile 무변경 계약을 로컬 검증했으며 실제 Clerk/Supabase fixture green run은 Phase 13 외부 게이트로 남긴다.

### 2026-07-18 비-에프터케어 Expo 이미지 접근성 계약

- Expo TSX의 의미 이미지 사용처를 전수 확인해 홈의 시술 확정·패션 추천 카드와 결과 상세 이미지에 동적 목적 label과 `image` role을 추가했다.
- 기존 업로드·개인컬러·생성 보드·Styler 헤어 선택/전신 사진/룩북 이미지도 같은 계약을 충족하는지 고정했다. 홈의 공용 preview는 호출자가 구체 label을 반드시 전달해야 한다.
- `mobile-image-accessibility.test.js`는 에프터케어를 제외한 8개 소유 파일에서 모든 `<Image>`가 label과 role을 갖는지 검사하며 8/8 통과했다. Expo typecheck와 대상 lint도 통과했다.
- 정적 label/role 계약은 실제 VoiceOver/TalkBack 읽기 순서, 발음, 중복 공지와 200% 글자 크기 실기기 증거를 대체하지 않는다.

### 2026-07-18 모바일 긴 목록·선택 상태 로컬 계약

- 공용 `VirtualizedListScreen`은 `initialNumToRender=8`, `maxToRenderPerBatch=8`, `updateCellsBatchingPeriod=50`, `windowSize=7`을 기본값으로 제공하되 화면별 데이터 밀도에 맞춰 기존 FlatList prop으로 재정의할 수 있게 유지했다. 중첩 `ScrollView`를 만들지 않고 `FlatList`가 유일한 scroll owner인 기존 계약도 유지한다.
- Styler 최근 결과 목록은 `selectedVariantId`를 `FlatList.extraData`에 연결하고 group render batch를 3개로 제한했다. 같은 데이터 참조에서 선택 ID만 바뀌는 재렌더에도 기존 카드의 selected state가 해제되고 새 카드가 선택됨으로 갱신되는 interaction을 고정했다.
- 기본값 전달·화면별 override 2개와 Styler 선택 전환을 포함한 집중 Jest 7/7, Expo 전체 25 suites·128/128, 앱 typecheck·quiet lint, 목록 pagination/race 계약 12/12, registry 45 components·45 passports가 통과했다.
- 125건 cursor fixture는 중복 없이 모든 행에 도달하고 100번째 이후 검색 결과도 찾지만 JS thread frame time·메모리·이미지 decode 비용을 측정하지는 않는다. 따라서 체크리스트 완료와 `experimental` 컴포넌트 승격은 iOS/Android 100+ 실데이터 기기 측정 뒤로 유지한다.

### 2026-07-18 운영·살롱 live region 잔여 감사

- 비-에프터케어 웹·Expo의 조건부 오류 표면을 다시 검색해 시각 카드만 있고 공지 semantics가 없던 표면을 확인했다. 웹 살롱 생성 마법사의 오류는 `alert`, 성공은 `status/polite`로 구분하고 관리자 고객지원 성공 안내도 `status/polite`로 보강했다.
- 관리자 회원·환불의 고위험 작업 영수증은 `failed`·`conflict`를 `alert/assertive`, 완료·이미 처리·처리 중·외부 동기화 대기를 `status/polite`로 구분해 보조기기가 결과 심각도를 함께 전달한다.
- Expo 관리자 B2B·메일·회원 목록·회원 상세·리뷰와 살롱 고객 목록·매칭 후보 오류를 `accessibilityRole="alert"`·`accessibilityLiveRegion="assertive"`로 감쌌다. 기존 재시도 CTA와 오류 문구는 그대로 보존했다.
- `user-safe-error:contract:test` 4/4가 새 웹 alert/status와 native 7개 운영 표면을 포함해 통과했고 웹·Expo typecheck와 quiet lint, 격리된 Next production compile·TypeScript·static 96/96도 통과했다. 정적 semantics는 실제 VoiceOver/TalkBack 공지 순서·중복·발음을 대체하지 않는다.
- Core Web Vitals trace도 재시도했지만 `web-perf`가 요구하는 Chrome DevTools MCP가 현재 도구 구성에 없어 수치를 생성하지 않았다. 측정하지 않은 값을 추정하지 않고 CWV 체크는 외부 도구 게이트로 유지한다.

### 2026-07-18 모바일 safe area·keyboard·back 셸 보강

- `AppScreen`은 고정 footer가 없을 때 top·bottom safe area를 함께 적용한다. 마이페이지처럼 고정 CTA가 있으면 외부 셸은 top만 소유하고 footer의 별도 `SafeAreaView edges=[bottom]`가 홈 인디케이터 영역을 전담해 중복 inset과 CTA 겹침 가능성을 줄였다.
- 일반 ScrollView는 iOS `automaticallyAdjustKeyboardInsets`, iOS `interactive`·Android `on-drag` dismiss와 `keyboardShouldPersistTaps=handled`를 기본으로 갖는다. 인증 폼은 기존 `FormScreen`의 iOS padding·Android height `KeyboardAvoidingView`와 고정 submit footer 계약을 유지한다.
- `VirtualizedListScreen`에도 같은 keyboard tap/dismiss/inset 정책을 소비자가 재정의 가능한 기본값으로 추가했다. 따라서 관리자·살롱 목록의 header 검색 입력에서 키보드가 열린 상태로 검색·필터 버튼을 누를 때 첫 탭이 단순 dismiss로 소모되지 않는다.
- Android hardware back은 기존 `useSafeBackNavigation`이 화면 focus 동안에만 listener를 등록하며 업로드·생성 접수·결과 변경·결제 확인·Styler 진행 중에는 요청을 차단하고 안내한다. visible back CTA와 hardware back은 같은 경로를 사용한다.
- AppScreen bottom-safe-area 소유권 2개, FormScreen 2개, VirtualizedListScreen 2개, safe back 5개로 집중 Jest 11/11을 통과했다. Expo 전체 26 suites·130/130, 앱 typecheck·quiet lint, mobile sync 246/246, registry 45/45와 Web 1,063·iOS 1,343·Android 1,366 modules production export도 통과했다. 실제 iPhone 홈 인디케이터, Android 3-button/gesture back, 키보드 높이·제조사별 `adjustResize` 동작은 실기기 종료 게이트다.

### 2026-07-18 모바일 reduced-motion 전수 계약

- 비-에프터케어 Expo 소스의 `Animated`, `animationType`, interval/timeout 사용처를 전수 검색했다. 개인컬러의 scan·pulse·swatch·자동 메시지는 기존 대응을 유지하고, 누락된 홈 계정 설정 `fade`와 Styler 헤어 선택 `slide` modal을 공용 `useReducedMotionPreference`에 연결했다.
- 공용 hook은 OS 설정이 확인되기 전에는 `null`을 반환하고 modal animation resolver는 이 상태도 `none`으로 처리한다. 네이티브 preference 조회가 실패해도 장식 모션을 허용하지 않으며 `reduceMotionChanged`를 구독해 앱 실행 중 설정 변경을 반영하고 unmount 시 listener를 제거한다.
- 생성 결과 polling, Styler 세션 polling, 견적 만료 timeout은 장식 애니메이션이 아니라 서버 상태·비용 정확성 계약이므로 reduced motion에서 중단하지 않는다. 시각 진행 막대는 CSS/Animated transition 없이 서버가 반환한 값만 즉시 표시한다.
- 공용 preference/resolver·listener·조회 실패 3개, 전체 modal adoption 1개, Styler motion on/off interaction과 기존 개인컬러 정지를 포함한 집중 Jest 12/12를 통과했다. Expo 전체 28 suites·135/135, 앱 typecheck·quiet lint, mobile sync 250/250, registry 45/45와 Web 1,065·iOS 1,343·Android 1,367 modules production export도 통과했다.
- 정적·Jest 계약은 iOS Reduce Motion·Android Remove animations 설정을 실제로 전환했을 때 native modal 전환, screen reader 공지와 앱 재개 상태를 대체하지 않으므로 체크와 컴포넌트 `experimental` 상태를 유지한다.

### 2026-07-18 모델 생성 문구 한국어 표시 계약

- 원본 생성 데이터는 저장·선택 계약을 위해 그대로 보존하고, 웹 `useResultTranslations`와 Expo `useMobileResultTranslations`가 사용자 표시만 담당한다. Expo는 인증 토큰을 붙이는 공용 API client의 `/api/result-translations` 호출을 사용한다.
- 라틴 문자가 포함된 label·reason·얼굴 분석·태그·AI 평가·디자이너 브리프는 한영 혼용 여부와 관계없이 번역 응답을 캐시한다. 응답 누락, API key 미설정, 네트워크·provider 실패, 영문 응답 반복 시에는 `추천 스타일 N`, 추천 이유·분석·키워드별 한국어 fallback으로 fail-closed한다.
- 적용 표면은 웹·Expo 생성 보드와 결과 상세, 웹 고객 Workspace·살롱 Workspace, 웹·Expo Styler 선택 모달과 선택 요약이다. 접근성 이미지·버튼 label도 같은 표시명을 사용해 화면 제목과 공지가 어긋나지 않는다.
- shared 표시 resolver 2건을 포함한 shared 46/46, Expo 영어 번역 실패 렌더 계약을 포함한 28 suites·136/136, 결과 UX 10/10, 7개 workspace typecheck, 웹·Expo lint 오류 0, mobile sync 250/250, registry 45/45를 통과했다. Next production static 96/96와 Expo Web 1,055·iOS 1,346·Android 1,369 modules export도 최종 소스 기준 exit 0이다.
- 이는 실제 Gemini 번역 품질·운영 rate limit과 iOS/Android 네트워크 전환을 대신하지 않는다. 다만 번역 서비스 장애가 사용자 화면의 영문 원문 노출로 이어지지 않는 로컬 종료 조건은 고정했다.

### 2026-07-18 인증 token·모바일 offline 복구 계약

- Expo root는 `NetworkRecoveryProvider`를 한 번만 설치하고 `expo-network`의 `isConnected`·`isInternetReachable`을 `unknown | online | offline`으로 정규화한다. 공용 `AppScreen`은 offline 상태를 assertive alert로 알리되 현재 화면과 입력을 유지한다.
- 알려진 offline → online 전이에서만 단조 증가하는 recovery token을 발급한다. 홈·생성 현황·결과·Styler의 조회 effect가 token을 소비하며, 생성 polling은 offline 동안 중지하고 online 복귀 후 다시 시작한다. 네트워크 결과가 모호한 상태에서 추천·생성·유료 명령을 자동 재전송하지 않는다.
- 웹 `useAuthenticatedFetch`와 모바일 공용 API client는 인증 요청이 401일 때 `getToken({ skipCache: true })`로 token을 한 번 강제 갱신하고 같은 요청을 정확히 한 번 재시도한다. 갱신할 token이 없으면 최초 401을 유지해 각 기능의 로그인 복귀 경로가 처리하게 한다.
- 모바일 reconnect·API adoption 집중 Jest 7/7, 웹 auth recovery 2/2, Expo 전체 32 suites·145/145, 7개 workspace typecheck, 전체 lint 오류 0(별도 에프터케어 경고 1), mobile sync 259/259, registry 46/46를 통과했다. 최신 제품 소스의 Next static 96/96와 Expo Web 1,071·iOS 1,350·Android 1,372 modules export도 exit 0이다.

### 2026-07-18 운영 Dialog keyboard·axe 후속 게이트

- 환경 플래그가 없으면 `notFound()` 경계만 렌더하는 테스트 전용 route에서 운영 리뷰·Styler·구독 공지·계정 설정 컴포넌트를 직접 렌더했다. 제품과 다른 Dialog 복제본은 만들지 않았다.
- 자동 공지는 한 번에 하나만 열리고 구독 안내를 닫으면 계정 설정이 이어졌다. 리뷰와 Styler는 keyboard 선택·focus 복원·live 상태·선택 상태 유지까지 실제 Chromium으로 확인했다.
- 리뷰·Styler·고위험 확인 Dialog의 axe serious/critical 위반은 0건이다. 320px light·375px dark에서 Styler 패널 경계·문서 overflow 0·닫기/선택 도달성도 확인했으며, `dialog-accessibility:contract:test` 11/11, 대상 typecheck/lint, E2E Next static 97/97, production Playwright 21/21이 통과했다.
- 실제 인증 데이터 route, 관리자 API 성공·충돌 결과, NVDA/VoiceOver/TalkBack 공지 순서·발음은 이 증거에 포함되지 않는다.
- 이 로컬 계약은 실제 저속 회선, iOS/Android 비행기 모드·프로세스 종료, live Clerk 세션 만료를 대신하지 않는다. 해당 항목은 Phase 13 실기기·외부 환경 게이트로 유지한다.

### 2026-07-18 업로드 오류 접근성·플랫폼 일치 계약

- 웹·Expo·서버의 사진 형식, 8MB, 512px 규칙을 shared 계약으로 통일하고, 드롭존이 거부한 HEIC도 운영 오류 표면에 전달해 무반응 실패를 없앴다.
- 웹 숨은 파일·카메라 입력에 접근 가능한 이름을 추가했다. 웹·Expo 오류는 `alert/assertive`, 진행·성공은 `status/polite`로 분리했다.
- production Chromium에서 HEIC·8MB 초과·1px·정상 1024px 파일을 실제 입력해 4/4 통과했고, 정상 화면 axe serious/critical 위반은 0건이었다. 실제 Safari·저속 회선·VoiceOver/TalkBack·실기기는 Phase 13 외부 게이트다.

### 2026-07-19 웹 개인컬러 진행 상태 브라우저 안정화

- 1.7초 타이머로 바뀌는 설명 문구를 live region에서 분리했다. 시각 사용자는 기존 분석 단계 미리보기를 보지만, 보조기기에는 “분석 진행 중이며 결과 준비 시 자동 표시”라는 고정 사실만 polite/atomic status로 한 번 전달해 장식 단계를 실제 서버 진행처럼 반복 공지하지 않는다.
- `PersonalColorDiagnosisProgress`는 `data-motion=pending|allowed|reduced`를 공개하고 스캔 오버레이·팔레트 비교 미리보기·움직이는 단계 문구를 명시적으로 `aria-hidden` 처리했다. 동작 줄이기에서는 메시지 타이머와 scan/palette/pulse CSS animation이 모두 멈춘다.
- 앱 셸의 production 컴포넌트를 직접 조합하는 fail-closed E2E route를 추가했다. 최초 하네스의 중첩 `main` landmark는 첫 실행에서 발견해 일반 컨테이너로 수정했고, 최종 페이지는 단일 main 구조를 유지한다.
- Chromium 3/3에서 1024px light의 시각 메시지 전환·오버레이 토글, 320px light reduced와 375px dark reduced의 고정 메시지·animation name `none`, overflow 0·axe serious/critical 0을 확인하고 세 visual baseline을 저장했다.
- source 계약은 3/3, Next E2E build는 static 110/110이다. Passport와 registry는 `experimental`에서 `candidate`로만 승격했으며, 인증 개인컬러 실제 요청 흐름과 NVDA/VoiceOver screen reader 증거 전에는 stable로 올리지 않는다.

### 2026-07-19 웹 MyPage 탭 keyboard·모바일 overflow 안정화

- 여섯 링크가 모두 Tab 순서에 들어가던 구조를 활성 탭 한 개만 Tab 진입점으로 쓰는 roving tabindex로 바꿨다. ArrowLeft·ArrowRight는 순환하고 Home·End는 처음·마지막 탭으로 포커스를 옮기며, 실제 이동은 링크 Enter 활성화로 분리한다.
- 활성 panel만 렌더하는 화면 구조에 맞춰 `aria-controls`도 활성 탭에만 제공한다. 활성 상태는 `aria-selected`, `aria-current=page`, matching tabpanel label로 일치시켰다.
- 최초 모바일 브라우저 검증에서 tablist의 662px intrinsic 폭이 페이지 전체를 미는 실패를 검출했다. navigation·tablist의 `min-width: 0`과 최대 폭을 고정해 탭 영역만 가로 스크롤되고 문서 overflow는 0이 되도록 수정했다.
- fail-closed production harness와 source 계약 5/5, Chromium 3/3에서 결제 복귀 query 보존, keyboard focus, 1024px light·320px light·375px dark visual, focused tab 노출, axe serious/critical 0을 확인했다. Next E2E build는 static 111/111이며 인증 MyPage와 실제 screen reader·200% 글자는 Phase 13 외부 증거로 남긴다.

## 롤백·인계

- a11y·문구 fix는 문제 묶음별로 rollback 가능하게 유지한다.
- Phase 13에 기기·viewport·스크린리더·성능 증거를 넘긴다.
