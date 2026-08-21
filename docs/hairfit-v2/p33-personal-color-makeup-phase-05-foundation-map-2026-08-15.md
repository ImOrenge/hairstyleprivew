# HairFit V2 Phase 05 — Makeup Foundation Map

Date: 2026-08-15
Scope: local implementation and verification only

## Outcome

Phase 05 adds a versioned Makeup Direction stage between Salon Brief and Fashion. A user records presentation intent and practical constraints once, then the server builds one deterministic seven-zone face map from the confirmed hairstyle, active Personal Color V2 profile, and ready face observation. The same immutable snapshot drives both the visual Canvas and the semantic Matrix.

This phase establishes direction and editable geometry. It does not synthesize makeup pixels, alter the face image, smooth skin, reshape features, or claim a photorealistic makeup preview. Detailed zone policies and richer adjustment controls belong to Phase 06.

## Context and inclusion contract

- Presentation intent, occasion, available time, skill level, finish, facial-hair preference, exclusions, owned products, and available tools are stored separately from inferred evidence.
- Onboarding gender is disclosed as context but never enables, disables, or removes a makeup module.
- Every snapshot always contains `base`, `brow`, `eyeshadow`, `eyeliner`, `blush`, `lip`, and `lashes`.
- Presentation intent can change intensity and direction copy, but module availability remains invariant.
- User exclusions disable a direction explicitly; the module remains present and can be restored.

## Geometry and rendering contract

- Geometry is produced by a versioned deterministic compiler using stored face landmarks and semantic regions.
- When a zone lacks a dedicated landmark subset, a bounded normalized fallback is recorded by the compiler instead of asking an LLM to invent coordinates.
- The original signed consultation photo remains the only raster layer.
- The Canvas renders normalized SVG polygons, paths, points, and vectors over that source image.
- No CSS image filter, pixel tint, morph, smoothing, or hidden image-generation call is used.
- The semantic Matrix receives the exact same seven-module snapshot as the Canvas, so visual and textual directions cannot diverge.

## Persistence and concurrency

Migration `20260815031542_makeup_direction_foundation.sql` adds:

- versioned direction snapshots linked to the consultation, face observation, Personal Color V2 profile, and confirmed style selection;
- append-only module patch history;
- one active editable snapshot per consultation;
- optimistic revision checks for patch and confirmation RPCs;
- immutable confirmed snapshots;
- service-role-only access with forced RLS;
- the `makeup` value in the complete consultation stage constraint.

Saving context and building the map are presented as one user action. Module edits are bounded and revisioned. Confirmation is idempotent and locks the snapshot. If any source revision changes, the stage reports the stale reason and requires a new foundation map instead of silently reusing mismatched geometry.

## Journey and rollback

- New lifecycle snapshots require confirmed Makeup after Salon Brief before Fashion opens.
- Legacy snapshots without a Makeup summary retain the previous path for compatibility.
- `MAKEUP_DIRECTION_V1` gates the routes and stage.
- When the flag is off, Makeup is removed from the allowed/recommended journey and Fashion is reopened without deleting stored Makeup data.
- Confirming the stage refreshes the server-authored journey; the client does not invent completion state.

## Local verification

- Phase 05 contract tests: 7/7 pass.
- Shared tests: 109/109 pass.
- Consulting contract tests: 105/105 pass.
- Web and shared typechecks: pass.
- Focused ESLint: pass.
- PostgreSQL 18 fresh-chain: 93/93 migrations pass without Docker.
- Target PostgreSQL probe: `makeup` session stage, snapshot/patch tables, patch/confirm RPCs, and confirmed-snapshot immutability resolve and behave as expected.
- Component registry: 58 components and 58 passports valid.
- Migration mirror: 93/93 pass.
- `git diff --check`: pass, with line-ending conversion warnings only.

## External boundary

No remote migration, live authenticated Makeup session, production feature-flag enablement, deployment, or release was executed. `MAKEUP_DIRECTION_V1` must remain off wherever migration 93 is not applied. Generated makeup imagery and detailed per-zone artistry remain outside Phase 05.
