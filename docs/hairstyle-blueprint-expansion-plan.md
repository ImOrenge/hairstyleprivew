# Google News RSS 기반 헤어스타일 블루프린트 150개 확장 계획

작성일: 2026-08-08
상태: 원격 migration·A/B/C 카탈로그·RSS proxy·rollback drill 완료, 개인화 실사용 표본 기반 10%→50%→100% 전환 대기
대상 시장: `kr`
기준 브랜치: `main@6fe19e6`, RSS proxy 코드 `develop/2026-08-08-hairstyle-blueprint-expansion@d7095b4`
연계 문서: [헤어스타일 카탈로그 순환 아키텍처](hairstyle-catalog-rotation-architecture.md)

## 1. 결정 요약

| 항목 | 결정 |
| --- | --- |
| 수량 | 기존 32개를 보존하고 신규 150개를 추가해 목표 풀을 총 182개로 만든다. |
| 성별 배분 | 신규 150개는 여성 전용 75개, 남성 전용 75개로 배분한다. 기존 공용 4개는 유지하되 신규 150개 수량에는 포함하지 않는다. |
| 길이 배분 | 여성·남성 각각 단기장 25개, 중기장 25개, 장기장 25개를 추가한다. |
| 모발 분류 | `직모·곱슬·강한 곱슬`은 texture 축, `가는·보통·굵은 모발`은 strand thickness 축, `손상·탈색·염색`은 condition 축으로 분리한다. 서로 다른 의미의 속성을 하나의 열거형에 섞지 않는다. |
| 사용자 용어 | 사용자 화면에서는 낙인감이 있는 `악성곱슬` 대신 `강한 곱슬·부스스함`을 사용하고, 검색 별칭으로만 원문 용어를 인식한다. |
| RSS 역할 | Google News RSS는 스타일 발견과 트렌드 점수 근거로 사용한다. 기사 제목만으로 블루프린트를 자동 게시하거나 화학 시술 안전성을 판단하지 않는다. |
| 추천 방식 | 활성 cycle과 기존 lineup을 유지하되, 전체 활성 풀에서 현재 모발 호환 후보를 먼저 뽑고 lineup의 트렌드·회전 후보를 혼합해 9개를 만든다. |
| 출시 방식 | 50개씩 3개 배치로 추가하고, 각 배치마다 정적 감사·프롬프트 샘플·shadow 추천을 통과한 뒤 다음 배치로 진행한다. |
| 운영 경계 | 150개 데이터와 DB migration, web/mobile/salon 전달, 추천 로직, A/B/C active cycle, RSS proxy, rollback flag는 운영에 반영됐다. 개인화는 실사용 표본이 0건이므로 `shadow/0%`를 유지하며, 10%→50%→100% live 전환은 표본 게이트를 통과한 뒤 수행한다. |

## 2. 현재 기준선과 해결할 문제

### 2.1 저장소에서 확인한 현재 상태

| 영역 | 현재 상태 | 한계 |
| --- | --- | --- |
| blueprint | `KOREAN_HAIRSTYLE_BLUEPRINTS` 32개 | 여성 후보 18개, 남성 후보 18개라 모발 상태별 선택 폭이 없다. |
| 길이 분포 | 여성 `5/7/6`, 남성 `8/6/4` | 남성 장기장 후보가 특히 적고, 각 길이 안의 texture·condition 보장이 없다. |
| 모발 표현 | `texture: string` 자유 문자열 | 표준 분류가 아니므로 호환성 필터와 수량 감사를 할 수 없다. |
| 사용자 입력 | 얼굴 분석과 `styleTarget` 중심 | 현재 길이, 직모·곱슬, 손상, 염색·탈색 이력이 추천 점수에 들어가지 않는다. |
| 추천 | active lineup 9개를 우선 순서대로 사용 | 182개를 저장해도 고정 lineup 9개 밖의 후보는 사용자별 추천에 거의 참여하지 못한다. |
| RSS | Google News RSS 11개 query, query당 최대 10개 | 150개 확장 풀의 길이·texture·condition별 근거를 수집하기에는 query facet과 표본이 부족하다. |
| 검증 | 32개 정확 수량, 성별 후보 수, 길이별 최소 4개 | texture·condition 교차 커버리지, 유사 스타일 중복, 시술 제약, 프롬프트 적합성 검사가 없다. |

### 2.2 핵심 문제 정의

블루프린트 수만 182개로 늘리면 다음 문제가 남는다.

1. 직모 사용자에게 강한 펌 의존 스타일이 상위에 노출될 수 있다.
2. 탈색·고손상 모발에 추가 탈색이나 고열·강한 펌을 전제로 한 후보가 노출될 수 있다.
3. 같은 스타일 이름의 미세 변형이 9개 보드를 채워 실제 선택 폭이 넓어지지 않을 수 있다.
4. RSS 기사 노출량이 많은 스타일이 안전성·실현 가능성과 무관하게 과대 평가될 수 있다.
5. 기존 active lineup이 9개로 고정되어 있으면 확장된 150개가 런타임 개인화에 쓰이지 않을 수 있다.

따라서 완료 기준은 `blueprintCount = 182`가 아니라 `현재 모발 상태에 맞는 비교 가능한 9개가 생성되는가`까지 포함한다.

## 3. 범위와 비범위

### 포함

- 신규 150개 blueprint의 수량·분류·작성 규칙
- Google News RSS query registry와 trend evidence 수집 개선
- 현재 모발 프로필 계약과 web/mobile 입력 경로
- Supabase catalog row의 호환성 필드와 migration 방향
- 추천 점수, hard exclusion, 9개 다양성 규칙
- 정적 감사, shadow 평가, 배치별 rollout, rollback

### 제외

- 기사 본문·이미지 저장 또는 외부 사진의 학습 데이터 사용
- RSS 결과만으로 자동 생성한 blueprint의 무검수 운영 게시
- 실제 미용 시술 가능성을 의료적·전문가적 보증으로 표현하는 기능
- 성별 계약 자체를 이번 작업에서 전면 재설계하는 일
- 기존 32개 삭제, 과거 cycle 삭제, 즉시 전면 교체

## 4. 신규 150개 수량 설계

### 4.1 성별·길이 배분

| 스타일 대상 | 단기장 | 중기장 | 장기장 | 신규 합계 |
| --- | ---: | ---: | ---: | ---: |
| 여성 | 25 | 25 | 25 | 75 |
| 남성 | 25 | 25 | 25 | 75 |
| 합계 | 50 | 50 | 50 | 150 |

길이는 외형적 이름이 아니라 결과 이미지 기준으로 정의한다.

| bucket | 판정 기준 |
| --- | --- |
| `short` | 귀·턱선 부근까지의 짧은 실루엣, 남성 크롭·보브·픽시 포함 |
| `medium` | 턱선 아래부터 어깨 부근까지, 세미롱·미디엄 레이어 포함 |
| `long` | 어깨 아래로 명확히 내려오는 실루엣 |

### 4.2 texture와 condition 교차 배분

각 `성별 × 길이` 25개 셀 안에서 아래 12개 조합을 최소 2개씩 만든다.

| 축 | 값 |
| --- | --- |
| primary texture | `straight`, `wavy_curly`, `tight_curly_frizzy` |
| primary condition | `untreated`, `damaged`, `bleached`, `colored` |

`3 texture × 4 condition × 최소 2개 = 24개`이며, 남는 1개는 해당 성별·길이의 RSS 수요와 기존 풀의 부족 영역에 배정한다. 이 규칙을 6개 성별·길이 셀에 적용하면 최소 보장 144개와 수요 배정 6개를 합쳐 정확히 150개가 된다.

| 각 성별·길이 25개 내부 | 목표 수량 |
| --- | ---: |
| 직모 중심 | 8 |
| 곱슬·웨이브 중심 | 9 |
| 강한 곱슬·부스스함 중심 | 8 |
| 미시술·일반 상태를 primary로 둔 항목 | 7 |
| 손상 모발 대응을 primary로 둔 항목 | 6 |
| 탈색 모발 대응을 primary로 둔 항목 | 6 |
| 염색 모발 대응을 primary로 둔 항목 | 6 |
| 가는 모발 중심 | 8 |
| 보통 굵기 모발 중심 | 9 |
| 굵은 모발 중심 | 8 |

`primary`는 수량 감사를 위한 대표 분류다. 실제 사용 가능성은 `compatible*`과 `avoid*` 다중 태그로 판정한다. 예를 들어 탈색과 손상이 동시에 있는 사용자는 `conditionTags = ["bleached", "damaged"]`이며 두 조건을 모두 만족해야 한다.

모발 굵기는 texture·condition 12개 교차 셀을 깨지 않도록 각 25개 묶음에 독립적으로 순환 배치한다. 따라서 72개 기존 교차 셀 보장과 함께 여섯 성별·길이 묶음 모두 `fine 8 / medium 9 / coarse 8`을 만족한다.

### 4.3 50개 단위 작성 배치

| 배치 | 여성 단/중/장 | 남성 단/중/장 | 합계 | 종료 게이트 |
| --- | --- | --- | ---: | --- |
| A | `9/8/8` | `8/9/8` | 50 | schema, 중복, prompt 정적 감사 통과 |
| B | `8/9/8` | `8/8/9` | 50 | 누적 100개 교차 커버리지와 shadow 추천 통과 |
| C | `8/8/9` | `9/8/8` | 50 | 신규 150개 정확 수량과 72개 교차 셀 최소 2개 통과 |
| 누적 | `25/25/25` | `25/25/25` | 150 | 총 182개 active 후보 빌드 가능 |

## 5. Blueprint v4 계약

### 5.1 필드 설계

기존 표현 필드는 유지하고 다음 구조 필드를 추가한다.

| 필드 | 형식 | 용도 |
| --- | --- | --- |
| `styleFamily` | string | 같은 계열의 과도한 중복을 검사하는 기준 |
| `variantKey` | string | family 안의 길이·texture·굵기·condition 변형 식별 |
| `primaryTexture` | enum-like text | 신규 150개 수량 감사의 대표 texture |
| `compatibleTextureTags` | text[] | 추천 허용 texture |
| `avoidTextureTags` | text[] | 부적합 texture 또는 매우 낮은 적합도 |
| `primaryStrandThickness` | enum-like text | 신규 150개 수량 감사의 대표 모발 굵기 |
| `compatibleStrandThicknessTags` | text[] | 가는·보통·굵은 모발 호환 범위 |
| `avoidStrandThicknessTags` | text[] | 무게·볼륨 설계상 피해야 할 모발 굵기 |
| `primaryCondition` | enum-like text | 수량 감사용 대표 condition |
| `compatibleConditionTags` | text[] | 현 상태 그대로 적용 가능한 condition |
| `avoidConditionTags` | text[] | 추가 시술 위험이나 유지 난도가 큰 condition |
| `requiredServices` | text[] | `cut`, `perm`, `straightening`, `color`, `bleach`, `heat_styling` 등 |
| `serviceConstraints` | text[] | `no_additional_bleach`, `low_heat`, `strand_test`, `cut_first` 등 |
| `maintenanceLevel` | `low/medium/high` | 손질 시간과 관리 난도 |
| `trendKeywords` | string[] | RSS 기사와 연결할 한·영 키워드와 별칭 |
| `introducedIn` | string | 기존 32개와 신규 배치 A/B/C 구분 |

Postgres에는 확장 가능성이 큰 분류를 `text`와 `text[]`로 저장하고 check constraint로 허용값을 제한한다. 배열 포함 검색을 DB에서 실제 사용하게 될 때만 실행 계획을 확인한 뒤 GIN index를 추가한다. 현재처럼 active cycle 전체를 한 번 읽어 애플리케이션에서 182개를 점수화한다면 불필요한 index를 먼저 만들지 않는다.

### 5.2 예시

```json
{
  "slug": "female-medium-airy-layer-colored-straight",
  "nameKo": "미디엄 에어리 레이어",
  "styleTargets": ["female"],
  "lengthBucket": "medium",
  "styleFamily": "airy-layer",
  "variantKey": "female-medium-straight-colored",
  "primaryTexture": "straight",
  "compatibleTextureTags": ["straight", "wavy_curly"],
  "avoidTextureTags": [],
  "primaryCondition": "colored",
  "compatibleConditionTags": ["untreated", "colored", "damaged"],
  "avoidConditionTags": ["severely_damaged"],
  "requiredServices": ["cut", "low_heat_styling"],
  "serviceConstraints": ["color_safe", "low_heat"],
  "maintenanceLevel": "medium",
  "trendKeywords": ["미디엄 레이어드", "에어리 레이어", "medium airy layer"],
  "introducedIn": "expansion-a"
}
```

### 5.3 작성 저장소 구조

182개를 하나의 거대한 TypeScript 배열로 관리하지 않는다.

```text
my-app/data/hairstyle-blueprints/v4/
  schema.json
  query-registry.json
  female-short.json
  female-medium.json
  female-long.json
  male-short.json
  male-medium.json
  male-long.json
my-app/lib/hairstyle-catalog-seed.ts
my-app/scripts/build-hairstyle-blueprint-manifest.mjs
my-app/scripts/audit-hairstyle-catalog-blueprints.mjs
```

- 6개 manifest를 schema로 검증한 뒤 런타임 loader가 하나의 immutable 배열로 합친다.
- 기존 32개도 v4 필드를 backfill하되 slug는 바꾸지 않는다.
- `FEMALE_ONLY_SLUGS`, `MALE_ONLY_SLUGS`처럼 별도 Set을 중복 관리하지 않고 각 blueprint의 `styleTargets`를 단일 진실 소스로 사용한다.
- 생성 스크립트는 정렬만 수행하며 스타일 이름, 안전 제약, prompt 내용을 임의로 보정하지 않는다.

## 6. Google News RSS 수집 설계

### 6.1 역할 경계

| RSS가 하는 일 | RSS가 하지 않는 일 |
| --- | --- |
| 최근 스타일 이름·동의어 발견 | 기사 제목을 그대로 blueprint 이름으로 자동 게시 |
| 성별·길이·texture·condition별 언급량 측정 | 기사 내용의 정확성 또는 시술 안전성 보증 |
| trend/freshness score 보조 | 얼굴형·모발 상태 hard constraint 무시 |
| 출처 수와 최근성 기록 | 기사 이미지나 본문을 앱 자산으로 복제 |

기사에서 보이는 트렌드와 손상·탈색 모발의 시술 가능성은 분리한다. 트렌드는 RSS가 점수화하고, 시술 제약은 명시적 editorial rule과 QA fixture가 결정한다.

### 6.2 Query registry 60개

현재 11개 일반 query를 구조화된 60개 registry로 교체한다.

| query 군 | 산식 | 개수 | 예시 |
| --- | ---: | ---: | --- |
| 성별×길이×texture | `2×3×3` | 18 | `2026 여자 중단발 곱슬 헤어스타일`, `2026 남자 장발 직모 스타일` |
| 성별×길이×strand thickness | `2×3×3` | 18 | `2026 여자 단발 가는 모발 헤어스타일`, `2026 남자 장발 굵은 모발 스타일` |
| 성별×길이×condition | `2×3×3` | 18 | `2026 여자 단발 탈색모 스타일`, `2026 남자 중간머리 손상모 헤어` |
| 성별×길이 일반 trend | `2×3` | 6 | `2026 여자 긴머리 트렌드` |
| 합계 |  | 60 | query당 최대 10개, 1회 최대 원시 item 600개 |

condition query는 `damaged`, `bleached`, `colored` 3개를 사용하고 `untreated`는 일반 trend query에서 근거를 얻는다. query 객체에는 문자열만 두지 않고 `id`, `styleTarget`, `lengthBucket`, `textureFacet`, `strandThicknessFacet`, `conditionFacet`를 함께 보존해 어떤 셀의 근거인지 추적한다.

### 6.3 수집 실행 규칙

1. 기존 7일 active cycle TTL과 매일 09:20 KST due checker를 유지한다.
2. cycle이 due가 아닐 때는 60개 RSS를 다시 요청하지 않는다.
3. 60개 요청을 한꺼번에 `Promise.allSettled`하지 않고 동시성 4로 제한한다.
4. 개별 요청은 현재 12초 timeout을 유지하고, 재시도는 네트워크 오류·429·5xx에만 최대 2회 지수 backoff와 jitter를 적용한다.
5. URL과 제목·출처·발행시각 기준으로 중복 제거한다.
6. 60일 primary, 120일 fallback, `seeded` fallback 계약은 유지한다.
7. 성공 query 비율, facet별 문서 수, distinct source 수를 cycle `source_summary`에 남긴다.
8. RSS 실패는 현재 active cycle을 교체하지 않는 이유가 될 수 있지만, 기존 active 추천 서비스를 중단시키지 않는다.

### 6.4 Trend score 개선

기존 키워드 일치에 다음 신호를 더한다.

| 신호 | 처리 |
| --- | --- |
| keyword 일치 | 기존 방식 유지, 완전 일치와 별칭 일치를 구분 |
| query facet 일치 | blueprint의 성별·길이·texture·condition과 query metadata가 맞을 때 가중치 추가 |
| distinct source | 동일 기사 재배포보다 서로 다른 출처를 우선 |
| recency | 7/30/60/120일 구간 가중치 유지 |
| source concentration | 한 출처가 신호의 50%를 넘으면 trend 상한 적용 |
| evidence 부족 | baseline 점수를 사용하고 `evidenceStatus = seeded/weak` 기록 |

자동 활성화 품질 게이트는 `전체 query 성공률`만 보지 않는다. 특정 facet이 비어도 기존 curated baseline으로 cycle을 만들 수 있으나 `coverageWarnings`에 누락 셀을 남기고 해당 셀의 trend boost는 주지 않는다.

## 7. 현재 모발 프로필과 추천 계약

### 7.1 입력 계약

web과 mobile이 같은 `CurrentHairProfile`을 사용한다.

```ts
type CurrentHairProfile = {
  currentLength: "short" | "medium" | "long" | "unknown";
  textureType: "straight" | "wavy_curly" | "tight_curly_frizzy" | "unknown";
  strandThickness: "fine" | "medium" | "coarse" | "unknown";
  conditionTags: Array<"damaged" | "bleached" | "colored" | "permed">;
  damageLevel: "low" | "medium" | "high" | "unknown";
  desiredLength?: "short" | "medium" | "long" | null;
};
```

- 사용자가 직접 입력한 값과 이미지에서 추정한 값은 provenance를 분리한다.
- 이미지 추정값만 있을 때는 hard exclusion에 사용하지 않는다.
- 값이 없으면 `unknown`으로 처리하고 현재 32개 기반 동작에 가깝게 fallback한다.
- `bleached`는 대체로 `damaged` 가능성이 높지만 자동으로 동일시하지 않는다.

### 7.2 추천 단계

```text
active cycle rows 182개
  -> styleTarget 필터
  -> hard incompatibility 제외
  -> 얼굴·길이·texture·굵기·condition·trend 점수화
  -> 개인화 후보 6개
  -> 기존 active lineup에서 호환 가능한 trend/evergreen 3개 혼합
  -> family·길이·서비스 다양성 검사
  -> 최종 9개 + 선택 이유 + 시술 제약
```

기존 active lineup은 폐기하지 않는다. 다만 9개 전체를 고정하는 목록에서, 개인화 결과에 주간 trend와 회전성을 주입하는 snapshot으로 역할을 좁힌다. `unknown` 프로필이나 feature flag 비활성 시에는 기존 lineup-first 경로를 그대로 사용한다.

### 7.3 점수와 제외 규칙

정확한 가중치는 shadow 평가로 조정하되 초기 계약은 다음과 같다.

| 요소 | 초기 처리 |
| --- | --- |
| 얼굴형·두상·볼륨 | 기존 점수 유지 |
| trend/freshness | 기존 합산 비중을 유지하되 개인화 적합도보다 우선하지 않음 |
| texture 완전 일치 | `+18` |
| texture 호환 | `+8` |
| 모발 굵기 완전 일치 | `+10` |
| 모발 굵기 호환 | `+5` |
| `avoidStrandThicknessTags` 충돌 | hard exclude |
| condition 모두 호환 | `+12` |
| condition 일부 미정 | `0`, 이유에 낮은 신뢰 표시 |
| `avoidConditionTags`와 사용자 상태 충돌 | 기본 `-40`; `severely_damaged`와 추가 탈색·강한 펌 충돌은 hard exclude |
| 유지 난도 | 사용자가 관리 제약을 입력한 후 별도 가중치 적용 |

### 7.4 9개 다양성 규칙

| 모드 | 길이 구성 | 추가 조건 |
| --- | --- | --- |
| 기본 비교 | 단기장 3, 중기장 3, 장기장 3 | 같은 `styleFamily` 최대 2개 |
| 목표 길이 고정 | 목표 6, 인접 길이 2, 탐색 1 | 목표 길이가 실현 불가하면 이유와 대안 표시 |
| 모발 프로필 unknown | 기존 최소 길이 분산 계약 유지 | 기존 lineup-first fallback |

모발 프로필이 알려진 경우 최종 9개 중 최소 6개는 texture와 모발 굵기가 완전 일치 또는 명시적 호환이어야 하고, 9개 모두 hard condition 또는 굵기 conflict가 없어야 한다.

### 7.5 Prompt와 살롱 브리프

- 이미지 생성 prompt에는 목표 외형과 현재 모발 상태를 구분해 쓴다.
- `damaged`, `bleached`, `colored`를 이미지 결함처럼 과장해 그리지 않는다.
- 상태 태그는 얼굴 보존·헤어 외 영역 불변 규칙보다 앞설 수 없다.
- `requiredServices`와 `serviceConstraints`는 살롱 브리프·애프터케어로 전달한다.
- 고손상·탈색 상태에서는 `추가 탈색 회피`, `낮은 열`, `strand test`, `디자이너 확인` 같은 조건을 사용자에게 명확히 표시한다.

## 8. Supabase 데이터 모델과 migration 방향

### 8.1 `hairstyle_catalog` 확장

기존 row와 과거 cycle을 깨지 않도록 새 필드는 nullable 또는 안전한 기본값으로 추가하고, backfill 후 constraint를 강화한다.

| 컬럼 | 제안 형식 | 기본값/비고 |
| --- | --- | --- |
| `style_family` | text | 기존 slug 기반 backfill 후 not null 검토 |
| `variant_key` | text | cycle 안에서 유일성 검사 |
| `primary_texture` | text | 허용값 check constraint |
| `compatible_texture_tags` | text[] | `'{}'` |
| `avoid_texture_tags` | text[] | `'{}'` |
| `primary_strand_thickness` | text | `fine/medium/coarse`, check constraint |
| `compatible_strand_thickness_tags` | text[] | `'{}'` |
| `avoid_strand_thickness_tags` | text[] | `'{}'` |
| `primary_condition` | text | 허용값 check constraint |
| `compatible_condition_tags` | text[] | `'{}'` |
| `avoid_condition_tags` | text[] | `'{}'` |
| `required_services` | text[] | `'{}'` |
| `service_constraints` | text[] | `'{}'` |
| `maintenance_level` | text | `medium`, check constraint |
| `introduced_in` | text | `legacy-32` 또는 expansion batch |

### 8.2 DB 안전 원칙

- 새 migration은 Supabase CLI의 `migration new`로 생성하고 `supabase/migrations`와 `my-app/supabase/migrations` mirror 계약을 지킨다.
- `ADD CONSTRAINT IF NOT EXISTS`를 사용하지 않고 `pg_constraint` 확인 DO block으로 멱등성을 보장한다.
- 기존 `(market, source_cycle_id, status)` 조회 index를 먼저 재사용한다.
- 배열을 SQL에서 `@>`/`&&`로 필터링할 때만 해당 배열에 GIN index를 추가하고 `EXPLAIN` 근거를 남긴다.
- `public` table의 RLS를 유지한다. authenticated는 필요한 select만, catalog write와 cycle 활성화는 service role/RPC로 제한한다.
- 신규 필드를 `get_active_hairstyle_catalog` RPC JSON에 추가하고 TypeScript normalize 단계가 구버전 row도 읽도록 한다.
- migration, RPC, TypeScript type, row normalizer, upsert payload를 한 Phase에서 함께 변경한다.

### 8.3 사용자 프로필 저장

`CurrentHairProfile`은 개인 데이터이므로 catalog table에 저장하지 않는다. V2 consultation/session 저장소가 준비되면 그 aggregate에 versioned snapshot으로 저장하고, 그 전에는 generation request의 명시적 입력으로만 전달한다. 장기 프로필로 저장할 경우 사용자별 RLS와 삭제 정책을 별도 검증한다.

## 9. 구현 Phase와 변경 지도

| Phase | 핵심 작업 | 주요 경로 | 종료 조건 |
| --- | --- | --- | --- |
| P0. 기준선 | 기존 32 slug snapshot, 현재 추천·lineup 결과 fixture 저장 | `my-app/scripts/audit-hairstyle-catalog-blueprints.mjs`, 신규 fixture | 현행 결과와 수량 기준 재현 |
| P1. v4 계약 | JSON schema, 6개 manifest, loader, legacy 32 backfill | `my-app/data/hairstyle-blueprints/v4/*`, `hairstyle-catalog-seed.ts` | 기존 32개 동작·slug 동일 |
| P2. DB/타입 | catalog 확장 migration, RPC, TS type/normalizer/upsert | 양쪽 migration mirror, `recommendation-types.ts`, `hairstyle-catalog.ts` | 임시 Postgres migration smoke 통과 |
| P3. RSS facet | 60개 query registry, 동시성 제한, facet evidence, source summary | `hairstyle-trend-research.ts`, query registry | seeded/fallback/fresh fixture 통과 |
| P4-A. 50개 | 배치 A 작성·검수 | 6개 manifest | 신규 50개 정확 수량과 prompt QA |
| P4-B. 50개 | 배치 B 작성·shadow 추천 | 6개 manifest | 누적 100개, known profile fixture 통과 |
| P4-C. 50개 | 배치 C 작성·전체 교차 감사 | 6개 manifest | 신규 150, 총 182, 72셀 최소 2개 |
| P5. 개인화 | `CurrentHairProfile`, hard exclude, 점수, 6+3 혼합, 이유 | `recommendation-types.ts`, `hairstyle-catalog.ts`, `hairstyle-catalog-lineup.ts` | 9개 다양성·호환성 계약 통과 |
| P6. 입력 UX | web/mobile/salon 입력과 API 전달 | generation prepare/accept 경로, web upload, mobile upload, salon workspace | 같은 payload와 unknown fallback |
| P7. 운영 출시 | feature flag, shadow log, canary, active cycle rebuild | audit/smoke/readiness scripts | rollback drill과 runtime smoke 통과 |

## 10. 검증 계획

### 10.1 정적 catalog 감사

| 검사 | 합격 기준 |
| --- | --- |
| 총 수량 | 기존 32 + 신규 150 = 182 |
| 신규 성별 | 여성 전용 75, 남성 전용 75 |
| 신규 길이 | 성별별 short/medium/long 각각 25 |
| 교차 커버리지 | 72개 `gender×length×texture×condition` 셀 각각 최소 2 |
| 모발 굵기 커버리지 | 각 gender×length 25개마다 `fine/medium/coarse = 8/9/8` |
| slug | 전체 유일, 기존 32 slug 불변 |
| variant | 같은 cycle의 `styleFamily+variantKey` 유일 |
| keyword | 각 항목 한글 핵심어 2개 이상, 전체 공백 keyword 없음 |
| 제약 | condition 대응 항목에 compatibility 또는 constraint 필수 |
| prompt | 얼굴·성별·피부·배경 변경 지시 금지, prompt version 최신 |
| 중복 | 같은 family가 한 성별·길이 셀의 30%를 넘지 않음 |

정규식으로 TypeScript 소스를 파싱하는 현재 audit는 JSON schema와 실제 parsed object 감사로 교체해 CRLF와 포맷 변경 영향을 제거한다.

### 10.2 추천 fixture

최소 다음 12개 프로필을 남·녀 각각 실행한다.

| texture | condition |
| --- | --- |
| 직모 | 일반, 손상, 탈색, 염색 |
| 곱슬 | 일반, 손상, 탈색, 염색 |
| 강한 곱슬·부스스함 | 일반, 손상, 탈색, 염색 |

실행형 계약 테스트는 여성·남성 × 희망 단·중·장 × texture 3종 × 가는·보통·굵은 모발 × 일반·손상·탈색·염색 4종에 고손상 `탈색+손상` 조합을 더한 총 270개 profile을 순회한다. 운영 추천과 같은 순수 selector를 실행해 각 결과의 9개 수량, 중복 없음, 길이 규칙, family 최대 2개, hard conflict 0, texture·굵기 호환 후보 최소 6개를 검사한다.

같은 테스트에서 v4 flag를 끄고 기존 32개·`catalog-v3` rollback pool이 남녀 각각 9개, 단·중·장 각 3개, family 최대 2개인 lineup-first 결과를 유지하는지도 실행 검증한다.

### 10.3 RSS fixture

- XML 정상, 일부 query 실패, 전체 실패, 잘못된 날짜, 중복 기사, HTML entity, 한 출처 집중 fixture
- 60개 query를 실제 네트워크 없이 재현하는 recorded fixture
- live RSS smoke는 read-only로 분리하고 결과 변동 때문에 CI의 결정적 pass/fail 근거로 쓰지 않는다.

### 10.4 명령 계약

구현 시 다음 명령을 repository script로 제공한다.

```text
npm run hairstyle:blueprints:audit
npm run hairstyle:blueprints:db:smoke -- --databaseUrl <local-postgres-url>
npm run hairstyle:catalog:recommendation:test
npm run hairstyle:catalog:rss:fixture:test
npm run hairstyle:catalog:env:check -- --mode=blueprint-v4-rollout
npm run hairstyle:catalog:runtime:smoke -- --mode=personalization-metrics --cycleId <active-cycle-id> --requireSamples <count>
npm run hairstyle:catalog:audit
npm run hairstyle:catalog:lineup:audit
npm run supabase:migrations:mirror:check
npm run lint
npm run build
```

remote DB write, function deploy, active cycle 강제 rebuild는 로컬 구현 완료에 포함하지 않으며 기존 write guard와 별도 승인 경계를 유지한다.

## 11. 출시와 운영

### 11.1 Feature flag

| flag | off | on |
| --- | --- | --- |
| `HAIRSTYLE_BLUEPRINT_V4_ENABLED` | 기존 32 loader | 182 manifest loader |
| `HAIRSTYLE_BLUEPRINT_V4_BATCH` | v4 off 시 무시 | `expansion-a` 신규 50개, `expansion-b` 누적 100개, `expansion-c` 누적 150개 |
| `HAIR_PROFILE_MATCHING_V2_ENABLED` | 기존 lineup-first 추천 | 모발 호환 6 + lineup 3 |
| `HAIRSTYLE_RSS_FACETS_V2_ENABLED` | 기존 11 query | 구조화 60 query |

개인화 master flag가 켜진 뒤에는 `HAIR_PROFILE_MATCHING_V2_MODE=shadow|live`, `HAIR_PROFILE_MATCHING_V2_INTERNAL_USER_IDS`, `HAIR_PROFILE_MATCHING_V2_ROLLOUT_PERCENT=0|10|50|100`을 함께 사용한다. `shadow`는 얼굴 분석을 중복 실행하지 않고 baseline과 개인화 후보를 같은 catalog snapshot에서 계산해 overlap, hard conflict, 호환 결과 수, fallback 여부를 저장하되 baseline 결과를 제공한다. `live`의 비허용 사용자는 안정적 user-ID bucket에 따라 shadow control에 남는다.

flag는 web UI만 숨기는 용도가 아니다. 서버 loader, scoring, rebuild가 각각 안전하게 구버전 경로로 돌아갈 수 있어야 한다.

### 11.2 Rollout 순서

1. schema와 code를 배포하되 세 flag는 off로 둔다.
2. `HAIRSTYLE_BLUEPRINT_V4_BATCH=expansion-a`로 기존 32+신규 50개의 dry-run cycle을 만들고 DB에는 활성화하지 않는다.
3. `expansion-a` → `expansion-b` → `expansion-c` 순서로 82→132→182개 누적 shadow cycle을 생성해 coverage와 prompt 표본을 검토한다. 잘못된 batch 값은 기존 32개·`catalog-v3`로 fail-closed 한다.
4. RSS facet만 켜 source summary와 실패율을 한 cycle 관찰한다.
5. blueprint v4를 내부 계정에만 활성화한다.
6. 개인화 scoring을 10% canary로 켜 fallback·hard conflict·선택률을 비교한다.
7. 50% 후 100%로 확대한다. 각 단계는 최소 한 active cycle을 관찰한다.

각 단계의 운영 증거는 `personalization-metrics` read-only smoke로 집계한다. 이 명령은 사용자 ID나 모발 프로필을 출력하지 않고 cycle별 표본 수, shadow/live·사유·bucket 비율, hard conflict, 6개 이상 호환 결과, fallback 및 선택률만 출력한다. `--requireSamples`, `--expectedMode`, `--expectedRolloutPercentage`, `--expectReason`으로 단계별 최소 증거를 fail-closed 검증한다.

### 11.3 운영 지표

| 지표 | 경고 기준 |
| --- | --- |
| `rss_query_success_ratio` | 0.8 미만 |
| `rss_facet_empty_count` | 이전 cycle 대비 급증 |
| `catalog_profile_fallback_ratio` | known profile에서 0.1 초과 |
| `hard_conflict_candidate_count` | 0이 아니면 차단 |
| `profile_compatible_result_ratio` | known profile에서 9개 중 6개 미만 |
| `family_duplicate_ratio` | 결과 9개 중 같은 family 3개 이상 |
| `active_cycle_row_count` | 182 미만이면 v4 활성화 차단 |
| `recommendation_p95_ms` | 기준선 대비 50ms 이상 악화 시 조사 |

## 12. Rollback

| 장애 | 즉시 조치 | 데이터 처리 |
| --- | --- | --- |
| 추천 품질 저하 | `HAIR_PROFILE_MATCHING_V2_ENABLED=off` | 새 필드는 유지, 기존 lineup-first 복귀 |
| 182 manifest 오류 | `HAIRSTYLE_BLUEPRINT_V4_ENABLED=off` | 기존 32 manifest와 active cycle 유지 |
| RSS 과다 실패 | `HAIRSTYLE_RSS_FACETS_V2_ENABLED=off` | 기존 11 query 또는 seeded fallback 사용 |
| 잘못된 cycle 활성화 | active pointer를 검증된 `previous_cycle_id`로 원자적 복귀 | 실패 cycle은 감사용으로 보존 |
| migration 문제 | code flag off, 호환 가능한 nullable 필드는 유지 | 자동 drop·데이터 삭제 금지, 별도 수정 migration 사용 |

rollback drill은 `이전 active cycle 유지`, `9개 추천 반환`, `기존 32 slug 정상`, `새 필드가 없는 row normalize`를 확인해야 한다.

## 13. 위험과 완화

| 위험 | 영향 | 완화 |
| --- | --- | --- |
| RSS 기사 편향·SEO 중복 | trend 점수 왜곡 | distinct source, 집중도 상한, curated baseline |
| 150개 수작업 오탈자 | 잘못된 prompt·태그 | JSON schema, batch 50, 자동 coverage, 표본 review |
| 비슷한 변형 과다 | 사용자 체감 다양성 저하 | style family cap, variant uniqueness, 결과 family 최대 2 |
| 탈색·손상 안전 과장 | 잘못된 시술 기대 | hard constraint, 상담 문구, 전문가 확인, RSS와 안전 규칙 분리 |
| 182개 전수 점수화 비용 | 응답 지연 | 먼저 애플리케이션 benchmark, 필요할 때만 segment index/pool 도입 |
| web/mobile 입력 불일치 | 플랫폼별 추천 차이 | 공유 type·API schema·parity contract test |
| 기존 rotation audit 훼손 | active lineup 회귀 | lineup snapshot 유지, 추천 감사에 6+3 계약 추가 |
| DB와 manifest 불일치 | cycle 활성화 실패 | row count·prompt version·coverage를 활성화 전 validation에 포함 |

## 14. 최종 완료 기준

- [x] 기존 32개 slug를 보존하면서 신규 150개가 manifest에 존재한다.
- [x] 여성 75·남성 75, 성별별 단/중/장 25개가 자동 감사로 증명된다.
- [x] 72개 texture×condition 교차 셀 각각 신규 blueprint가 최소 2개다.
- [x] 여성·남성의 단·중·장 각 25개 묶음이 가는/보통/굵은 모발 `8/9/8`을 만족한다.
- [x] RSS 60개 query가 metadata와 함께 수집되고 실패 시 기존 active cycle이 유지된다.
- [x] 현재 모발 프로필이 web/mobile/salon generation 경로에서 동일하게 전달된다.
- [x] known profile의 9개 결과에는 hard condition·굵기 conflict가 없고 최소 6개가 texture·굵기 호환이다. 운영 selector를 공유하는 270개 profile 실행형 테스트로 증명한다.
- [x] 기본 비교 모드는 단/중/장 각 3개, 동일 family 최대 2개를 보장한다.
- [x] 기존 active lineup, seeded fallback, previous cycle rollback과 `32개/11 query/lineup-first` flag fallback이 유지된다.
- [x] migration mirror, catalog audit, recommendation fixture, profile unit test, lint, web/mobile typecheck와 production build가 통과한다.
- [x] 임시 Supabase Postgres에서 76개 migration fresh-chain과 v4 컬럼·제약·권한·RLS-backed RPC 반환 smoke를 통과한다.
- [x] shadow → 내부 → 10% → 50% → 100%의 안정적 user bucket 판정과 master flag 즉시 rollback이 결정적 단위 테스트로 증명된다.
- [x] 원격 pre-deploy dry-run과 migration list가 v4 미적용 상태를 식별하고, 현재 32개 rollback active cycle의 `32 rows / 남녀 18 candidates / 남녀 lineup 9` DB·앱 status smoke가 통과한다.
- [x] 선행 `20260722120000_google_play_billing.sql`과 `20260808090000_extend_hairstyle_blueprint_v4.sql`을 원격 적용하고 migration 정합성·v4 RPC runtime smoke를 통과한다.
- [x] 배포된 코드에서 A/B/C active cycle shadow와 master-off/기존 32개 포인터 rollback drill 및 C 복구 증거가 남는다.
- [ ] 개인화 실사용 표본을 확보해 내부 allowlist → 10% → 50% → 100%의 `personalization-metrics` 게이트를 통과한다. 현재 표본은 0건이며 `shadow/0%`다.
- [x] Cloudflare Worker의 Google News RSS egress를 service-role 인증 Supabase Edge proxy로 분리하고 자동 rotation과 같은 production dry-run 경로를 다시 검증한다. 60개 중 45개 query가 성공하고 근거 3건을 사용해 182-row validation을 통과했으며 기존 active C 포인터는 유지됐다.
- [ ] 개인화 실사용 운영 관측이 끝나기 전에는 전체 개인화 rollout을 완료로 표시하지 않는다.

로컬 UI 검증은 `/e2e-harness/hair-profile`의 HTTP 200과 길이·형태·굵기·상태 필드 SSR 출력을 확인했다. 자동 브라우저 런타임은 로컬 경로 오류로 연결되지 않아 스크린샷·클릭 상호작용 검증은 배포 전 잔여 항목으로 둔다.

### 14.1 2026-08-09 원격 pre-deploy 기준선

- 연결 프로젝트: `dpzdhxlqnogfpubpslbf`
- `supabase db push --dry-run`: 원격 쓰기 없이 실행, `readyForWrite=false`
- 미적용 migration: `20260722120000_google_play_billing.sql`, `20260808090000_extend_hairstyle_blueprint_v4.sql`
- 현재 active cycle: `992846d6-32be-4ab0-9ff2-6f7c22d23aa1`, 만료 `2026-08-12T00:20:14.095Z`
- rollback 기준선: catalog 32개, 남성 후보 18개, 여성 후보 18개, 남녀 lineup 각 9개, catalog rotation alert 0개, delivery 0개
- 배포 앱 `GET /api/admin/hairstyles/cycles/latest`: 같은 active cycle과 lineup 각 9개, warning 0개
- v4 flag off에서는 기존 active row의 `catalog-v3` prompt version을 검증하고, v4 flag on에서만 `catalog-v4`를 요구한다.

### 14.2 2026-08-09 원격 rollout 증거

- Git: 최신 `main@6fe19e6`을 통합한 `develop/2026-08-08-hairstyle-blueprint-expansion@0dc5fd5`를 원격 게시했다.
- Supabase: `20260722120000_google_play_billing.sql`, `20260808090000_extend_hairstyle_blueprint_v4.sql` 적용 후 `supabase db push --dry-run`이 up-to-date를 반환했다.
- 코드 배포: Worker `322dfe87-aa69-42e4-bff9-bc4c9d461e91`을 flag-off 상태로 10% canary 후 100% 승격했다. canary에서 공개 페이지 30/30, 관리자 상태 API 30/30, 새 버전 preview API가 정상 응답했다.
- A cycle: `d2b06f66-39a3-49c9-8dfd-094ce4d41191`, 82 rows, 남녀 후보 각 43, lineup 각 9.
- B cycle: `941e14a2-f69d-434e-8eb6-f227695f7cfc`, 132 rows, 남녀 후보 각 68, lineup 각 9.
- C cycle: `d95d2899-a6e6-420d-9561-a8e9e4260ed9`, 182 rows, 남녀 후보 각 93, lineup 각 9.
- 구조화 RSS: 60/60 query 성공, 사용 근거 1건, 빈 facet 23개로 `qualityGateStatus=warn`을 기록했다. 안전·호환성은 RSS가 아니라 curated blueprint 제약과 activation validation이 담당한다.
- 최종 Worker: `08e7e3bb-d518-4ac6-bf57-b70fc97f6e50` 100%, `expansion-c`, RSS facet on, 개인화 `shadow/0%`.
- rollback drill: master-off Worker와 기존 cycle `992846d6-32be-4ab0-9ff2-6f7c22d23aa1`로 원자 복귀해 32 rows, 남녀 후보 각 18, lineup 각 9, 공개 페이지 5/5를 확인한 뒤 C cycle과 최종 Worker를 복구했다.
- 복구 후 smoke: 182 rows, 남녀 후보 각 93, lineup 각 9, warning 0, 공개 페이지 10/10 정상.
- 운영 편차: Cloudflare preview의 직접 Google News RSS 수집은 유효 근거 0건으로 fail-closed 됐다. A의 첫 제어 호출은 Windows `curl` JSON 인용 문제로 기본 활성화 요청으로 해석됐지만 82-row activation validation을 통과했고, 이후 B/C는 Node `fetch`의 명시적 `dryRun` 응답을 확인한 뒤 활성화했다.
- 개인화 증거: 최종 C cycle의 generation/evaluated/selected 표본은 모두 0건이다. 따라서 내부·10%·50%·100% live 전환은 수행하지 않고 shadow를 유지한다.

### 14.3 2026-08-09 RSS egress 복구와 최종 운영 증거

- Supabase Edge Function: `hairstyle-rss-proxy`를 `dpzdhxlqnogfpubpslbf`에 배포했다. `verify_jwt=false` 대신 함수 내부에서 service role `apikey`/Bearer를 검증하고, `https://news.google.com/rss/search` 및 `q/hl/gl/ceid`만 허용한다.
- 프록시 smoke: 정상 feed는 item/source 각 80개, 무인증 요청 401, 허용되지 않은 upstream 400, 잘못된 method 405를 반환했다.
- Worker: `fba6c1fd-170d-4717-8bd8-53f432464912`를 기존 `08e7e3bb-d518-4ac6-bf57-b70fc97f6e50` 90%/신규 10% canary로 배포한 뒤 공개 페이지 30/30과 관리자 상태 30/30을 확인하고 신규 버전을 100%로 승격했다.
- production 자동 경로 dry-run: `rssTransport=supabase-edge`, query 60개 중 성공 45·실패 15, 사용 근거 3건, `qualityGateStatus=warn`, 182 rows, 남녀 후보 각 93, lineup 각 9, prompt mismatch 0으로 통과했다. dry-run 전후 active cycle은 `d95d2899-a6e6-420d-9561-a8e9e4260ed9`로 동일하다.
- 최종 DB: active C 182 rows, 남녀 후보 각 93, lineup 각 9, catalog rotation alert 0, delivery 0이다.
- 개인화 표본은 generation/evaluated/selected 모두 0건이다. 따라서 안전한 운영값인 `shadow/0%`를 유지하고 실제 표본 없이 내부·10%·50%·100%를 강제하지 않는다.
