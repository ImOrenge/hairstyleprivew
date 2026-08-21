# 컨설팅 결과 명세서·PDF

컨설팅 Result Scene의 좌우 분할 작업대 구조를 세로형 명세 영수증 Report로 바꾸고, 현재 15-stage 상담 여정의 분석·디렉팅 자료를 실제 PDF로 내보내기 위한 구현 문서 모음이다.

## 문서 진입점

- [상세 구현 계획](./implementation-plan/README.md)
- [Acceptance Matrix](./implementation-plan/acceptance-matrix.md)
- [P7 고객 결과 중심 리포트 고도화 구현안](./implementation-plan/phase-07-result-content-upgrade.md)

## 현재 상태

- 문서 설계: 완료
- 15-stage·Result→Report 계약: 2026-08-16 갱신
- 제품·privacy 기본값: 원본 얼굴 사진 항상 제외, private owner-only export, 24시간 다운로드 만료
- 기능 코드: `feat/2026-08-12-discovery-scroll` 작업 트리에 Web Report·PDF export까지 로컬 구현
- 결과 콘텐츠 V2: 5개 결과 탭·11개 section·초기 케어/별도 Aftercare 경계 확정, P7 구현안 갱신, 코드 미적용
- DB migration: `20260816110000_consultation_report_exports.sql` 양쪽 mirror 작성, 원격 미적용
- PDF artifact: bundled Nanum Gothic으로 실제 `%PDF-` 생성 계약 통과, 인증 DB/Storage 다운로드는 미검증
- 배포·canary·실기기 검증: 미실행

## 2026-08-16 구현 경로

| 책임 | 구현 경로 |
| --- | --- |
| 공용 읽기 모델·14개 section projector | `packages/shared/src/consulting/report.ts` |
| Result 세로형 receipt | `my-app/components/consulting/report/ReportReceipt.tsx` |
| 인쇄·PDF CTA | `my-app/components/consulting/report/ReportToolbar.tsx` |
| Result composition | `my-app/components/consulting/workbenches/ResultWorkbench.tsx` |
| 실제 PDF renderer | `my-app/lib/consulting/render-report-pdf.tsx` |
| immutable snapshot·export service | `my-app/lib/consulting/report-export-server.ts` |
| create/status/download API | `my-app/app/api/v2/consultations/[consultationId]/report-exports/**` |
| private DB/Storage migration | `supabase/migrations/20260816110000_consultation_report_exports.sql` |
| 계약·실제 PDF smoke | `my-app/lib/consulting/report.test.ts`, `report-pdf.test.ts` |

문서의 후속 rollout·staging·mobile 경로는 목표 계약이다. 로컬 구현과 원격 적용·인증 환경·운영 증거를 구분한다.
