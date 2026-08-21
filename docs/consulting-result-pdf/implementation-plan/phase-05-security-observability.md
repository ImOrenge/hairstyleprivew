# P5. 개인정보·보안·보존·관측성

## 목표

얼굴 분석, 사용자 메모, 스타일 선택, 실제 시술 기록이 결합되는 고민감 산출물을 최소 범위로 처리하고, 누가 어떤 profile을 언제 만들고 받았는지 내용 노출 없이 감사할 수 있게 한다.

## 위협 모델

| 위협 | 방어 |
| --- | --- |
| 다른 사용자의 consultationId 추측 | owner authorization + 404 은닉 |
| signed URL 재사용 | 5분 만료, private bucket, no-store |
| PDF 링크 공개 공유 | public URL 미지원, salon_handoff 전용 share 분리 |
| 임의 URL 이미지로 SSRF | object-reference allow-list, network 차단 |
| HTML/메모를 PDF에 주입 | plain text rendering, 길이 제한, 제어문자 제거 |
| 원본 얼굴 사진의 무단 포함 | default false, 별도 opt-in flag/consent/audit |
| worker 중복 실행 | conditional lease + idempotency key |
| 로그로 개인정보 유출 | fingerprint와 분류 코드만 기록 |
| 만료 PDF가 storage에 잔존 | scheduled retention + reconciliation |
| 관리자 권한 남용 | 원본 사진 profile 별도 privileged action + audit |

## 개인정보 분류

| 등급 | 예시 | 기본 PDF |
| --- | --- | --- |
| P0 공개 제품 문구 | 고지, 섹션명 | 포함 |
| P1 사용자 스타일 선호 | 목표, 관리 강도 | full에 포함 |
| P2 추론·상담 결과 | 얼굴형, 퍼스널 컬러, 선택 이유 | 인증 PDF에 포함 |
| P3 민감 이미지·기하 | 원본 얼굴, landmark, crop 좌표 | 기본 제외 |
| P3 실제 관리 기록 | after photo, concerns, 만족도 | profile·동의에 따라 제한 |
| Secret | share token, signed URL, storage path | 절대 포함 금지 |

## 동의 UX

원본 얼굴 사진 포함은 다음 조건을 모두 만족할 때만 가능하다.

1. `CONSULTATION_PDF_RAW_PHOTO_OPT_IN_ENABLED=true`
2. 사용자 본인이 full_journey 생성 dialog에서 체크
3. 체크박스 기본 false
4. 포함 목적, 파일 보존 시간, 다운로드 후 통제 범위 설명
5. consent version과 timestamp 기록
6. salon_handoff profile에서는 강제로 false

사용자 동의는 기존 분석 사용 동의를 자동 재사용하지 않는다. 분석 목적과 문서 내보내기 목적은 별도다.

## Retention

제안 기본값:

- immutable report snapshot JSON: consultation 보존 정책을 따름
- ready PDF binary: 24시간
- failed temp object: 최대 1시간
- export job metadata: 90일
- audit event: 180일 또는 현재 감사 정책 중 더 짧은 기간
- download signed URL: 5분

정책 값은 코드 상수가 아니라 `CONSULTATION_REPORT_RETENTION_POLICY` 단일 계약에서 관리한다. 환경변수로 보존 시간을 임의 변경하지 않으며, 변경은 migration/정책 PR과 감사 승인을 거친다.

## Cleanup와 reconciliation

정기 작업:

1. `expires_at < now()`이고 ready인 export를 expired로 claim
2. storage object 삭제
3. object 부재를 확인
4. DB `storage_path`, binary digest 접근 상태를 만료 처리
5. orphan temp objects 삭제
6. DB row 없는 storage object와 storage object 없는 ready row 보고

삭제 작업은 batch 100, 최대 실행 시간 제한, dry-run summary, correlation ID를 가진다. source snapshot과 consultation row는 이 작업에서 삭제하지 않는다.

## 감사 이벤트

- `report_snapshot_created`
- `report_export_requested`
- `report_export_ready`
- `report_export_failed`
- `report_download_authorized`
- `report_download_denied`
- `report_raw_photo_opted_in`
- `report_export_expired`
- `report_export_deleted`

필수 필드:

```ts
interface ReportAuditEventV1 {
  event: string;
  correlationId: string;
  actorFingerprint: string;
  consultationFingerprint: string;
  reportSnapshotFingerprint: string | null;
  exportFingerprint: string | null;
  profile: string | null;
  rawPhotoIncluded: boolean | null;
  result: "success" | "denied" | "failed";
  reasonCode: string | null;
  occurredAt: string;
}
```

PDF 내용, 이메일, 실제 이름, 사진 URL, share token은 이벤트에 넣지 않는다.

## 운영 지표와 SLO

### 지표

- snapshot projection success rate
- export queue depth/oldest age
- render success rate와 p50/p95/p99
- retry rate와 final failure code
- PDF page/byte distribution
- download authorization success/denied
- expired binary cleanup lag
- section partial/unavailable 비율

### SLO 제안

- snapshot API 성공률 99.9%
- PDF export 성공률 99.0% 이상
- PDF ready p95 15초 이하
- queue oldest age 60초 이하
- 만료 object cleanup 6시간 이내 99.9%
- cross-user authorization 사고 0

### Alert

- 15분 동안 export failure 5% 초과
- queue oldest age 2분 초과
- `REPORT_ACCESS_DENIED` 급증
- raw photo included count가 rollout 허용량 초과
- orphan object 0이 아닌 상태 24시간 지속
- PDF p95 20초 초과

## 비용 제어

- 같은 snapshot+renderer version의 ready export 재사용
- 이미지 변환 cache는 binary보다 짧게 보관하고 raw photo cache 금지
- active job/분당 요청 제한
- page/image/byte 상한을 projection 단계에서 fail-fast
- internal test export는 production 지표와 분리

## 보안 테스트

- owner A/B cross access
- expired/revoked session
- salon share로 full_journey 접근 시도
- admin role로 raw photo export 시도
- idempotency key를 다른 사용자·snapshot에서 재사용
- storage path traversal
- external URL/redirect/private IP 이미지
- HTML/script/control character note
- oversized image/PDF
- signed URL이 로그와 PDF text에 없는지 검사

## 배포 전 증거

- RLS SQL test 결과
- storage policy 목록과 private 확인
- 2인 privacy review
- consent copy 승인
- retention dry-run 결과
- redacted audit log sample
- signed URL 5분 만료 실제 확인

로컬 unit test는 실제 Supabase RLS, Storage 만료, production log redaction의 증거로 간주하지 않는다.

## 롤백

- 신규 export 요청 플래그 off
- raw photo opt-in 플래그 즉시 off
- 의심되는 download authorization endpoint 차단
- 기존 binary는 보안 사고 시 별도 승인된 purge runbook으로 삭제
- purge는 snapshot/상담 원본을 건드리지 않음
- 사고 범위와 다운로드 감사 이벤트를 보존

## Exit Gate

- [ ] privacy 분류와 consent copy 승인
- [ ] RLS/storage/download negative test 통과
- [ ] retention/reconciliation dry-run과 실제 test environment cleanup 통과
- [ ] 로그·PDF에 secret URL/token 없음
- [ ] SLO dashboard와 alert 준비
