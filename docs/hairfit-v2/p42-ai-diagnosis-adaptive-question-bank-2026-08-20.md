# P42 AI 진단 적응형 추가 질문 은행

- 기준일: 2026-08-20
- 상태: P41 하위 권위 문서
- 상위 계약: `p41-consultant-chapter-journey-hair-trait-analysis-architecture-2026-08-20.md`
- 목적: 질문 후보는 충분히 넓게 확보하되, 한 사용자에게는 진단 결과를 바꾸는 최소 질문만 노출한다.
- 구현 페이즈: [P44 Phase 02 — 적응형 AI 진단과 모질 분석](./p44-phase-02-adaptive-ai-diagnosis-hair-trait-2026-08-20.md)
- 비목표: 의료 문진, 탈모·두피 질환 진단, 장문 초기 설문, AI 자유 질문 생성

## 1. 핵심 결정

질문 은행의 크기와 실제 질문 수를 분리한다.

- 등록 질문 은행: 촬영·모발·시술·환경·충돌·전문가 확인을 포함한 50개 이상 후보
- 결과 전 질문: 최대 2개
- 결과와 함께 제공하는 선택 질문: 최대 2개
- 한 analysis run의 실제 질문: 최대 4개
- Hair/Color 설계로 미뤄도 되는 질문은 AI 진단에서 묻지 않는다.
- 사진으로 충분히 관찰된 항목은 다시 묻지 않는다.
- AI는 template ID와 변수를 전달받아 설명 문장만 작성하며 선택지·저장 필드·의료 경계를 바꾸지 못한다.

## 2. 질문 표현 방식

기존 `InterviewQuestionKind`는 유지하고 표시 방식만 확장한다.

```ts
export type DiagnosticQuestionPresentation =
  | "choice_cards"
  | "multi_choice_chips"
  | "visual_choice"
  | "comparison"
  | "timeline"
  | "range_with_labels"
  | "photo_request"
  | "optional_note";

export interface DiagnosticQuestionPresentationV1 {
  templateId: string;
  questionKind: InterviewQuestionKind;
  presentation: DiagnosticQuestionPresentation;
  assetSetId: string | null;
  maxSelections: number | null;
  allowsUnknown: true;
  allowsSalonConfirmation: boolean;
}
```

| 표시 방식 | 용도 | 접근성 대체 |
|---|---|---|
| choice cards | 일반 단일 선택 | native radio와 전체 라벨 |
| multi-choice chips | 복수 시술·제품 이력 | checkbox와 선택 수 안내 |
| visual choice | 컬·볼륨·끝 상태 비교 | 이미지마다 구체적인 대체 텍스트 |
| comparison | 평소와 촬영 당시 상태 비교 | 두 열을 순서형 카드로 제공 |
| timeline | 최근 시술 시점 | 날짜 입력 대신 넓은 기간 선택 |
| range with labels | 건조 시간·손질 지속성 | 숫자만 쓰지 않고 양끝 의미 표시 |
| photo request | 선택적 추가 근거 | 건너뛰기와 unknown 허용 |
| optional note | 구조화 선택으로 표현 불가 | 120자 이하 선택 입력 |

시각 선택지는 실제 모발 유형을 등급화하거나 우열로 표현하지 않는다. 사진 자산은 성별·피부색에 종속되지 않는 모발 부분 예시 또는 중립 일러스트를 사용한다.

## 3. 질문 선택 정책

기능 플래그 `AI_DIAGNOSIS_ADAPTIVE_QUESTION_BANK_ENABLED`가 꺼지면 P41의 기본 16개 템플릿만 사용한다. 은행이 켜져 있어도 각 template은 서버 allow-list 설정으로 개별 비활성화할 수 있어야 하며, 클라이언트가 임의 template ID를 활성화하지 못한다.

### 3.1 세 가지 큐

| 큐 | 의미 | 노출 시점 | 예산 |
|---|---|---|---:|
| A: diagnosis-critical | 결과 왜곡을 막거나 핵심 trait를 확정 | 결과 준비 전 | 최대 2 |
| B: result-refinement | 결과 설명·추천 정확도를 개선 | 부분 결과와 함께 | 최대 2 |
| C: design-deferred | 시술·관리 선택에만 필요 | Hair 또는 Color 탭 | 진단 예산에서 제외 |

### 3.2 후보 제외 규칙

다음 후보는 점수 계산 전에 제거한다.

- 같은 field에 이미 `user`, `saved_profile`, `salon_confirmed` 답변이 있음
- 동일 run에서 answered, unknown, skipped 또는 salon confirmation으로 종결됨
- downstream 도메인이 상담 범위에 없음
- 사진 사전검사 실패라 답변보다 재촬영이 우선함
- 답변이 추천·신뢰도·제약 어느 것도 바꾸지 않음
- 질문이 의료적 판단 또는 보호 속성 추론을 요구함
- 최근 동일 질문에 답했고 source fingerprint가 변하지 않음

### 3.3 선택 점수

```text
score =
  decisionImpact * 0.30
  + uncertaintyReduction * 0.25
  + conflictResolution * 0.15
  + answerability * 0.15
  + urgency * 0.10
  + novelty * 0.05
  - interactionBurden
  - sensitiveDataRisk
```

- `decisionImpact`: Hair/Color 결과가 실제로 달라지는 정도
- `uncertaintyReduction`: 답변으로 confidence를 얼마나 개선할 수 있는지
- `answerability`: 사용자가 도구 없이 답할 수 있는지
- `novelty`: 이미 저장된 정보와 중복되지 않는지
- `sensitiveDataRisk`: 건강·정체성 정보에 가까울수록 감점

점수가 같으면 `capture truth → chemical history → natural behavior → conflict → optional refinement` 순으로 선택한다.

## 4. 촬영·입력 신뢰도 질문

| templateId | 질문 | 선택지 요약 | 큐 | 반영 |
|---|---|---|---|---|
| `capture.filter-retouch.v1` | 이 사진에 필터나 피부 보정을 사용했나요? | 없음 / 색감만 / 피부 보정 / 모름 | A | `captureRetouch` |
| `capture.base-makeup.v1` | 촬영할 때 피부 표현 제품을 사용했나요? | 없음 / 선크림·톤업 / 가벼운 베이스 / 커버 / 모름 | A | `baseMakeup` |
| `capture.light-source.v1` | 얼굴을 비춘 주된 빛은 무엇이었나요? | 자연광 / 흰 조명 / 노란 조명 / 혼합 / 모름 | A | `lightSource` |
| `capture.white-balance.v1` | 사진 색이 평소 피부·모발색과 비슷한가요? | 매우 비슷 / 조금 다름 / 많이 다름 / 모름 | A | `colorFidelityReport` |
| `capture.hair-state.v1` | 촬영 당시 모발에 어떤 손질을 했나요? | 자연 건조 / 드라이 / 열기구 / 제품 / 모름 | A | `captureState` |
| `capture.wetness.v1` | 촬영 당시 모발은 완전히 마른 상태였나요? | 완전 건조 / 약간 젖음 / 젖은 상태 / 모름 | A | `captureWetness` |
| `capture.recent-wash.v1` | 사진 촬영 전 마지막 샴푸 시점은 언제인가요? | 당일 / 하루 전 / 2일 이상 / 모름 | B | `lastWashWindow` |
| `capture.extensions.v1` | 사진에 붙임머리·가발·헤어피스가 포함됐나요? | 없음 / 일부 / 대부분 / 모름 | A | `artificialHairPresence` |
| `capture.color-contact.v1` | 퍼스널 컬러 참고 시 컬러 렌즈를 착용했나요? | 없음 / 착용 / 모름 | B | `colorContactPresent` |
| `capture.additional-view.v1` | 가르마와 정수리 상태를 더 정확히 볼 사진을 추가할까요? | 지금 추가 / 나중에 / 추가하지 않음 | B | optional capture task |

blur, 얼굴·모발 가림, 해상도 부족, 강한 과노출은 질문으로 해결하지 않는다. 시스템이 직접 재촬영 사유와 촬영 가이드를 표시한다.

## 5. 자연 모발 패턴·형태 질문

| templateId | 질문 | 선택지 요약 | 큐 | 반영 |
|---|---|---|---|---|
| `hair.wet-pattern.v1` | 젖었을 때 컬이나 웨이브는 어떻게 변하나요? | 펴짐 / 웨이브 선명 / 컬 강함 / 부위별 차이 / 모름 | A | `wetPattern` |
| `hair.air-dry-pattern.v1` | 제품 없이 자연 건조하면 어떤 형태가 되나요? | 곧게 마름 / 약한 굴곡 / 뚜렷한 웨이브 / 컬 / 불규칙 | A | `airDryPattern` |
| `hair.shrinkage.v1` | 마른 뒤 길이가 젖었을 때보다 얼마나 짧아 보이나요? | 거의 동일 / 조금 / 많이 / 부위별 차이 / 모름 | B | `visualShrinkage` |
| `hair.pattern-distribution.v1` | 컬이나 웨이브가 주로 어디에 있나요? | 전체 / 중간부터 / 끝부분 / 안쪽 / 부위마다 다름 | B | `patternDistribution` |
| `hair.crown-direction.v1` | 정수리 모발은 평소 어느 방향으로 눕나요? | 한 방향 / 두 방향 이상 / 쉽게 뜸 / 잘 모르겠음 | B | `crownGrowthBehavior` |
| `hair.parting-stability.v1` | 가르마를 바꾸면 얼마나 쉽게 유지되나요? | 쉽게 유지 / 금방 원래대로 / 한쪽만 가능 / 모름 | C | `partingStability` |
| `hair.front-growth.v1` | 앞머리·헤어라인에 잘 뜨거나 갈라지는 부분이 있나요? | 없음 / 중앙 / 좌측 / 우측 / 여러 곳 | C | `frontGrowthBehavior` |
| `hair.side-behavior.v1` | 옆머리는 자연 상태에서 어떻게 움직이나요? | 붙음 / 적당함 / 바깥으로 뜸 / 컬이 생김 / 부위별 차이 | C | `sideBehavior` |
| `hair.nape-behavior.v1` | 목선의 모발은 어떤 방향으로 자라나요? | 아래 / 옆 / 위로 뜸 / 소용돌이 / 모름 | C | `napeBehavior` |
| `hair.visual-pattern-choice.v1` | 평소 자연 건조 상태와 가장 가까운 예시는 무엇인가요? | 중립 모발 예시 4종 / 모름 | B | `selfSelectedPattern` |

## 6. 굵기·밀도·볼륨 자가정보

| templateId | 질문 | 선택지 요약 | 큐 | 반영 |
|---|---|---|---|---|
| `hair.strand-feel.v1` | 모발 한 올을 만졌을 때 어떤 느낌인가요? | 가늘게 느껴짐 / 중간 / 굵고 단단함 / 부위별 차이 / 모름 | A | `strandThickness` |
| `hair.ponytail-volume.v1` | 묶었을 때 모발 양은 어느 정도로 느껴지나요? | 적음 / 중간 / 많음 / 길이에 따라 다름 / 해당 없음 | B | `reportedVolume` |
| `hair.parting-visibility.v1` | 평소 가르마에서 두피가 얼마나 보이나요? | 거의 안 보임 / 조금 보임 / 넓게 보임 / 부위별 차이 / 모름 | B | `partingVisibilityReport` |
| `hair.crown-volume.v1` | 제품 없이 말렸을 때 정수리 볼륨은 어떤가요? | 쉽게 가라앉음 / 자연 유지 / 쉽게 뜸 / 모름 | B | `naturalCrownVolume` |
| `hair.side-volume.v1` | 제품 없이 말렸을 때 옆 볼륨은 어떤가요? | 붙음 / 자연 유지 / 부풀어 오름 / 좌우 다름 | C | `naturalSideVolume` |
| `hair.volume-duration.v1` | 만든 볼륨이 보통 얼마나 유지되나요? | 1시간 미만 / 반나절 / 하루 / 환경에 따라 다름 / 모름 | C | `volumeHoldDuration` |
| `hair.density-change-report.v1` | 최근 평소와 다른 숱 변화가 느껴지나요? | 변화 못 느낌 / 변화 있음 / 부위별 변화 / 답하지 않음 | B | `reportedDensityChange` |

`hair.density-change-report.v1`은 사용자의 자가정보만 저장한다. 원인·질환·탈모 여부를 추론하거나 Hair 추천을 확정 제한하는 데 사용하지 않는다. 변화가 걱정된다는 선택이 있으면 미용 상담과 별도로 의료 전문가 상담을 고려하라는 일반 안내만 제공한다.

## 7. 표면 상태·엉킴·열 반응 질문

| templateId | 질문 | 선택지 요약 | 큐 | 반영 |
|---|---|---|---|---|
| `hair.ends-touch.v1` | 모발 끝을 만졌을 때 가장 가까운 상태는 무엇인가요? | 매끄러움 / 조금 거침 / 쉽게 엉킴 / 갈라짐 느낌 / 모름 | B | `endCondition` |
| `hair.tangle-location.v1` | 가장 잘 엉키는 부위는 어디인가요? | 거의 없음 / 목 뒤 / 중간 / 끝 / 전체 | B | `tangleLocation` |
| `hair.breakage-report.v1` | 빗질할 때 짧게 끊어진 모발이 자주 보이나요? | 거의 없음 / 가끔 / 자주 / 모름 | B | `breakageReport` |
| `hair.frizz-condition.v1` | 부스스함은 언제 가장 잘 나타나나요? | 거의 없음 / 습한 날 / 건조한 날 / 늘 비슷 / 모름 | B | `frizzCondition` |
| `hair.static-condition.v1` | 정전기와 잔머리는 언제 두드러지나요? | 거의 없음 / 건조할 때 / 옷·모자 후 / 늘 비슷 / 모름 | C | `staticCondition` |
| `hair.heat-response.v1` | 열기구를 사용하면 형태가 어떻게 유지되나요? | 잘 유지 / 금방 풀림 / 부스스해짐 / 사용하지 않음 / 모름 | C | `heatResponse` |
| `hair.dry-time.v1` | 샴푸 후 완전히 마르는 데 얼마나 걸리나요? | 15분 이내 / 15~30분 / 30~60분 / 60분 이상 / 모름 | B | `dryTimeBand` |
| `hair.water-response.v1` | 물을 묻히면 모발이 젖는 느낌은 어떤가요? | 바로 젖음 / 천천히 젖음 / 부위별 차이 / 모름 | C | `reportedWaterResponse` |
| `hair.product-absorption.v1` | 오일이나 에센스를 바르면 어떤가요? | 금방 가벼워짐 / 적당함 / 쉽게 무거워짐 / 사용 안 함 / 모름 | C | `productResponse` |

물 반응·건조 시간·제품 반응은 다공성의 직접 측정값이 아니다. 고객 화면에서는 생활 관찰로만 표시하고 `porosity`라는 확정 label로 변환하지 않는다.

## 8. 두피·세정 생활 자가정보

이 모듈은 질환을 진단하지 않고 제품·세정·볼륨 유지 상담의 맥락만 제공한다.

| templateId | 질문 | 선택지 요약 | 큐 | 반영 |
|---|---|---|---|---|
| `scalp.wash-interval.v1` | 평소 머리를 얼마나 자주 감나요? | 하루 2회 이상 / 매일 / 이틀에 한 번 / 더 긴 간격 | C | `washInterval` |
| `scalp.root-feel.v1` | 샴푸 다음 날 뿌리 느낌은 어떤가요? | 산뜻함 / 약간 무거움 / 쉽게 기름짐 / 부위별 차이 / 모름 | C | `rootFeelNextDay` |
| `scalp.tightness-report.v1` | 세정 후 두피가 당기는 느낌이 있나요? | 없음 / 가끔 / 자주 / 답하지 않음 | C | `tightnessReport` |
| `scalp.sensitivity-report.v1` | 제품 사용 후 불편함을 느낀 적이 있나요? | 없음 / 특정 제품에서 / 자주 / 답하지 않음 | C | `productDiscomfortReport` |
| `scalp.sweat-context.v1` | 땀이나 운동이 헤어 유지에 얼마나 영향을 주나요? | 거의 없음 / 가끔 / 자주 / 매우 자주 | C | `sweatContext` |
| `scalp.covering-context.v1` | 모자·헬멧을 자주 착용하나요? | 거의 안 함 / 주 1~2회 / 자주 / 매일 | C | `headwearContext` |

통증, 상처, 심한 가려움 등 건강 우려를 입력한 경우 AI가 원인을 추정하지 않는다. 해당 필드를 추천에서 제외하고 전문가 확인 상태로 전달한다.

## 9. 시술·컬러 이력 질문

| templateId | 질문 | 선택지 요약 | 큐 | 반영 |
|---|---|---|---|---|
| `service.chemical-history.v1` | 최근 1년 동안 받은 시술을 알려주세요. | 염색 / 탈색 / 펌 / 매직·스트레이트 / 없음 / 모름 | A | `treatmentHistory` |
| `service.last-chemical-window.v1` | 가장 최근 화학 시술은 언제였나요? | 1개월 이내 / 1~3개월 / 3~6개월 / 6개월 이상 / 모름 | C | `lastChemicalWindow` |
| `service.bleach-count.v1` | 탈색한 부위는 몇 번 정도 시술했나요? | 1회 / 2회 / 3회 이상 / 부분만 / 모름 | C | `bleachCountBand` |
| `service.color-layering.v1` | 최근 여러 색을 덧입힌 이력이 있나요? | 없음 / 1회 / 여러 번 / 어두운 색으로 덮음 / 모름 | C | `colorLayering` |
| `service.perm-type.v1` | 최근 펌·스트레이트 시술은 무엇이었나요? | 일반 펌 / 열펌 / 매직·스트레이트 / 복합 / 없음 / 모름 | C | `permHistoryType` |
| `service.cut-thinning.v1` | 최근 숱가위나 강한 층 처리가 있었나요? | 없음 / 가벼운 정리 / 많이 줄임 / 모름 | C | `thinningHistory` |
| `service.home-color.v1` | 셀프 염색이나 컬러 제품을 사용했나요? | 없음 / 셀프 염색 / 컬러 샴푸·트리트먼트 / 둘 다 / 모름 | C | `homeColorHistory` |
| `service.prior-discomfort.v1` | 이전 염색·펌에서 불편함을 경험한 적이 있나요? | 없음 / 있었음 / 답하지 않음 | C | `priorServiceDiscomfort` |
| `service.salon-confirmation.v1` | 시술 전 미용실에서 꼭 확인받고 싶은 항목이 있나요? | 모발 상태 / 두피 상태 / 탈색 가능 여부 / 시술 이력 / 없음 | C | `salonConfirmationTopics` |

시술 이력은 가능성·주의사항을 만드는 근거이지 안전 확정 근거가 아니다. 특히 탈색·펌 가능 여부와 과거 불편 경험은 Salon Brief에 `전문가 확인 필요`로 전달한다.

## 10. 관리·환경·스타일 유지 질문

| templateId | 질문 | 선택지 요약 | 큐 | 반영 |
|---|---|---|---|---|
| `routine.dry-method.v1` | 평소 머리를 어떻게 말리나요? | 자연 건조 / 두피 위주 / 전체 드라이 / 열 브러시 | C | `dryMethod` |
| `routine.heat-frequency.v1` | 고데기·아이론을 얼마나 자주 사용하나요? | 사용 안 함 / 주 1~2회 / 자주 / 매일 | C | `heatFrequency` |
| `routine.product-types.v1` | 자주 사용하는 제품은 무엇인가요? | 오일·세럼 / 크림 / 무스 / 왁스 / 스프레이 / 없음 | C | `productTypes` |
| `routine.brush-tools.v1` | 평소 사용하는 도구는 무엇인가요? | 빗 / 롤브러시 / 드라이어 / 아이론 / 없음 | C | `stylingTools` |
| `routine.morning-time.v1` | 아침 손질에 사용할 수 있는 시간은 어느 정도인가요? | 5분 이하 / 10분 / 20분 / 30분 이상 | C | `morningMinutes` |
| `environment.humidity.v1` | 습한 날 모발은 어떻게 변하나요? | 변화 적음 / 처짐 / 부풀음 / 컬 강해짐 / 부위별 차이 | B | `humidityResponse` |
| `environment.dryness.v1` | 건조한 날 모발은 어떻게 변하나요? | 변화 적음 / 정전기 / 뻣뻣함 / 잔머리 증가 / 모름 | C | `dryWeatherResponse` |
| `environment.activity.v1` | 일상에서 헤어 형태를 흐트러뜨리는 활동이 있나요? | 운동 / 야외 활동 / 모자·헬멧 / 장시간 묶음 / 없음 | C | `activityContexts` |
| `routine.tie-frequency.v1` | 모발을 묶고 있는 시간이 긴 편인가요? | 거의 안 묶음 / 가끔 / 자주 / 대부분 | C | `tieFrequency` |
| `routine.sleep-state.v1` | 자고 난 뒤 가장 불편한 변화는 무엇인가요? | 눌림 / 엉킴 / 부스스함 / 컬 변형 / 특별히 없음 | C | `sleepBehavior` |

## 11. 충돌 해소·한계 확인 질문

| templateId | 상황 | 질문 목적 | 처리 |
|---|---|---|---|
| `conflict.texture.v1` | 사진 texture와 저장 답변 불일치 | 평소 자연 상태와 촬영 스타일링 분리 | 양쪽 source 유지 후 inferred 갱신 |
| `conflict.density.v1` | 사진 apparent density와 사용자 진술 불일치 | 조명·가르마 영향 확인 | 미용실 확인 허용 |
| `conflict.color-origin.v1` | 사진 색 차이와 자연 모발 답변 불일치 | 자연색·염색·조명 분리 | Color 입력 revision 생성 |
| `conflict.damage-history.v1` | 표면 징후와 시술 이력 불일치 | 환경·제품·시술 가능성 분리 | 손상 단정 금지 |
| `conflict.profile-age.v1` | 저장 답변이 오래됐고 새 사진과 다름 | 이전 정보 사용 여부 확인 | 이전 profile을 supersede |
| `limitation.unknown.v1` | 사진과 답변 모두 부족 | unknown 유지 동의 | 추천에서 필드 제외 |
| `limitation.salon-check.v1` | 시술 안전성에 영향 | 전문가 확인으로 이관 | brief unresolved 항목 생성 |
| `limitation.add-photo.v1` | 특정 영역만 보이지 않음 | 선택적 추가 사진 요청 | 기존 결과 보존, child task 추가 |

## 12. 도메인 분기 규칙

### Hair만 선택한 경우

- A/B 큐에서 texture, volume, density, capture state만 선택한다.
- Personal Color와 화학 시술 상세는 묻지 않는다.
- Color·Makeup·Fashion 질문은 생성하지 않는다.

### Hair+Color를 선택한 경우

- capture color fidelity, 자연 모발색, 시술·탈색 이력을 우선한다.
- 탈색 횟수와 이전 불편 경험은 AI 진단에서 모두 묻지 않고 Color 탭에 이관할 수 있다.
- 사진 기반으로 시술 가능 여부를 확정하지 않는다.

### Total Styling을 선택한 경우

- AI 진단 질문 예산은 그대로 최대 4개다.
- Makeup과 Fashion의 취향·상황 질문은 각각의 단독 인터뷰에 남긴다.
- 진단 단계에서는 필터·베이스 메이크업처럼 분석 신뢰도에 직접 영향을 주는 항목만 묻는다.

## 13. 후속 질문 분기 예시

```text
hair.current-capture-state = 열기구 사용
  ├─ texture confidence >= 0.80 → 추가 질문 없음, 촬영 영향 warning
  └─ texture confidence 0.55~0.79 → hair.air-dry-pattern 제안

service.chemical-history includes 탈색
  ├─ scope = hair → brief에 이력만 전달
  └─ scope includes color → Color 탭에서 bleach-count와 color-layering 질문

capture.base-makeup = 커버 메이크업
  ├─ 보조 자연광 사진 있음 → 보조 사진으로 Personal Color 재실행
  └─ 보조 사진 없음 → Personal Color warning + 선택적 photo request

conflict.texture = 사진 촬영 때만 스타일링
  → observed는 보존
  → reported natural pattern을 별도 저장
  → recommendation은 natural pattern과 capture warning을 함께 참조
```

한 답변에서 최대 한 개의 즉시 후속 질문만 연다. 나머지 후보는 다시 점수화하며 질문 chain은 최대 깊이 2로 제한한다.

## 14. 답변 처리와 provenance

- 모든 답변은 `user` provenance와 template ID를 가진다.
- 시각 선택도 내부에는 안정적인 option value를 저장한다.
- `unknown`은 유효 답변이며 같은 run에서 다시 묻지 않는다.
- `skip`은 보류이므로 다음 상담에서 다시 제안할 수 있지만 즉시 반복하지 않는다.
- `salon_confirmation`은 질문을 종결하고 Salon Brief unresolved 항목을 만든다.
- 답변 수정은 기존 확정 profile을 덮어쓰지 않고 새 revision을 만든다.
- AI 요약은 등록 option value만 참조하며 사용자가 선택하지 않은 시술 이력이나 건강 정보를 추가하지 않는다.

## 15. 고객 문구 패턴

### 관찰 확인

```text
사진에서는 모발 끝에 굴곡이 보이지만 촬영 당시 손질의 영향일 수 있어요.
평소 자연 건조 상태를 알려주면 레이어 방향을 더 정확히 맞출 수 있어요.
```

### 충돌 확인

```text
사진에서 보이는 상태와 이전에 저장된 정보가 조금 달라요.
둘 중 하나가 틀렸다는 뜻은 아니며, 평소 상태와 촬영 상태를 나눠서 반영할게요.
```

### 미확인 처리

```text
사진만으로 확정하기 어려운 항목이에요.
잘 모르겠다면 비워 둔 채 추천을 진행하고 미용실 확인 항목으로 남길 수 있어요.
```

### 추가 사진 요청

```text
현재 사진으로 기본 분석은 완료했어요.
정수리와 가르마를 더 정확히 보고 싶다면 사진 한 장을 추가할 수 있어요. 지금 추가하지 않아도 상담은 계속됩니다.
```

## 16. UI 구성

- 질문은 AI 진단 우측 패널의 `확인이 필요한 내용` 카드에 한 장씩 표시한다.
- 카드 상단에 `왜 묻는지`를 한 문장으로 표시한다.
- 질문 전체 목록이나 `2 / 8` 같은 마법사 진행률은 표시하지 않는다.
- 답변 후 해당 결과 카드의 confidence·근거가 어떻게 바뀌었는지 짧게 보여준다.
- 선택 질문은 `지금 답하기 / 결과 먼저 보기`를 제공한다.
- C 큐 질문은 AI 진단에 노출하지 않고 관련 Hair·Color 탭의 입력 카드로 전달한다.
- 시각 선택지는 확대, 키보드 선택, 대체 텍스트, 고대비 focus를 지원한다.

## 17. 테스트 매트릭스

### 정책

- 질문 후보가 10개여도 A/B 예산 합계 4개를 넘지 않음
- 같은 field와 동일 run에 중복 instance 없음
- high confidence와 충돌 없음이면 질문 0개
- 재촬영이 필요한 사진을 질문으로 통과시키지 않음
- scope에 없는 도메인 질문 제거
- chain 깊이 2 초과 금지

### 계약

- 모든 template ID, option value, target field가 allow-list에 존재
- visual asset과 대체 텍스트 일치
- unknown, skip, salon confirmation 상태 전이
- 수정 시 profile revision과 generation fingerprint 갱신
- AI 설명 JSON이 option·blocking·target field를 변조하면 거부

### 브라우저

- 질문 1장 표시, 자동 저장, 다음 후보 재점수화
- 결과 먼저 보기와 나중에 답하기
- 시각 선택 확대·키보드·스크린리더
- 저장 409 충돌 복구
- 나가기·재개 시 answered/unknown 상태 복원
- 질문 반영 전후 confidence와 recommendation reason 표시

### 안전·회귀

- 의료·탈모·정상/비정상 단정 문구 부재
- 성별·인종·나이 사진 추론 부재
- 다공성·탄력을 사진 결과로 확정하지 않음
- Hair-only에서 Color·Makeup·Fashion 질문 0개
- 기능 플래그 OFF에서 기존 P41 16개 기본 템플릿과 legacy Discovery 유지

## 18. 종료 기준

- [ ] 질문 은행이 촬영, 모발 패턴, 굵기·밀도, 표면 상태, 두피 자가정보, 시술 이력, 환경·관리, 충돌·한계를 포함한다.
- [ ] 질문 은행 크기와 무관하게 진단 run당 노출 질문은 최대 4개다.
- [ ] 질문 필요 여부와 선택지는 결정론적 정책이 소유한다.
- [ ] AI 설명 실패 시 기본 한국어 템플릿으로 진행된다.
- [ ] 초기 상담 목표 설정과 중복되는 질문을 다시 묻지 않는다.
- [ ] 사진으로 확정할 수 없는 속성은 reported 또는 unknown으로 남는다.
- [ ] 시술 안전성과 건강 우려는 AI 판단이 아니라 전문가 확인으로 이관한다.
- [ ] 답변 source·template·revision이 Hair/Color/Brief/Result까지 추적된다.
- [ ] Web/Native에서 같은 template ID와 option value를 사용한다.

## 19. 증거 경계

템플릿 수와 로컬 정책 테스트는 질문의 실제 이해도, 응답 피로도, 모질 분석 정확도 향상 또는 사용자 만족도를 증명하지 않는다. canary에서는 질문별 노출률, 답변률, unknown 비율, 결과 수정률, 이탈률을 측정하고 효과가 낮거나 부담이 큰 질문은 은행에서 비활성화한다.
