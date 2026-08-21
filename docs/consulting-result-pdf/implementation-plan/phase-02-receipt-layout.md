# P2. 세로 명세 영수증형 결과 화면

## 목표

컨설팅 결과를 장식적 카드 보드가 아니라 위에서 아래로 읽고 바로 A4로 인쇄할 수 있는 단일 열 명세서로 제공한다. 기존 14개 편집·후속 Scene은 유지하고, 현재 `result` Scene만 좌우 분할 작업대에서 읽기·인쇄·PDF 내보내기 전용 Report로 전환한다.

## Route와 책임

### canonical route

- `my-app/app/consulting/[sessionId]/[stage]/page.tsx`의 `stage=result`
- `my-app/components/consulting/workbenches/ResultWorkbench.tsx`를 `ConsultationReportPage` composition으로 교체
- 선택적으로 `/consulting/[sessionId]/report`는 `/consulting/[sessionId]/result?print=1` redirect만 제공

Query:

- `snapshot={uuid}`: 고정 보고서 조회
- 없으면 최신 snapshot을 조회하되 자동 생성하지 않음
- `profile=full_journey|salon_handoff`: 새 snapshot 생성 dialog의 기본값에만 사용
- `print=1`: 인쇄 준비 모드, 인증·데이터 로드 후 자동 인쇄는 사용자 동작 뒤에만 실행

### 기존 화면 연결

- `DecisionWorkbench`: 최종 선택 후에는 Color Studio·Brief·Makeup·Fashion readiness를 안내하고 아직 Result를 조기 개방하지 않음
- `BriefWorkbench`: `살롱 전달 명세서 보기`
- `FashionWorkbench`: 최종 선택 후 `전체 여정 결과 보기`로 Result 자동 이동
- legacy `/result/[id]`: 연결된 consultationId가 있을 때만 report CTA 표시

기존 `/result/[id]`를 즉시 교체하지 않는다. legacy 결과는 generation 단위, consultation `/result`는 전체 여정 Report다.

## 컴포넌트 구조

```text
my-app/components/consulting/report/
  ConsultationReportPage.tsx
  ReportToolbar.tsx
  ReportReceipt.tsx
  ReportHeader.tsx
  ReportSection.tsx
  ReportDefinitionRows.tsx
  ReportEvidenceTable.tsx
  ReportImageGrid.tsx
  ReportStatusStamp.tsx
  ReportDisclosure.tsx
  ReportFooter.tsx
  report-print.css
```

### 책임 규칙

- `ConsultationReportPage`: 데이터 경계, 생성 dialog, export 상태만 담당
- `ReportReceipt`: 이미 투영된 view model만 렌더; fetch와 mutation 금지
- `ReportSection`: heading, status, page-break hint, empty/redacted 표현 통일
- `ReportImageGrid`: signed URL이 아니라 로드 가능한 presentation URL과 대체 텍스트만 받음
- `ReportToolbar`: print/PDF/profile action; print 영역 밖에 위치

Result에서는 `WorkbenchGrid`, `data-consulting-split-canvas`, 좌우 독립 스크롤을 사용하지 않는다. Scene title은 compact variant를 유지하고 Report 본문은 브라우저 문서 스크롤 하나만 사용한다.

## 화면 레이아웃

```text
┌──────────────────────────────────────────────┐
│ HAIRFIT CONSULTATION SPEC        REPORT #123 │
│ 2026.08.15 · FULL JOURNEY · v12              │
├──────────────────────────────────────────────┤
│ 01 REQUEST                                   │
│ 목표              얼굴 균형 / 낮은 관리     │
│ 현재 모발         ...                        │
│ 피할 항목         ...                        │
├──────────────────────────────────────────────┤
│ 02 INPUT QUALITY                  [PARTIAL]   │
│ 정면 0.94 · 조명 0.82 · 헤어라인 0.76        │
│ ! 좌측 그림자 경고                           │
├──────────────────────────────────────────────┤
│ 03 ANALYSIS EVIDENCE                         │
│ 근거              의미              행동     │
│ 08 COLOR · 09 BRIEF · 10 MAKEUP · 11 FASHION│
│ 12 AFTERCARE STATUS                          │
├──────────────────────────────────────────────┤
│ ...                                          │
├──────────────────────────────────────────────┤
│ 비의료 고지 · 제외 항목 · HASH 4f8a...       │
└──────────────────────────────────────────────┘
```

### 시각 규칙

- 장식용 hero, gradient, blur, shadow 제거
- 섹션 제목은 번호 + 영문 kicker + 한국어 제목 조합
- 값은 오른쪽 카드가 아니라 정의 목록과 표로 정렬
- 상태는 텍스트 stamp와 아이콘을 함께 사용
- 핵심 선택 이미지는 1장 크게, 후보 이미지는 최대 3열
- 인쇄에서 배경색이 사라져도 border와 label로 구조 유지
- 화면에서는 sticky toolbar 허용, 인쇄에서는 완전히 숨김

## CSS 계약

```css
@page {
  size: A4 portrait;
  margin: 12mm;
}

@media print {
  [data-report-toolbar],
  [data-app-shell="header"],
  [data-app-shell="footer"] { display: none !important; }

  [data-report-receipt] {
    width: auto;
    max-width: none;
    margin: 0;
    color: #000;
    background: #fff;
    box-shadow: none;
  }

  [data-report-section] { break-inside: auto; }
  [data-report-keep] { break-inside: avoid; }
  [data-report-page-before] { break-before: page; }
}
```

한 섹션 전체에 무조건 `break-inside: avoid`를 주지 않는다. 긴 분석 표가 한 페이지보다 길면 빈 페이지 또는 잘림이 생기므로, 제목+첫 행만 `data-report-keep`으로 묶고 행 단위 나눔을 허용한다.

## 상태별 UX

| 상태 | 화면 | 인쇄/PDF |
| --- | --- | --- |
| snapshot 없음 | 생성 CTA + profile 설명 | 인쇄 action 비활성 |
| 생성 중 | 진행 dialog, 이탈 가능 | 해당 없음 |
| ready | 명세서 + print/PDF | 전체 출력 |
| partial | 상단 요약과 해당 section stamp | 누락 사유 포함 |
| stale | “상담 v13, 보고서 v12” 안내 + 새 버전 생성 | 기존 보고서는 그대로 출력 |
| failed | 재시도와 안전한 오류 코드 | 실패 화면을 PDF로 만들지 않음 |
| expired export | snapshot은 유지, PDF 다시 만들기 | 기존 URL 사용 불가 |

## 접근성

- 문서 제목은 `h1`, 섹션은 순차 `h2`, 하위 그룹은 `h3`
- 정의 값은 `dl/dt/dd`, 분석 행은 실제 `table` 사용
- 상태 stamp는 색 이외 텍스트 포함
- 후보 선택 여부를 이미지 alt에 넣지 않고 인접 텍스트로 명시
- report toolbar의 상태 갱신은 `aria-live="polite"`
- dialog는 focus trap, Escape, trigger focus return 제공
- 200% zoom과 320 px에서 가로 스크롤 금지
- `prefers-reduced-motion`에서 progress 장식 중지

## Print action

1. 브라우저에서 이미지·폰트 준비 상태 확인
2. 실패 이미지는 placeholder와 이유로 확정
3. `document.fonts.ready` 대기
4. report root에 `data-print-ready=true` 설정
5. 사용자의 버튼 클릭에서 `window.print()` 호출
6. analytics에는 report ID fingerprint와 profile만 기록

이미지 한 장이 끝없이 대기하지 않도록 전체 준비 제한은 5초다. 제한 후에는 `partial media` 상태로 인쇄한다.

## 테스트

### Component

- section status 5종
- 0/1/9개 이미지
- 긴 근거 표 30행
- stale snapshot banner
- raw photo redacted block

### Playwright

- Chromium print media emulation
- 320/375/768/1280 px horizontal overflow 0
- A4와 Letter screenshot
- header/footer/toolbar print hidden
- heading order와 axe serious/critical 0
- 마지막 section과 integrity footer가 잘리지 않음

### 명령

```powershell
npm --prefix my-app run consultation-report:contract:test
npm run web:e2e -- tests/web-e2e/consultation-report.spec.ts
npm run lint
npm run typecheck
npm run build
```

## 롤백

- `CONSULTATION_RECEIPT_LAYOUT_V1_ENABLED=false`
- 신규 route CTA를 숨김
- 현재 15개 Scene과 legacy result route 유지
- 생성된 snapshot은 삭제하지 않음

## Exit Gate

- [ ] A4/Letter 및 4개 viewport visual 승인
- [ ] full/partial/redacted fixture에서 화면 구조 일치
- [ ] 브라우저 인쇄 시 app shell과 toolbar 제외
- [ ] long table과 9-image fixture 페이지 잘림 없음
- [ ] 기존 result·consulting Scene 회귀 없음
- [ ] Result에서 split canvas marker와 개별 pane scroll이 없음
- [ ] Color Studio·Makeup·Fashion 상세 링크가 canonical Scene으로 이동
