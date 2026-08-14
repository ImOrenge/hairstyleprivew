# D-AI-SIM browser report

- 검증일: 2026-08-14
- 대상: `http://localhost:3114/discover/ai-hairstyle-simulation`
- 실행: Next.js 16.2.10 production build, Chromium

## 결과

| 항목 | 결과 |
| --- | --- |
| 본문·H1·title | pass |
| 3전략·9-preview | pass, 9개 이미지 `naturalWidth > 0` |
| `/consulting/new` CTA | pass |
| canonical·FAQ JSON-LD | pass |
| sitemap·robots | HTTP 200, canary 포함·`/discover` 허용 |
| 미등록 slug | HTTP 404 |
| 360×800 | pass, horizontal overflow 0 |
| 390×844 | pass, horizontal overflow 0 |
| 768×1024 | pass, horizontal overflow 0 |
| 1440×900 | pass, horizontal overflow 0 |
| axe WCAG A/AA | serious 0, critical 0 |
| skip link | pass, `#main-content` focus |
| 이미지 요청 실패 | alt와 비교 카드 크기 유지 |
| console·Next error overlay | 0 |
| 정적 HTML 응답 | H1·sample comparison·FAQ·CTA 포함 |

첫 실행에서 `근거 확인` 날짜의 대비가 3.14:1로 검출됐다. `--app-subtle`을 `--app-muted`로 변경한 뒤 axe gate가 통과했다.

## 제한

정적 응답 HTML에는 핵심 검색 콘텐츠가 포함되지만, 앱 전역의 Clerk 스트리밍 경계는 JavaScript 비활성 브라우저에서 초기 loading shell을 시각적으로 교체하지 못한다. canary 자체는 Server Component이지만 이 전역 shell 동작은 별도 아키텍처 작업으로 분리한다.
