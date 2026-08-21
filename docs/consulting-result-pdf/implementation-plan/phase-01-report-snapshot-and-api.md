# P1. 보고서 스냅샷·API·DB

> V1 기준선 문서다. P7의 11개 결과 section, `not_started` omission, ViewModel V2 공존 규칙은 [P7 구현안](./phase-07-result-content-upgrade.md)이 우선한다.

## 목표

상담의 여러 산출물을 하나의 재현 가능한 `ConsultationReportSnapshotV1`로 투영하고, 중복 요청·동시 수정·권한 검사를 견디는 생성·조회 API를 만든다.

## 데이터 모델

### `consultation_report_snapshots`

| column | type | 규칙 |
| --- | --- | --- |
| `id` | uuid PK | 서버 생성 |
| `user_id` | text | consultation owner와 동일 |
| `consultation_id` | uuid FK | 삭제 정책은 consultation 정책과 일치 |
| `consultation_version` | bigint | 생성 시점 optimistic version |
| `profile` | text | allow-list check |
| `locale` | text | `ko-KR`, `en-US` |
| `schema_version` | text | `consultation-report-snapshot-v1` |
| `source_digest` | text | 64 lowercase hex, unique key 일부 |
| `content` | jsonb | immutable report snapshot |
| `raw_photo_included` | boolean | default false |
| `created_by` | text | owner 또는 authorized staff |
| `created_at` | timestamptz | server timestamp |

Unique 제안:

`(consultation_id, consultation_version, profile, locale, source_digest)`

같은 원본과 설정으로 재요청하면 기존 snapshot을 반환한다. 상담이 갱신되면 새 snapshot을 만들며 기존 snapshot을 수정하지 않는다.

### `consultation_report_exports`

| column | type | 규칙 |
| --- | --- | --- |
| `id` | uuid PK | export job ID |
| `snapshot_id` | uuid FK | immutable source |
| `user_id` | text | owner |
| `status` | text | queued/rendering/ready/failed/expired |
| `idempotency_key` | text | user+snapshot 범위 unique |
| `renderer_version` | text | 코드·폰트 변경 추적 |
| `storage_path` | text nullable | ready에서만 존재 |
| `sha256` | text nullable | binary digest |
| `byte_size` | bigint nullable | 상한 검증 |
| `page_count` | integer nullable | 구조 검사 결과 |
| `error_code` | text nullable | 안전한 분류값 |
| `attempt_count` | integer | 기본 0, 최대 3 |
| `expires_at` | timestamptz | 기본 created_at + 24h |
| `created_at/updated_at` | timestamptz | 상태 추적 |

### migration 경로

- `supabase/migrations/<timestamp>_consultation_report_snapshots.sql`
- `my-app/supabase/migrations/<same>_consultation_report_snapshots.sql`
- private bucket `consultation-report-exports`

root와 `my-app` migration mirror를 같은 해시로 유지한다.

## 서버 서비스

### 신규 경로

- `my-app/lib/v2/report/report-projector.ts`
- `my-app/lib/v2/report/report-snapshot-server.ts`
- `my-app/lib/v2/report/report-authorization.ts`
- `my-app/lib/v2/report/report-redaction.ts`
- `my-app/lib/v2/report/report-digest.ts`

### projection 순서

1. Clerk user와 consultation owner 검증
2. consultation aggregate와 요청 version 확인
3. 연결된 AnalysisEvidence, PersonalColorEvidence, PreviewBoard, StyleSelectionSnapshot 조회
4. selection/color/result snapshot에 연결된 SalonBrief/Makeup/Fashion과 후속 Aftercare만 조회
5. profile include policy 적용
6. raw photo·geometry redaction 적용
7. section별 `ready/partial/not_started/unavailable/redacted` 계산
8. canonical key order로 직렬화하고 SHA-256 생성
9. transaction 내 unique key로 insert 또는 기존 row 반환

보고서 생성 중 상담 버전이 바뀌면 `409 CONSULTATION_VERSION_CONFLICT`를 반환하고 새 버전으로 자동 재시도하지 않는다. 사용자가 갱신된 내용으로 다시 생성하도록 한다.

## API 계약

### Snapshot 생성

`POST /api/v2/consultations/{consultationId}/report-snapshots`

```json
{
  "expectedConsultationVersion": 12,
  "profile": "full_journey",
  "locale": "ko-KR",
  "privacy": {
    "includeRawPhoto": false,
    "includeFaceGeometry": false
  }
}
```

응답 `201` 또는 idempotent `200`:

```json
{
  "snapshot": {
    "id": "uuid",
    "consultationId": "uuid",
    "consultationVersion": 12,
    "profile": "full_journey",
    "sourceDigest": "64-char-sha256",
    "createdAt": "ISO-8601"
  }
}
```

### Snapshot 조회

`GET /api/v2/consultations/{consultationId}/report-snapshots/{snapshotId}`

- owner: full profile 조회 가능
- salon share recipient: 별도 share authorization을 통과한 `salon_handoff`만 가능
- admin: 일반 admin role만으로 원본 얼굴 포함 보고서 조회 불가

Result 화면은 최신 report snapshot이 없을 때 현재 `ConsultationSnapshot`으로 동일 view model을 읽기 전용 projection할 수 있다. 이 preview projection은 DB snapshot 생성으로 가장하지 않으며 PDF export 전에 반드시 immutable report snapshot을 만든다.

### Export 생성

`POST /api/v2/consultations/{consultationId}/report-exports`

Headers:

- `Idempotency-Key`: UUID, 필수
- `Content-Type: application/json`

Body:

```json
{ "snapshotId": "uuid", "format": "pdf" }
```

응답 `202`:

```json
{
  "export": {
    "id": "uuid",
    "status": "queued",
    "pollAfterMs": 1500,
    "expiresAt": "ISO-8601"
  }
}
```

### Export 상태

`GET /api/v2/consultations/{consultationId}/report-exports/{exportId}`

ready일 때만 `downloadAvailable: true`를 반환한다. storage path나 service-role signed URL을 상태 응답에 직접 넣지 않는다.

### Download

`POST /api/v2/consultations/{consultationId}/report-exports/{exportId}/download`

- 인증과 소유권 재검증
- 만료 전 5분짜리 signed URL을 만들거나 서버 stream 응답
- `Content-Disposition: attachment; filename="HairFit-consultation-YYYYMMDD-{shortId}.pdf"`
- `Cache-Control: private, no-store`

## 오류 계약

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | `REPORT_PROFILE_INVALID` | profile/locale/privacy 조합 오류 |
| 401 | `AUTH_REQUIRED` | 로그인 필요 |
| 403 | `REPORT_ACCESS_DENIED` | owner/share 범위 아님 |
| 404 | `CONSULTATION_NOT_FOUND` | 상담 없음 또는 은닉된 접근 거절 |
| 409 | `CONSULTATION_VERSION_CONFLICT` | expected version 불일치 |
| 409 | `REPORT_SOURCE_INCOMPLETE` | 선택한 profile 필수 원본 부족 |
| 413 | `REPORT_SOURCE_TOO_LARGE` | 이미지/섹션 예산 초과 |
| 422 | `REPORT_SOURCE_INVALID` | 연결 ID 또는 schema 불일치 |
| 429 | `REPORT_EXPORT_RATE_LIMITED` | 사용자별 생성 제한 |
| 500 | `REPORT_PROJECTION_FAILED` | 안전한 내부 오류 |

원본 provider 오류, Storage path, user ID는 클라이언트 오류에 포함하지 않는다.

## RLS와 권한

- snapshot/export select: `auth.uid()`와 application user mapping이 owner일 때만
- insert/update: service role 전용 RPC 또는 server route
- content update 금지; 잘못 만든 snapshot은 삭제 대신 superseding snapshot 생성
- storage object: private, service role write, owner signed download only
- public share는 기존 consultation share token과 분리하고 `salon_handoff` profile로 제한

## 테스트

### Unit

- full/partial/redacted fixture projection
- canonical digest 결정성
- section status 계산
- raw photo·geometry redaction
- stale version conflict
- same idempotency key replay

### DB

- fresh migration
- root/my-app mirror hash
- owner A가 owner B snapshot 조회 불가
- service role 외 content 수정 불가
- unique key concurrent insert 2건이 1 snapshot으로 수렴
- expired export download 거절

### Contract

```powershell
npm --prefix my-app run consultation-report:contract:test
npm --prefix my-app run supabase:migrations:mirror:check
npm --prefix my-app run supabase:migrations:fresh:check --
npm run typecheck
```

## 관측성

이벤트:

- `consultation_report_snapshot_requested`
- `consultation_report_snapshot_created`
- `consultation_report_snapshot_reused`
- `consultation_report_snapshot_failed`

필드:

`correlation_id`, `consultation_fingerprint`, `profile`, `locale`, `consultation_version`, `section_status_counts`, `duration_ms`, `error_code`. 이메일·원본 이미지·보고서 내용은 로그 금지다.

## 롤백

1. `CONSULTATION_REPORT_SNAPSHOT_V1_ENABLED=false`
2. 신규 route는 404/feature-disabled로 닫음
3. 생성된 rows와 objects는 보존하고 신규 생성만 중단
4. migration down을 자동 실행하지 않음
5. 데이터 삭제는 별도 cleanup 승인 후 retention job으로만 수행

## Exit Gate

- [ ] immutable snapshot 생성·재사용·버전 충돌 테스트 통과
- [ ] RLS와 storage private 정책 통과
- [ ] 세 fixture의 snapshot hash 고정
- [ ] raw photo 기본 제외가 API/DB 양쪽에서 강제됨
- [ ] API client 타입과 오류 계약 연결
