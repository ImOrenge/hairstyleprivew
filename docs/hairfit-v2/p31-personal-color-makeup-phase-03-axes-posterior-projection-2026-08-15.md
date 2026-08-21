# HairFit V2 Phase 03 — Axes, Posterior & Legacy Projection

Date: 2026-08-15
Scope: local implementation and verification only

## Outcome

Phase 03 converts the Phase 02 observation bundle into five versioned axis estimates, a normalized 12-type posterior, an explicit display classification, a palette projection, and a legacy `PersonalColorResult` consumed by the existing Styler.

The axis engine is deterministic and versioned. It is not presented as a trained or clinically calibrated model. `posterior-v1+uncalibrated-identity-v1` records that the probability calibration hook is currently an identity hook; later Brier/ECE calibration can replace it without changing the profile contract.

## Evidence policy

- Temperature, value, chroma, and hue character use weighted region Lab statistics and record region evidence IDs.
- Contrast remains `value: null`, `confidence: 0`, `unavailableReason: HAIR_OR_IRIS_OBSERVATION_UNAVAILABLE` until reliable hair or iris representative colors exist.
- Unavailable axes are excluded from prototype distance rather than substituted with zero.
- Photo observation reliability and profile inference confidence are stored and displayed separately.
- Posterior contains all 12 unique types and sums to one within contract tolerance.

## Persistence and projection

Migration `20260815023212_personal_color_profiles_v2.sql` adds:

- versioned profile history linked to the immutable observation bundle;
- one active profile projection per user;
- hash-only V1/V2 reconciliation receipts;
- an atomic activation RPC that writes the active profile and updates the existing `user_style_profiles.personal_color_*` contract;
- forced RLS and service-role-only access.

The legacy projection keeps `tone`, `contrast`, detailed best/challenge swatches, styling palette, hair-color hints, summary, timestamp, and model. Existing Styler reads remain unchanged. The V2 read flag changes which projection is written to consultation evidence; with the flag off, the existing provider result remains active.

## UX

The consultation Personal Color workbench now optionally loads the owner-scoped V2 profile and displays:

- separate photo-observation and profile-inference confidence;
- five signed axes with explicit unavailable states;
- text-equivalent 12-type posterior bars;
- technical details for bundle ID, calibration, policy versions, and region validity.

## Local verification

- Phase 03 tests: 6/6 pass.
- Shared tests: 107/107 pass.
- Shared and web typecheck: pass.
- PostgreSQL 18 fresh-chain: 91/91 migrations pass without Docker.
- Target schema probe: profile history, active projection, reconciliation, and activation RPC resolve.
- Migration mirror: 91/91 pass.

## External boundary

No remote migration, live authenticated profile activation, production Styler generation, deployment, or release was executed. `PERSONAL_COLOR_V2_WRITE` and `PERSONAL_COLOR_V2_READ` must remain off in environments where migrations 90–91 are not applied.
