# D-AI-SIM local performance report

- 검증일: 2026-08-14
- 대상: local production build
- 측정 도구: agent-browser vitals, Playwright PerformanceObserver

| 지표 | 결과 | canary budget | 판정 |
| --- | ---: | ---: | --- |
| TTFB | 3.4 ms | 관찰값 | pass |
| FCP | 92 ms | 관찰값 | pass |
| LCP | 92 ms | 2,500 ms 이하 | pass |
| CLS | 0 | 0.1 이하 | pass |
| interaction event max | 200 ms 이하 | 200 ms 이하 | pass |

수치는 로컬 머신의 production server 관찰값이며 실제 배포 환경의 RUM 또는 field data가 아니다. 배포 후 Search Console Core Web Vitals와 실제 사용자 계측으로 다시 판정해야 한다.
