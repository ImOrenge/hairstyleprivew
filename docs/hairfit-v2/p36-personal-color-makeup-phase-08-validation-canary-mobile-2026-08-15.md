# HairFit V2 Phase 08 — Validation, Canary, Mobile Parity, and Rollback

Date: 2026-08-15
Status: ACCEPTED for the local release candidate
Scope: implementation, local verification, and release-control rehearsal; no remote deployment

## Outcome

Phase 08 closes the Personal Color Intelligence and Makeup Direction package with one shared Web/Expo contract, explicit optional training consent, a documented synthetic validation matrix, fail-closed reconciliation, a zero-structural-mismatch canary rule, and a non-mutating rollback rehearsal. The canonical closing order is now `Fashion final selection → Result synthesis → actual-service Aftercare` on both product contracts. The implementation does not claim colourimeter accuracy, a trained proprietary model, exact commercial foundation shades, or raster makeup synthesis.

## Release artifacts

- `packages/shared/src/quality/personal-color-makeup-validation.ts`: 14 inclusive failure-mode fixtures, expert multi-label dataset contract, canary evaluator, and legacy-retirement rule.
- `packages/shared/src/v2/personal-color-makeup-openapi.ts`: OpenAPI 3.1 route and schema surface built from shared Personal Color and Makeup schemas.
- `docs/hairfit-v2/personal-color-makeup-dataset-card-v1.md`: synthetic-only evidence boundary, proposed expert annotation contract, unmeasured human metrics, and subgroup limitations.
- `docs/hairfit-v2/personal-color-makeup-model-policy-card-v1.md`: deterministic policy components, privacy, fairness, known limits, and prohibited claims.
- `docs/hairfit-v2/personal-color-makeup-canary-rollback-runbook-v1.md`: canary decision states, zero structural mismatch threshold, feature-flag rollback, and legacy preservation.
- `20260815044500_personal_color_training_consent.sql`: append-only, owner-linked, default-not-granted training consent events, independently versioned from product processing consent.
- `NativePersonalColorProfileV2` and `NativeMakeupDirectionV1`: Expo views consuming the same versioned profile, seven-module geometry, routine, and brief contracts as Web.

## Acceptance matrix

| Gate | Evidence | Result |
|---|---|---|
| Schema, OpenAPI, shared types | Shared JSON Schema, OpenAPI 3.1 constant, Web/Expo imports, 118 shared tests | PASS |
| Posterior and unavailable axes | Posterior normalization and explicit null/unavailable tests in P03 and shared fixtures | PASS |
| Drape replay and invalidation | Deterministic side randomization, correction replacement, unsure, source invalidation, 8/8 P04 tests | PASS |
| Seven modules and gender invariance | Shared module catalog, male/female/neutral invariant tests, facial-hair exclusions, bounded patches | PASS |
| Routine and brief consistency | Immutable source IDs, disabled-module omission, 10-minute budget, source-photo default off | PASS |
| Legacy compatibility | Golden legacy response/projection tests, additive V2 fields, feature-flag OFF bypass | PASS |
| Retry, fencing, reconciliation, cost | Durable consultation contract suite 105/105; P08 reconciliation hashes IDs and fails closed | PASS |
| Privacy and consent | Private assets, forced RLS, redacted telemetry, delete receipts, share revoke/expiry, separate training consent | PASS |
| Responsive and accessibility | 390/768/1440, no horizontal overflow, keyboard control, Axe serious/critical zero, reduced motion | PASS |
| Performance budget | Local module-control response is gated below 100 ms in Playwright | PASS |
| Signed URL recovery | expired photo evidence calls `recoverExpiredAsset` and exposes automatic reload status | PASS |
| Web/Expo parity and resume | shared API client, foreground AppState recovery, two native component tests, monorepo typecheck | PASS |
| Migration safety | Docker-free PostgreSQL fresh chain 95/95, mirror 95/95, RLS/privilege probes | PASS |
| Canary and rollback | empty canary is `insufficient_data`; clean structural sample passes; OFF plan covers 29 flags and performs no remote access | PASS |
| Legacy retirement | not eligible before two compatible releases plus 30 observation days and zero mismatches; no legacy code removed | PASS |

## Database proof

The Docker-free fresh database applied all 95 migrations. The Phase 08 consent table probe returned:

- RLS enabled and forced;
- table comment explicitly states that product diagnosis processing does not depend on training consent;
- `anon` and `authenticated`: SELECT/INSERT/UPDATE/DELETE all denied;
- `service_role`: SELECT and INSERT granted, UPDATE and DELETE denied;
- zero rows after migration, which is the default-not-granted state.

The PostgreSQL instance was stopped after verification. No remote Supabase project was read or mutated.

## Canary decision and rollback drill

The structural canary accepts no projection mismatch, cross-domain profile mismatch, or missing execution artifact. An empty cohort cannot pass and returns `insufficient_data`; a cohort with any structural mismatch fails. Reconciliation samples expose only a 16-character SHA-256 entity fingerprint and a bounded reason, never a consultation ID, image, skin sample, storage path, or provider payload.

The rollback drill executed the OFF command without `--apply`. It resolved the pinned Worker name, produced a 29-flag all-false plan, left public build-time values unchanged, performed no remote access, and changed no migration, deployment source, or provider call. This proves the rollback payload and refusal boundaries without claiming a production rollback.

## Verification record

- P00–P08 phase suites: 61/61 pass.
- Shared package: 118/118 pass.
- Consulting contract suite: 105/105 pass.
- Native Personal Color/Makeup component tests: 2/2 pass.
- P08 Playwright quality suite: 4/4 pass.
- Makeup direction browser regression: 2/2 pass; combined current E2E bundle 6/6.
- Monorepo workspace typecheck: pass.
- Full Web ESLint plus focused Expo, shared, API client, and E2E ESLint: pass.
- Component registry: 60 components, 60 passports, 13 stable; valid.
- PostgreSQL fresh chain: 95/95 pass without Docker.
- Migration mirror: 95/95 pass.
- Next.js production build: pass; 130 static pages generated.
- `git diff --check`: pass; line-ending conversion warnings only.
- Visual evidence: `docs/hairfit-v2/evidence/p08-makeup-tablet-accessibility.png`.

## Evidence boundary

The validation dataset is synthetic and intentionally cannot support human accuracy or fairness claims. A real consented cohort, independent expert labels, calibrated-display/device measurement, production canary traffic, physical-device screen-reader session, and production deployment were not fabricated or reported as completed. They are release-operation activities, not hidden prerequisites of this local implementation package. The live path must remain flag-off until its own authorized rollout checklist is executed.

No legacy Personal Color or Styler path is removed by this phase. Retirement remains prohibited until two compatible releases, at least 30 observation days, and zero structural mismatches are recorded from an authorized rollout.
