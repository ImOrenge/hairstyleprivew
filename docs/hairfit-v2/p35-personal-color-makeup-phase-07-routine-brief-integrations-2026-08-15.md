# HairFit V2 Phase 07 — Routine, Artist Brief, and Cross-domain Integration

Date: 2026-08-15
Scope: local implementation and verification only

## Outcome

Phase 07 compiles a confirmed Makeup Direction into two execution artifacts: a time-bounded self-makeup routine and a structured artist brief. It also links Hair Dye, Fashion, Makeup, and the legacy Styler fallback to the same optional active Personal Color V2 profile. Artifact generation is deterministic and idempotent; an LLM does not invent colour evidence, coordinates, or product shade numbers.

## Self-makeup routine

- `compact` and `full` modes are compiled only from a confirmed immutable direction snapshot.
- Disabled modules are omitted instead of being silently re-enabled.
- Each step contains order, time, instruction, failure-prevention tips, and brand-neutral search attributes.
- Search terms are normalized attributes, not sponsored or fabricated product claims.
- The compiler scales steps to the context budget. A 10-minute context is mechanically bounded to 600 seconds or less.
- Routine provenance includes the exact direction snapshot, Personal Color profile, and confirmed hair selection identifiers.

## Artist brief and sharing

- The brief preserves all seven structured module summaries, context, presentation intensity, exclusions, technical direction, warnings, and source identifiers.
- The stored brief always has `source_photo_included=false`.
- Public sharing requires an explicit action, uses a random token whose database value is SHA-256 hashed, supports 24/168/720-hour expiry, and can be revoked.
- The original photo checkbox defaults to off. When explicitly enabled, the server chooses a ready private capture, caps the share expiry to asset retention, and returns only a short signed URL; no storage path is exposed publicly.
- Revocation and expiry are checked on every public read.

## Cross-domain Personal Color consistency

- Generation input can carry an additive `personalColor.profileV2` snapshot while retaining the legacy Personal Color fields.
- Hair-colour generation and confirmation persist the active profile ID and reject confirmation if that profile changed.
- Fashion recommendation, styling session, batch, preview set, and final output persist the same optional profile ID.
- V2 harmony palette is preferred for face-near, neutral, accent, challenge, metal, and print-contrast guidance; legacy `profile.personalColor` remains the fallback when no active V2 profile exists.
- Existing Styler and legacy consultation records continue to work with a null V2 profile ID.

## Persistence

Migration `20260815040117_makeup_routine_brief_integrations.sql` adds:

- immutable `makeup_routines` and `makeup_artist_briefs` tables;
- revocable `makeup_brief_shares` with a default-off photo permission;
- service-role-only grants with enabled and forced RLS;
- optional indexed Personal Color profile FKs on Hair Color, styling, Fashion batch, and Fashion output records.

Confirmed Makeup automatically ensures both artifacts, while idempotent artifact routes allow safe recovery if compilation or persistence was interrupted.

## Local verification

- Phase 07 contract tests: 7/7 pass.
- Phase 06 and Phase 05 regression tests: 14/14 pass.
- Shared tests: 113/113 pass.
- Consulting contract tests: 105/105 pass.
- Web and monorepo workspace typechecks: pass.
- Focused ESLint: pass.
- Playwright desktop/mobile Makeup checks: 2/2 pass, including routine, brief, product guide, and unchecked photo permission.
- PostgreSQL 18 fresh-chain: 94/94 migrations pass without Docker.
- Fresh database catalog probe: 3/3 tables use enabled/forced RLS; 3/3 deny anon/authenticated reads; 3/3 grant service-role CRUD; both photo fields default false; 2 immutable update triggers resolve; all 5 cross-domain profile columns resolve.
- Migration mirror: 94/94 pass.
- Component registry: 58 components and 58 passports valid.
- `git diff --check`: pass, with line-ending conversion warnings only.
- Visual evidence: `docs/hairfit-v2/evidence/p07-makeup-routine-brief-share-desktop.png`.

## External boundary

No remote migration, real Clerk-authenticated share flow, private photo signed-URL read, paid Hair/Fashion generation, production canary, deployment, or release was executed. Local fixture and database evidence must not be described as production proof. Phase 08 owns final security, accessibility, mobile parity, canary, rollback, and release-gate validation.

## P40 rationale revision extension

P40 adds the Makeup standalone interview and explicit AI-adjustment review before the direction map. Newly compiled routines and artist briefs persist the originating `rationaleRevision`; legacy artifacts remain readable with a null revision. See `p40-makeup-interview-ai-rationale-implementation-spec-2026-08-16.md`.
