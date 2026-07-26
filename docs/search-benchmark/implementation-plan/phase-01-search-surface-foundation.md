# P1. Search Surface Foundation 상세 구현 계획

- 상태: planned
- 선행조건: P0 Exit Gate, ADR-001 accepted
- 입력: B-02 intent map, 현재 home content·sitemap·robots
- 출력: C-01, C-02, S-01, S-02, S-03, Q-01
- 다음 Phase: [P2 Pilot Content & Sample Experience](./phase-02-pilot-content-sample-experience.md)

## 1. 목표와 비범위

승인된 콘텐츠만 정적 검색 페이지로 만들 수 있는 최소 기반을 구축한다. `D-AI-SIM` 한 개를 canary로 사용해 route, registry, metadata, JSON-LD, sitemap, audit을 연결한다.

비범위:

- 실제 사용자 업로드를 Hero에 내장
- 이벤트 DB 또는 실험 할당
- 4개 pilot의 최종 카피·이미지 공개
- 카탈로그 변경이 즉시 검색 페이지에 반영되는 자동화

## 2. 목표 구조

```mermaid
flowchart LR
  Registry["discovery-pages.ts"] --> Params["generateStaticParams"]
  Registry --> Page["discover/[slug]/page.tsx"]
  Registry --> Meta["metadata.ts"]
  Registry --> Sitemap["sitemap.ts"]
  Page --> Template["DiscoveryPageTemplate"]
  Registry --> Audit["audit-search-discovery.mjs"]
```

소스는 하나의 registry이고 route, metadata, sitemap, 내부 링크는 이를 소비한다. 개별 page 파일에 title·canonical·FAQ를 다시 선언하지 않는다.

## 3. 변경 파일

| 작업 | 경로 | 변경 |
| --- | --- | --- |
| P1-W01 | `my-app/lib/discovery/types.ts` | page, message, FAQ, CTA, status 타입 |
| P1-W02 | `my-app/lib/discovery/discovery-pages.ts` | 승인 registry와 lookup |
| P1-W03 | `my-app/lib/discovery/metadata.ts` | metadata·WebPage·FAQ JSON-LD builder |
| P1-W04 | `my-app/app/(marketing)/discover/page.tsx` | discovery hub skeleton |
| P1-W05 | `my-app/app/(marketing)/discover/[slug]/page.tsx` | 정적 route·404 |
| P1-W06 | `my-app/components/discovery/DiscoveryPageTemplate.tsx` | 서버 컴포넌트 중심 skeleton |
| P1-W07 | `my-app/app/sitemap.ts`, `my-app/app/robots.ts` | published page 반영 |
| P1-W08 | `my-app/scripts/audit-search-discovery.mjs` | Q-01 정적 감사 |
| P1-W09 | `my-app/package.json` | `search:discovery:audit` script |

## 4. 핵심 타입 계약

```ts
export type DiscoveryStatus = "draft" | "review" | "published" | "retired";

export type DiscoveryPageId =
  | "D-AI-SIM"
  | "D-FACE"
  | "D-MEN"
  | "D-WOMEN"
  | "D-BANGS"
  | "D-BOB"
  | "D-SALON";

export interface DiscoveryPageDefinition {
  id: DiscoveryPageId;
  slug: string;
  status: DiscoveryStatus;
  intentId: string;
  audience: "b2c" | "b2b";
  locale: "ko-KR";
  updatedAt: string;
  seo: {
    title: string;
    description: string;
    canonicalPath: `/discover/${string}`;
    index: boolean;
  };
  message: {
    eyebrow: string;
    h1: string;
    support: string;
    primaryCta: DiscoveryCta;
    forbiddenClaims: string[];
  };
  sections: DiscoverySection[];
  faq: DiscoveryFaq[];
  sampleManifestId: string | null;
  evidenceIds: string[];
  relatedPageIds: DiscoveryPageId[];
}
```

추가 invariant:

- `published`만 정적 params·sitemap·hub에 포함한다.
- `published`는 `seo.index=true`, evidence, CTA, FAQ, sections를 필수로 가진다.
- slug와 id는 전 registry에서 unique다.
- `canonicalPath === /discover/${slug}`다.
- retired는 replacement가 있으면 redirect 결정 레코드를 가진다.

## 5. 작업 패키지

### P1-W01. 타입과 fixture 우선

1. 타입과 canary `D-AI-SIM` fixture를 작성한다.
2. registry를 `satisfies readonly DiscoveryPageDefinition[]`로 제한한다.
3. `getPublishedDiscoveryPages`, `getDiscoveryPageBySlug`, `getDiscoveryPageById`를 만든다.
4. lookup은 입력을 normalize하지 않는다. 미등록 slug는 `undefined`다.

### P1-W02. 정적 route

```ts
export const dynamicParams = false;

export function generateStaticParams() {
  return getPublishedDiscoveryPages().map(({ slug }) => ({ slug }));
}

export default async function DiscoveryDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const definition = getDiscoveryPageBySlug(slug);
  if (!definition || definition.status !== "published") notFound();
  return <DiscoveryPageTemplate definition={definition} />;
}
```

route는 auth, cookie, request header, DB query에 의존하지 않는다. 로그인 여부에 따른 redirect도 하지 않는다. CTA가 기존 `/workspace`로 이동하는 지점에서만 제품 플로우와 연결한다.

### P1-W03. metadata와 구조화 데이터

`generateMetadata`는 registry의 title, description, canonical, Open Graph를 반환한다. JSON-LD builder는 화면에 렌더된 FAQ와 같은 배열을 사용한다.

- canonical origin은 검증된 site URL helper를 사용
- title/H1은 동일해도 되지만 모든 페이지 간 완전 중복은 금지
- FAQ가 없으면 FAQPage JSON-LD도 생성하지 않음
- 검증되지 않은 평점·가격·후기 구조화 데이터 금지
- `updatedAt`만 sitemap `lastModified`로 사용

### P1-W04. sitemap·robots

기존 정적 URL을 보존하고 published discovery만 합친다. draft/review/retired는 sitemap에서 제외한다. robots는 공개 `/discover`를 허용하되 preview/draft 전용 경로가 생기면 명시적으로 차단한다.

### P1-W05. Q-01 감사 스크립트

감사기는 registry를 import해 다음을 non-zero exit로 막는다.

1. slug·ID·canonical 중복
2. published 필수값 누락
3. invalid ISO date
4. evidence/sample ID dangling reference
5. related self-link, draft-link, orphan
6. FAQ 화면/JSON-LD source 분리
7. 허용되지 않은 CTA 경로
8. forbidden claim 포함
9. sitemap 대상과 registry 불일치

결과는 사람과 CI가 모두 읽도록 text summary와 JSON report 경로를 제공한다.

## 6. 컴포넌트·디자인 계약

`DiscoveryPageTemplate`는 다음 순서를 기본으로 한다.

1. Hero: HairFit 정체성, audience, outcome, primary CTA, 다음 섹션 힌트
2. sample placeholder: P2 자산이 없으면 허위 결과 대신 준비 상태
3. workflow
4. benefit/proof
5. trust summary
6. related pages
7. FAQ
8. final CTA

클라이언트 컴포넌트는 상호작용이 필요한 island로 제한한다. 색상·spacing·button은 기존 홈 token을 재사용하고 P1에서 새 시각 시스템을 만들지 않는다.

## 7. 테스트와 명령

```powershell
npm --prefix my-app run search:discovery:audit
npm --prefix my-app run lint
npm run typecheck
npm --prefix my-app run build
```

검증 사례:

- canary slug는 build output에 존재
- `/discover/not-registered`는 404
- view-source에 H1 본문·canonical·JSON-LD가 존재
- draft로 바꾸면 params·hub·sitemap에서 동시에 사라짐
- 기존 home, upload, workspace route의 build 결과가 유지됨

## 8. 출시와 롤백

P1은 canary를 `review` 상태로 먼저 병합할 수 있다. 외부 공개 승인 시에만 `published`로 전환한다. 문제가 생기면 registry status를 `review`로 되돌려 다음 build에서 sitemap과 정적 route에서 제거한다. 이미 색인된 URL은 단순 404로 끝내지 않고 noindex 또는 redirect 결정을 별도 기록한다.

## 9. Exit Gate

- [ ] C-01 타입·registry·lookup invariant가 테스트됨
- [ ] `/discover`와 canary가 정적 build됨
- [ ] 미등록·비공개 slug가 404임
- [ ] view-source에 핵심 본문·canonical·JSON-LD가 있음
- [ ] sitemap은 published만 포함하고 실제 `updatedAt`을 사용함
- [ ] Q-01이 fixture 실패를 검출하고 정상 registry에서 통과함
- [ ] home·upload·workspace 회귀가 없음
- [ ] P2 입력용 sample/evidence placeholder ID가 확정됨
