# HairFit V2 Phase 04 — Interactive Drape Validation

Date: 2026-08-15
Scope: local implementation and verification only

## Outcome

Phase 04 adds an optional, owner-scoped interactive drape session after a ready Personal Color V2 profile. The session compares 6–10 deterministic color pairs, updates the 12-type posterior from harmony answers, records preference independently, and creates a new confirmed profile version only when the user confirms the result.

The implementation is an evidence refinement tool, not a camera-based physical drape simulator and not a clinically calibrated classifier. Its likelihood policy is deterministic and versioned as `drape-likelihood-v1`.

## Rendering and interaction contract

- Both comparison panes reuse the exact same source photo and crop.
- The face image receives no filters, tint, blend, morph, or pixel alteration.
- Only a solid lower drape band changes color.
- Left/right placement is deterministic per session while preventing a fixed semantic side.
- Answers are `left_better`, `right_better`, `no_meaningful_difference`, or `unsure`.
- `unsure` records an observation but leaves the posterior numerically unchanged.
- Personal preference is collected separately and never changes the harmony posterior.
- A prior pair can be corrected; only its latest revision participates in inference.
- The user can stop and confirm early or abandon the session while retaining the previous active profile.

Quick mode is presented as lower-precision validation. The policy stops at 10 pairs, or from 6 pairs when confidence or entropy meets the versioned threshold.

## Persistence and concurrency

Migration `20260815024219_personal_color_drape_sessions.sql` adds:

- versioned drape sessions linked to the source Personal Color V2 profile;
- append-only response revisions with `supersedes_response_id`;
- optimistic session revision checks in response and completion RPCs;
- profile-source invalidation for active, paused, and sufficient-confidence sessions;
- idempotent terminal completion receipts;
- forced RLS and service-role-only mutation boundaries.

A correction is allowed after automatic sufficient-confidence stopping. If the corrected evidence no longer meets a stop threshold, the session returns to active. Confirming creates and activates a new immutable profile version with `drapeValidatedAt`, `confirmedAt`, an updated posterior, harmony evidence, preference evidence, and a new legacy projection hash.

## API and feature flags

Owner-authenticated routes support session create/resume/read, response append/correction, completion, and abandonment. `PERSONAL_COLOR_DRAPE_V1` gates all drape routes and the workbench entry point. The existing Personal Color profile remains usable when the flag is off or the user abandons validation.

## Local verification

- Phase 04 policy/contract tests: 8/8 pass.
- Shared tests: 107/107 pass.
- Web typecheck: pass.
- Focused ESLint: pass.
- PostgreSQL 18 fresh-chain: 92/92 migrations pass without Docker.
- Target schema probe: session/response tables, append/complete RPCs, and profile-change trigger resolve.
- Component registry: 57 components and 57 passports valid.
- Migration mirror: 92/92 pass.
- `git diff --check`: pass, with pre-existing line-ending conversion warnings only.

## External boundary

No remote migration, live authenticated drape session, production profile activation, deployment, or release was executed. `PERSONAL_COLOR_DRAPE_V1` must remain off wherever migration 92 is not applied.
