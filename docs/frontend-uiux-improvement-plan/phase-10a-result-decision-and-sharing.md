# Phase 10A — 결과 선택·확정·공유 UX

- 상태: 로컬 핵심 구현·production component viewport 완료 — 결과 상태·원본 삭제·공유 범위·행동 계층·터치 비교·오류 재시도, 320/375px 고정 CTA·axe·visual 반영. 승인된 인증 데이터 재진입/실기기와 공개 snapshot 정책은 미완료
- 우선순위: P1
- 변경 게이트: `behavioral`
- 선행 페이즈: Phase 01A, Phase 02A, Phase 07A, Phase 07B, Phase 09A
- 독립 배포: 가능

## 목표

결과 화면에서 사용자가 지금 무엇을 선택했고, 무엇이 최종 확정됐으며, 어떤 행동이 다음 단계인지 분명히 알게 한다. 삭제된 원본을 가짜 이미지로 보여주지 않고 공유 범위도 정확하게 설명한다.

## 포함 범위

- [x] `generated`, `selected`, `confirmed`별 주 CTA 하나
- [x] 선택 가능한 상태와 `selectionLocked` 상태의 문구·배지 통일
- [x] 확정 후 query string·stale store가 다른 variant를 표시하지 못하게 함
- [x] `beforeImage: null`을 허용하고 원본 삭제 안내 표시
- [x] placeholder를 원본 사진으로 설명하지 않음
- [x] 계정 전용 링크면 `내 계정용 링크 복사`로 명확화
- [ ] 공개 공유가 필요하면 만료형 read-only snapshot을 별도 승인 후 구현
- [x] 공유·다운로드·평가·상담지를 `더보기`로 계층화
- [x] 재생성은 비용 확인이 있는 보조 위험 행동으로 표시
- [x] loading, empty, error, partial, completed 상태 분리와 재시도
- [x] touch 가능한 before/after 비교 조작
- [x] 웹·모바일 결과 parity matrix 갱신

## 제외 범위

- Styler 상세 흐름
- 에프터케어 날짜·과금 UI
- 공개 snapshot 정책을 결정하지 않은 상태에서의 공개 링크 발급
- ActionToolbar 파일 구조 분해

## 예상 파일

- `my-app/app/result/[id]/page.tsx`
- `my-app/components/result/ActionToolbar.tsx`
- `my-app/components/result/ComparisonView.tsx`
- `my-app/components/result/VariantSwitcherGrid.tsx`
- `apps/hairfit-app/app/result/[id].tsx`
- `packages/api-client/src/index.ts`

## 수용 기준

- 선택 전·선택 후·확정 후에 주 CTA가 각각 하나다.
- 사용자는 `선택`과 `시술 계획 확정`의 잠금 결과를 구분한다.
- 원본이 없으면 개인정보 보호 삭제 상태를 표시하고 가짜 비교 이미지를 사용하지 않는다.
- 인증이 필요한 링크를 공개 공유처럼 표현하지 않는다.
- 320/375px에서 고정 action이 본문과 OS UI를 가리지 않는다.
- 결과 조회 실패가 정상 빈 결과로 보이지 않고 재시도할 수 있다.

## 검증

```powershell
npm run lint
npm run typecheck
npm run build
# 신규: result state/selection interaction test
# 신규: result web E2E
```

이메일 링크 재진입, 원본 정리 후 재진입, partial result, locked query conflict, touch comparison을 포함한다.

### 2026-07-15 로컬 구현 증거

- 웹 결과 조회 실패를 빈 결과로 삼지 않고 `InlineAlert`와 다시 시도로 분리했다.
- 삭제된 원본에는 외부 placeholder를 넣지 않고 개인정보 보호 정리 상태를 설명한다.
- before/after 비교를 pointer hover 전용에서 range input 기반 touch·keyboard 조작으로 바꿨다.
- 고정 toolbar는 확정/에프터케어 CTA 하나만 전면에 두고 계정 링크 복사·다운로드·평가·상담지·재생성을 더보기로 이동했다.
- 재생성은 이동 전에 최신 10크레딧 Quote 재확인 안내 dialog를 거친다.
- 웹과 Expo 모두 selected/confirmed 잠금 상태는 서버 record를 우선하며, `result-ux:contract:test` 11/11과 7-workspace typecheck가 통과했다.
- 공개 snapshot은 제품 승인 전 발급하지 않는다. 인증된 320/375px, 원본 정리 후 재진입, 실기기 touch는 Phase 12B/13 종료 게이트다.

### 2026-07-18 결과 의사결정 production component E2E

- fail-closed E2E route가 실제 `ComparisonView`, `SelectedVariantCard`, `VariantSwitcherGrid`, `ActionToolbar`를 함께 렌더하며 명시적 build flag가 없으면 `notFound()`로 닫힌다.
- Chromium 4/4에서 range input 방향키 50→51, variant `aria-pressed` 전환, 확정 뒤 다른 variant disabled, 잠금 live/atomic 공지, keyboard `더보기`와 계정 전용 공유 문구를 확인했다.
- 320px light·375px dark에서 고정 작업 영역이 viewport 안에 있고 마지막 결과 카드를 가리지 않으며 horizontal overflow·axe serious/critical 0과 visual baseline을 통과했다.
- 최초 visual 검증에서 320/375px 핵심 CTA가 말줄임되어 의미가 사라지는 결함을 발견했다. 모바일은 아이콘을 숨기고 `패션 추천`, `시술 확정`/`관리 가이드`를 표시하며 screen reader에는 전체 행동 이름을 제공하도록 수정했다.
- 이 증거는 production component와 route fixture 기반이다. 승인된 Clerk 세션의 실제 generation 재진입, 원본 정리 후 서버 데이터, 실제 touch 기기는 계속 외부 게이트다.

## 롤백·인계

- 서버 selection lock은 유지하고 표현 계층만 feature flag로 되돌릴 수 있다.
- Phase 10D와 12B에 결과 상태 fixture와 action hierarchy를 넘긴다.
