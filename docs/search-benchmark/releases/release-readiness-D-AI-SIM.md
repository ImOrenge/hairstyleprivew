# D-AI-SIM release readiness

- 작성일: 2026-08-14
- 상태: local-ready, not deployed
- branch: `feat/2026-08-14-search-discovery-canary`
- integration target: `develop/2026-08-08-hairfit-v2-backend@3be4d8894dd3e1249808275afd001933417883c8`
- delivery commit: 이 문서를 포함하는 local commit

## 통과한 gate

- 정적 `/discover` hub와 D-AI-SIM detail 생성
- published registry invariant와 3전략·9-preview manifest 검증
- metadata·canonical·Open Graph·FAQ JSON-LD·sitemap·robots 정합성
- discovery contract 12/12, audit blocking 0
- Playwright browser contract 11/11와 axe serious/critical 0
- 360/390/768/1440 반응형 visual baseline
- landing contract 16/16, consulting contract 78/78
- Next production build에서 detail route SSG 확인

## 내부 승인 근거

canary sample은 현재 프리미엄 랜딩에서 공개 사용 중인 synthetic 동일 인물 `female-v2-01..09` 자산이다. manifest에는 owner, synthetic 생성물, 사용자 업로드가 아님을 기록했다. 검색 페이지는 실제 시술 결과·완벽한 일치·검증되지 않은 정확도를 주장하지 않는다.

## 외부 공개 전 필요한 작업

1. synthetic sample provenance·권리 승인 원문의 공식 보관 위치를 확정한다.
2. 승인된 integration branch로 merge하고 배포한다. 이번 작업은 merge·push·deploy를 수행하지 않았다.
3. Search Console sitemap 제출·색인 상태와 실제 query baseline을 수집한다.
4. 배포 환경의 RUM/Core Web Vitals를 확인한다. 현재 성능 수치는 로컬 관찰값이다.
5. PR-2에서 허용된 `landing_id` attribution과 로그인 왕복 보존 계약을 구현한다. 현재 CTA는 정확히 `/consulting/new`로만 연결된다.
6. 전역 Clerk streaming shell의 JavaScript-disabled 시각 fallback은 별도 아키텍처 작업으로 다룬다. 응답 HTML의 검색 콘텐츠 포함 여부는 통과했다.

## 판정

PR-1은 로컬 구현·검증 기준으로 release candidate다. 외부 provenance, integration, deployment, live indexing, live auth handoff는 완료로 주장하지 않는다.
