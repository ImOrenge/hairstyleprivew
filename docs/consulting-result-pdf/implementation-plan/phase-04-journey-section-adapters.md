# P4. 전체 여정 섹션 어댑터

> 현재 구현된 ViewModel V1의 14-section 기준선이다. P7은 이를 수정하지 않고 ViewModel V2의 5개 탭·11개 결과 section을 추가한다. P7 구현에서는 [P7 결과 콘텐츠 고도화](./phase-07-result-content-upgrade.md)의 탭/section/omission 규칙과 초기 케어/별도 Aftercare 경계가 우선한다.

## 목표

15개 Scene의 편집 상태를 그대로 출력하지 않고, 서버 권위 원본을 보고서용 읽기 모델로 변환한다. Result는 이를 종합하는 출력 Scene이므로 자기 자신을 중복 섹션으로 만들지 않고, Result snapshot ID·version을 문서 식별과 무결성에 사용한다.

## 공통 인터페이스

```ts
interface ReportSectionAdapterV1<TSource> {
  key: ReportSectionKeyV1;
  supports(profile: ConsultationReportProfileV1): boolean;
  project(source: TSource, context: ReportProjectionContextV1): ConsultationReportSectionV1;
  validate(section: ConsultationReportSectionV1): ReportSectionValidationV1;
}
```

신규 경로:

```text
packages/shared/src/v2/reports/sections/
  identity.ts
  discovery.ts
  photo-quality.ts
  analysis.ts
  personal-color.ts
  direction.ts
  preview-comparison.ts
  decision.ts
  color-studio.ts
  salon-brief.ts
  makeup.ts
  aftercare.ts
  fashion.ts
  integrity.ts
```

어댑터는 DB fetch를 하지 않는다. 서버 서비스가 모든 source를 한 번에 읽고, 어댑터에는 직렬화 가능한 입력만 전달한다.

## 섹션별 mapping

### 00. 문서 식별

원본:

- `ConsultationSessionV2.id/state/version/sessionKind`
- snapshot ID/profile/createdAt

표시:

- report short ID, 상담 시작·갱신 시각, consultation version
- `완료`, `진행 중`, `취소됨` 상태
- profile, locale, 생성 기준

금지:

- Clerk user ID, DB UUID 전체 노출
- entitlement grant ID와 결제 정보

### 01. Discovery 요청 명세

원본:

- goals, currentHair, desiredServices, maintenanceLevel, avoid, notes

필수:

- 목표 1개 이상 또는 current hair 설명

규칙:

- notes는 사용자 입력임을 표시
- 빈 배열은 `입력하지 않음`, 아직 Discovery 미완료면 `not_started`
- salon_handoff에서는 사용자가 비공개로 지정한 note 제외

### 02. Photo·Scan 입력 품질

원본:

- `PhotoQualityV2`
- source transform summary
- usage scopes와 retention policy

표시:

- overall/frontal/lighting/resolution/occlusion/hairline visibility
- blocking/warning message
- retry required 여부

privacy:

- 기본 profile은 원본 사진을 넣지 않고 quality 숫자와 경고만 표시
- face geometry는 `analysis_only` + explicit opt-in에서만 가능
- crop 좌표, 원본 storage path는 외부 보고서에서 제외

### 03. Analysis Evidence

원본:

- face shape primary/secondary/blend/summary
- measurements category, normalized value, confidence, explanation
- hairline confidence
- manual corrections count/revision
- evidence ledger 또는 V2 geometry-derived explanations

표시 행:

`근거 -> 의미 -> 디렉팅 행동 -> 신뢰도 -> 교정됨`

규칙:

- 모델이 낸 설명과 사용자가 교정한 점을 구분
- confidence를 확률처럼 단정하지 않고 low/medium/high 또는 백분율+설명으로 표시
- 의료적 진단·관상 표현 금지
- 최소 근거가 부족하면 `partial`, 분석 자체가 unusable이면 `unavailable`

### 04. Personal Color

원본:

- `PersonalColorEvidenceV2.result`
- quality status/warnings

표시:

- season, undertone, palette hex+이름, confidence
- 피부색 신뢰도 경고

규칙:

- 팔레트는 색 swatch와 텍스트 hex/name을 함께 표시
- 흑백 인쇄에서는 추천 순번과 명칭 유지
- unusable은 결과를 숨기고 재촬영 권고만 표시

### 05. Direction Strategy

원본:

- length, fringe, parting, layerStart, crownVolume, sideVolume, texture, color
- strategy revision/confirmedAt
- linked evidence IDs

표시:

- 8축 명세 표
- 각 축의 근거 문장
- revision과 확정 여부

규칙:

- `confirmedAt=null`이면 `DRAFT` stamp
- 분석 근거 없는 수동 방향은 `사용자 지정`으로 표시
- 새 strategy revision이 선택 snapshot보다 최신이면 decision section을 stale 처리

### 06. Preview·Compare

원본:

- PreviewBoard variants/generation attempts
- axis, reason, status, rejection codes
- shortlist/finalist

표시:

- 최대 9개 후보, 이미지, 축, label, recommendation reason
- shortlist 번호와 finalist 표시
- accepted/failed/pending 상태

규칙:

- profile별 최대 이미지: full 9, salon 3, analysis 0
- 실패 slot은 빈 이미지가 아니라 실패 사유 코드의 사용자 문구 표시
- provider/model/prompt hash는 integrity appendix에만 제한적으로 포함
- signed URL과 storage path는 snapshot에 저장하지 않고 object reference만 저장

### 07. Decision

원본:

- immutable `StyleSelectionSnapshotV2`
- finalist/backup

표시:

- 선택 스타일과 대안
- recommendation reason
- implementation feasibility
- 현재 모발과 차이
- 필요한 서비스와 관리 강도
- limitations/cautions

규칙:

- confirmed snapshot을 우선
- superseded snapshot은 전체 이력 profile이 아니면 제외
- selection의 analysisEvidenceIds가 report source와 불일치하면 `REPORT_SOURCE_INVALID`

### 08. Color Studio

원본:

- `ColorDecisionSnapshot`와 current color revision
- 최종 AI 염색 preview, 구현 조건과 warning

표시:

- 현재색 유지·보류·살롱 검토·확정 상태
- 컬러명, swatch, salon level, technique, bleach policy, maintenance, fade direction
- 최종 이미지와 Personal Color 연결 근거

규칙:

- 현재 selection/color revision과 일치하는 결과만 ready
- 탐색용 low 후보를 최종 컬러로 표시하지 않음
- 얼굴·배경·헤어 형태 변경 품질 경고를 숨기지 않음

### 09. Salon Brief

원본:

- `SalonBriefV2`, audience customer/designer

표시:

- summary, cut, volume/texture, color, styling, cautions
- selection snapshot short ID와 version

규칙:

- `salon_handoff`의 중심 섹션
- raw face 포함 금지
- QR은 PDF 자체 URL이 아니라 만료형 salon share가 이미 발급된 경우에만 포함
- share token 원문을 snapshot JSON과 로그에 저장하지 않음

### 10. Makeup

원본:

- confirmed `MakeupDirectionSnapshot`
- `MakeupRoutine`, `MakeupArtistBrief`

표시:

- 컨텍스트·강도와 7개 모듈의 사용 여부·색상·마감·위치·방향
- 셀프 루틴 시간·순서·실패 방지 팁
- artist brief와 브랜드 비종속 검색 속성

규칙:

- landmark 디버그 좌표와 source photo는 기본 제외
- 미확정 direction은 partial, routine/brief 미생성은 해당 artifact만 unavailable
- 실제 raster makeup 합성 결과로 표현하지 않음

### 11. Fashion

원본:

- `FashionPreviewSetV2`
- selected look, direction, palette, silhouette, neckline, items, shopping keywords

표시:

- hair/personal color 연결 근거
- 선택 룩과 2~3개 shortlist
- 카테고리, 팔레트, 아이템, 검색 키워드

규칙:

- 현재 Color selection과 Personal Color profile provenance 일치를 필수 검증
- mock look을 실제 생성 결과로 표시하지 않음
- styling session 상태가 completed가 아니면 image 제외
- 상표·가격·재고를 snapshot 생성 시 재조회하지 않음

### 12. Actual Service·Aftercare

원본:

- actual service record
- `AftercareProgramV2`

표시:

- 실제 시술과 계획 차이
- today, D+3, W+2, W+6, W+10
- concerns, satisfaction

규칙:

- 실제 시술 전이면 계획을 실제 기록으로 표시하지 않음
- 미체크 checkpoint는 실패가 아니라 예정
- after photo는 raw photo opt-in과 별개 동의 범위를 사용
- 만족도와 우려는 salon_handoff에서 기본 제외 가능

### 13. 고지·무결성

표시:

- 비의료 고지
- raw photo/geometry/민감 note 제외 목록
- source digest short code
- consultation/report/renderer version
- 생성 시각과 만료 시각은 구분

## 완결성 계산

```ts
interface ReportCompletenessV1 {
  ready: number;
  partial: number;
  notStarted: number;
  unavailable: number;
  redacted: number;
  blockingCodes: string[];
}
```

`full_journey`는 현재 Result readiness와 동일하게 Analysis evidence, terminal Personal Color, confirmed Hair, terminal Color decision, Salon Brief, 현재 Color revision과 일치하는 Fashion final selection이 ready여야 생성할 수 있다. Makeup은 선택적이며 unavailable/partial로 표시할 수 있다. Aftercare는 not_started여도 PDF 생성 가능하다. `salon_handoff`는 confirmed selection과 SalonBrief가 모두 ready여야 한다.

## 테스트 matrix

| fixture | 기대 |
| --- | --- |
| analysis complete, no decision | full_journey 생성 차단 |
| decision complete, fashion 미확정 | full_journey 생성 차단, Fashion 복구 링크 |
| result ready, aftercare 미시작 | full_journey ready, Aftercare not_started |
| salon brief, raw photo opt-out | salon_handoff ready, raw photo redacted |
| personal color unusable | color unavailable, direction 유지 가능 |
| strategy revision newer than selection | decision stale/partial, 재확정 안내 |
| 3 failed preview slots | 6 accepted + 3 failure rows |
| actual service absent | 계획과 실제 시술 혼동 없음 |

## 검증

```powershell
node --test packages/shared/src/v2/reports/sections/*.test.ts
npm --prefix my-app run consultation-report:contract:test
npm run typecheck
git diff --check
```

## 롤백

각 adapter는 registry flag로 개별 비활성화할 수 있다. 비활성 adapter는 section을 삭제하지 않고 `unavailable/SECTION_ADAPTER_DISABLED`로 투영한다. 이미 생성한 snapshot은 변경하지 않는다.

## Exit Gate

- [ ] 14개 report section adapter와 fixture test 통과
- [ ] profile별 include/exclude 정책 통과
- [ ] stale revision·source ID 불일치 검출
- [ ] mock/pending/failed 결과의 오표시 없음
- [ ] 실제 시술과 계획 데이터가 분리됨
