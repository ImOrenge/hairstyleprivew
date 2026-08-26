# HairFit 광고·제휴 문의 Agentic Run Packet

- mode: redesign
- objective: 뷰티 브랜드가 HairFit의 실제 제품 경험을 확인하고 맞춤 광고·제휴 제안을 안전하게 제출할 수 있는 공개 전환 페이지와 운영 CRM을 완성한다.
- route: `/partnerships`
- audience: 헤어·뷰티 브랜드의 마케팅, 브랜드, 커머스 담당자
- primary_conversion: `제휴 제안 보내기`
- proof: 광고, 브랜드 콘텐츠, 공동 캠페인의 노출 방식·목적과 HairFit 제품 경험 연결을 명시한 코드 기반 제휴 인벤토리
- excluded_claims: 확인되지 않은 이용자 수, 성과, 제휴사 로고, 확정 단가, 회신 기한, 보장 성과
- section_order: 히어로 → 제휴 가능 분야 → HairFit 제품 경험 → 협업 절차 → FAQ → 문의 폼
- operational_contract: 기존 `b2b_leads`, 관리자 단계 관리, Turnstile, HMAC 웹훅을 호환 확장하고 미계약 브랜드 문의를 1년 후 삭제한다.
- responsive_checks: 390px, 768px, 1440px에서 메시지·CTA·오버플로·링크·메타데이터·콘솔·자산 오류를 확인한다.
- repair_loop: 첫 검수에서 가장 높은 우선순위의 전환 또는 접근성 결함을 하나 이상 수정한 뒤 동일 조건으로 재검증한다.
- next_action: 데이터 계약과 보존 경계를 먼저 구현한 뒤 공개 페이지와 관리자 CRM을 같은 계약에 연결한다.

## Inspect → Repair → Verify

- inspect: 최종 프로덕션 빌드를 로컬 서버로 실행하고 390×844, 768×900, 1440×1000 전체 페이지 캡처에서 첫 화면 메시지, CTA, 폼, 푸터와 수평 오버플로를 확인했다.
- highest_priority_finding: FAQ 질문 행에 펼칠 수 있다는 시각적 단서가 부족했다.
- repair: 모든 FAQ 요약에 펼침 화살표를 추가하고 열린 상태에서 회전하도록 변경했다.
- verify: 제휴 페이지 Axe WCAG A/AA 심각·치명 위반 0건, 3개 뷰포트 오버플로 0건, 메타데이터·sitemap·robots·푸터/B2B 링크, FAQ 키보드 열기, 폼 레이블, 오프라인 입력 보존·재시도·중복 제출 방지 Playwright 3건이 통과했다.
- database_limit: Docker Desktop 엔진이 실행 중이 아니어서 로컬 SQL smoke는 실행하지 못했으며, `my-app/supabase/tests/brand_partnership_lead_retention_smoke.sql`로 실행 계약을 남겼다.

## Brand Visual Repair Loop

- assumption: 공개되지 않은 실제 광고 상품이나 성과는 확정된 것으로 표현하지 않고, 브랜드가 가능한 활용 장면을 이해할 수 있는 제휴 콘셉트로만 시각화한다.
- inspect: 1440px 전체 화면에서 히어로가 남성 패션 룩북, 제품 구간이 미용실 상담 장면으로 보여 브랜드 담당자가 광고·콘텐츠·공동 캠페인 활용 지점을 상상하기 어려웠다.
- finding: `BRAND-VISUAL-01` / P1 / asset·conversion — 제휴 제안의 세 형식과 이미지 증거가 연결되지 않아 브랜드 대상 페이지의 제품 정체성과 전환 설득력이 약했다.
- repair_attempt_1: 실제 브랜드 로고·가격·성과·문구를 넣지 않은 제휴 전용 이미지 2종과 HTML 라벨을 적용했으나, 생성 이미지의 오브젝트와 가상 UI가 많아 제휴 상품을 다시 해석해야 한다는 사용자 피드백이 발생했다.
- repair_attempt_2: 생성 이미지를 모두 제거하고 히어로를 `노출 방식 + 목적`이 바로 보이는 3개 제휴 인벤토리로 교체했다. 제품 구간은 `사용자 상황 → HairFit 경험 → 브랜드 접점` 3행 연결표로 바꿔 사진이나 가상 UI 해석이 필요 없도록 했다.
- verify: 390px, 768px, 1440px에서 메인 이미지 0개, 제휴 인벤토리 3개, 제품 연결 행 3개를 확인했고 수평 오버플로·콘솔 오류·요청 실패는 없었다. 제휴 페이지 WCAG A/AA, 공개 메타데이터·링크·반응형, 폼 입력 보존·중복 방지 Playwright 3건과 계약·타입·이미지 정책·컴포넌트 레지스트리·프로덕션 빌드가 통과했다.
- next_action: 사용자 검토를 위해 로컬 `/partnerships` 화면을 유지하고, 승인 전에는 통합·푸시·배포하지 않는다.
