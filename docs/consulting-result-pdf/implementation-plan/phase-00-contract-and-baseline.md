# P0. 계약 동결과 기준선

> 이 문서의 profile·section 계약은 ViewModel V1 기준선이다. P7 V2에서는 [P7 결과 콘텐츠 고도화](./phase-07-result-content-upgrade.md)의 5개 탭·11개 section과 초기 케어/별도 Aftercare 경계를 우선 적용한다. V1의 `aftercare_update` profile은 V2 Result에 노출하지 않는다.

## 목표

프런트엔드의 단일 JSON snapshot과 V2 백엔드의 정규화된 aggregate가 공존하는 현재 상태에서 보고서의 권위 원본, API prefix, 민감 정보 정책, PDF 런타임을 먼저 동결한다. 이 Phase가 끝나기 전에는 migration이나 사용자 노출 UI를 만들지 않는다.

## 선행 조건

- 정확한 구현 브랜치와 통합 대상 기록
- `feat/2026-08-08-ai-consultant-frontend`와 `feat/2026-08-08-hairfit-v2-backend`의 통합 순서 결정
- 실제 배포 런타임(Node/Cloudflare)과 최대 함수 실행 시간 확인

## RP-P0-01. 현재 상태 감사

### 읽을 경로

- `packages/shared/src/consulting/contract.ts`
- `packages/shared/src/v2/consultation/contract.ts`
- `packages/shared/src/v2/analysis/contract.ts`
- `packages/shared/src/v2/selection/contract.ts`
- `packages/shared/src/v2/outputs/contract.ts`
- `my-app/components/consulting/workbenches/*`
- `my-app/app/result/[id]/page.tsx`
- `apps/hairfit-app/app/result/[id].tsx`

### 산출물

`docs/consulting-result-pdf/evidence/current-state-YYYY-MM-DD.md`에 다음을 기록한다.

- 각 경로의 source SHA
- 실제 존재하는 필드와 제안 필드 구분
- 기존 결과 페이지와 새 컨설팅 보고서의 책임 경계
- legacy `/result/{generationId}`와 `/consulting/{sessionId}/report` 연결 규칙
- 실제 데이터, fixture, 제안 데이터 표시

### Gate

- 문서가 서로 다른 브랜치의 파일을 동일 구현 상태로 오인하지 않는다.
- backend working tree의 미커밋 변경은 기준선에 포함하지 않는다.

## RP-P0-02. ADR 작성

다음 ADR을 추가한다.

`docs/adr/ADR-REPORT-001-consultation-report-snapshot-and-renderers.md`

결정 내용:

1. canonical API는 `/api/v2/consultations/{consultationId}/report-*`로 한다.
2. legacy `/api/consultations/*`는 migration 기간에만 adapter를 둔다.
3. 보고서는 immutable snapshot으로 생성하며 live aggregate를 매 다운로드마다 즉석 렌더하지 않는다.
4. 기존 `/consulting/{sessionId}/result`를 세로형 Report 화면으로 승격하고 별도 report stage를 만들지 않는다.
5. HTML과 PDF는 동일한 view model과 copy dictionary를 사용하지만 렌더러는 분리한다.
6. PDF는 `@react-pdf/renderer`를 Node-only 모듈에서 실행한다.
7. PDF binary는 private storage에 단기 보관한다.
8. 원본 얼굴 사진은 기본 제외다.

대안과 기각 이유:

- `window.print()`만 사용: 모바일 다운로드와 동일 파일 재현 불가
- DOM 캡처: 텍스트 검색·페이지 나눔·접근성·고해상도 인쇄 취약
- headless Chromium을 API 요청마다 실행: 번들·cold start·메모리·타임아웃 위험
- live aggregate 직접 렌더: 상담 변경 후 같은 보고서 ID가 달라지는 재현성 문제

## RP-P0-03. 계약 파일

### 신규 경로

- `packages/shared/src/v2/reports/contract.ts`
- `packages/shared/src/v2/reports/schema.ts`
- `packages/shared/src/v2/reports/view-model.ts`
- `packages/shared/src/v2/reports/fixtures/full-journey.ts`
- `packages/shared/src/v2/reports/fixtures/partial-journey.ts`
- `packages/shared/src/v2/reports/fixtures/redacted-journey.ts`

### 핵심 타입

```ts
type ConsultationReportProfileV1 =
  | "full_journey"
  | "salon_handoff"
  | "analysis_only"
  | "aftercare_update";

interface ConsultationReportSnapshotV1 {
  schemaVersion: "consultation-report-snapshot-v1";
  id: string;
  consultationId: string;
  consultationVersion: number;
  profile: ConsultationReportProfileV1;
  locale: "ko-KR" | "en-US";
  source: {
    analysisEvidenceId: string | null;
    analysisCorrectionRevision: number | null;
    styleSelectionSnapshotId: string | null;
    styleSelectionSnapshotVersion: number | null;
    salonBriefVersion: number | null;
    aftercareVersion: number | null;
    fashionPreviewSetVersion: number | null;
  };
  privacy: {
    rawPhotoIncluded: boolean;
    faceGeometryIncluded: boolean;
    publicShareAllowed: false;
    redactionCodes: string[];
  };
  sections: ConsultationReportSectionV1[];
  resultSnapshotId: string;
  sourceDigest: string;
  createdBy: string;
  createdAt: string;
}
```

`sourceDigest`는 canonical JSON의 SHA-256이다. 표시용 무결성 코드는 앞 12자리만 노출하고 전체 값은 API와 감사 로그에 유지한다.

## RP-P0-04. 문구와 상태 동결

다음 문구는 shared copy dictionary에 둔다.

- `미완료`: 여정 시작 전
- `일부 자료만 포함`: 유효하지만 일부 필드 없음
- `자료를 불러오지 못함`: 권위 원본 조회 실패
- `개인정보 보호를 위해 제외됨`: 정책 redaction
- `AI 분석 결과는 의료 진단이 아니며 디자이너의 현장 판단이 우선합니다.`

빈 문자열, `-`, `N/A`, `undefined`를 서로 다른 상태 대신 무분별하게 사용하지 않는다.

## RP-P0-05. 폰트·이미지·런타임 spike

### 검증 fixture

- 한글 2,000자 장문
- 숫자/영문/괄호/슬래시/원화 기호
- 9개 후보 이미지
- 30개 근거 행
- 긴 URL과 긴 디자이너 메모
- emoji는 지원 대상에서 제외하고 텍스트 대체

### 확인 항목

- 배포 번들에 폰트가 포함되는가
- 폰트 license가 PDF embedding을 허용하는가
- 이미지 9개, 15페이지에서 메모리와 시간이 예산 안인가
- 외부 signed URL 만료 전에 서버가 이미지를 안전하게 가져오는가
- 렌더 실패 시 binary가 저장되지 않는가

### 제안 예산

| 항목 | 목표 | 차단선 |
| --- | --- | --- |
| snapshot projection p95 | 500 ms 이하 | 1.5 s |
| PDF render p95 | 8 s 이하 | 20 s |
| PDF 크기 | 8 MB 이하 | 15 MB |
| 페이지 수 | 6~18 | 24 초과 시 경고 |
| 이미지당 decoded 크기 | 12 MP 이하 | 20 MP |
| 동시 작업당 메모리 | 256 MB 이하 | 512 MB |

## 검증

```powershell
npm run typecheck
npm run lint
node --test packages/shared/src/v2/reports/*.test.ts
git diff --check
```

P0에서는 실제 PDF 라이브러리 추가 전 별도 spike branch를 허용하되, lockfile 변경과 최종 라이브러리 채택은 ADR 승인 후에만 한다.

## 롤백

코드·DB를 변경하지 않는 Phase다. ADR이 승인되지 않으면 계약과 fixture를 유지한 채 상태를 `decision-needed`로 바꾸고 P1을 시작하지 않는다.

## Exit Gate

- [ ] canonical API prefix 확정
- [ ] report snapshot schema와 fixture 승인
- [ ] raw photo 기본 제외 승인
- [ ] PDF renderer와 한글 폰트 승인
- [ ] 성능 예산 spike 통과
- [ ] legacy generation 결과 페이지와 consultation Result→Report 경계 문서화
