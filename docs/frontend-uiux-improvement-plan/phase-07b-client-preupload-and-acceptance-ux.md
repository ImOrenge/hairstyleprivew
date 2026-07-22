# Phase 07B — 웹·앱 사전 업로드와 접수 UX

- 상태: 로컬 구현 완료 — 실제 브라우저·iOS·Android 종료/복귀 검증 대기
- 우선순위: P0
- 변경 게이트: `behavioral`
- 선행 페이즈: Phase 05, Phase 07A
- 독립 배포: Phase 07A API와 호환될 때만 가능

## 목표

큰 원본 업로드와 작은 accept command를 분리하고, 사용자가 언제 화면을 유지해야 하는지 정확히 안내한다. `acceptedAt` 전에는 종료 경고, 이후에는 종료 가능·완료 이메일 안내를 노출한다.

## 사용자 흐름

```text
사진 선택
  -> private 사전 업로드 중: 화면 유지
  -> draft receipt ready: 접수 버튼 활성화
  -> accept 요청 중: 영수증 전까지 화면 유지
  -> acceptedAt 수신: 앱/웹 종료 가능, /generate/{id}로 이동
  -> 서버 상태 재조회: queued/preparing/retry/processing/terminal
```

## 로컬 구현 완료

### 웹

- [x] 사진 선택 후 자동 사전 업로드와 동일 `clientRequestId` 요청 중복 결합
- [x] `draftReceipt`, upload progress/error, accept receipt를 generation store/hook에 분리
- [x] draft 준비 전 생성 버튼 비활성화와 업로드 재시도 문구
- [x] accept 응답의 `generationId`, `acceptedAt`, `preparationStatus` 검증
- [x] 접수 전 “유지”, 접수 후 “닫아도 됨” 문구 분리
- [x] 고객 workspace와 살롱 workspace가 같은 draft/accept 계약 사용
- [x] 브라우저 로컬 생성 fallback 제거
- [x] Next 개발 서버에서는 Cloudflare binding 부재 시에만 loopback 내부 API로 durable outbox를 소비하며, 브라우저 상태·base64에는 의존하지 않음
- [x] IndexedDB 원본을 Clerk `userId`별 key와 owner metadata로 이중 결속하고 owner 없는 v1 cache 폐기
- [x] 로그인·로그아웃·계정 전환 시 preview object URL, draft, Quote, generation 상태를 초기화하고 hydration 완료 전 페이지 차단
- [x] 업로드·Quote·accept·variant 비동기 응답과 WebP 변환에 owner revision fence 적용
- [x] generation detail에서 Workflow 실행 대기·사진 분석·후보 생성·완료 단계를 구분하고 서버 후보 수와 수동 새로고침 표시

### Expo 앱

- [x] 사진 선택 직후 private draft 업로드와 업로드 재시도
- [x] draft receipt만 SecureStore에 저장하고 원본/base64는 영구 저장하지 않음
- [x] draft receipt를 Clerk `userId`별 SecureStore v2 key와 owner metadata로 저장하고 앱 시작 시 expiry 검증
- [x] 계정 전환 시 context subtree와 메모리 사진·draft를 초기화하고 이전 계정 async setter를 실행 시점 owner 검사로 차단
- [x] accept 성공 직후 메모리 base64와 draft receipt 제거
- [x] 401은 로그인 후 generation 복귀, 403은 다른 계정/권한 오류로 분리
- [x] generation detail에서 preparation 상태와 “분석 준비 중” empty state 표시
- [x] 웹과 동일한 서버 단계 진행 카드, 후보 완료 수, 수동 새로고침 표시

## 운영·실기기 검증 대기

- [ ] Chrome/Safari에서 업로드 중 탭 이동·새로고침·브라우저 종료 UX 확인
- [ ] iOS/Android에서 background·강제 종료·cold start receipt 복구 확인
- [x] Expo 상호작용에서 accept 응답 유실을 재현하고 같은 `draftId`·`quoteId` 재시도, 성공 receipt 전 메모리 유지, 성공 뒤 1회 정리를 확인. PostgreSQL `paid_action_quote_smoke.sql`의 `idempotentReplay`와 단일 generation/outbox 계약도 함께 통과
- [ ] 실제 저속 회선에서 accept 서버 commit 직후 응답 단절·재접속을 캡처하고 동일 generation 복귀 확인
- [x] pure/static 계약에서 draft 만료·owner mismatch·A→B stale receipt/image/async 응답 비노출 확인
- [ ] 실제 Clerk 계정 전환과 iOS/Android에서 stale receipt 제거·계정별 복귀 확인
- [x] Expo `GenerationFlowProvider` 상호작용에서 accepted 뒤 portrait data URL·recommendation draft·receipt 메모리 제거, SecureStore 직렬화 base64 비포함, 접수 화면 console 비노출 확인
- [ ] 실제 iOS/Android 프로세스 메모리·JS/native 로그 캡처에서 accepted 이후 base64 비노출 확인
- [x] 로컬 웹 Chromium·Expo 계약에서 8MB 초과·지원하지 않는 MIME·512px 미만 오류의 assertive 공지와 정상 경계 확인
- [ ] 실제 slow network에서 업로드 지연·중단·재시도 안내 확인
- [x] 웹과 앱의 queued/preparing/retry/ready/failed 표시와 새로고침 CTA를 shared 계약으로 통일하고 정적 parity 계약으로 확인

## 명시적 제한

- 웹의 draft receipt는 현재 Zustand 메모리 상태다. 브라우저를 닫기 전 accept까지 완료하는 것이 기본 계약이며, pre-accept 브라우저 종료 복구를 보장하지 않는다.
- 개발 서버의 로컬 Workflow 실행기는 `NODE_ENV=development`와 loopback origin에서만 동작한다. 배포 환경은 Cloudflare Workflow binding이 없으면 실행 불가로 처리한다.
- 모바일은 draft receipt를 복구하지만, `acceptedAt` 전에는 서버 Workflow 소유권이 확정되지 않았으므로 종료 가능 문구를 표시하지 않는다.
- 계정 A→B 전환과 stale async 차단은 로컬 자동 계약으로 검증했으며 실제 Clerk 다중 계정·강제 종료 증거를 대체하지 않는다.
- 이 페이즈는 실제 메일 수신이나 OS push를 구현·증명하지 않는다. 이메일은 Phase 09A, push는 Phase 09B다.
- accept 시점 10크레딧 reservation은 Phase 03/07A에서 원자적으로 구현됐다. UI와 receipt는 접수 시 `reserved`, 첫 authoritative 성공 시 `charged`, 성공 결과 없는 terminal 실패 시 `refunded`를 구분하며 접수를 최종 차감 완료로 조기 표현하지 않는다.

## 2026-07-15 로컬 검증 증거

- 웹 IndexedDB cache와 Expo SecureStore receipt는 모두 Clerk `userId`별 key와 owner metadata를 사용하며 owner 없는 legacy 항목은 복구하지 않는다.
- 업로드·WebP 변환·Quote·accept·variant 응답의 owner revision fence와 계정 전환 초기화 계약을 로컬 자동 테스트로 확인했다.
- Expo 전체 Jest 36/36, 7개 workspace typecheck, lint 오류 0·기존 경고 14가 통과했다.

이 증거는 실제 인증 브라우저에서의 Clerk A→B 계정 전환, Chrome/Safari 종료, iOS/Android background·강제 종료·cold start를 대체하지 않는다.

## 2026-07-18 사전 업로드 검증 후속 증거

- 웹·Expo·서버가 공용 `@hairfit/shared` 계약의 JPEG/PNG/WebP, 8MB 이하, 가로·세로 512px 이상 규칙을 사용한다. Expo ImagePicker base64는 실제 반환 형식에 맞춰 JPEG data URL로 전송해 HEIC 원본 MIME 오표기를 막았다.
- 운영 `UploadArea`는 지원하지 않는 MIME도 `onDropRejected`를 통해 오류 표면으로 전달하며 숨은 파일·카메라 입력에 접근 가능한 이름을 제공한다. `ValidationCheck`와 Expo 오류는 `alert/assertive`, 진행·성공은 `status/polite`로 구분한다.
- 공용 검증 49/49, Expo 집중 12/12, 업로드 정적 계약 5/5, 최신 Next E2E static 105/105, 실제 Chromium HEIC·8MB 초과·1px·1024px 상호작용과 320px light·375px dark visual/파일명·CTA 도달성을 포함한 업로드 6/6 및 axe serious/critical 0건을 확인했다. `UploadArea`와 `ValidationCheck`는 공용 CSS namespace·독립 타입 계약까지 갖춰 registry `stable`로 승격했다.
- 이 로컬 증거는 실제 저속 회선, Safari, VoiceOver/TalkBack, iOS/Android 실기기 파일 선택과 앱 강제 종료를 대체하지 않는다.

## 2026-07-18 생성 진행 상태 플랫폼 일치 증거

- 웹·Expo 진행 카드는 같은 `GenerationJobProgressPresentation`, `GENERATION_JOB_COPY`, 새로고침 label resolver와 후보 수 summary를 사용한다. queued/preparing/retry/ready/failed의 제목·설명·진행률은 shared 상태 행렬에서 한 번만 결정한다.
- 웹은 `status/polite`, Expo는 `accessibilityLiveRegion=polite`로 상태 갱신을 알리고 두 플랫폼 모두 “시간 예상치가 아닌 서버 단계 기준”임을 표시한다.
- shared 상태·문구 단위 계약과 `generation-progress-parity:contract:test`가 두 운영 컴포넌트의 shared copy/CTA 사용을 고정한다. 실제 VoiceOver/TalkBack 발음·중복 공지와 인증 상태 전이는 실기기·외부 게이트로 유지한다.
- 웹 `GenerationJobProgressCard`와 `PipelineStatusIndicator`는 공용 `PipelineStage`, 한국어 단계명, `status/polite/atomic/busy`, progressbar와 실패 alert 계약을 사용한다. fail-closed 운영 하네스의 queued/preparing/retry/ready/failed 5상태, 새로고침, axe serious/critical 0건, 320px light·375px dark visual과 가로 넘침 0을 확인해 웹 두 컴포넌트를 registry `stable`로 승격했다. 작은 화면의 6단계명은 3×2 배열로 모두 노출하고 다크 모드 현재 단계 대비를 보정했다.
- 이 승격은 웹 컴포넌트 자체의 로컬 안정성 판정이다. 인증 Workspace의 실제 서버 전이, 브라우저 zoom·물리 screen reader와 Expo 진행 카드는 외부·실기기 게이트로 유지한다.
- 고객 Workspace의 3단계는 `생성 진행·알림`으로 목적을 명시하고, 설명도 서버 작업 상태와 완료 알림 확인으로 고정했다. 데스크톱은 4단계 labelled navigation과 `aria-current=step`, 모바일은 현재 `n단계/4` 요약·잠긴 native button·선택 후 메뉴 자동 닫힘을 제공한다. 접수 완료 표면은 정적 알림 카드의 중복 live region을 제거하고 단일 polite/atomic 접수 공지, 진행 카드, 완료 이메일·예약 크레딧, 작업 현황/홈/새 사진 CTA를 분리했다.
- fail-closed 운영 하네스의 잠금 해제→3단계 keyboard 선택→모바일 자동 닫힘→세 CTA trial click, axe serious/critical 0, 1024px light·320px light·375px dark visual과 overflow 0을 확인해 `WorkspaceStepNavigation`과 `WorkspaceAcceptedGenerationStatus`를 registry `stable`로 승격했다. 실제 인증 accept receipt와 메일 수신·물리 screen reader는 외부 게이트다.

## 2026-07-18 accept 응답 유실·민감 원본 수명주기 증거

- Expo 접수 화면에서 첫 `acceptGenerationDraft` 응답이 서버 commit 뒤 유실된 상황을 재현했다. 오류 뒤 접수 잠금이 해제될 때까지 기다린 다음 같은 `draftId`와 `quoteId`로 재시도하며, 성공 receipt 전에는 `flow.clear()`를 호출하지 않고 성공 뒤 정확히 한 번 호출한다.
- 실제 로컬 PostgreSQL 18.4의 `paid_action_quote_smoke.sql`은 동일 accepted draft 재호출이 `idempotentReplay=true`를 반환하고 중복 generation·크레딧 처리를 만들지 않음을 transaction rollback smoke로 확인했다.
- 실제 `GenerationFlowProvider`에 민감 portrait sentinel을 주입한 뒤 `clear()`가 원본 data URL, recommendation draft, draft receipt를 모두 비우고 계정별 SecureStore key를 삭제하는지 확인했다. 복구 저장값과 접수 화면 console에는 base64 sentinel이 포함되지 않는다.
- 집중 검증은 `generation-acceptance-retry`, `generation-flow-memory`, `generation-recovery` 3 suites·9/9가 open handle 없이 통과했다. 이는 실제 저속 회선과 iOS/Android 프로세스 메모리·native 로그 캡처를 대체하지 않는다.

## 수용 기준

- 원본 업로드와 accept가 각각 실패·재시도 가능한 독립 상태로 보인다.
- draft receipt가 없거나 만료되면 생성 버튼이 실행되지 않는다.
- `acceptedAt` 이전에는 종료 경고만, 이후에는 종료 가능 안내만 보인다.
- accept 성공 후 앱 원본 base64가 전역 상태에 남지 않는다.
- 401과 403이 같은 “로그인 필요” 오류로 뭉개지지 않는다.
- generation detail은 준비 중 empty state를 정상 결과 없음으로 오해하게 하지 않는다.
- generation detail은 예약만 된 작업을 실제 생성 중으로 표현하지 않고, 서버 실행 여부와 후보 완료 수를 다시 확인할 수 있다.

## 주요 파일

- `my-app/store/useGenerationStore.ts`
- `my-app/lib/generation-owner-state.ts`
- `my-app/lib/uploadImageCache.ts`
- `my-app/components/providers/GenerationAuthBoundary.tsx`
- `my-app/hooks/useGenerate.ts`
- `my-app/hooks/useUpload.ts`
- `my-app/components/upload/UploadArea.tsx`
- `my-app/components/upload/ValidationCheck.tsx`
- `my-app/lib/generation-workflow-local.ts`
- `my-app/app/generate/page.tsx`
- `my-app/app/generate/[id]/page.tsx`
- `my-app/components/workspace/WorkspaceWizard.tsx`
- `my-app/components/generate/GenerationJobProgressCard.tsx`
- `my-app/components/salon/SalonWorkspaceWizard.tsx`
- `apps/hairfit-app/lib/generation-flow.tsx`
- `apps/hairfit-app/lib/generation-recovery.ts`
- `apps/hairfit-app/app/upload.tsx`
- `apps/hairfit-app/app/generate.tsx`
- `apps/hairfit-app/app/generate/[id].tsx`
- `apps/hairfit-app/components/generation/GenerationJobProgressCard.tsx`
- `packages/api-client/src/index.ts`
- `packages/shared/src/generation/upload-validation.ts`

## 롤백·인계

- 클라이언트 UI를 되돌려도 이미 accepted된 generation은 Phase 07A Workflow가 계속 처리한다.
- 구형 prompt route compatibility adapter는 활성 구버전 앱이 사라진 뒤 제거한다.
- Phase 09A에는 `generationId`와 email re-entry 상태를, Phase 13에는 브라우저·실기기 종료 매트릭스를 넘긴다.
