# P4. Content Expansion & Operations 상세 구현 계획

- 상태: planned
- 선행조건: P2 공개 후보 승인, P3 계측 안정성 확인
- 대상: D-BANGS, D-BOB, D-SALON 및 7페이지 전체
- 출력: 확장 C-01, S-04, O-01, candidate report, 회귀 Q-02/Q-03
- 다음 Phase: [P5 Experiment & Optimization](./phase-05-experiment-optimization.md)

## 1. 목표와 비범위

pilot에서 검증된 구조를 앞머리, 보브, 살롱 상담 의도로 확장하고, 카탈로그 신호가 “후보 생성 → 사람 승인 → 정적 공개”를 거치도록 운영 체계를 만든다.

비범위:

- active catalog 항목의 자동 SEO 공개
- 검색량만으로 thin page 대량 생성
- B2B 살롱 CTA를 B2C upload CTA와 같은 퍼널로 합산
- locale 자동 번역·다국어 공개

## 2. 확장 페이지 계약

| Page ID | 역할 | 고유 콘텐츠 | CTA/event |
| --- | --- | --- | --- |
| D-BANGS | 앞머리 비교 | 앞머리 유무·형태 비교, 승인 샘플 | B2C workspace |
| D-BOB | 보브컷 비교 | 길이·실루엣 비교, 상담 질문 | B2C workspace |
| D-SALON | 미용실 상담 이미지 | 추천 보드로 상담 준비 | B2B/B2C 상담 목적 별도 CTA |

D-SALON은 살롱 파트너 제품을 가장하지 않는다. 현재 제공되는 기능이 이미지 보드 생성이라면 그 범위만 설명하고, B2B 문의가 실제로 존재할 때만 별도 CTA를 둔다.

## 3. 변경 파일

| 작업 | 경로 | 변경 |
| --- | --- | --- |
| P4-W01 | `my-app/lib/discovery/discovery-pages.ts` | 3개 페이지와 전체 link graph |
| P4-W02 | `my-app/lib/discovery/sample-manifests.ts` | 확장 샘플 |
| P4-W03 | `my-app/lib/discovery/evidence-registry.ts` | 확장 증거 |
| P4-W04 | `my-app/lib/discovery/catalog-candidates.ts` | candidate schema·reader |
| P4-W05 | `my-app/scripts/build-discovery-candidates.mjs` | read-only 후보 생성 |
| P4-W06 | `docs/search-benchmark/candidates/*.yaml` | 주기별 후보 보고서 |
| P4-W07 | `docs/search-benchmark/runbooks/content-operations.md` | O-01 |
| P4-W08 | `my-app/app/sitemap.ts` | 7개 published 반영 |
| P4-W09 | `docs/search-benchmark/reports/*` | 전체 browser/perf 회귀 |

## 4. 카탈로그 후보 경계

입력은 기존 catalog의 market, rotation period, style slug, target, slot, freshness 신호다. 후보 생성기는 registry를 수정하거나 이미지를 publish하지 않는다.

```ts
interface DiscoveryContentCandidate {
  candidateId: string;
  sourceCycleId: string;
  market: string;
  rotationPeriod: string;
  styleSlug: string;
  styleTargets: readonly string[];
  slotKeys: readonly ("trend" | "face_fit" | "evergreen" | "experimental")[];
  usedLookbackDays: number;
  lowFreshness: boolean;
  proposedPageId: DiscoveryPageId | null;
  decision: "proposed" | "approved" | "rejected";
  decisionReason: string | null;
  reviewer: string | null;
  decidedAt: string | null;
}
```

자동 reject/block:

- `lowFreshness=true`인데 근거 보완 없음
- experimental slot 단독
- 제품에서 지원하지 않는 스타일·성별·시장
- 기존 canonical intent와 중복
- 권리 승인된 sample/evidence 없음

## 5. 작업 패키지

### P4-W01. 후보 추출기

현재 catalog를 read-only로 불러와 deterministic YAML을 만든다. 같은 cycle 입력은 같은 candidate ID와 순서를 생성해야 한다. 개인 데이터, trend mail 수신자, 비공개 원문은 포함하지 않는다.

### P4-W02. 편집 승인

승인자는 다음 순서로 확인한다.

1. 검색 의도와 기존 canonical 중복
2. 실제 제품 지원 범위
3. 고유 message map과 proof
4. 샘플 자산 권리·다양성·과장
5. SEO·privacy·product review
6. reviewer, reason, decidedAt 기록

`approved` 후보도 자동 publish하지 않는다. 사람이 C-01 변경 PR을 만들고 Q-01을 통과해야 한다.

### P4-W03. 내부 링크 graph

hub와 7개 페이지의 역할을 명시한다.

- hub는 모든 published 페이지로 crawlable link
- 각 페이지는 primary intent가 다른 관련 페이지 2~4개
- D-SALON 링크에는 상담 준비 맥락을 명시
- home/upload/support에서 필요한 상위 링크만 추가
- orphan 0, self-link 0, retired-link 0

### P4-W04. 운영 runbook

O-01은 propose, approve, implement, verify, publish, observe, revise, retire를 단계별 명령과 책임자로 정의한다. `published` 전환과 sitemap 확인은 같은 change set에서 수행한다.

## 6. Retire와 redirect

| 조건 | 처리 |
| --- | --- |
| 동일 의도의 대체 페이지 존재 | permanent redirect와 link 교체 |
| 일시적 evidence 만료 | `review` 전환, sitemap 제외, 대체 proof |
| 검색 의도 가치 소멸·대체 없음 | noindex 관찰 후 제거 결정 |
| privacy/권리 revoke | 즉시 sample 교체 또는 페이지 비공개 |

URL을 제거하기 전에 inbound internal link, Search Console 성과, 외부 backlink, replacement를 확인한다. redirect chain은 한 단계만 허용한다.

## 7. 검증

- 7개 title/H1/message/FAQ fingerprint 중복 검사
- primary intent와 canonical 1:1
- hub/page graph orphan 0
- candidate generator deterministic snapshot test
- low-freshness·experimental-only 자동 공개 불가 test
- B2C/B2B CTA ID와 scorecard 분리
- 360/390/768/1440 전체 page browser matrix
- 대표 3개가 아니라 7개 모두 Q-01, 핵심 template은 Q-02 회귀
- sitemap URL, status, lastModified와 registry 일치

## 8. Rollout

1. D-BANGS review → canary publish
2. 7일 또는 승인된 관찰 기간 동안 rendering·crawl·funnel 확인
3. D-BOB publish
4. D-SALON은 CTA와 책임자가 확인된 후 별도 publish
5. 전체 internal link graph 활성화

각 단계는 registry status만으로 끄고 켤 수 있어야 한다. 문제 시 앞 단계의 published 집합으로 돌아가며, 기존 pilot에는 영향이 없어야 한다.

## 9. Exit Gate

- [ ] 7개 페이지가 고유 intent·message·evidence·sample을 가짐
- [ ] orphan·canonical 중복·retired link 0건
- [ ] 후보 생성이 registry publish를 직접 변경하지 않음
- [ ] low-freshness 후보가 사람 승인 없이 공개되지 않음
- [ ] B2C/B2B CTA와 지표가 분리됨
- [ ] O-01 publish·retire·rollback dry-run 완료
- [ ] 7페이지 Q-01 및 browser/performance 회귀 승인
