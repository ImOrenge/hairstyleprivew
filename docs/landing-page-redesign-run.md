# HairFit landing page redesign run

- date: `2026-08-04`
- updated: `2026-08-12`
- mode: `redesign`
- phase: `premium-baseline`
- primary conversion: `/consulting/new`에서 프라이빗 AI 컨설팅 시작
- technical target: Next.js 16 App Router의 기존 `/` 경로

> 2026-08-12 V2 기준: 이 문서의 에디토리얼 구조·모션·이미지 계약은 유지한다. 제품 포지셔닝, 상품·가격, CTA 카피는 `docs/hairfit-v2-premium-landing-baseline-2026-08-12.md`와 프리미엄 전략 문서를 우선한다.

> 2026-08-13 구현 경계: 프리미엄 리디자인의 Scene 매핑, 실제 V2 증거, 현재 billing 호환, 가격 가설 분리, 단계별 종료조건은 `docs/hairfit-v2-premium-landing-redesign-implementation-2026-08-13.md`를 따른다.

## Outcome

- Hero의 외곽 카드 배경·테두리·그림자를 제거하고 4열 롤링 이미지 프레임, 라운드, 상하 투명 그라데이션은 유지했다.
- Hero 이후 10개 장면을 `LandingScene` 기반의 큰 타이포그래피, 실사 이미지, 투명한 콘텐츠 구조로 전환했다.
- `Panel`, `SurfaceCard`, `InverseSection`, `InverseCard`를 랜딩에서 제거하고 공용 `Surface` 기본 계약은 변경하지 않았다.
- Workflow 3장, Feature 4장, Criteria 4장, Review 3장, Pricing 1장, 동적 FAQ 4장, Salon 1장, Final CTA 1장으로 총 21개의 고유 WebP 설명 이미지를 사용했다.
- 원본 모델 2장과 남녀 각 9장의 결과 자산을 `Origin × 3×3` 독립 프리뷰로 복구했다.
- Hero 롤링 이미지는 Hero에만 사용하고, 원본·3×3 결과 자산은 Hairstyle/Fashion demo에서만 사용한다.
- Fashion demo의 `stage` 래퍼를 제거해 controls, media, details를 투명한 오픈 그리드의 직접 형제 요소로 재배치했다.
- Feature의 무드·넥라인과 Review의 패션 연결 이미지는 거울·반사·복제 인물 없이 한 명의 행동으로 다시 생성해 교체했다.
- 섹션 진입 페이드는 1.05초로 늦추고, 제목·이미지·선택지·목록은 85ms 간격과 최대 13단계 지연으로 차례로 상승하도록 연결했다.
- Workflow 3장은 실물 사진 카드와 거울을 제거하고 태블릿 안에서 사진 확인, 3×3 헤어 비교, 헤어·패션 선택 저장이 이어지는 장면으로 교체했다. 업로드 장면은 태블릿을 든 인물과 화면 속 인물의 포니테일·크림색 니트·연령·피부톤을 동일하게 고정했다. 저장 장면은 분리된 얼굴·의류·소품 콜라주 대신 한 인물의 완성된 전신 착장 프리뷰로 정리했다.
- Criteria 4장은 한 명의 실제 인물 위에 얼굴 랜드마크·폭 브래킷·비율 연결선, 중첩 두상 곡선·높이 눈금·후두부 투영, 길이 구간 화살표·모발 끝 투영, 모발 흐름 화살표를 각각 다르게 겹친 실사 인포그래픽으로 교체했다.
- Salon 장면은 인쇄된 사진과 거울을 제거하고, 미용실 의자에 앉은 고객과 태블릿으로 같은 고객의 헤어 후보·전신 패션 무드를 설명하는 디자이너의 2인 상담 구도로 교체했다.
- Workflow 비교·저장 장면을 업로드 장면과 동일한 여성, 크림 니트, 포니테일, 방, 태블릿의 연속 장면으로 다시 생성했다.
- Hairstyle 3×3은 남녀 원본 모델별 9개 정사각 결과로 교체하고, Fashion은 같은 남녀 정체성을 유지한 short·medium·long 전신 6장으로 교체했다.
- FAQ는 질문을 열 때 사진 준비·3×3 비교·미용실 상담·헤어에서 패션 연결 중 해당 카피와 맞는 실사 이미지로 전환한다.
- 첫 번째 후기는 실제 인물과 거울 속 자세가 달랐던 사진 띠 장면을 제거하고, 한 여성이 태블릿에서 자신의 3개 헤어 후보를 비교하는 장면으로 교체했다.

## Editorial image contract

- 기본 구도: 한 명의 인물, 클로즈업 또는 미디엄 클로즈업, 하나의 행동과 하나의 메시지.
- 금지 구도: 군중, 불필요한 단체 사진, 거울 속 불일치, 반사와 본체의 다른 자세·의상·소품.
- 분석 기준: 문자를 생성하지 않고 실제 얼굴과 모발 위에 해부학적으로 정렬된 선, 점, 곡선, 화살표만 사용한다.
- 워크플로우: 실물 사진 카드 대신 태블릿 화면 안에서 입력, 비교, 선택 상태가 보이게 한다.
- 카피 대응: 사진 업로드, 후보 비교, 선택 저장, 얼굴선, 목선·상체, 무드, 상황, 추천 기준, 후기, 가격 시작, FAQ 사진 준비, 살롱 상담, 최종 시작을 각각 다른 이미지로 설명한다.
- 처리: 1536×1024 생성 원본을 품질 86 WebP로 최적화하고, 정보 이미지에 구체적인 한국어 alt와 반응형 `sizes`를 제공했다.
- 모션: `data-detail-closeup`의 미세한 초점 이동과 `data-reveal-item`의 순차 상승을 적용하고 `prefers-reduced-motion`에서는 모든 콘텐츠를 정적 상태로 고정한다.

## Structure

1. Hero — 4열 세로 롤링 필름과 중앙 카피
2. Hairstyle preview — 원본 모델, 남녀 각 3×3 결과, 선택 요약
3. Fashion demo — 선택 헤어에서 패션 추천으로 연결하는 오픈 그리드
4. Workflow — 업로드, 비교, 선택 저장
5. Features — 얼굴선, 목선·상체, 무드, 상황
6. Criteria — 얼굴 비율, 두상 균형, 길이, 스타일 무드
7. Reviews — 실제 결정과 상담 활용 proof rail
8. Pricing — 이미지로 시작 맥락을 설명한 투명 가격표
9. FAQ — 사진 준비 이미지와 질문 목록
10. Salon — 최소 인원의 실제 상담 장면
11. Final CTA — 한 장의 사진에서 시작하는 단일 장면

## Main artifacts

- `my-app/app/page.tsx`
- `my-app/app/landing.css`
- `my-app/components/home/LandingScene.tsx`
- `my-app/components/home/HeroSection.tsx`
- `my-app/components/home/HairstylePreviewShowcase.tsx`
- `my-app/components/home/FashionDemoShowcase.tsx`
- `my-app/components/home/FeatureShowcase.tsx`
- `my-app/components/home/ReviewCarousel.tsx`
- `my-app/components/home/PricingPreview.tsx`
- `my-app/components/home/FaqShowcase.tsx`
- `my-app/public/landing/editorial/*.webp`
- `docs/landing-page-editorial-image-prompts.md`
- `my-app/lib/landing-flat-surface-contract.test.ts`
- `my-app/lib/landing-motion-contract.test.ts`
- `docs/components/passports/web-landing-scene.yaml`
- `docs/components/passports/web-reveal-on-scroll.yaml`
- `docs/components/passports/web-hairstyle-preview-showcase.yaml`
- `docs/components/passports/web-faq-showcase.yaml`

## Verification

- targeted ESLint: pass
- `npm --prefix my-app run typecheck`: pass
- landing flat-surface contract: 9/9 pass
- landing Hero contract: 1/1 pass
- landing motion contract: 3/3 pass
- web image contract: 1/1 pass
- global CSS contract: 9/9 pass
- Surface stability contract: 3/3 pass
- component registry: 54 component entries valid; `FaqShowcase` is a feature/candidate with a dedicated passport
- `npm --prefix my-app run build`: pass with Next.js 16.2.10
- 36개의 새 continuity 자산: SHA-256 기준 36개 고유, 중복 0
- 중앙 `cover` 크롭: editorial·review는 3:2, fashion 전신은 세로 비율을 사용해 핵심 얼굴·태블릿·전신을 보존
- Workflow 3장·Criteria 4장: 1536×1024 생성 원본을 품질 86 WebP로 교체하고 7개 자산 경로 계약 통과
- Browser desktop 1440×1000: Hero, Hairstyle, Fashion, Workflow, Features, Criteria, Reviews, Pricing, FAQ, Salon의 실사 이미지 로드·카피 대응·중앙 크롭을 직접 확인했다.
- Browser mobile 390×844: 본문 가로 오버플로 0, Hero 4열 롤링, Hairstyle 3×3 고정 3열, Fashion 가로 옵션 레일과 전신 이미지, Workflow 태블릿, FAQ 3:2 이미지, Salon 상담 구도를 확인했다.
- Workflow: 업로드·9가지 비교·저장 3장이 같은 여성, 포니테일, 크림 니트, 방, 태블릿으로 이어지고 얼굴·태블릿이 3:2 프레임에서 잘리지 않는다.
- Reviews: 거울과 다른 자세의 인쇄 사진 장면을 제거했다. 모바일 후기 레일을 끝까지 스크롤해 세 이미지가 모두 로드되고, 첫 태블릿의 세 후보와 마지막 태블릿·네이비 재킷이 모두 보이는 것을 확인했다.
- FAQ interaction: 미용실 질문을 열면 `미용실 상담 활용`, 패션 질문을 열면 `헤어에서 패션으로` 이미지와 alt가 전환된다.
- Accessibility interaction: Hairstyle과 Fashion 탭 모두 ArrowRight 입력 후 선택 상태와 키보드 초점이 여성 탭으로 함께 이동하고, 각 결과군의 `aria-pressed=true`는 1개다.
- Browser semantics: duplicate ID 0, 이름 없는 button 0, h1 1개, 빈 alt 16개는 모두 `aria-hidden` 롤링 복제 프레임, Hero와 비-Hero 이미지 경로 중복 0.
- Browser console: 새 검증 탭의 error 0. FAQ `fill`/sticky 위치 경고는 명시적 1536×1024 크기로 교정 후 재발하지 않았다.
- Reduced motion: 브라우저 제어 기능에는 media preference override가 없어 실제 OS 토글 대신 `landing-motion:contract:test`의 `prefers-reduced-motion` 정적 상태 계약 3/3 통과로 검증했다.

## Known non-blocking note

- Next.js build reports the repository-wide middleware-to-proxy deprecation warning. This refactor does not change middleware.
- 개발 모드에서 하단 해시로 직접 진입할 때 Hero 이미지 LCP advisory가 발생할 수 있다. 기능·레이아웃 오류는 아니며 console error는 0이다.

## Next action

프리미엄 전략의 메시지 맵을 11개 장면에 대응시키고, 기존 무료 생성기 카피를 컨설팅 가치·근거·결과물 중심으로 교체한다.
