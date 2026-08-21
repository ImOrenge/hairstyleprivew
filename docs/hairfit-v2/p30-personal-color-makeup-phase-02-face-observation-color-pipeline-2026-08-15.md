# HairFit V2 Phase 02 — Face Observation & Color Pipeline

Date: 2026-08-15
Branch: `feat/2026-08-12-discovery-scroll`
Scope: local implementation and verification only

## Outcome

Phase 02 adds an additive, provider-independent face observation bundle between photo capture and personal-color inference. The bundle records actual normalized MediaPipe coordinates, semantic include/exclude masks, an explicit sRGB → linear sRGB → XYZ D65 → Lab pipeline, per-region robust statistics, calibration provenance, model hashes, and quality warnings.

This phase does not claim a trained face-parsing segmentation model. The current semantic mask adapter derives auditable polygons from detected MediaPipe coordinates. Highlight, shadow, and reflection exclusions are deterministic pixel rules. The adapter boundary and model manifest allow a later parsing provider to replace that implementation without changing storage or UI contracts.

## Implemented contract

- `FaceObservationBundleV2` is exported from `@hairfit/shared/personal-color-v2` and `@hairfit/shared/v2`.
- Coordinate space is fixed to `normalized-upright-source-v1`.
- Required color observation regions: forehead, upper/lower left cheek, upper/lower right cheek, jaw; neck is optional.
- Semantic exclusions include hairline, brows, eyes, periorbital zones, lips, nostrils, and facial-hair-prone zones.
- Pixel-level exclusions record highlight, shadow, and reflection counts by region.
- Region statistics record median Lab, 10% trimmed mean, channel MAD, median chroma, median hue, sampled/valid pixel counts, and valid ratio.
- Cross-region inconsistency is stored as `CROSS_REGION_COLOR_INCONSISTENCY` with measured Delta E 76. It remains a warning rather than silently changing the diagnosis.
- Web and Expo re-export the same normalized coordinate projection.

## Persistence and durability

Migration `20260815021548_face_observation_color_pipeline.sql` adds:

- immutable ready observation bundles keyed by consultation, input hash, and model hash;
- per-region Lab sample rows;
- durable jobs and outbox rows with lease, retry, and terminal states;
- append-only manual mask correction records with optimistic revision checks;
- forced RLS and service-role-only access.

The request path currently computes the bundle synchronously after analysis evidence persistence, while also recording the durable job/outbox terminal receipt. The lease-based worker RPCs are present for extraction into a background worker in a later operational phase.

## Runtime wiring

- Observation write runs only when `PERSONAL_COLOR_V2_WRITE=true`.
- Observation read runs only when `PERSONAL_COLOR_V2_READ=true`.
- Identical ready input/model hashes reuse the existing bundle.
- A separate color capture receives its own landmark run; base-photo coordinates are not projected onto a different source.
- The evidence API returns the owner-scoped bundle.
- The browser overlay uses bundle masks only when the displayed image and observation source are the same. A color-assist bundle is summarized but never overlaid on the base portrait.

## Local verification

- Phase 02 contract tests: 6/6 pass.
- Shared tests: 104/104 pass.
- Shared typecheck: pass.
- Web typecheck: pass.
- Migration mirror: 90/90 pass.
- PostgreSQL 18 fresh-chain migration: 90/90 pass without Docker.
- Target schema probe: bundle table, ready input/model unique index, enqueue RPC, lease-claim RPC, and append-only correction RPC resolve successfully.

Browser visual evidence is recorded separately after the final Phase 02 verification run.

## Unverified external boundaries

- No remote Supabase migration was applied.
- No live Clerk identity, private Storage upload, provider call, deployment, or release was exercised.
- Enabling either read/write flag in an environment without the migration is unsupported and intentionally not claimed as ready.
