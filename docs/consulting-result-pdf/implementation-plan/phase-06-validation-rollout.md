# P6. 검증·모바일 연결·점진 출시

> V1 rollout 기준선이다. P7 검증에서는 5개 탭·11개 결과 section, `not_started`와 빈 탭 omission, 초기 케어/별도 Aftercare 경계, V1/V2 snapshot 공존 fixture를 추가한다.

## 목표

화면이 보기 좋다는 수준을 넘어 데이터 재현성, 인쇄물, PDF 구조, 권한, 실제 다운로드까지 검증하고 기능 플래그로 점진 출시한다. Web을 먼저 완료한 뒤 Expo는 동일 API의 다운로드·공유 연결만 추가한다.

## 검증 층위

| 층위 | 증명 범위 | 증명하지 못하는 것 |
| --- | --- | --- |
| unit/contract | projection, redaction, state, digest | 실제 DB/RLS/Storage |
| component | 화면 상태와 접근성 구조 | 브라우저 print dialog 결과 |
| Playwright | viewport, print media, 실제 route 흐름 | OS별 실제 프린터 드라이버 |
| PDF parser/render | page, text, 이미지, glyph, visual | 사용자 다운로드 권한 |
| local DB | migration/RLS 논리 | production policy/current data |
| staging authenticated | owner/download/expiry | production 부하 |
| production canary | 실제 배포·지표 | 장기 retention 결과 |
| physical device | Expo 다운로드·share sheet | 모든 제조사 PDF viewer |

완료 보고는 각 층위의 통과와 미실행을 분리한다.

## Fixture matrix

| ID | 조건 | 예상 페이지 | 핵심 기대 |
| --- | --- | --- | --- |
| RPF-01 | full journey, 9 images, ko-KR | 10~18 | 모든 section ready |
| RPF-02 | result ready, aftercare 미시작 | 8~14 | Aftercare not_started, Result 완료 |
| RPF-03 | salon handoff | 3~6 | raw photo/민감 note 없음 |
| RPF-04 | analysis partial | 4~8 | warning과 누락 사유 |
| RPF-05 | personal color unusable | 5~10 | 결과 단정 없이 unavailable |
| RPF-06 | long Korean notes/evidence 30행 | 12~24 | 글리프·표 잘림 없음 |
| RPF-07 | 3 preview failures | 7~14 | 실패 slot 오표시 없음 |
| RPF-08 | stale report v12 / consultation v13 | 기존 유지 | stale banner, 새 생성 CTA |
| RPF-09 | raw photo opt-in | +1~2 | consent/audit, full only |
| RPF-10 | expired export | 해당 없음 | snapshot 유지, 재생성 가능 |

fixture는 실제 사용자의 사진·이름·상담 메모를 복제하지 않는다. 합성·라이선스 확인 asset만 사용한다.

## 자동 검증

### 정적·계약

```powershell
npm run lint
npm run typecheck
npm --prefix my-app run consultation-report:contract:test
npm --prefix my-app run consultation-report:pdf:test
npm --prefix my-app run result-ux:contract:test
npm --prefix my-app run supabase:migrations:mirror:check
git diff --check
```

### Web E2E

신규:

- `tests/web-e2e/consultation-report.spec.ts`
- `tests/web-e2e/consultation-report-print.spec.ts`
- `tests/web-e2e/consultation-report-export.spec.ts`

검증:

- snapshot 없음 -> 생성 -> report 열람
- stale version -> 기존 열람 -> 새 snapshot 생성
- full/salon profile 전환은 새 snapshot을 사용
- print toolbar 숨김과 section 순서
- Result split canvas 제거와 단일 문서 스크롤
- Personal Color·Color Studio·Makeup·Fashion 상세 링크
- export queued -> ready -> authenticated download
- expired -> regenerate
- raw photo 기본 제외
- 320/375/768/1280 px overflow 0
- axe serious/critical 0

### PDF visual QA

각 fixture PDF를 150 DPI PNG로 렌더해 다음을 확인한다.

- 첫/중간/마지막 페이지
- 섹션 제목과 표 header 반복
- 이미지 비율과 잘림
- 한글 tofu glyph 없음
- footer page number와 integrity code
- 흑백 렌더에서 상태 구분 가능
- 페이지 마지막 8 mm 영역에 본문 침범 없음

visual snapshot 갱신은 renderer, font, copy 또는 layout 변경 사유를 PR에 적을 때만 허용한다.

## Staging 인증 검증

계정 A/B와 salon share recipient를 사용한다.

1. A가 full snapshot과 export 생성
2. A가 다운로드하고 SHA/페이지 수 확인
3. B가 A의 snapshot/export ID로 조회·다운로드 실패
4. salon recipient가 salon_handoff 조회 성공, full 실패
5. URL 5분 만료 후 재사용 실패
6. 24시간 정책을 test override한 단축 retention으로 object 삭제 확인
7. audit log에는 fingerprint만 있는지 확인

실제 사용자 이메일·ID·사진·secret은 증거 문서에서 redaction한다.

## Expo 연결

### 경로

- `apps/hairfit-app/app/consulting.tsx`의 `result` stage
- `apps/hairfit-app/components/consulting/report/MobileReportSummary.tsx`
- `apps/hairfit-app/lib/report-download.ts`

### 범위

- report 요약과 section status 열람
- PDF 만들기/상태 polling
- 기기 sandbox에 임시 다운로드
- OS share sheet 열기
- 공유 후 앱 임시 파일 cleanup 시도

### 제외

- native에서 PDF 자체 렌더링 재구현
- 앱 내부 PDF 편집
- 원본 사진 opt-in UI의 첫 출시

### 실제 기기 Gate

- Android와 iOS physical device 각각 1대 이상
- 로그인, export, background/foreground 복귀
- 다운로드 중 네트워크 전환
- Files/Drive/Kakao 등 share sheet 대상 1개 이상
- 만료 URL 재시도
- 15 MB 상한 파일 열기

Simulator/emulator 통과를 physical device 증거로 보고하지 않는다.

## Rollout

### R0. 내부 fixture

- snapshot/receipt/pdf flag 켬
- 운영 사용자 노출 0%
- golden fixture와 부하 테스트

### R1. 운영자·테스트 계정

- raw photo flag off
- 최소 30 exports
- failure < 2%, p95 < 15s

### R2. 사용자 5%

- full_journey만 노출
- 48시간 관찰
- cross-access, queue, renderer, cleanup 확인

### R3. 사용자 25%

- salon_handoff 추가
- 72시간 관찰
- support 문의와 PDF viewer 호환성 확인

### R4. 100%

- Web 전면 노출
- Expo는 physical device gate 통과 플랫폼만 노출
- raw photo opt-in은 별도 출시로 유지

## Go/No-Go

Go:

- RLS negative test 100% 통과
- export success >= 99%
- p95 <= 15초, PDF <= 15 MB
- serious/critical accessibility 0
- raw photo 예상 외 포함 0
- cleanup lag <= 6시간
- 기존 consulting/result 회귀 0

No-Go:

- 다른 사용자의 snapshot/export 접근 가능
- PDF에 signed URL/storage path/token 포함
- 한글 glyph 누락
- report source ID 불일치가 성공 처리
- queue age 2분 초과 지속
- 15 MB/page 24 상한 우회

## 롤백 순서

1. `CONSULTATION_PDF_EXPORT_V1_ENABLED=false`
2. 필요 시 `CONSULTATION_RECEIPT_LAYOUT_V1_ENABLED=false`
3. snapshot 생성에 문제가 있으면 snapshot flag off
4. worker intake 중단, active job 안전 종료
5. 신규 signed download 차단 여부 결정
6. 기존 상담·선택·brief·aftercare·fashion 데이터 유지
7. incident evidence와 redacted audit 보존
8. 재출시는 원인별 fixture 회귀 테스트 후 새 renderer version으로 수행

## 최종 Handoff

최종 문서에는 다음을 남긴다.

- 구현 source SHA와 통합 target
- migration 파일과 원격 적용 여부
- feature flag snapshot
- renderer/font version
- fixture SHA/page count/PNG evidence
- local/staging/production/physical-device 검증 구분
- RLS/storage/download 증거
- canary 지표와 관찰 시간
- rollback 실행 여부
- 미완료 gate와 담당자

## Exit Gate

- [ ] 전체 fixture 자동·시각 검증 통과
- [ ] staging cross-user/share/expiry 통과
- [ ] Web canary 지표 기준 충족
- [ ] 실제 기기 검증된 플랫폼만 Expo 노출
- [ ] rollback rehearsal 완료
- [ ] 미검증 항목을 통과로 표현하지 않은 handoff 작성
