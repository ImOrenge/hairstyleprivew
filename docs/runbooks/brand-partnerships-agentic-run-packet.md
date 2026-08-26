# HairFit 광고·제휴 문의 Agentic Run Packet

- mode: create
- objective: 뷰티 브랜드가 HairFit의 실제 제품 경험을 확인하고 맞춤 광고·제휴 제안을 안전하게 제출할 수 있는 공개 전환 페이지와 운영 CRM을 완성한다.
- route: `/partnerships`
- audience: 헤어·뷰티 브랜드의 마케팅, 브랜드, 커머스 담당자
- primary_conversion: `제휴 제안 보내기`
- proof: HairFit의 실제 헤어·패션 미리보기 이미지와 상담 화면 자산
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
