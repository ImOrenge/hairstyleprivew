# HairFit V2 프리미엄 랜딩 리디자인 구현 계획

- 작성일: `2026-08-13`
- 문서 상태: `implementation-ready`
- 작업 모드: `redesign`
- 작업 브랜치: `feat/2026-08-12-premium-landing-refactor`
- 통합 대상: `develop/2026-08-08-hairfit-v2-backend@3be4d88`
- 시각 기준: `feat/2026-08-04-landing-rolling-hero@c2162ed`
- 제품 기준: `docs/hairfit-v2-premium-landing-baseline-2026-08-12.md`
- 전략 원문: `D:/HariStyle-Preview/docs/HairFit_프리미엄_AI_스타일_컨설팅_전략_v1.0.md`
- 주 전환: `/consulting/new`

## 1. 구현 목표

현재 랜딩의 에디토리얼 구조와 CSS 스타일은 유지하면서 HairFit을 `AI 헤어스타일 미리보기`가 아니라 `PRIVATE AI STYLE DIRECTION`으로 설명한다. 랜딩이 약속하는 가치는 현재 프로젝트에 존재하는 V2 컨설팅 계약을 근거로 해야 하며, 아직 운영 상품이 아닌 프리미엄 가격 가설이나 Style Archive를 판매 가능한 기능처럼 노출하지 않는다.

최종 방문자 인식은 다음과 같아야 한다.

```text
사진을 올려 이미지를 생성하는 서비스
-> 내 조건을 분석하고 방향을 조정하며
   후보를 비교해 실제 시술과 관리까지 연결하는 AI 컨설팅
```

## 2. 문서 권위와 변경 경계

| 항목 | 권위 | 적용 원칙 |
|---|---|---|
| 프리미엄 포지셔닝 | 프리미엄 전략 v1.0 | 카테고리, 메시지, 장기 상품 가설의 원천 |
| 현재 구현 사실 | 현재 브랜치의 V2 코드와 계약 테스트 | 랜딩에서 즉시 약속할 수 있는 범위 |
| 랜딩 시각 구조 | 기존 Motion Editorial 리팩토링 | 11개 Scene, 이미지 연속성, 모션, CSS 유지 |
| 컨설팅 여정 | `consulting-frontend-v2-implementation.md` | 비마법사 lifecycle, 11 URL Scene, 자동 task handoff |
| 상품·결제 | 현재 billing·entitlement 코드 | 프리미엄 offering 출시 전 실제 결제 계약 유지 |

이 문서는 랜딩 구현의 실행 권위다. 과거 문서의 `/workspace`, 무료 생성기, 크레딧·생성 횟수 중심 설명은 구현 기준으로 사용하지 않는다.

## 3. 현재 프로젝트 적합성 판정

### 3.1 즉시 근거로 사용할 수 있는 기능

| 프리미엄 약속 | 현재 근거 | 랜딩 표현 |
|---|---|---|
| 얼굴·사진 분석 근거 | `AnalysisEvidenceV2`, 서버 landmark, `FaceEvidenceOverlay` | 측정선, 신뢰도, 직접 감지·추정·수동 보정 |
| 사용자가 방향 조정 | Discovery 입력과 versioned strategy snapshot | AI 권장과 현재 선택을 나란히 표시 |
| 전략형 9개 헤어 후보 | Balance/Image/Lifestyle 3×3 board | 무작위 9장이 아닌 세 전략 |
| shortlist와 비교·결정 | shortlist, finalist, immutable selection snapshot | 동일 얼굴·동일 crop 비교 |
| Salon Brief | snapshot-linked `SalonBriefV2` | 시술 제원과 주의사항 샘플 |
| Aftercare | 실제 시술 확인 후 care program | 오늘·3일·2주·6주·다음 방문 |
| Fashion Direction | entitlement 검증 후 9-look batch | 헤어 선택에서 패션 방향으로 확장 |
| 능동형 lifecycle | `recommendedStage`, `allowedStages`, `activeTasks` | wizard가 아닌 진행 중인 AI 컨설팅 |
| 중간 이탈·복귀 | server snapshot과 상담 나가기 계약 | 저장된 상담을 이어서 진행 |

### 3.2 부분 구현이므로 샘플로만 표현할 항목

| 항목 | 현재 상태 | 허용 표현 |
|---|---|---|
| Style Dossier | 개별 분석·선택·Brief·Aftercare·Fashion 데이터는 존재하지만 통합 산출물 UI/PDF는 없음 | `Style Dossier 구성 예시`, `제공 예정` 또는 비결제 샘플 |
| 퍼스널컬러 정밀 진단 | evidence 계약과 화면은 있으나 사진 조건에 따라 추정 포함 | `예상 진단`, 신뢰 상태와 추정 포함 고지 |
| 실제 시술 현실성 | selection/brief 데이터에 구현 가능성 필드가 있으나 현장 확정은 미용사 책임 | `시뮬레이션`, `미용사 확인 필요` |
| 장기 Style Archive | 히스토리 데이터 일부는 있으나 프리미엄 archive 제품은 없음 | 로드맵으로만 언급하고 판매 기능에서는 제외 |

### 3.3 구현 전에는 판매할 수 없는 항목

- `Private Hair Direction 99,000원`
- `Total Image Direction 189,000원`
- `Signature Style Membership 649,000원/년`
- 연간 4회 전체 컨설팅과 분기별 재컨설팅
- 전문가 검수 옵션
- 통합 Style Dossier PDF 납품 보장

위 항목은 전략 가격 가설이다. `product_offerings_v2`, `product_prices_v2`, entitlement grant, 결제·환불·재처리 계약과 실제 운영 준비가 완료되기 전에는 구매 CTA를 연결하지 않는다.

## 4. 전환·상품 호환 전략

### 4.1 현재 단계

- 모든 B2C 주 CTA는 `/consulting/new`로 이동한다.
- `/consulting/new`에서 Discovery와 사진 준비를 시작하고, 실제 생성 권한은 기존 서버 entitlement가 검사한다.
- 현재 `Free/Basic/Standard/Pro` 월 플랜과 usage pack 결제는 운영 계약으로 유지한다.
- 랜딩은 현재 결제 상품과 다른 프리미엄 가격을 동시에 판매하지 않는다.
- B2B CTA는 `/b2b/signup`, `/b2b/contact`를 유지한다.

### 4.2 전환기 가격 Scene

프리미엄 상품 백엔드가 준비되기 전 `Services` Scene은 다음 두 블록으로 분리한다.

1. `컨설팅에서 받는 결과` — Analysis, 9 Directions, Selection, Brief, Aftercare, Fashion의 범위 설명
2. `현재 이용 방식` — 실제 `PricingPreview`와 `/billing` 계약을 그대로 사용하되 크레딧 대신 이용 범위와 보관 기간을 설명

전략 가격 가설은 사용자에게 표시하지 않고 문서 내부에만 유지한다. 프리미엄 상품화가 완료되면 `current-subscription` 모드를 `premium-offerings` 모드로 전환한다.

### 4.3 프리미엄 상품 전환 조건

- versioned offering과 실제 가격이 운영 승인됨
- 일회성 컨설팅·연간 멤버십 entitlement가 구현됨
- 결제 완료 후 consultation grant가 멱등하게 생성됨
- 환불, 오류 재처리, 미사용·부분 사용 기준이 확정됨
- `/billing`과 MyPage가 새 상품을 조회·구매·복구할 수 있음
- 실제 checkout 브라우저 검증이 통과함

## 5. 메시지 맵

| 요소 | 구현 카피 계약 |
|---|---|
| Category | `PRIVATE AI STYLE DIRECTION` / `AI 프라이빗 스타일 디렉팅` |
| H1 | `당신의 스타일에는, 생성보다 정확한 기준이 필요합니다.` |
| One-liner | 얼굴 구조, 현재 모발과 생활 조건을 분석해 헤어·컬러·패션의 방향을 설계하고 선택·시술·관리로 연결하는 AI 컨설팅 |
| Core promise | 사용자가 추천 근거를 확인하고 직접 방향을 조정해 실행 가능한 스타일을 선택함 |
| Primary CTA | `프라이빗 컨설팅 시작` -> `/consulting/new` |
| Secondary CTA | `컨설팅 결과 예시 보기` -> `#home-dossier` |
| Proof | 분석 overlay, 3전략×3후보, shortlist 비교, Salon Brief, Aftercare timeline, Fashion batch |
| Trust | 사진 사용·보관·삭제, 공유 만료·폐기, 시뮬레이션 한계, 품질 미달 재처리 |

금지 카피:

- `무료로 내 스타일 보기`
- `사진 한 장으로 9개 생성`
- `크레딧 지급·차감`
- 검증되지 않은 `정확도 100%`, `전문가 검수`, `실제 시술과 동일`
- 상품화되지 않은 프리미엄 가격의 구매 가능 표현

## 6. 11개 Scene 재매핑

| # | ID | 현재 구조 | 목표 역할 | 핵심 증거 |
|---:|---|---|---|---|
| 01 | `home-hero` | rolling Hero | Premium Hero | 카테고리, H1, 2개 CTA, 결과 범위 strip |
| 02 | `home-analysis` | Hairstyle preview | Analysis Evidence | 얼굴 overlay, confidence, Evidence Ledger |
| 03 | `home-direction` | Fashion demo | User Direction | AI 권장·현재 선택·근거·예상 영향 |
| 04 | `home-previews` | Workflow | Strategic Preview | Balance 3, Image 3, Lifestyle 3 |
| 05 | `home-decision` | Features | Compare & Decision | 같은 crop의 2~3개 후보와 현실성 축 |
| 06 | `home-brief` | Criteria | Salon Brief | cut, volume, texture, color, cautions |
| 07 | `home-aftercare` | Reviews | Aftercare | Today, D+3, W+2, W+6, next visit |
| 08 | `home-fashion` | Pricing | Fashion Direction | direction, 9 looks, shortlist, final look |
| 09 | `home-dossier` | FAQ | Style Dossier sample | 7개 현재 산출물과 roadmap Archive 구분 |
| 10 | `home-services` | Salon | Services & current billing | 컨설팅 범위와 실제 이용 방식 |
| 11 | `home-trust` | Final CTA | Trust & final conversion | 개인정보·품질·한계·최종 CTA |

후기와 FAQ를 별도 장면으로 유지하지 않는다. 후기는 해당 증거 Scene의 proof rail에 배치하고, FAQ는 Trust Scene 하단에 포함한다.

## 7. 컴포넌트 구현 계획

### 7.1 유지

- `LandingScene`
- `RevealOnScroll`
- Hero rolling film과 identity-matched 이미지 자산
- `landing.css`의 Graphite/Warm Ivory/Champagne 시각 언어
- `data-reveal-item`, `data-detail-closeup`, reduced-motion 처리
- `MobileStickyCtaBar`

### 7.2 신규 또는 역할 전환

| 컴포넌트 | 책임 | 데이터 원칙 |
|---|---|---|
| `PremiumHeroSection` | category, H1, CTA, result strip | 제품 계약 상수 |
| `AnalysisEvidenceShowcase` | 얼굴 overlay와 Evidence Ledger | privacy-safe fixture가 `AnalysisEvidenceV2` shape를 따름 |
| `DirectionShowcase` | AI 권장과 사용자 선택 비교 | strategy fixture, 8축 중 대표 4축 공개 |
| `StrategicPreviewShowcase` | 3전략×3후보 | accepted preview fixture |
| `CompareDecisionShowcase` | shortlist와 현실성 비교 | 동일 인물·동일 crop |
| `SalonBriefShowcase` | 고객용·디자이너용 brief | `SalonBriefV2` 필드에서 민감정보 제거 |
| `AftercareTimelineShowcase` | 시술 후 관리 timeline | 실제 시술 뒤 활성화됨을 명시 |
| `FashionDirectionShowcase` | 9-look와 최종 선택 | Fashion batch fixture |
| `StyleDossierShowcase` | 통합 산출물 목차와 예시 | 현재 제공/예정 항목을 구분 |
| `ServiceAccessShowcase` | 컨설팅 범위와 현재 플랜 | 실제 billing 데이터만 가격 표시 |
| `TrustAndFinalCta` | privacy, quality, limitations, CTA | 정책·코드로 확인된 사실만 사용 |

### 7.3 파일 변경 예상 범위

- `my-app/app/page.tsx`
- `my-app/app/landing.css`
- `my-app/components/home/*`
- `my-app/lib/home-content.ts`
- `my-app/lib/i18n/locales/ko.ts`
- `my-app/lib/i18n/locales/en.ts`
- `my-app/lib/landing-*-contract.test.ts`
- `docs/components/component-registry.json`
- `docs/components/passports/web-*.yaml`

결제, entitlement, Supabase migration은 이 랜딩 리디자인 브랜치의 P0~P3 범위에 포함하지 않는다. 프리미엄 상품화 단계에서 별도 구현 경계로 다룬다.

## 8. 증거 fixture 계약

랜딩에는 실제 사용자 데이터나 signed URL을 사용하지 않는다. 샘플은 현재 공유 DTO를 축약한 정적 fixture로 작성한다.

- 실제 필드 이름과 상태 의미를 따른다.
- 원본 얼굴 사진, user ID, storage path, prompt 원문을 포함하지 않는다.
- `detected`, `estimated`, `user_adjusted`를 구분한다.
- 분석 정확도를 숫자 마케팅 문구로 과장하지 않는다.
- Salon Brief의 가상 시술 제원은 `샘플`로 표시한다.
- Style Dossier는 현재 제공되는 산출물과 예정 항목을 시각적으로 구분한다.

## 9. 단계별 실행 계획

### Phase 0 — 구현 계약 고정

- 현재 랜딩 카피·CTA·앵커 inventory 작성
- 본 문서의 11 Scene ID와 순서를 contract test로 고정
- `/workspace`, 무료 생성기, premium price 오노출 금지 계약 추가
- 현재 billing과 premium offering mode의 경계를 상수 또는 서버 설정으로 명시

종료조건:

- 메시지 맵과 Scene map이 단일 테스트 권위로 고정됨
- 실제 운영 가격과 전략 가격 가설이 혼재하지 않음

### Phase 1 — Hero·SEO·전환

- title, description, JSON-LD를 AI 컨설팅 카테고리로 변경
- Hero category, H1, 설명, CTA 교체
- 모바일 sticky CTA를 `프라이빗 컨설팅 시작`으로 통일
- 보조 CTA를 `#home-dossier`로 연결

종료조건:

- 첫 viewport에서 제품 정체성, 결과, CTA, 다음 증거가 보임
- 모든 B2C CTA가 `/consulting/new`로 연결됨
- 랜딩 CTA에 `/workspace`와 무료 생성기 카피가 없음

### Phase 2 — Analysis·Direction·Preview 증거

- Analysis Evidence와 landmark overlay 샘플 구현
- AI 권장·현재 선택·근거·예상 영향 구현
- 9개 후보를 세 전략으로 재구성
- 실제 V2 DTO shape 기반 privacy-safe fixture 추가

종료조건:

- 가격보다 먼저 분석 근거와 사용자 개입이 보임
- 9개 결과가 무작위 생성으로 설명되지 않음

### Phase 3 — Decision·Brief·Aftercare·Fashion·Dossier

- 동일 crop 비교축 구현
- Salon Brief 샘플 구현
- Aftercare timeline 구현
- Fashion 9-look 연결 구현
- Style Dossier 목차와 현재/예정 상태 구현

종료조건:

- Preview 이후 실제 실행과 관리까지 하나의 selection snapshot으로 연결됨
- 존재하지 않는 PDF·Archive·전문가 검수를 완료 기능처럼 표시하지 않음

### Phase 4 — Services·Trust·호환 가격

- 컨설팅 결과 범위와 현재 이용 방식을 분리
- 실제 `PricingPreview` 데이터만 가격으로 표시
- 개인정보, 공유, 품질 재처리, 시뮬레이션 한계 추가
- FAQ를 Trust Scene에 통합

종료조건:

- 랜딩 메시지와 실제 checkout 상품이 충돌하지 않음
- 사진 보관·삭제·공유·한계가 결제 전에 보임

### Phase 5 — 프리미엄 상품화 후속

별도 backend·billing 작업으로 수행한다.

- premium offering catalog와 가격 승인
- 일회성·연간 entitlement
- checkout, webhook, refund, recovery
- Style Dossier export와 Style Archive
- premium offering mode 활성화

종료조건:

- 운영 승인 가격으로 실제 결제가 가능함
- 결제부터 consultation grant, 완료, 환불까지 실브라우저로 검증됨

## 10. 테스트 계약

### 정적·계약 테스트

- `landing-premium-message:contract:test`
  - category, H1, CTA, 금지 카피
- `landing-premium-scenes:contract:test`
  - 11개 ID, 순서, proof-before-services
- `landing-premium-proof:contract:test`
  - Analysis, Brief, Aftercare, Fashion, Dossier 증거 존재
- 기존 `landing-hero`, `landing-flat-surface`, `landing-motion`, `web-image`, `global-css` 계약 유지

### 브라우저 검증

- Desktop `1440×1000`
- Tablet `768×1024`
- Mobile `390×844`
- 가로 overflow 0
- H1 1개, 이름 없는 button 0, 깨진 이미지 0
- CTA `/consulting/new`, Dossier anchor, B2B 경로 확인
- keyboard tab, FAQ disclosure, focus visibility
- reduced motion에서 rolling/reveal이 읽기 방해 없이 정지
- console error 0

### 제품 정합성 검증

- 랜딩 증거 fixture와 현재 V2 DTO 필드 대응표 검토
- 현재 플랜 가격과 landing 표시 가격 일치
- premium 가격 가설이 checkout CTA와 연결되지 않음
- 실제 제공/예정 기능 라벨이 정확함

## 11. 완료 조건

다음을 모두 만족해야 프리미엄 랜딩 리디자인 완료로 판정한다.

- [x] 11개 Scene이 목표 IA로 교체됨
- [x] Hero·SEO·CTA가 프리미엄 AI 컨설팅 메시지로 통일됨
- [x] Analysis, Direction, Preview, Compare, Brief, Aftercare, Fashion 증거가 구현됨
- [x] Style Dossier가 현재 제공과 예정 범위를 구분함
- [x] 실제 billing 상품과 다른 가격을 구매 가능하게 노출하지 않음
- [x] `/workspace`와 무료 생성기 중심 CTA가 랜딩에서 제거됨
- [x] 기존 CSS·모션·반응형·접근성 계약이 유지됨
- [x] 정적 테스트, typecheck, lint, production build가 통과함
- [x] 세 viewport의 브라우저 검증과 콘솔 검증이 통과함
- [x] 최종 검증은 전체 구현 후 한 번의 종료 게이트로 기록됨

## 12. Agentic Run Packet

### Mode

`redesign`

### Assumptions

| ID | Assumption | Risk | Confirmation |
|---|---|---|---|
| A-01 | `/consulting/new`가 계속 B2C 주 전환이다 | 낮음 | 현재 route와 CTA로 확인 |
| A-02 | 기존 에디토리얼 CSS 스타일을 유지한다 | 낮음 | 사용자 요구와 기준점으로 확인 |
| A-03 | 프리미엄 가격은 운영 승인 전 가설이다 | 높음 | backend 문서와 현재 billing 코드로 확인 |
| A-04 | Style Dossier 통합 export는 아직 미구현이다 | 중간 | 코드 inventory로 확인 |

### Findings

| ID | Priority | Finding | Evidence | Resolution |
|---|---:|---|---|---|
| F-01 | P0 | Hero가 9개 미리보기 생성기로 제품을 축소함 | `HeroSection`, `home-content`, KO locale | Phase 1 |
| F-02 | P0 | 전략 가격과 실제 월 플랜 계약이 다름 | `PricingPreview`, `plan-entitlements` | Phase 4·5 분리 |
| F-03 | P1 | Analysis·Brief·Aftercare 증거가 랜딩에 없음 | 현재 Scene inventory | Phase 2·3 |
| F-04 | P1 | Style Dossier를 증명할 통합 결과물이 없음 | source inventory | 샘플과 예정 범위 분리 |
| F-05 | P2 | FAQ·후기 장면이 제품 증거보다 독립 콘텐츠로 큼 | 현재 11 Scene | 증거·Trust에 통합 |

### Work Queue

| Order | Work | Exit condition | Status |
|---:|---|---|---|
| 1 | Phase 0 계약 테스트 | Scene·message·가격 경계 고정 | completed |
| 2 | Phase 1 Hero·SEO | 첫 viewport와 CTA 정합 | completed |
| 3 | Phase 2 핵심 증거 | 분석·방향·전략형 9개 노출 | completed |
| 4 | Phase 3 실행 산출물 | 결정·Brief·Aftercare·Fashion·Dossier 노출 | completed |
| 5 | Phase 4 Trust·호환 가격 | 실제 상품·정책과 일치 | completed |
| 6 | 종료 검증 | 모든 gate 통과 | completed |

### Acceptance Gates

- Agentic Operation Gate: 이 문서의 상태·가정·finding·queue·next action을 단일 권위로 사용한다.
- Copy Gate: Hero부터 Trust까지 하나의 메시지 맵을 사용한다.
- Design Gate: 기존 Motion Editorial style contract를 유지한다.
- Browser Gate: 세 viewport와 콘솔 검증을 완료 시 기록한다.
- Technical Gate: contract, typecheck, lint, build를 완료 시 기록한다.
- Fix Gate: F-01과 F-02를 먼저 해소한다.

### Current Status

`implemented-and-verified`

### Next Action

별도 승인 전에는 merge·push·deploy를 수행하지 않는다.

## 13. 2026-08-13 구현 및 종료 검증 기록

### 구현 결과

- 4열 rolling hero, 동일 인물의 hair/fashion pair, 상하 gradient mask, reveal 및 reduced-motion 처리를 유지했다.
- Hero H1과 주 CTA를 PRIVATE AI STYLE DIRECTION 메시지로 교체했고 `/consulting/new`로 통일했다.
- Scene 02~09와 11을 `PremiumConsultingShowcases`로 구현하고 Scene 10은 현재 운영 중인 billing 계약만 표시하도록 유지했다.
- Style Dossier 샘플은 `현재 제공`과 `예정 기능`을 분리했다. PDF export, 연간 Archive, 전문가 검수는 예정 기능으로만 표시한다.
- 가설 가격 99,000원·189,000원·649,000원은 랜딩과 checkout CTA에 노출하지 않았다.
- 모바일 첫 화면을 포함해 rolling media 높이를 조정하여 H1, 결과 설명, 주 CTA, 다음 Evidence 힌트가 viewport 안에 들어오도록 했다.
- Strategic Preview의 헤어 3×3과 Fashion Direction 패널은 여성·남성 모델을 5초 간격으로 자동 전환한다. 수동 탭 선택, 포커스·호버·화면 밖 일시정지, reduced-motion 자동 전환 중지를 함께 적용했다.

### 자동화 게이트

| Gate | Result |
|---|---|
| `landing-premium:contract:test` | 4/4 pass |
| `landing-hero:contract:test` | 1/1 pass |
| `landing-flat-surface:contract:test` | 4/4 pass |
| `landing-motion:contract:test` | 3/3 pass |
| `web-image:contract:test` | 1/1 pass |
| `global-css:contract:test` | 9/9 pass |
| `component-registry:validate` | 59 components / 59 passports valid |
| `typecheck` | pass |
| `lint` | pass |
| `next build --webpack` | pass, 130 pages generated |

### 브라우저 게이트

| Viewport | overflow | H1 | unnamed button | broken image | Hero CTA | Evidence hint |
|---|---:|---:|---:|---:|---|---|
| 1440×1000 | 0 | 1 | 0 | 0 | visible | visible |
| 768×1024 | 0 | 1 | 0 | 0 | visible | visible |
| 390×844 | 0 | 1 | 0 | 0 | visible | visible |

- 11개 Scene anchor, `/consulting/new` CTA 5개, Dossier 현재/예정 라벨, `/b2b/signup`, `/b2b/contact`를 확인했다.
- `/workspace` 랜딩 링크 0개, console error 0개를 확인했다.
- FAQ summary가 native keyboard focus 대상임을 확인했다.
- 런타임 stylesheet에서 `prefers-reduced-motion: reduce` 규칙 10개, Hero rolling 정지, landing reveal animation/transition 제거 규칙을 확인했다.

### 비범위

- 프리미엄 패키지 offering·entitlement·checkout·refund 계약과 전략 가격의 운영 출시는 이 변경에 포함하지 않는다.
- PDF export, 연간 Style Archive, 전문가 검수는 구현하지 않았다.
- merge, push, deploy, branch/worktree cleanup은 수행하지 않는다.

## 14. 2026-08-13 섹션 콘텐츠 밀도 개선

### 개선 원칙

섹션의 문장 수를 늘리는 대신 `주장 → 실제 산출물 → 판단 기준 → 다음 결과`가 한 화면에서 연결되도록 구성한다. 모든 표시 값은 개인정보 비식별 샘플이며, 현재 V2 데이터 계약과 아직 제공하지 않는 기능을 혼합하지 않는다.

### 반영 범위

| Scene | 추가한 증거 UI | 사용자에게 전달하는 가치 |
|---|---|---|
| 02 Analysis | 얼굴 혼합형, 비율, 퍼스널 컬러, 사진 품질과 출처 ledger | 직접 측정·AI 추정·시스템 검증의 차이를 확인 |
| 03 Direction | 길이·가르마·볼륨·질감/컬러 전략표 | 추천값뿐 아니라 근거와 영향을 함께 비교 |
| 05 Compare | 후보 3개와 8개 비교축 decision matrix | 이미지 취향을 관리·시술·리스크 판단으로 확장 |
| 06 Salon Brief | 8개 시술 필드와 현장 확인 항목 | 디자이너에게 전달 가능한 구조화된 기준 제공 |
| 07 Aftercare | 오늘의 행동 카드, 시술/체크인 상태, 4시점 timeline | 시술 이후에도 현재 행동과 다음 점검을 즉시 파악 |
| 08 Fashion | palette·neckline·silhouette·avoid brief | 9-look 이미지가 생성된 이유와 활용 기준을 설명 |
| 09 Dossier | Face, Direction, Decision, Care 샘플 페이지 | 단일 생성물이 아니라 누적되는 결정 기록을 시각화 |

Services와 Trust는 이미 운영 상품·정책 정보가 충분하므로 추가 카드나 마케팅 문구를 넣지 않는다. 모바일에서는 비교 이미지와 matrix를 가로 탐색할 수 있게 유지하고, 핵심 텍스트 표는 단일 열로 전환한다.

### 개선 검증

- `landing-premium:contract:test` 6/6, `landing-flat-surface:contract:test` 4/4, `landing-motion:contract:test` 3/3, `web-image:contract:test` 1/1, `global-css:contract:test` 9/9 통과
- component registry 59/59, typecheck, lint, Next production build 130 pages 통과
- 1440×1000과 390×844에서 문서 전체 horizontal overflow 0, 깨진 이미지 0, console error 0 확인
- 모바일 Compare의 이미지 rail과 8축 matrix는 각각 내부 스크롤 영역으로 제한해 3개 후보와 전체 판단축을 생략하지 않는다.

## 15. 2026-08-13 Rolling Hero 확장

### 요청과 finding

- 기존 rolling stage는 데스크톱 최대 22rem 높이로 제한되고 카피 아래에 분리돼, 프리미엄 비주얼보다 상단 배너처럼 보였다.
- Hero shell의 82rem 제한과 내부 gutter 때문에 넓은 화면에서도 이미지가 viewport 끝까지 사용되지 않았다.

### 반영

- rolling stage를 Hero 전체 높이 `44rem ~ 59rem`의 absolute background layer로 전환했다.
- Hero shell은 기존 container보다 landing gutter 한 칸만 넓혀 중앙 정렬하고, 4개 rolling column 최대 폭을 100rem으로 넓혔다. `100vw`는 scrollbar 폭까지 포함해 양끝이 잘릴 수 있어 사용하지 않는다.
- 카피를 rolling stage 위 중앙에 겹치고, 카피 주변에는 54%의 완만한 translucent scrim을 적용했다.
- 타이틀 바로 주변은 배경색 72%에서 가장자리로 투명해지는 radial mask와 7px backdrop blur를 사용해 이미지가 비치면서도 제목 대비를 유지했다.
- 모바일 rolling columns는 내부 폭 150%로 확대해 4열이 지나치게 가늘어지지 않도록 했으며 Hero 바깥 overflow는 숨긴다.
- reduced-motion에서는 rolling animation과 backdrop blur를 함께 제거하되 반투명 배경 대비는 유지한다.

### 종료 기준

- 1440×1000, 390×844에서 타이틀·CTA가 첫 viewport 안에 노출된다.
- 문서 horizontal overflow와 깨진 이미지, console error가 모두 0이다.
- rolling stage가 Hero 전체 높이와 안전 확장 폭을 사용하고 타이틀의 translucent mask가 runtime computed style에서 확인된다.

### 검증 결과

- 1440×1000에서는 실제 client width 1425px 안에서 Hero 1342px와 좌우 약 42px 안전 여백을 사용한다.
- 390×844에서는 실제 client width 375px 안에서 Hero 373px와 좌우 약 1px 안전 여백을 사용한다.
- 타이틀과 주 CTA의 첫 viewport 노출, Hero 전체 높이, 반투명 mask는 변경 없이 유지한다.
- runtime title pseudo-element에서 `blur(7px) saturate(0.72)`와 radial translucent background 확인
- 두 viewport 모두 document horizontal overflow 0, broken image 0, console error 0
- `landing-hero:contract:test` 1/1, `landing-motion:contract:test` 3/3, `landing-flat-surface:contract:test` 4/4, `global-css:contract:test` 9/9, typecheck, lint, production build 130 pages 통과

## 16. 2026-08-13 Scene 제목 타이포그래피 보정

### finding

- 모든 Scene H2가 데스크톱에서 동일한 79.2px 크기를 사용해, 폭 340px인 Compare 제목은 6줄까지 늘어났다.
- 한국어 줄바꿈이 `word-break: normal`에 의존해 `시/술`, `맥/락`처럼 어절 내부 음절이 분리될 수 있었다.
- 390px 모바일에서도 최대 3.35rem과 12vw를 사용해 제목이 본문과 산출물보다 과도하게 화면을 점유했다.

### 반영 계약

- 모든 Scene H2에 `word-break: keep-all`, `overflow-wrap: break-word`, `text-wrap: balance`를 함께 적용한다.
- `editorial-split`은 좁은 컬럼을 고려한 3.55vw, `sticky-stage`는 4.4vw, `typographic-index`는 4.8vw, `closing-stage`는 4vw 기준으로 분리한다.
- 제목 행폭과 행간을 `--landing-title-measure`, `--landing-title-leading` 토큰으로 관리한다.
- 840px 이하에서는 stack된 레이아웃에 맞춘 공통 scale, 600px 이하에서는 `2.15rem ~ 2.85rem` 범위를 사용한다.

### 종료 기준

- 어절 내부의 부자연스러운 음절 분리가 없어야 한다.
- 1440px Compare 제목은 기존 6줄보다 줄어들고, 나머지 Scene도 2~4줄 범위의 균형을 유지해야 한다.
- 768px와 390px에서 제목 overflow·clipping·문서 horizontal overflow가 없어야 한다.

### 검증 결과

- 1440px: editorial 51.12px, sticky 63.36px, typographic 69.12px, closing 57.6px로 분리됐다.
- Compare는 79.2px/6줄에서 51.12px/4줄로 감소했고 Style Dossier는 4줄에서 3줄로 감소했다.
- 768px은 53.76px와 2~4줄, 390px은 37.44px와 3~4줄 범위로 수렴했다.
- 모든 viewport에서 H2 `word-break: keep-all`, heading overflow 0, document horizontal overflow 0, broken image 0, console error 0을 확인했다.
- landing flat-surface 5/5, landing motion 3/3, component registry 59/59, 전체 workspace typecheck, lint, production build 130 pages가 통과했다.
