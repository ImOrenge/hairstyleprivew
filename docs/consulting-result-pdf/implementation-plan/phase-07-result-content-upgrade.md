# P7. 고객 결과 중심 리포트 고도화 구현안

- 작성일: 2026-08-16
- 상태: implementation-ready
- 선행 구현: `ConsultationReportViewModelV1`, 세로형 Result, HTML print, PDF export
- 기준 인터뷰: 고객+디자이너 공용, 5개 탭·11개 결과 섹션, 일반 섹션의 실제 적용 방법 제외
- 구현 대상: `feat/2026-08-12-discovery-scroll`의 Result/PDF 코드
- 비대상: 원격 migration 적용, 배포, 실인증, canary, 실기기 검증

## 1. 목표

현재 Report V1의 `요청 명세`, `입력 품질`, 문서 식별 같은 여정·시스템 중심 섹션을 본문에서 제거하고, 고객이 상담을 통해 얻은 결과를 이해하고 디자이너가 같은 문서에서 근거와 시술 명세를 확인할 수 있는 결과 중심 리포트로 전환한다.

화면과 PDF는 동일한 `ConsultationReportViewModelV2`를 사용한다. 화면은 현재 상담 상태를 읽는 최신 projection이고 PDF는 생성 시점의 불변 snapshot이다.

화면은 `헤어 → 염색 → 메이크업 → 패션 → 최종` 탭으로 결과를 탐색한다. 리포트에 포함되는 관리는 확정 결과를 전제로 한 초기 케어 안내까지만이며, 실제 시술 이후의 장기 관리는 별도 Aftercare 프로그램으로 진행한다.

## 2. 확정 제품 결정

### 독자

- 1차 독자: 고객
- 2차 독자: 살롱 디자이너
- 고객 요약과 전문가 근거를 한 문서에서 계층적으로 제공한다.
- Salon Brief의 전문 명세는 화면에서 disclosure로 접을 수 있지만 PDF와 인쇄에서는 항상 펼친다.

### 삭제 대상

다음 내용은 Report 본문 section을 만들지 않는다.

- Discovery 요청 명세와 인터뷰 응답
- 업로드·촬영·입력 품질
- 분석·생성 task 상태, polling, queue, 내부 ID
- 별도 문서 식별 section
- `not_started` 빈 section
- Makeup landmark, zone ID, 좌표, 기술 parameter, 조정 panel
- 원본 얼굴 사진과 원본 After 사진
- 실제 시술 기록, Aftercare 프로그램 진행률, 알림 발송 상태, 관찰·만족도 기록

상담 ID, report ID, 상담/결과/view-model/renderer version, 생성·갱신 시각, integrity digest는 compact header와 footer metadata로만 제공한다.

### 공통 내용 구조

각 결과 section은 가능한 항목만 다음 순서로 렌더한다.

1. 한 줄 결론
2. 핵심 결과
3. AI 판단 근거
4. 고객에게 미치는 효과
5. 피해야 할 선택
6. 불확실성·주의사항
7. 원본 Scene 상세 링크

일반 section에 `실제 적용 방법` 블록을 만들지 않는다. `initial-care`만 시술 직후 안전을 위한 짧은 checklist를 제공한다.

### 탭 정보 구조

화면 탭 순서는 고정한다. `/result` 최초 진입은 전체 결론을 먼저 이해할 수 있도록 `final`을 활성화하고, 사용자가 탭을 선택하면 `?tab=hair|color|makeup|fashion|final`로 주소화한다. 새로고침·뒤로가기로 선택 탭이 보존되어야 한다.

| 탭 | section 순서 | 목적 |
| --- | --- | --- |
| `hair` / 헤어 | `face-hair-analysis` → `hair-direction` → `candidate-comparison` → `final-hair` | 분석부터 최종 헤어 확정까지 추적 |
| `color` / 염색 | `personal-color` → `final-color` | 퍼스널 컬러 근거와 확정 염색 결과 연결 |
| `makeup` / 메이크업 | `makeup-result` | 확정 메이크업 결과와 색상 조화 확인 |
| `fashion` / 패션 | `fashion-result` | 확정 룩과 대안 비교 |
| `final` / 최종 | `executive-summary` → `salon-specification` → `initial-care` | 전체 결론, 살롱 전달 명세, 초기 케어 확인 |

탭은 section을 중복 소유하지 않는다. 탭 badge는 section 수나 준비 여부만 표현하고 내부 task 상태를 노출하지 않는다. `partial` 또는 `unavailable` section도 해당 탭 안에서 이유를 설명하며, 빈 탭은 숨긴다. 단, `final`은 항상 노출하고 종합 결론을 만들 근거가 부족하면 `partial`로 표시한다.

PDF·인쇄물에는 interactive tab을 렌더하지 않는다. 대신 `헤어`, `염색`, `메이크업`, `패션`, `최종`을 group heading으로 출력하고 각 group 안에서 위 section 순서를 유지한다.

## 3. V1 대비 변경

| V1 section | V2 처리 |
| --- | --- |
| `identity` | 삭제하고 header/footer metadata로 이동 |
| `request` | 삭제 |
| `input-quality` | 삭제 |
| `analysis` | 얼굴·모발 분석으로 확대 |
| `personal-color` | 12타입·4축·신뢰도·5개 팔레트 군으로 확대 |
| `direction` | 8축 blueprint와 명세표로 확대 |
| `preview-comparison` | 최종·차선·대안 3개 비교로 축소·고도화 |
| `decision` | `final-hair`로 전환 |
| `color-studio` | `final-color`로 독립 유지 |
| `salon-brief` | 고객 요약+전문 disclosure로 확대 |
| `makeup` | 최종 mood image+7 module color board로 확대 |
| `fashion` | 최종 1개+대안 2개로 확대 |
| `aftercare` | 리포트에서는 제거하고 `initial-care`로 축소; 실제 시술 이후는 별도 Aftercare 프로그램으로 이관 |
| `integrity` | 삭제하고 footer metadata·고지로 이동 |
| 없음 | `executive-summary` 신설 |

V2의 본문 section 수는 정확히 11개다.

## 4. ViewModel V2 계약

V1 snapshot과 이미 생성된 PDF를 변경하지 않는다. 동일한 schema version에서 section key와 의미를 바꾸지 않고 새 계약을 추가한다.

```ts
type ReportSectionStatusV2 = "ready" | "partial" | "unavailable" | "redacted";

interface ConsultationReportViewModelV2 {
  schemaVersion: "consultation-report-view-model-v2";
  reportId: string;
  consultationId: string;
  consultationVersion: number;
  resultVersion: number;
  viewModelVersion: 2;
  rendererVersion: string;
  profile: "full_journey" | "salon_handoff";
  generatedAt: string;
  refreshedAt: string;
  sourceFingerprint: string;
  integrityCode: string;
  rawPhotoIncluded: false;
  afterPhotoIncluded: false;
  metadata: ReportMetadataV2;
  defaultTab: "final";
  tabs: ResultReportTabV2[];
}
```

```ts
type ResultReportTabKeyV2 = "hair" | "color" | "makeup" | "fashion" | "final";

interface ResultReportTabV2 {
  key: ResultReportTabKeyV2;
  label: string;
  sections: ResultReportSectionV2[];
}
```

### section union

```ts
type ResultReportSectionV2 =
  | ExecutiveSummarySectionV2
  | FaceHairAnalysisSectionV2
  | PersonalColorSectionV2
  | HairDirectionSectionV2
  | CandidateComparisonSectionV2
  | FinalHairSectionV2
  | FinalColorSectionV2
  | SalonSpecificationSectionV2
  | MakeupResultSectionV2
  | FashionResultSectionV2
  | InitialCareSectionV2;
```

공통 `fields[]`에 모든 결과를 평탄화하지 않는다. 차트, 팔레트, 후보 비교, 전문 명세, timeline을 타입별 payload로 표현한다. HTML/PDF renderer는 동일 union을 exhaustive switch로 처리하고 미지원 key에서 build/test가 실패하게 한다.

### 상태 노출 규칙

V2 public type에는 `not_started`를 두지 않는다. projector가 source 상태를 보고 section 자체를 생략하고 section이 하나도 없는 선택 탭도 생략한다. `final` 탭과 `executive-summary`는 항상 존재하며, 근거 부족은 `partial` 상태와 누락 사유로 표현한다. `initial-care`는 확정 Hair 또는 Color 결과를 근거로 생성할 수 있을 때만 포함한다.

- `ready`: 필수 결과와 provenance가 모두 있음
- `partial`: 확인된 결과만 표시할 수 있고 누락 설명이 있음
- `unavailable`: 결과를 단정하지 않으며 제외 이유가 있음
- `redacted`: privacy 정책으로 값이나 이미지를 의도적으로 제외

## 5. 5개 탭·11개 section 상세 계약

아래 접두사는 화면 소유 탭을 뜻한다. 문서에 적힌 계약 설명 순서와 무관하게 실제 화면·PDF 배치는 2장의 탭 정보 구조를 따른다.

### Final-01. `executive-summary`

필수 payload:

- 확정 Hair+Color 대표 이미지
- AI consultant 한 문장 총평
- Hair, Color, Makeup, Fashion 최종 선택 요약
- 전체 조화 근거 최대 3개
- 변화 강도, 관리 난이도, 살롱 시술 필요 여부
- 핵심 주의사항 최대 3개

금지:

- 근거 없는 종합점수·적합도·순위
- 아직 확정되지 않은 선택을 확정으로 표현

대표 이미지는 확정 컬러 이미지, 확정 헤어 이미지 순으로 fallback한다. 원본 얼굴 사진으로 fallback하지 않는다.

### Hair-01. `face-hair-analysis`

필수 payload:

- 한국형 두상 기준 face shape posterior 전체 합 100%
- 1순위·2순위 얼굴형과 혼합 비율
- 상·중·하안부 비율, 좌우 균형
- 이마·헤어라인·광대·턱선 관찰 결과
- 모량·모발 굵기·질감·손상도
- 최종 Hair 결정에 영향을 준 특징 3~5개
- AI confidence와 확인 불가 항목
- 분석→Hair 결정 evidence links

시각 요소:

- 얼굴형 donut/pie chart
- 원본 사진을 사용하지 않는 추상 얼굴형 diagram
- 모발 상태 summary cards

계약상 posterior가 없으면 임의 비율을 만들지 않는다. 기존 단일 `faceShape`만 있으면 section은 `partial`이고 “분포 근거 없음”을 표시한다.

### Color-01. `personal-color`

필수 payload:

- 12타입 1순위·2순위와 blend
- temperature/value/chroma/contrast 4축
- capture reliability와 diagnosis confidence 분리
- best, neutral, accent, caution, metal palette
- Hair Color, Makeup, Fashion 연결 요약
- 피해야 할 색과 이유
- unavailable axis와 재확인 필요 여부

시각 요소:

- 4축 chart
- 중복 없는 palette chip
- Hair/Makeup/Fashion consumer badge

색상 chip에는 HEX와 사용자용 이름을 함께 표시한다. 색상만으로 의미를 전달하지 않는다.

### Hair-02. `hair-direction`

필수 payload:

- 한 문장 design concept
- length, fringe, parting, layer summary
- crown/side volume, texture, color direction
- 현재 모발 대비 변화
- 분석 evidence와 연결된 선택 근거
- 고객 인상 효과
- 유지 난이도와 예상 salon cycle
- 허용 서비스와 필요한 서비스 차이
- 피해야 할 형태
- AI 추천값과 고객 수정값 provenance

시각 요소:

- 얼굴형 diagram 주변 8축 Hair Blueprint
- 동일 값을 가진 명세표

Blueprint와 명세표는 같은 payload를 사용하며 별도 계산하지 않는다.

### Hair-03. `candidate-comparison`

본문에는 다음 3개만 포함한다.

- winner
- runner-up
- alternative

후보별 payload:

- 이미지, 이름, concept
- 얼굴 균형, 목표 부합, 관리 부담
- 모발 적합성, 시술 가능성, 손상 위험
- 변화 강도, Personal Color 호환성
- Makeup/Fashion 확장성
- 강점, 주의, 비교 우위
- winner 선택 이유와 나머지 미선택 이유

전체 9개 accepted 후보는 Preview/Compare 상세 Scene에만 표시한다. 생성 실패·품질 미달 후보는 본문 3개에 포함하지 않는다. 수치 점수는 권위 원본이 없으면 생성하지 않는다.

### Hair-04. `final-hair`

필수 payload:

- 확정 Hair 대형 이미지
- Hair 이름과 concept
- 커트 구조, silhouette
- fringe, parting, crown/side volume
- texture, weight
- 현재 모발과 차이
- 선택 근거와 고객 인상 효과
- feasibility, 필요한 서비스, 관리 부담
- limitations와 생성 이미지 고지

`SelectedStyleSnapshot`과 selection provenance가 없으면 `ready`가 될 수 없다.

### Color-02. `final-color`

필수 payload:

- 확정 Color 대형 이미지
- 색상명, HEX, target level
- temperature, saturation, technique
- bleach policy, root depth/gradation
- fade direction
- Personal Color와 Final Hair 연결 근거
- 유지 난이도, 손상 위험, salon 재확인 항목

`keep-current`, `deferred`, `salon-review`도 정상 결과로 표현하되 생성 이미지를 요구하지 않는다. `confirmed`만 최종 Color 이미지를 요구한다.

### Final-02. `salon-specification`

두 계층을 가진다.

1. 고객용 요약
2. 디자이너 전문 명세 disclosure

전문 명세 payload:

- 디자이너에게 전달할 한 문장 목표
- 전체 silhouette와 weight center
- 전면·측면·후면 커트 구조
- fringe 길이·연결, parting 위치·방향
- crown/side volume 목표
- 모량 제거·질감 처리 기준
- 필요한 서비스와 권장 순서
- 현재 모발 구현 가능 범위
- 손상·곱슬·모량 주의사항
- Color level·technique·bleach 판단 기준
- 시술 전 재확인 질문
- 피해야 할 시술 결과
- Hair/Color snapshot ID와 brief version

명시적 제외:

- 레이어 시작점·끝선
- 변경 가능·금지 요소
- 근거 없는 길이·각도·약제 수치

화면 disclosure state는 client-only이며 snapshot과 PDF 결과를 변경하지 않는다.

### Makeup-01. `makeup-result`

필수 payload:

- 최종 Makeup mood image
- 전체 concept와 Personal Color/Hair 연결 근거
- base, brow, eyeshadow, eyeliner, blush, lip, lashes 7 modules
- module별 color name, HEX, texture, finish, intensity, effect
- 전체 color harmony
- 피해야 할 색상·질감
- routine·artist brief readiness
- 사용자 presentation direction provenance

시각 요소:

- mood image
- 중복되지 않는 7 module color board

금지:

- landmark, zone ID, 좌표, technical parameters
- interactive adjustment panel
- 성별을 이유로 module 삭제

### Fashion-01. `fashion-result`

필수 payload:

- final look 1개 대형 이미지
- alternative 2개 thumbnail
- 이름, concept, situation, season
- genre, silhouette, fit
- top/bottom/outer 구성, material, texture
- neckline과 Hair 관계
- main/sub/accent palette
- Hair/Color/Makeup 연결 근거
- accessory, shoes
- 피해야 할 색상·fit·combination
- shopping keywords
- Fashion interview constraint 반영 여부
- batch와 final selection version

대안은 completed·quality accepted 후보에서만 선택한다. 최종 선택과 같은 이미지나 동일 look ID를 중복 표시하지 않는다.

### Final-03. `initial-care`

리포트의 관리 section은 확정 Hair·Color와 Salon Specification을 근거로 한 `초기 케어 안내`다. 실제 시술 이력이나 장기 추적 상태를 투영하지 않는다.

필수 payload:

- 적용 기준: 확정 Hair, 확정 Color, 예상 서비스
- 시술 직후 24시간 핵심 주의사항
- 첫 세정 시점과 첫 3일 세정·건조 원칙
- 첫 7일 열기구·마찰·묶음·수영·사우나 주의
- 염색 고객의 초기 색 빠짐·이염 주의
- 펌·볼륨 고객의 초기 컬·볼륨 유지 주의
- 두피 자극·알레르기·과도한 손상 시 상담이 필요한 징후
- 권장·비권장 제품 유형
- 최대 7개 초기 케어 checklist
- 근거 source ID와 생성 시점

표현 규칙:

- 확정 Color가 `keep-current`이면 염색 전용 항목을 생략한다.
- 서비스가 확정되지 않은 항목은 단정하지 않고 조건부 문구로 표시한다.
- 리포트가 갱신되더라도 실제 시술 이후의 수행 여부나 관찰 결과를 합치지 않는다.
- PDF에는 알림 활성화 CTA나 프로그램 진행률을 넣지 않는다.

금지 payload:

- actual service/treatment record
- D+1·D+3·D+7 이후의 장기 발송 일정과 delivery 상태
- concern, satisfaction, check-in response, after photo
- Aftercare program ID, request ID, queue/retry/provider 상태

### 리포트 밖 Aftercare 프로그램 경계

Aftercare 프로그램은 실제 시술 저장 이후 별도 lifecycle로 시작한다.

```text
Confirmed Result
  └─ Salon Treatment Record 생성
       └─ Aftercare Program 생성/재사용
            ├─ 일정·알림
            ├─ 관찰·체크인
            ├─ 만족도·우려 기록
            └─ 필요 시 전문가 후속 상담
```

- 권위 단위는 상담 리포트가 아니라 실제 `treatment record`다.
- 하나의 확정 결과에서 여러 실제 시술과 Aftercare 프로그램이 파생될 수 있다.
- 리포트 snapshot/PDF는 프로그램 진행에 따라 변경하지 않는다.
- 화면의 `final` 탭은 실제 시술이 등록된 경우에만 별도 프로그램 진입 링크를 제공할 수 있다. 링크와 eligibility만 화면 UI에 두고 PDF 본문에는 넣지 않는다.
- Aftercare 프로그램의 idempotency, 알림, durable execution, retention은 Aftercare 전용 계획과 계약을 따른다.

화면 전용 handoff 계약은 Report ViewModel 밖에 둔다.

```ts
interface AftercareProgramEntryState {
  eligible: boolean;
  treatmentRecordId?: string;
  programId?: string;
  href?: string; // /aftercare/programs/{programId}
  reason?: "treatment_required" | "program_ready" | "program_unavailable";
}
```

- `eligible=false`이면 Final 탭의 초기 케어만 표시하고 프로그램 CTA를 숨긴다.
- 실제 treatment record가 있으면 `POST /api/v2/treatments/{treatmentId}/aftercare-programs`로 프로그램을 생성하거나 같은 request ID의 기존 프로그램을 재사용한다.
- program 생성·조회 응답은 `ConsultationReportViewModelV2`, report snapshot, digest, PDF renderer 입력에 합치지 않는다.
- 기존 상담 Aftercare 주소가 필요하면 신규 program 주소로 영구 redirect하거나 entry shell로만 사용하며, 리포트 안에 장기 관리 UI를 다시 넣지 않는다.

## 6. 데이터 원본과 provenance

| section | 권위 원본 |
| --- | --- |
| executive-summary | Result snapshot + confirmed Hair/Color/Makeup/Fashion |
| face-hair-analysis | AnalysisEvidence V2 + face observation/measurement + discovery current hair |
| personal-color | PersonalColorEvidence/Profile V2 |
| hair-direction | confirmed StrategySnapshot + recommendation evidence |
| candidate-comparison | accepted previews + shortlist/finalist + selection snapshot |
| final-hair | immutable StyleSelectionSnapshot V2 |
| final-color | immutable ColorSelectionSnapshot V2 |
| salon-specification | SalonBriefVersion V2 + Hair/Color source IDs |
| makeup-result | MakeupDirection + routine + artist brief + approved mood image |
| fashion-result | FashionPreviewSet/Batch + immutable selected look |
| initial-care | confirmed Hair/Color + SalonBriefVersion V2 + initial-care ruleset |

`ActualService`, `AftercareProgram V2`, 알림·관찰·만족도 데이터는 Report projector의 source가 아니다. 별도 Aftercare 프로그램 화면과 API만 이를 읽는다.

projector는 표시 문자열을 근거 없이 재생성하지 않는다. 원본에 값이 없으면 `partial/unavailable`과 omission reason을 사용한다. LLM으로 결과를 다시 요약하여 의미를 바꾸지 않는다.

## 7. 저장·버전·stale 계약

기존 `consultation_report_snapshots_v2`의 unique key는 같은 상담/결과 version에서 V1과 V2를 동시에 저장하지 못한다. additive migration으로 다음을 추가한다.

```sql
alter table public.consultation_report_snapshots_v2
  add column if not exists view_model_version integer not null default 1,
  add column if not exists renderer_version text not null default 'report-pdf-v1';

-- 기존 unique constraint를 version-aware unique index로 교체
create unique index ... on consultation_report_snapshots_v2 (
  consultation_id,
  consultation_version,
  result_version,
  profile,
  view_model_version,
  renderer_version
);
```

원칙:

- V1 row와 PDF는 수정·삭제하지 않는다.
- V2 snapshot은 `view_model_version=2`로 새로 생성한다.
- 화면은 현재 source를 매 요청 projection한다.
- PDF는 선택한 V2 snapshot을 렌더한다.
- 현재 source fingerprint와 PDF snapshot fingerprint가 다르면 `outdated`로 표시한다.
- 기존 PDF를 덮어쓰지 않고 새 snapshot/export를 생성한다.
- digest는 canonical V2 payload와 renderer version을 포함한다.

## 8. UI 구조

```text
ResultWorkbench
└─ ConsultationReportV2
   ├─ ReportMetadataHeader
   ├─ ReportTabList
   │  ├─ HairTab
   │  │  ├─ FaceHairAnalysisSection
   │  │  ├─ HairDirectionBlueprintSection
   │  │  ├─ CandidateComparisonSection
   │  │  └─ FinalHairSection
   │  ├─ ColorTab
   │  │  ├─ PersonalColorSection
   │  │  └─ FinalColorSection
   │  ├─ MakeupTab
   │  │  └─ MakeupResultSection
   │  ├─ FashionTab
   │  │  └─ FashionResultSection
   │  └─ FinalTab
   │     ├─ ExecutiveSummarySection
   │     ├─ SalonSpecificationSection
   │     └─ InitialCareSection
   └─ ReportNoticeFooter
```

### 화면 규칙

- Result는 split canvas로 돌아가지 않는다.
- 탭 panel마다 하나의 세로 문서 스크롤만 사용하고 중첩 스크롤을 만들지 않는다.
- title 영역은 compact를 유지한다.
- tablist는 sticky로 유지하되 본문 높이를 과도하게 줄이지 않는다.
- 최초 진입은 `final`, 탭 UI 순서는 `hair → color → makeup → fashion → final`이다.
- 탭 변경은 query string과 동기화하고 키보드 방향키·Home·End를 지원한다.
- section은 기본적으로 펼쳐 표시하되 모바일 장문 section은 접을 수 있다.
- executive summary, final Hair, final Color는 접을 수 없다.
- section 내부 debug data와 raw JSON을 표시하지 않는다.
- 상세 링크는 canonical Scene으로 이동한다.

### print/PDF 규칙

- disclosure를 모두 펼친다.
- interactive toolbar와 상세 링크를 숨긴다.
- chart, color chip, text label을 함께 렌더한다.
- 다섯 탭을 고정 순서의 print group heading으로 변환한다.
- Final Hair와 Final Color는 각각 독립 page-break group이다.
- 후보 3개와 Fashion 3개 이미지는 card 단위로 분할한다.
- section heading만 페이지 하단에 고립되지 않게 한다.

## 9. 구현 파일 지도

### Shared contract/projector

- `packages/shared/src/consulting/report-v2.ts`
- `packages/shared/src/consulting/report-v2.test.ts`
- `packages/shared/src/index.ts`
- `packages/shared/package.json`

V1 `report.ts`는 호환용으로 유지한다.

### Server hydration·snapshot

- `my-app/lib/consulting/report-v2-server.ts`
- `my-app/lib/consulting/report-export-server.ts`
- `my-app/lib/consulting/server-store.ts` 또는 별도 report query adapter
- `my-app/app/api/v2/consultations/[consultationId]/report-exports/route.ts`
- `my-app/app/api/v2/consultations/[consultationId]/report-exports/[exportId]/route.ts`

### Web renderer

- `my-app/components/consulting/report/ReportReceiptV2.tsx`
- `my-app/components/consulting/report/ReportTabsV2.tsx`
- `my-app/components/consulting/report/ReportSectionShell.tsx`
- `my-app/components/consulting/report/ReportMetadataHeader.tsx`
- `my-app/components/consulting/report/ReportToolbar.tsx`
- `my-app/components/consulting/report/InitialCareSectionV2.tsx`
- `my-app/components/consulting/aftercare/AftercareProgramEntryCard.tsx` (화면 전용, report section 아님)
- `my-app/components/consulting/workbenches/ResultWorkbench.tsx`
- `my-app/app/globals.css`

### Aftercare handoff

- `my-app/lib/consulting/aftercare-entry-server.ts`
- `my-app/app/api/v2/treatments/[treatmentId]/aftercare-programs/route.ts`
- `my-app/app/aftercare/programs/[programId]/page.tsx`

이 경로들은 Result/PDF projector가 아니라 실제 시술 이후 Aftercare 프로그램 lifecycle에 속한다. P7에서는 경계와 entry state까지만 연결하고 프로그램 내부 실행은 Aftercare 전용 구현 Phase가 소유한다.

### PDF renderer

- `my-app/lib/consulting/render-report-pdf-v2.tsx`
- `my-app/lib/consulting/report-pdf-v2.test.ts`

### Migration

- `supabase/migrations/20260817xxxxxx_consultation_report_v2_versions.sql`
- `my-app/supabase/migrations/20260817xxxxxx_consultation_report_v2_versions.sql`

## 10. 실행 Phase

### P7-0. 기준선·fixture 동결

- 현재 V1 HTML/PDF fixture와 API response 보존
- 11개 section fixture 정의
- full, partial, unavailable, initial-care 준비
- face posterior·Personal Color·Makeup·Fashion richer source 가용성 확인

종료조건:

- fixture에 실제 사용자 데이터 없음
- 11개 section의 required/optional/source 필드가 확정됨
- V1 호환 fixture가 유지됨

### P7-1. ViewModel V2와 projector

- discriminated union 구현
- V1 section을 단순 rename하지 않고 V2 source adapter 작성
- `not_started` section omission
- 5개 tab grouping·default final·empty tab omission 구현
- metadata/footer projection 분리

종료조건:

- tab key와 순서가 정확히 5개이며 section 소유권·순서가 고정됨
- 전체 section key 수가 정확히 11개
- request/input-quality/identity/integrity 본문 key가 없음
- raw/after photo included가 항상 false
- full/partial/unavailable fixture 통과

### P7-2. Rich source hydration

- face posterior와 facial proportions 연결
- Personal Color 12타입·4축·palette 연결
- Hair Blueprint provenance 연결
- Salon Brief 전문 항목 연결
- Makeup mood/module와 Fashion alternatives 연결
- confirmed Hair/Color와 Salon Brief 기반 initial-care ruleset 연결
- ActualService/AftercareProgram이 Report source에서 제외됐는지 계약 검증

종료조건:

- 화면용 문구를 빈 값을 메우기 위해 발명하지 않음
- source ID/revision mismatch는 partial 또는 conflict
- old Color revision의 Fashion을 current 결과로 표시하지 않음

### P7-3. Web Result UI

- 5개 tab·11개 전용 section component
- face shape pie, 4축 chart, Hair Blueprint
- 후보 3개 comparison
- Final Hair/Color 분리
- Salon professional disclosure
- Makeup 7-module board, Fashion final+2 alternatives
- Final 탭의 summary·salon specification·initial care 구성
- responsive collapse와 print expansion

종료조건:

- customer-request journey 요소 0개
- 내부 task/debug data 0개
- 중복 section ownership 0개, tab query/keyboard 접근성 통과
- 320/375/768/1280 px 가로 overflow 0
- heading/definition/disclosure 접근성 통과

### P7-4. PDF V2·snapshot coexistence

- migration mirror 작성
- V2 snapshot/export idempotency key에 version 포함
- V2 PDF exhaustive renderer
- outdated detection과 새 PDF CTA
- V1 PDF 다운로드 호환 유지

종료조건:

- V1과 V2가 같은 consultation/result version에서 공존
- `%PDF-`, EOF, glyph, digest 검증
- 화면과 PDF section/value parity
- raw photo, signed URL, storage path가 PDF text에 없음

### P7-5. 회귀·시각 검증

- component/contract/PDF tests
- browser runtime DOM과 print media
- PDF PNG visual QA
- authenticated owner/cross-user/expiry는 staging 증거로 분리

종료조건:

- 관련 lint/typecheck/build 통과
- migration mirror 통과
- Result split marker 없음
- 11개 section ready fixture visual 승인
- 미실행 remote/staging/production 증거를 통과로 표현하지 않음

## 11. Acceptance Matrix

| ID | 조건 | 기대 |
| --- | --- | --- |
| R2-01 | ready full report | 화면 5개 탭·본문 section 11개, 확정 소유권과 순서 유지 |
| R2-02 | Result 진입 | 요청 명세·입력 품질·task 상태 없음 |
| R2-03 | face posterior 있음 | 한국형 두상 pie 합계 100%, top 2 표시 |
| R2-04 | posterior 없음 | 임의 비율 없이 partial 고지 |
| R2-05 | Personal Color ready | 12타입·4축·5 palette 군과 소비처 연결 |
| R2-06 | Hair Direction | Blueprint와 명세표 값 동일 |
| R2-07 | accepted 후보 9개 | 본문은 winner/runner-up/alternative 3개만 표시 |
| R2-08 | Color keep-current | 생성 이미지 없이 정상 결과 표시 |
| R2-09 | Salon Brief | 제외 필드 4종과 근거 없는 수치 없음 |
| R2-10 | Makeup | 7 module board, landmark/debug panel 없음 |
| R2-11 | Fashion | final 1+서로 다른 alternative 2 |
| R2-12 | 확정 Hair/Color 있음 | Final 탭에 근거 기반 초기 케어와 최대 7개 checklist 표시 |
| R2-13 | 실제 시술 저장 | 리포트/PDF 불변, 별도 Aftercare 프로그램만 생성·갱신 |
| R2-14 | optional not started | section 자체가 없음 |
| R2-15 | source unavailable | 확정 단정 없이 이유 표시 |
| R2-16 | print/PDF | disclosure 전체 펼침, toolbar/link 숨김 |
| R2-17 | PDF 생성 후 source 변경 | outdated 표시와 새 version 생성 CTA |
| R2-18 | V1 export ID | 기존 PDF 조회·다운로드 유지 |

## 12. 검증 명령

구현 후 저장소의 실제 script 이름을 확인하고 다음 범위를 실행한다.

```powershell
npm --workspace @hairfit/shared run typecheck
npm --workspace my-app run typecheck
npm --workspace my-app run consultation-report:contract:test
npm --workspace my-app run supabase:migrations:mirror:check
npm --workspace my-app run build
```

추가 자동화:

- `report-v2.test.ts`: 11 section order, omission, source mapping
- `report-layout-v2-contract.test.ts`: 5 tab order/ownership/query, 삭제된 key/marker와 disclosure/print 계약
- `report-pdf-v2.test.ts`: actual PDF, Korean glyph, section parity
- `report-v2-export-contract.test.ts`: V1/V2 coexistence, idempotency, stale, ownership
- `tests/web-e2e/consultation-report-v2.spec.ts`: 4 viewport와 detail links

## 13. 롤백

- `CONSULTATION_REPORT_CONTENT_V2_ENABLED=false`
- Result와 신규 export의 기본 projector를 V1로 복귀
- V2 snapshot/export row와 PDF는 삭제하지 않음
- V1 snapshot/export/download 경로 유지
- migration column/index는 additive 상태로 유지
- source consultation, Hair/Color selection, Salon Brief, Makeup, Fashion, Aftercare 프로그램 데이터는 변경하지 않음

## 14. 완료 기준

- [ ] `헤어·염색·메이크업·패션·최종` 5개 탭과 11개 결과 section이 V2 계약으로 구현됨
- [ ] 요청·입력 품질·진행/시스템 section이 본문에서 제거됨
- [ ] Final Hair와 Final Color가 독립 section임
- [ ] Salon Brief 제외 항목 4종이 화면/PDF에 없음
- [ ] 일반 section에 실제 적용 방법 block이 없음
- [ ] Final 탭의 초기 케어에만 최대 7개 checklist가 있음
- [ ] 리포트에 실제 Aftercare 진행률·알림·관찰·만족도 데이터가 없음
- [ ] 실제 시술 이후 Aftercare가 treatment record 기반 별도 프로그램으로만 진행됨
- [ ] `not_started` section과 빈 선택 탭이 숨겨짐
- [ ] 화면 latest/PDF immutable/outdated 정책이 동작함
- [ ] V1 snapshot/PDF 호환이 유지됨
- [ ] 화면·인쇄·PDF가 동일 V2 ViewModel을 사용함
- [ ] 계약·UI·PDF·migration mirror·typecheck·lint·build 검증이 통과함
- [ ] 원격 migration, 실인증, staging, 배포 증거가 로컬 검증과 분리됨
