# P29 — Personal Color + Makeup Phase 01 Capture Assets & Quality

Date: 2026-08-14
Branch: `feat/2026-08-12-discovery-scroll`
Baseline package: `HairFit_PersonalColor_Makeup_Implementation_Package_v1/06-phases/phase-01-capture-assets-quality`

## Outcome

Phase 01을 additive 구현했다. 기존 `generation_upload_drafts`와 `/api/personal-color/analyze` 응답은 제거하지 않았다. 새 컨설팅 컬러 촬영은 JSON data URL 대신 Supabase signed upload token으로 private bucket에 바이너리를 직접 업로드한다. legacy 분석은 `PERSONAL_COLOR_V2_WRITE=true`일 때만 같은 private asset으로 dual-write한다.

## Contract and storage

- Shared contract: `@hairfit/shared/personal-color-v2`
  - `PersonalColorCaptureAssetV2`
  - `PersonalColorCaptureQualityV2`
  - Quick / Precision mode
  - `blockers`, `warnings`, `usableAxes` 분리
- Private bucket: `private-color-inputs`
  - public access disabled
  - JPG / PNG / WebP only
  - 10MB upper bound
  - path uses user hash, consultation UUID, asset UUID, fixed role
- Idempotency: `(user_id, consultation_id, role, checksum_sha256)` unique
- Client checksum and server-downloaded checksum must match.
- Client dimensions, decoded dimensions, MIME, byte size are finalized together.
- Raw photo, signed URL, storage path, skin sample are not written to telemetry payload.

Supabase current behavior was checked against official signed upload and Storage access-control documentation before implementation. Service-role remains server-only; the browser receives only a time-bounded upload token.

## Lifecycle

```text
file selection
  -> SHA-256 + decoded dimensions
  -> capture intent (Clerk owner check)
  -> signed binary upload to private bucket
  -> finalize (download, MIME/size/checksum/dimension verification)
  -> PersonalColorCaptureQuality
  -> quality_ready | quality_blocked
  -> FaceObservation / personal color analysis handoff
```

Delete is split into DB tombstone intent and storage cleanup outbox. Successful storage removal creates a deletion receipt containing the original checksum and deletion timestamp. Retry stores a bounded error code, not a private path in application telemetry.

## PHOTO UX

- 컬러 진단 사용 범위를 켜면 Quick / Precision 선택이 나타난다.
- Precision 보조 사진은 WebP 재인코딩 없이 원본 JPEG/PNG/WebP를 전송한다.
- 컬러 품질 결과는 blocker, warning, five-axis usability를 별도로 표시한다.
- 실패 시 selected file, assist file, crop, mode를 유지한다.
- 명시적 `다시 선택`만 로컬 선택과 crop을 초기화한다.
- 기존 헤어 분석용 draft와 새 컬러 asset은 additive로 공존한다.

## Acceptance evidence

| Acceptance | Result | Evidence |
|---|---|---|
| 새 컬러 UI는 JSON data URL을 전송하지 않음 | PASS | `personal-color-capture-client.ts` uses `uploadToSignedUrl`; phase test 3 |
| 동일 checksum replay가 중복 asset을 만들지 않음 | PASS | unique key + reconcile path; phase test 1 |
| blocker/warning/usable axes 분리 | PASS | shared contract and server quality service; phase tests 4, shared tests 80–81 |
| 실패 시 기존 선택·crop 유지 | PASS | analyze catch does not reset state; phase test 5 |
| 원본 삭제 receipt | PASS (local contract/fresh DB) | cleanup outbox + finish RPC + receipt table; phase test 7 |
| Clerk owner isolation | PASS (static contract) | intent/finalize/delete routes and owner-scoped service query; phase test 2 |
| feature flag off regression | PASS (contract) | new routes fail closed; legacy success builder remains unchanged; phase test 6 |
| sensitive telemetry redaction | PASS | strict allowlist excludes image/path/sample fields; phase test 6 |

## Verification

| Command / check | Result |
|---|---|
| `npm run personal-color-v2:phase-01:test` | PASS — 7/7 |
| `npm --workspace @hairfit/shared test` | PASS — 101/101 |
| `npm --workspace @hairfit/shared run typecheck` | PASS |
| `npm --prefix my-app run typecheck` | PASS |
| focused ESLint for Phase 01 files | PASS |
| `npm run supabase:migrations:mirror:check` | PASS — 89 migrations |
| isolated local PostgreSQL fresh-chain, no Docker | PASS — 89/89 applied |
| E2E harness PHOTO DOM and console | PASS — Quick/Precision visible, no console error |
| `npm run component-registry:validate` | PASS — 57 components / 57 passports |
| targeted cleanup schema probe | PASS — active-checksum index, owner-scoped claim RPC, deletion receipt table |

Visual evidence: `docs/hairfit-v2/evidence/p29-phase-01-photo-capture-modes.png`

## Verification boundary

This phase did not apply the migration to remote Supabase and did not upload a real user image to live Storage. It does not claim live Clerk authentication, deployed Cloudflare behavior, remote deletion execution, or production retention completion. Those remain release and Phase 08 gates.

## Rollback

1. Set `PERSONAL_COLOR_V2_WRITE=false`.
2. New capture routes return not found and the legacy `/api/personal-color/analyze` response remains active.
3. Existing capture assets remain isolated from legacy reads.
4. Queue expired assets through `personal_color_capture_cleanup_outbox`; do not delete rows or storage objects directly.
