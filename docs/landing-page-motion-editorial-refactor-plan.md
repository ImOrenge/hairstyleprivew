# HairFit Motion Editorial 랜딩페이지 전체 리팩터링 계획

- 작성일: 2026-08-04
- 상태: 구현 및 검증 완료
- 작업 모드: `redesign`
- 변경 게이트: `style-contract` + 랜딩 전용 feature layout 재구성
- 기술 대상: Next.js 16 App Router의 기존 `/` 경로
- 1차 전환 목표: `/workspace`에서 사진 업로드 시작
- 작업 브랜치: `feat/2026-08-04-landing-rolling-hero`
- 통합 대상: `develop/2026-08-04-landing-rolling-hero`
- 계획 기준 HEAD: `87172db2eede7e3f1bbdbfca6916a9ffd0a2ab4a`
- 통합 대상 기준 SHA: `fa4934754b005df4759b1c71eea41cb5dde1a5a5`

## 1. 문서 목적

현재 랜딩페이지의 검증된 4열 롤링 히어로를 시각적 기준점으로 삼아 나머지 모든 섹션을 하나의 현대적인 에디토리얼 흐름으로 재설계한다.

이번 작업은 단순히 카드의 배경과 테두리를 제거하는 CSS 수정이 아니다. 기존의 카드 묶음 중심 정보 구조를 실사 이미지, 큰 타이포그래피, 전체 폭 장면, 제한된 스크롤 모션을 사용하는 `HairFit Motion Editorial` 구조로 전환한다.

완료된 랜딩은 다음 조건을 만족해야 한다.

1. 히어로부터 마지막 CTA까지 하나의 연속된 패션 필름처럼 읽힌다.
2. 섹션과 콘텐츠 컨테이너는 카드 배경, 카드 테두리, 카드 그림자를 사용하지 않는다.
3. 사진, 버튼, 입력 필드, 포커스 링 등 기능과 접근성을 위한 경계만 예외로 유지한다.
4. 모든 예시 이미지는 실사 에디토리얼 방향을 유지한다.
5. 공용 `Surface` 컴포넌트 계약과 다른 앱 화면에는 영향을 주지 않는다.
6. 데스크톱뿐 아니라 320~390px 모바일에서도 정보와 CTA가 손실되지 않는다.

## 2. 현재 기준선

### 2.1 구현 기준 파일

| 영역 | 현재 기준 파일 |
| --- | --- |
| 페이지 구성 | `my-app/app/page.tsx` |
| 롤링 히어로 | `my-app/components/home/HeroSection.tsx` |
| 히어로 스타일 | `my-app/components/home/HeroSection.module.css` |
| 패션 데모 | `my-app/components/home/FashionDemoShowcase.tsx` |
| 기능 소개 | `my-app/components/home/FeatureShowcase.tsx` |
| 가격 | `my-app/components/home/PricingPreview.tsx` |
| 후기 | `my-app/components/home/ReviewCarousel.tsx` |
| 모바일 CTA | `my-app/components/home/MobileStickyCtaBar.tsx` |
| 스크롤 등장 | `my-app/components/home/RevealOnScroll.tsx` |
| 공용 서피스 | `my-app/components/ui/Surface.tsx` |
| 공용 서피스 계약 | `docs/components/passports/web-surface.yaml` |
| 기존 랜딩 실행 기록 | `docs/landing-page-redesign-run.md` |

### 2.2 검증된 현재 상태

- 히어로는 4열, 16개 논리 타일, 8개 모델의 헤어·패션 페어로 구성되어 있다.
- 같은 모델의 헤어 이미지와 패션 이미지가 연속되며 열마다 다른 타이밍으로 세로 롤링한다.
- 히어로 이미지에는 테두리, 둥근 모서리, 상하단 투명 그라데이션이 적용되어 있다.
- 브랜드 설명과 CTA는 롤링 필름 아래 화면 중앙에 배치되어 있다.
- 히어로 이후 주요 섹션에는 1회성 스크롤 페이드인이 적용되어 있다.
- 공용 `Surface`는 안정화 상태이며 랜딩 외 다수 화면에서 사용된다.

### 2.3 현재 구조의 P1 문제

| ID | 문제 | 근거 | 목표 |
| --- | --- | --- | --- |
| P1-01 | 히어로 외곽이 큰 카드처럼 보임 | `.hero`의 border, background, radius | 외곽 카드 제거, 이미지 프레임만 유지 |
| P1-02 | 대부분의 섹션이 `Panel` 안에 `SurfaceCard`를 중첩 | `page.tsx`, `FeatureShowcase`, `PricingPreview` | 장면형 섹션과 평면 콘텐츠 구조로 전환 |
| P1-03 | 패션 데모에 `InverseCard`가 여러 단계로 중첩 | `FashionDemoShowcase.tsx` | 하나의 실사 중심 미디어 무대로 통합 |
| P1-04 | 후기가 카드 캐러셀로 분절됨 | `ReviewCarousel.tsx` | 인물과 큰 인용문 중심의 proof rail로 전환 |
| P1-05 | 가격 정보가 다섯 개 카드로 반복됨 | `PricingPreview.tsx` | 투명한 타이포그래피 가격표로 전환 |
| P1-06 | 섹션마다 동일한 카드 문법이 반복됨 | 전체 랜딩 | 5개 이하의 장면 패턴으로 리듬 재구성 |

### 2.4 변경 경계

이번 계획의 범위는 공개 랜딩 `/` 내부다.

범위에 포함한다.

- 랜딩 섹션 순서와 묶음 구조
- 랜딩 전용 레이아웃 컴포넌트
- 랜딩 전용 CSS namespace와 토큰
- 랜딩의 실사 이미지 배치와 모션
- 랜딩 컨테이너의 카드 제거
- 랜딩 반응형·접근성·성능·계약 테스트

범위에서 제외한다.

- 공용 `Surface`의 기본 스타일과 public API 변경
- 결제 상품, 가격, 크레딧 정책 변경
- `/workspace` 이후 생성 플로우 변경
- 인증, 결제, 살롱 제출 API 변경
- 브랜치 통합, push, release, deploy
- 인증·결제·살롱 제출과 무관한 제품 기능 변경

## 3. 제품 메시지 계약

레이아웃을 바꾸더라도 제품의 의미와 전환 목표는 바꾸지 않는다.

| 항목 | 계약 |
| --- | --- |
| 제품 | HairFit |
| 주요 사용자 | 내 사진으로 어울리는 헤어를 비교하고 패션까지 연결하고 싶은 사용자 |
| Job to be done | 여러 헤어 후보를 내 얼굴 기준으로 비교하고 선택한 헤어와 어울리는 패션을 확인한다 |
| One-liner | 내 사진 한 장으로 헤어를 비교하고, 선택한 스타일에 맞는 패션까지 이어본다 |
| Core promise | 헤어 선택을 단일 이미지 생성으로 끝내지 않고 실제 스타일 결정까지 연결한다 |
| Product proof | 8명 모델의 헤어·패션 연속 실사, 9가지 헤어 비교, 실제 생성 워크플로 |
| Primary CTA | 사진 업로드 시작 |
| Primary target | `/workspace` |
| Secondary conversion | 살롱 도입 문의 |

헤드라인과 CTA 문구를 수정할 때는 기존 제품 용어와 실제 지원 범위를 벗어나는 정확도, 보장, 즉시성 주장을 추가하지 않는다.

## 4. 디자인 컨셉: HairFit Motion Editorial

### 4.1 핵심 문장

`하나의 헤어 선택이 하나의 패션 장면으로 이어지는 디지털 에디토리얼 필름.`

### 4.2 히어로에서 페이지 전체로 확장할 디자인 언어

- 세로형 실사 이미지가 콘텐츠의 중심이다.
- 화면을 작은 카드로 자르지 않고 장면 단위로 사용한다.
- 장면 안의 텍스트는 이미지와 경쟁하지 않도록 짧고 크게 배치한다.
- 섹션 구분은 카드 테두리가 아니라 여백, 톤, 타이포그래피, 이미지 전환으로 만든다.
- 모션은 콘텐츠 의미를 설명할 때만 사용한다.
- 같은 모델의 헤어와 패션이 연속되도록 이미지 내러티브를 유지한다.

### 4.3 스타일 예산

| 항목 | 예산 | 규칙 |
| --- | --- | --- |
| 핵심 색상 | 3개 + 중립색 | 블랙, 오프화이트, HairFit 골드 accent |
| 장면 패턴 | 5개 | rolling rail, sticky stage, editorial split, typographic index, closing stage |
| 모션 패턴 | 3개 | continuous rail, scroll progress, reveal |
| 그림자 | 0개 | 랜딩 콘텐츠와 섹션에는 사용하지 않음 |
| 라운드 | 3개 이하 | 실사 미디어, 컨트롤, pill 상태에만 사용 |
| 브레이크포인트 | 4개 이하 | 320/390, 768, 1024, 1440 기준 |

## 5. 목표 정보 구조

현재 섹션의 제품 목적은 유지하되 신뢰가 가격보다 먼저 오도록 순서를 조정한다.

| 장면 | ID | 현재 소스 | 목표 구조 | 주요 역할 |
| --- | --- | --- | --- | --- |
| 01 | `home-hero` | `HeroSection` | Rolling Rail Hero | 정체성, 결과 이미지, CTA |
| 02 | `home-hairstyles` | `HairstylePreviewShowcase` | Origin × 3×3 Preview | 원본과 9개 결과 비교·선택 |
| 03 | `home-fashion` | `FashionDemoShowcase` | Open Hair × Fashion Stage | 제품 차별점 체험 |
| 04 | `home-workflow` | `page.tsx` | Sticky Workflow | 사용 흐름 설명 |
| 05 | `home-features` | `FeatureShowcase` | Editorial Feature Stories | 기능을 결과로 번역 |
| 06 | `home-criteria` | `page.tsx` | Selection Criteria Stage | 선택 기준과 신뢰 |
| 07 | `home-reviews` | `ReviewCarousel` | Proof Rail | 사용자 증거와 지표 |
| 08 | `home-pricing` | `PricingPreview` | Typographic Pricing Index | 가격과 제공량 비교 |
| 09 | `home-faq` | `page.tsx` | Oversized FAQ Index | 반대 의견 해소 |
| 10 | `home-salon` | `page.tsx`, `B2BLeadForm` | Salon Editorial Bridge | 보조 B2B 전환 |
| 11 | `home-final-cta` | `FinalCtaBlock` | Closing Stage | 1차 CTA 재확인 |

`Reviews`는 `Pricing`보다 앞에 둔다. 가격을 제시하기 전에 사용 결과와 신뢰 근거를 보여주기 위함이다.

## 6. 카드 제거와 시각 계약

### 6.1 기본 계약

모든 랜딩 콘텐츠 컨테이너는 다음 계산 스타일을 만족해야 한다.

```css
.f-landing [data-landing-surface] {
  background: transparent;
  border-width: 0;
  box-shadow: none;
}
```

다음 요소는 카드 제거 대상이다.

- 섹션 외곽 Panel
- 기능, 단계, 후기, 요금제, FAQ, 사용 사례 카드
- 패션 데모의 중첩 결과·추천·단계 카드
- 장식 목적으로만 존재하는 border와 shadow
- 카드 전용 pointer glow

### 6.2 허용 예외

| 예외 | 허용 이유 | 허용 스타일 |
| --- | --- | --- |
| 히어로·콘텐츠 실사 이미지 | 미디어 프레임 구분 | 얇은 테두리, 이미지 라운드 |
| 버튼·CTA | 상호작용 affordance | 배경, 테두리, hover, focus ring |
| 입력·텍스트 영역 | 입력 가능 영역 인지 | 테두리, 입력 배경, 오류 상태 |
| 선택·탭·필터 | 현재 상태 인지 | accent text, underline, indicator, focus ring |
| 색상 스와치 | 실제 색상 콘텐츠 | 색상 배경과 선택 indicator |
| 로딩 skeleton | 레이아웃 안정화 | 제한된 placeholder tone |

활성 선택 상태를 큰 카드 배경으로 표현하지 않는다. 우선순위는 글자색, 굵기, 밑줄, 작은 accent marker 순이다.

### 6.3 페이지 캔버스

- 개별 콘텐츠는 투명하지만 페이지 전체 캔버스에는 어두운 기본 톤을 허용한다.
- 톤 전환이 필요하면 둥근 섹션 카드가 아니라 viewport 전체 폭의 color band로 적용한다.
- 기존 대각선 패턴이 이미지 가독성을 방해하면 `.f-landing` 범위에서 강도를 낮추거나 제거한다.
- 전체 페이지에서 한 번에 두 개 이상의 강한 배경 효과를 겹치지 않는다.

## 7. 랜딩 전용 컴포넌트 구조

### 7.1 목표 트리

```text
AppPage
└── main.f-landing
    ├── LandingScene[data-layout="rolling-rail"]
    ├── LandingScene[data-layout="sticky-stage"]
    ├── LandingScene[data-layout="editorial-split"]
    ├── LandingScene[data-layout="typographic-index"]
    └── LandingScene[data-layout="closing-stage"]
```

### 7.2 신규 feature layout

`LandingScene`은 공용 디자인 시스템 컴포넌트가 아니라 랜딩 전용 layout component다.

예상 public API:

```ts
type LandingSceneProps = {
  as?: "section" | "div";
  id: string;
  number?: string;
  layout: "rolling-rail" | "sticky-stage" | "editorial-split" | "typographic-index" | "closing-stage";
  tone?: "canvas" | "inverse" | "quiet";
  motion?: "none" | "reveal" | "scroll-progress" | "continuous";
  className?: string;
  children: React.ReactNode;
};
```

구현 원칙:

- kind: `layout`
- stability: 첫 구현은 `candidate`
- namespace: `.f-landing-scene`
- 상태 선택자: `data-layout`, `data-tone`, `data-motion`
- 비즈니스 데이터, API, route 상태를 소유하지 않는다.
- `SceneHeader`, `MediaStage`, `MotionRail`, `EditorialList`는 첫 단계에서 로컬 element 또는 작은 feature component로 유지한다.
- 두 곳 이상에서 실제 API가 안정된 뒤에만 별도 candidate로 분리한다.

### 7.3 CSS 파일 구조

```text
my-app/app/globals.css
my-app/app/landing.css                 # 신규, .f-landing namespace
my-app/components/home/HeroSection.module.css
```

`landing.css`는 다음을 소유한다.

- 랜딩 캔버스와 장면 간격
- scene layout variant
- landing typography scale
- landing-only media와 surface 계약
- sticky stage와 editorial split 반응형
- reduced-motion fallback

`HeroSection.module.css`는 다음을 계속 소유한다.

- 4열 레일
- 타일 크기와 열별 animation timing
- 이미지 그라데이션
- 히어로 중앙 카피와 CTA 배치

공용 `globals.css`의 `c-surface`, `.app-panel`, `.app-card`, `.app-inverse` 기본값을 변경하지 않는다.

### 7.4 랜딩 토큰 후보

```css
.f-landing {
  --landing-canvas: var(--app-bg);
  --landing-ink: var(--app-text);
  --landing-accent: var(--app-accent);
  --landing-gutter: clamp(1rem, 4vw, 4.5rem);
  --landing-scene-block: clamp(5rem, 11vw, 10rem);
  --landing-copy-max: 42rem;
  --landing-media-radius: clamp(0.75rem, 1.5vw, 1.25rem);
  --landing-reveal-distance: 1.5rem;
  --landing-motion-fast: 220ms;
  --landing-motion-reveal: 860ms;
  --landing-motion-stagger: 85ms;
}
```

하드코딩된 일회성 여백, radius, duration이 증가하면 토큰 후보로 승격한다.

## 8. 섹션별 상세 청사진

### 8.1 Scene 01 — Rolling Rail Hero

목적:

- 첫 viewport에서 HairFit, 헤어·패션 연속성, CTA를 동시에 전달한다.

구조:

- 외곽 `.hero`의 border, background, shadow, 큰 radius를 제거한다.
- 4개 세로 레일과 16개 논리 이미지 구조는 유지한다.
- 사진 간격은 현재처럼 밀착시키고 타일 경계만 얇게 남긴다.
- 상하단 투명 그라데이션과 중앙 브랜드 카피를 유지한다.
- 다음 3×3 헤어 프리뷰 장면의 일부가 첫 viewport 하단에 보이도록 높이를 조정한다.

반응형:

- 데스크톱과 모바일 모두 4열을 유지한다.
- 320px에서는 타일 radius와 gap만 축소한다.
- 고정 CTA가 히어로 CTA를 가리지 않아야 한다.

Exit:

- 히어로 외곽 computed border `0px`, background 투명, shadow 없음.
- 이미지 타일의 border와 radius는 유지.
- 1440px와 390px에서 가로 오버플로 `0px`.

### 8.2 Scene 02 — Origin × 3×3 Hairstyle Preview

목적:

- 원본 모델을 기준으로 같은 얼굴의 9가지 헤어 변화를 한눈에 비교하고 하나를 직접 선택하게 한다.

구조:

- 데스크톱은 원본 모델, 3×3 결과 보드, 선택 요약을 독립된 3열로 배치한다.
- 원본 모델에는 얼굴형과 두상 밸런스 기준을 함께 표시하되 외곽 카드 배경은 사용하지 않는다.
- 결과는 남성·여성 각각 9장으로 유지하고 모든 화면에서 실제 3열×3행 배열을 보존한다.
- 선택 상태는 이미지 프레임의 accent border, check indicator, 텍스트 요약으로 중복 전달한다.
- 모바일은 원본 모델, 3×3 결과, 선택 요약 순서로 전환한다.

Exit:

- 남성·여성 원본 이미지 2장과 결과 이미지 18장이 유지된다.
- 320/390/768/1024/1440px에서 결과 보드가 항상 3열이며 가로 오버플로가 없다.
- 탭과 결과 선택을 키보드 및 native button으로 조작할 수 있다.

### 8.3 Scene 03 — Open Hair × Fashion Stage

목적:

- 선택한 헤어가 패션 추천으로 이어진다는 제품 차별점을 실제 화면처럼 체험시킨다.

구조:

- 기존 `InverseSection`과 중첩 `InverseCard`를 제거한다.
- 좌측 모델·스타일 인덱스, 중앙 대형 실사 모델, 우측 헤어·패션 설명을 하나의 외곽 컨테이너로 묶지 않고 같은 오픈 그리드의 독립 요소로 배치한다.
- 성별과 look 선택 기능은 유지하되 카드형 선택 버튼을 editorial index로 바꾼다.
- 추천 색상과 아이템은 독립 카드가 아니라 이미지 아래의 평면 caption/list로 배치한다.
- 같은 모델의 hair crop과 fashion full-body가 하나의 전환으로 이어진다.

모션:

- 데스크톱은 scroll progress 또는 명시적 선택으로 hair → fashion 상태를 전환한다.
- 모바일은 sticky를 제거하고 한 모델씩 세로로 보여준다.
- 선택 기능은 키보드로 조작 가능해야 하며 상태를 색상에만 의존하지 않는다.

Exit:

- `InverseSection`, `InverseCard` import와 사용이 없다.
- 이미지와 controls를 제외한 내부 surface가 투명하다.
- 기존 `f-fashion-stage__stage` 래퍼가 없고 controls, media, details가 직접 형제 구조다.
- 선택 변경 시 기존 데이터와 결과 설명이 손실되지 않는다.

### 8.4 Scene 04 — Sticky Workflow

목적:

- 업로드부터 헤어 비교와 패션 연결까지의 단계를 짧은 스크롤 이야기로 설명한다.

구조:

- 기존 단계 카드 3개를 제거한다.
- 왼쪽에는 큰 단계 번호와 문장, 오른쪽에는 고정 media stage를 배치한다.
- 단계가 바뀔 때 media stage의 실사 또는 실제 제품 화면이 교체된다.

반응형과 접근성:

- 데스크톱에서만 제한된 sticky를 사용한다.
- 모바일과 reduced-motion에서는 단계별 정적 세로 배열로 전환한다.
- DOM 순서는 시각 순서와 동일하게 유지한다.

Exit:

- 각 단계가 카드 없이도 번호, 간격, 타이포그래피로 구분된다.
- 200% 확대에서 텍스트와 media stage가 겹치지 않는다.

### 8.5 Scene 05 — Editorial Feature Stories

목적:

- 기능 이름보다 사용자가 얻는 결과를 크게 보여준다.

구조:

- `FeatureShowcase`의 외곽 Panel과 4개 SurfaceCard를 제거한다.
- 현재 feature data와 설명은 유지한다.
- 이미지 60% / 텍스트 40%의 좌우 교차 장면을 사용한다.
- 기존 카드 내부 point 문구는 작은 캡션 또는 editorial fact line으로 전환한다.

모션:

- 장면 진입 시 이미지와 문구가 한 번만 reveal된다.
- 카드 hover translate와 border 강조는 제거한다.

Exit:

- `Panel`, `SurfaceCard` 사용이 없다.
- 모바일에서 이미지 다음에 해당 설명이 바로 이어진다.

### 8.6 Scene 06 — Selection Criteria Stage

목적:

- HairFit이 얼굴형, 분위기, 관리 난이도 같은 선택 요소를 함께 본다는 신뢰를 만든다.

구조:

- 좌측 설명 Panel과 우측 기준 카드 묶음을 하나의 비교 장면으로 합친다.
- 대형 모델 이미지 위 또는 옆에 기준을 순차 배치한다.
- 기준 항목은 번호, 짧은 제목, 한 문장 설명으로 제한한다.
- 설명 CTA는 기존 `/workspace` 목적지를 유지한다.

Exit:

- 기준 항목에 카드 배경과 테두리가 없다.
- 이미지가 없어도 텍스트만으로 의미와 순서가 전달된다.

### 8.7 Scene 07 — Proof Rail

목적:

- 가격을 보기 전에 사용 경험과 정량 근거를 제공한다.

구조:

- 지표는 하나의 inline metric row로 배치한다.
- 후기는 인물, 큰 인용문, 사용 결과의 세 요소만 유지한다.
- 후기 카드 프레임과 내부 divider를 제거한다.
- 여러 후기는 수평 scroll snap 또는 drag 가능한 rail로 배치한다.

모션과 접근성:

- 자동 이동이 필요하면 저속으로 제한하고 hover, focus, reduced-motion에서 중지한다.
- 기본안은 사용자 주도 scroll snap이다.
- 인용문 순서와 작성자 정보는 DOM에서 연속되어야 한다.

Exit:

- `InverseSection`, `InverseCard` 사용이 없다.
- 키보드와 터치로 모든 후기에 도달할 수 있다.

### 8.8 Scene 08 — Typographic Pricing Index

목적:

- 제공량과 가격을 빠르게 비교하고 `/workspace` 또는 결제 플로우로 이동시킨다.

구조:

- 현재 요금 데이터와 결제 분기 로직은 변경하지 않는다.
- 5개 요금제 카드를 desktop ledger/table 형태로 전환한다.
- 추천 요금제는 배경이나 외곽선 대신 accent label, 굵기, 작은 marker로 표시한다.
- 모바일은 요금제별 세로 block으로 바꾸되 카드 배경은 사용하지 않는다.

상태 예외:

- 구매 버튼과 로그인·결제 상태는 기존 control surface를 유지한다.
- disabled, pending, 오류 피드백을 시각적으로 구분한다.

Exit:

- `Panel`, `SurfaceCard` 사용이 없다.
- 현재 가격·크레딧·CTA 로직에 대한 계약 테스트가 그대로 통과한다.

### 8.9 Scene 09 — Oversized FAQ Index

목적:

- 업로드, 결과, 결제, 개인정보, 다음 행동에 대한 반대 의견을 해소한다.

구조:

- 외곽 Panel과 개별 FAQ SurfaceCard를 제거한다.
- 큰 질문 번호, 질문, 열림 indicator만 기본 상태에서 보여준다.
- 답변은 질문 아래 동일 흐름에서 확장한다.
- 질문 사이 구분은 충분한 여백을 기본으로 하고 장식 divider는 사용하지 않는다.

접근성:

- native `details/summary` 또는 동등한 button/region 계약을 유지한다.
- 키보드 포커스 링은 제거하지 않는다.

Exit:

- 모든 질문이 카드 없이 스캔 가능하다.
- 열림 상태가 아이콘 또는 텍스트로도 식별된다.

### 8.10 Scene 10 — Salon Editorial Bridge

목적:

- 1차 B2C 흐름을 깨지 않으면서 살롱 도입 문의를 보조 전환으로 제공한다.

구조:

- 살롱 사용 사례 카드를 하나의 full-bleed editorial split으로 전환한다.
- 왼쪽에는 살롱 현장 실사와 가치 제안, 오른쪽에는 `B2BLeadForm`을 배치한다.
- 입력 필드는 기능성 surface 예외로 유지한다.
- 사용자용 CTA와 살롱 문의 CTA의 우선순위를 시각적으로 구분한다.

Exit:

- 사용 사례 카드가 없다.
- form label, 오류, 제출 상태, 개인정보 안내가 유지된다.

### 8.11 Scene 11 — Closing Stage

목적:

- 방문자가 첫 행동을 선택하도록 전환 경로를 한 번 더 명확히 한다.

구조:

- 기존 `InverseSection` 카드형 CTA를 제거한다.
- 히어로의 일부 세로 이미지를 축약한 closing strip과 중앙 CTA를 결합한다.
- 히어로를 그대로 복제하지 않고 정적인 2~3컷 또는 느린 역방향 rail을 사용한다.
- Primary CTA 하나를 우선하고 secondary link는 시각 강도를 낮춘다.

Exit:

- CTA 목적지가 `/workspace`로 유지된다.
- 화면 하단 safe area와 모바일 sticky CTA가 겹치지 않는다.

## 9. 모션 시스템

### 9.1 허용 모션

| 패턴 | 적용 | 규칙 |
| --- | --- | --- |
| `continuous` | Hero | transform 기반, 열별 다른 duration, 무한 반복 |
| `scroll-progress` | Fashion, Workflow | 데스크톱 중심, 콘텐츠 상태와 일치 |
| `reveal` | 나머지 장면 | opacity + translate, 1회 실행 |

섹션 래퍼는 `1.05s` 동안 천천히 페이드인하고, 내부의 번호·eyebrow·제목·설명·이미지·선택지·목록은 `data-reveal-order`에 따라 `85ms` 간격으로 상승한다. 긴 목록은 order `13`에서 지연을 제한하며, 키보드 포커스가 먼저 진입하면 즉시 visible 상태로 전환한다.

### 9.2 금지

- 모든 섹션에 서로 다른 parallax를 추가하지 않는다.
- 카드 hover처럼 의미 없는 translate와 scale을 추가하지 않는다.
- 텍스트를 읽는 동안 자동으로 콘텐츠를 교체하지 않는다.
- 스크롤을 강제로 가로채거나 자연 스크롤을 차단하지 않는다.
- 모바일에서 100vh sticky 장면을 연속 사용하지 않는다.

### 9.3 Reduced Motion

`prefers-reduced-motion: reduce`에서는 다음을 적용한다.

- Hero rail animation `none`
- scroll progress 대신 첫 번째 또는 전체 정적 상태 표시
- reveal transform 제거, opacity `1`
- 자동 후기 이동 중지
- 콘텐츠와 CTA는 모션 없이도 모두 도달 가능

## 10. 실사 이미지와 자산 방향

- `my-app/public/hero/rolling/model-01..08-{hair,fashion}.webp`는 Hero에만 사용한다.
- `my-app/public/hero/demo/*-original.webp`와 `grid/*.webp`는 Origin 3×3 프리뷰와 Fashion demo의 헤어 선택 썸네일에만 사용한다.
- Hero 밖의 메시지는 `my-app/public/landing/editorial/*.webp`에 있는 고유한 설명 이미지 18장을 사용하며 서로 재사용하지 않는다.
- 섹션별 이미지는 한 명의 인물 또는 실제 상담에 필요한 최소 인원, 한국형 패션 에디토리얼, 중립 스튜디오, 실제 피부·모발 질감을 유지한다.
- 거울 속 복제 인물, 반사와 본체의 다른 자세·의상·소품, 불필요한 군중 구도는 사용하지 않는다.
- 생성 이미지가 제품 UI나 실제 사용자 결과처럼 오인되지 않도록 필요한 곳에는 예시임을 표시한다.
- 장식 이미지보다 실제 제품 흐름, 모델 페어, 결과 비교를 우선한다.
- 새 자산은 WebP 또는 AVIF를 기본으로 하고 intrinsic size를 기록한다.
- LCP 후보 이미지만 priority preload를 허용한다.
- 모바일에서 desktop 전신 이미지를 그대로 과도하게 다운로드하지 않도록 `sizes`를 검토한다.

## 11. 반응형 계약

| 범위 | 구조 |
| --- | --- |
| 1440px 이상 | 넓은 canvas, split/sticky 적극 사용, 최대 콘텐츠 폭 제한 |
| 1024~1439px | split 유지, gutter와 타이포 축소 |
| 768~1023px | sticky 완화, 2열 또는 순차 layout |
| 320~767px | 단일 열 중심, Hero만 4열 유지, 모든 sticky 정적 전환 |

공통 Exit:

- 320, 390, 768, 1024, 1440px에서 가로 오버플로 `0px`.
- fixed header가 anchor 제목을 가리지 않는다.
- CTA가 viewport 밖으로 잘리거나 sticky CTA와 겹치지 않는다.
- 200% 텍스트 확대에서 문구와 controls가 손실되지 않는다.

## 12. 접근성 계약

- 페이지에는 하나의 `h1`만 두고 장면 제목은 논리적인 `h2` 순서를 유지한다.
- `main`, `section`, `nav`, form landmark를 실제 의미에 맞게 사용한다.
- 활성 상태는 색상만으로 표현하지 않는다.
- 버튼, 링크, summary, form control의 focus ring은 카드 제거 규칙의 예외다.
- 이미지에는 장식/정보 목적에 맞는 alt를 제공한다.
- motion rail 복제 DOM은 스크린리더에서 중복 읽히지 않게 처리한다.
- sticky 또는 absolute 배치가 DOM 읽기 순서를 바꾸지 않는다.
- Browser Gate에서 duplicate ID, alt 누락, 이름 없는 button이 `0`이고 tablist별 selected tab이 정확히 1개인지 확인한다.

## 13. 성능 계약

- transform과 opacity 외의 연속 animation을 피한다.
- scroll listener는 requestAnimationFrame 또는 observer 기반으로 제한한다.
- `next/image`와 명시적 `sizes`를 유지한다.
- 아래쪽 복합 장면은 기존 dynamic import 전략을 유지하거나 측정 후 조정한다.
- CSS filter, backdrop blur, 대형 shadow를 신규 도입하지 않는다.
- 기준선과 변경 후 LCP, CLS, JS console, 이미지 전송량을 같은 viewport에서 비교한다.
- 변경 후 median LCP가 기준선보다 10% 이상 악화되면 이미지 우선순위와 motion implementation을 먼저 축소한다.

## 14. 구현 페이즈

### Phase 0 — 기준선과 계약 고정

목표:

- 구현 전 현재 화면과 계약을 재현 가능한 증거로 남긴다.

작업:

1. 1440×1000, 1024×900, 390×844, 320×800 화면을 캡처한다.
2. 현재 section order, heading, CTA, analytics hook, Surface import를 inventory한다.
3. 카드 제거 예외 matrix를 확정한다.
4. `docs/landing-page-redesign-run.md`를 새 run의 `plan` 상태로 갱신한다.
5. 현재 LCP, CLS, overflow, console 기준선을 기록한다.

Exit:

- before screenshot과 computed-style evidence가 존재한다.
- exactly one `next_action`이 run packet에 기록된다.

Rollback:

- 문서와 evidence만 생성하므로 런타임 롤백 없음.

### Phase 1 — LandingScene 기반과 Hero 외곽 제거

대상 파일:

- `my-app/components/home/LandingScene.tsx` 신규
- `my-app/app/landing.css` 신규
- `my-app/app/globals.css`
- `my-app/app/page.tsx`
- `my-app/components/home/HeroSection.module.css`
- `docs/components/passports/web-landing-scene.yaml` 신규
- `docs/components/component-registry.json`

작업:

1. `.f-landing`, `.f-landing-scene` namespace와 토큰을 추가한다.
2. `LandingScene` candidate 계약을 만든다.
3. Hero outer shell의 카드 스타일을 제거한다.
4. 페이지 루트에서 landing-only CSS contract를 활성화한다.
5. Hero tile, gradient, CTA 예외를 테스트로 고정한다.

Exit:

- Hero 카드 제거 browser comment가 해결된다.
- 공용 Surface 계약 테스트가 그대로 통과한다.
- Hero desktop/mobile baseline이 유지된다.

Rollback:

- `LandingScene`, landing CSS import, Hero outer-shell diff만 독립적으로 되돌릴 수 있어야 한다.

### Phase 2 — 오프닝 시퀀스

대상:

- `HeroSection`
- `HairstylePreviewShowcase`
- `FashionDemoShowcase`
- `MobileStickyCtaBar`

작업:

1. Hero와 Origin 3×3, Fashion 사이의 vertical rhythm을 연결한다.
2. 원본 모델과 9개 결과를 비교·선택하는 독립 프리뷰를 복구한다.
3. Fashion 중첩 카드를 Open Hair × Fashion Stage로 교체한다.
4. 기존 선택 데이터와 이벤트를 새 layout에 연결한다.
5. mobile static fallback과 reduced-motion 상태를 구현한다.

Exit:

- 위 세 장면이 하나의 오프닝 시퀀스로 읽힌다.
- 선택 기능과 CTA 동작 회귀가 없다.

Rollback:

- 새 layout을 비활성화하고 기존 Fashion rendering으로 복귀할 수 있도록 데이터와 rendering 경계를 분리한다.

### Phase 3 — 제품 내러티브

대상:

- Workflow
- `FeatureShowcase`
- Selection Criteria

작업:

1. Workflow를 sticky story로 전환한다.
2. Feature cards를 교차 editorial scenes로 전환한다.
3. Criteria cards를 하나의 selection stage로 통합한다.
4. 모든 장면에 static mobile/reduced fallback을 제공한다.

Exit:

- 세 장면에서 `Panel`, `SurfaceCard` 사용이 없다.
- 텍스트 DOM 순서와 heading 구조가 유지된다.

Rollback:

- 장면별 독립 commit 또는 독립 diff로 되돌릴 수 있어야 한다.

### Phase 4 — 신뢰와 전환

대상:

- `ReviewCarousel`
- `PricingPreview`
- FAQ
- Salon
- Final CTA

작업:

1. Reviews를 proof rail로 전환하고 Pricing 앞에 배치한다.
2. 가격 카드를 typographic index로 전환한다.
3. FAQ를 oversized question list로 전환한다.
4. Salon을 full-bleed B2B bridge로 전환한다.
5. Final CTA를 closing stage로 전환한다.

Exit:

- 가격·결제·lead form 기능은 유지된다.
- 카드형 section/surface 사용이 랜딩에서 제거된다.

Rollback:

- 정보 순서 변경과 각 컴포넌트 rendering 변경을 분리해 되돌릴 수 있어야 한다.

### Phase 5 — CSS 계약과 정리

작업:

1. landing 파일의 미사용 Surface imports와 legacy classes를 제거한다.
2. 신규 landing contract test를 추가한다.
3. `LandingScene` Passport와 registry를 구현 상태에 맞게 갱신한다.
4. pointer glow, hover transform, 중첩 border를 제거한다.
5. 토큰, selector, reduced-motion 규칙을 정리한다.

Exit:

- 랜딩에서 `Panel`, `SurfaceCard`, `InverseSection`, `InverseCard` import가 `0`이다.
- controls/media 예외를 제외한 landing surface가 투명·무테두리·무그림자다.
- 공용 Surface Passport와 CSS 계약에는 breaking change가 없다.

Rollback:

- 공용 Surface에 손대지 않으므로 랜딩 namespace와 home component diff만 되돌린다.

### Phase 6 — 브라우저 검증과 핸드오프

작업:

1. 계약 테스트, typecheck, lint, build를 실행한다.
2. desktop/mobile, light/dark, reduced-motion을 검증한다.
3. Before/after screenshot과 computed-style audit를 남긴다.
4. `docs/landing-page-redesign-run.md`를 `handoff`로 갱신한다.
5. 남은 외부 gate와 정확한 다음 행동 하나를 기록한다.

Exit:

- 아래 Acceptance Gates가 모두 pass 또는 명시적 external-limited다.

## 15. 예상 파일 변경 목록

### 신규

- `docs/landing-page-motion-editorial-refactor-plan.md`
- `my-app/components/home/LandingScene.tsx`
- `my-app/app/landing.css`
- `my-app/lib/landing-flat-surface-contract.test.ts`
- `docs/components/passports/web-landing-scene.yaml`

### 수정

- `docs/landing-page-redesign-run.md`
- `docs/components/component-registry.json`
- `my-app/app/globals.css`
- `my-app/app/page.tsx`
- `my-app/components/home/HeroSection.module.css`
- `my-app/components/home/HeroSection.tsx`
- `my-app/components/home/FashionDemoShowcase.tsx`
- `my-app/components/home/FeatureShowcase.tsx`
- `my-app/components/home/PricingPreview.tsx`
- `my-app/components/home/ReviewCarousel.tsx`
- `my-app/components/home/MobileStickyCtaBar.tsx`
- `my-app/components/home/RevealOnScroll.tsx`
- `my-app/package.json`

파일 목록은 Phase 0 inventory에서 확정한다. 구현 중 범위가 다른 app route 또는 공용 UI로 확장되면 별도 change gate를 요구한다.

## 16. 자동 검증 계획

신규 script 후보:

```json
{
  "landing-flat-surface:contract:test": "node --no-warnings --test lib/landing-flat-surface-contract.test.ts"
}
```

구현 완료 전 실행할 명령:

```powershell
npm --prefix my-app run lint -- app/page.tsx components/home
npm --prefix my-app run typecheck
npm --prefix my-app run landing-flat-surface:contract:test
npm --prefix my-app run landing-hero:contract:test
npm --prefix my-app run global-css:contract:test
npm --prefix my-app run surface-stability:contract:test
npm --prefix my-app run web-image:contract:test
npm run component-registry:validate
npm --prefix my-app run build
```

Contract test가 고정할 항목:

- landing home components에서 금지 Surface imports `0`
- Hero outer shell에 border/background/shadow 없음
- Hero media tile의 border/radius/gradient 존재
- `.f-landing`과 `.f-landing-scene` namespace 존재
- reduced-motion fallback 존재
- `LandingScene` Passport와 registry 경로 일치
- 가격과 B2B form의 기능성 controls 예외 유지

## 17. 브라우저 검증 계획

| Gate | Viewport/상태 | 합격 조건 |
| --- | --- | --- |
| First viewport | 1440×1000 | 제품명, 가치, CTA, 다음 장면 hint가 보임 |
| Desktop flow | 1440×1000 | 11개 장면의 리듬과 anchor 정상 |
| Tablet | 1024×900, 768×1024 | split/sticky 축소와 텍스트 겹침 없음 |
| Mobile | 390×844, 320×800 | 가로 overflow 0, CTA 비가림 |
| Theme | light/dark | 텍스트와 controls contrast 유지 |
| Motion | normal/reduced | 모든 콘텐츠 도달, 자동 motion 중지 |
| Keyboard | 전체 인터랙션 | focus 순서와 focus ring 정상 |
| Accessibility | semantic DOM audit | duplicate ID, alt 누락, 이름 없는 button 0; tab/panel 연결 정상 |
| Runtime | console/network | blocking console/page/asset 오류 0 |
| Style contract | computed styles | surface 투명·border 0·shadow none |

Browser evidence는 before/after 같은 viewport로 저장하며, 시각적으로 좋다는 판단만으로 Gate를 통과시키지 않는다.

## 18. 리스크와 대응

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| 모든 섹션이 동일한 롤링 효과를 사용 | 피로도와 정보 손실 | continuous motion은 Hero만 기본 허용 |
| sticky가 모바일 스크롤을 방해 | CTA 이탈 | 768px 이하 static flow |
| 카드 제거 뒤 정보 경계가 약해짐 | 스캔성 저하 | 번호, 타이포, grid, vertical rhythm으로 구분 |
| 실사 이미지 증가 | LCP와 데이터 증가 | sizes, lazy loading, WebP/AVIF, priority 제한 |
| 공용 Surface 전역 수정 | 다른 화면 회귀 | 공용 CSS 불변, `.f-landing` namespace 사용 |
| 가격 UI 재배치 | 결제 행동 회귀 | 데이터·handler 유지, rendering만 교체 |
| 후기 rail 자동 재생 | 접근성 저하 | 사용자 주도 기본, 자동 시 pause 제공 |
| B2B 섹션이 B2C 흐름을 분산 | 1차 CTA 약화 | Salon을 후반 secondary bridge로 제한 |

## 19. Git·롤백·핸드오프 경계

- 기본 작업 폴더 `D:\HariStyle-Preview`의 기존 변경은 건드리지 않는다.
- 모든 구현은 현재 랜딩 전용 작업트리에서 수행한다.
- 각 Phase 착수 전 preflight로 branch, target, dirty state를 재확인한다.
- Phase별 diff를 분리해 장면 단위로 되돌릴 수 있게 한다.
- 공용 Surface를 변경하지 않아 landing-only rollback이 가능해야 한다.
- 문서 작성 또는 구현 완료는 commit, merge, push, release, deploy를 자동 승인하지 않는다.
- 통합 요청이 별도로 주어지면 `feat/2026-08-04-landing-rolling-hero`와 기록된 `develop/2026-08-04-landing-rolling-hero`의 ancestry를 다시 검증한다.

## 20. Agentic Run Packet

### Mode

`redesign`

### Phase

`plan`

### User Goal

히어로와 같은 현대적인 실사·모션 디자인 언어를 랜딩 전체 섹션에 적용하고 모든 카드형 컨테이너를 제거한다.

### Known Context

- 4열 세로 롤링 히어로는 구현과 browser validation을 마쳤다.
- 사진 테두리, 라운드, 상하단 투명 그라데이션은 유지해야 한다.
- 카드 배경, 카드 테두리, 카드 그림자는 랜딩의 모든 콘텐츠 컨테이너에서 제거해야 한다.
- 섹션은 스크롤 진입 시 fade-in하며 실사 이미지 방향을 유지한다.

### Assumptions

| ID | Assumption | Risk | Confirmation Needed |
| --- | --- | --- | --- |
| A-01 | 기존 제품 문구, 가격, CTA 목적지는 유지한다 | 낮음 | 아니오 |
| A-02 | B2C `/workspace` 진입이 1차 전환이다 | 낮음 | 아니오 |
| A-03 | Salon은 후반 secondary conversion으로 유지한다 | 중간 | 구현 전 copy 변경 시 필요 |
| A-04 | 기존 8명 모델 페어는 Hero에 유지하고, 별도 원본·3×3 헤어 자산은 Hairstyle/Fashion demo에서만 사용한다 | 낮음 | 아니오 |

### Work Queue

| ID | Phase | Task | Exit Condition | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| W-00 | inspect | 기준선과 style contract 고정 | before 증거와 inventory 존재 | screenshot, computed style, source inventory | completed |
| W-01 | repair | LandingScene 기반과 Hero 카드 제거 | Hero outer card 없음 | contract test, screenshot | completed |
| W-02 | repair | Origin 3×3/Fashion/Workflow 오프닝 재구성 | 원본·9개 결과 유지, unboxed fashion, mobile fallback | interaction, visual | completed |
| W-03 | repair | Features/Criteria 내러티브 재구성 | Surface imports 제거 | source search, visual | completed |
| W-04 | repair | Reviews/Pricing/FAQ/Salon/CTA 재구성 | 전환 기능 유지 | contract, browser | completed |
| W-05 | verify | 전체 검증과 핸드오프 | acceptance gates 충족 | commands, screenshots, audit | completed |

### Acceptance Gates

- Agentic Operation Gate: run packet, evidence, exactly one next action 기록
- Copy Gate: Hero, feature, proof, pricing, FAQ, CTA가 하나의 message map 유지
- Design Gate: 첫 viewport와 11개 장면이 HairFit Motion Editorial 언어로 연결
- Browser Gate: desktop/mobile/theme/reduced-motion before-after 증거
- Technical Gate: lint, typecheck, contracts, registry, build 통과
- Fix Gate: Hero outer card와 나머지 nested cards 제거 증거

### Current Status

`complete`

### Next Action

열린 로컬 랜딩에서 최종 시각 승인을 진행한다.

## 21. 최종 Exit Gate

- [x] Hero 외곽 카드가 제거되고 사진 프레임은 유지됨
- [x] 랜딩의 `Panel`, `SurfaceCard`, `InverseSection`, `InverseCard` 사용이 0임
- [x] 모든 콘텐츠 컨테이너의 배경이 투명하고 border/shadow가 없음
- [x] Hero, Origin 3×3, Fashion, Workflow가 하나의 오프닝 흐름으로 연결됨
- [x] Features와 Criteria가 카드가 아닌 실사 에디토리얼 장면으로 구성됨
- [x] Reviews가 Pricing보다 먼저 배치되고 proof rail로 동작함
- [x] Pricing의 가격·크레딧·CTA 로직이 유지됨
- [x] FAQ, Salon 링크, CTA의 키보드·포커스 계약이 유지됨
- [x] 320/390/768/1024/1440px 가로 오버플로가 0임
- [x] reduced-motion에서 자동 모션이 중지되고 콘텐츠 손실이 없음
- [x] semantic DOM audit에서 duplicate ID, alt 누락, 이름 없는 button이 0임
- [x] 공용 Surface contract test가 통과함
- [x] landing contract, image contract, typecheck, lint, build가 통과함
- [x] desktop/mobile 시각 증거와 검증 결과가 run packet에 기록됨
