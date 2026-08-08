# HairFit AI Consultant frontend v2 implementation

## Authority and boundary

This implementation follows `HairFit_Interactive_Consulting_Frontend_Design_Plan_v1.0.docx` as an independent frontend authority. It does not adopt or reconcile contracts from the backend refactor package. Existing generation, Result, Personal Color, Styler, and Aftercare surfaces remain compatibility bridges.

The visual contract is unchanged: `my-app/app/globals.css`, existing `--app-*` tokens, typography, spacing, radii, and shared UI surfaces are reused without a global CSS redesign.

## Product outcome

The product journey changes from a four-step image-generation wizard to a headerless AI decision service. The legacy wizard remains available only as the feature-flag rollback and generation bridge.

| # | Scene URL | Server snapshot responsibility |
|---|---|---|
| 01 | `/consulting/[sessionId]/discovery` | goals, current hair, services, maintenance, avoid conditions |
| 02 | `/consulting/[sessionId]/photo` | generation photo bridge, eight quality checks, use scope, retention |
| 03 | `/consulting/[sessionId]/scan` | evidence layers, excluded regions, confidence, manual correction |
| 04 | `/consulting/[sessionId]/analysis` | face analysis, personal color, Evidence -> Meaning -> Action ledger |
| 05 | `/consulting/[sessionId]/direction` | versioned eight-axis `StrategySnapshot` before generation |
| 06 | `/consulting/[sessionId]/previews` | BALANCE, IMAGE, LIFESTYLE 3x3 board and two-to-three shortlist |
| 07 | `/consulting/[sessionId]/compare` | same-crop finalist and optional backup comparison |
| 08 | `/consulting/[sessionId]/decision` | immutable, revisioned `SelectedStyleSnapshot` |
| 09 | `/consulting/[sessionId]/salon-brief` | versioned brief, customer/designer modes, expiring/revocable sanitized share |
| 10 | `/consulting/[sessionId]/aftercare` | actual multi-service record and Today/D+3/W+2/W+6/W+10 care program |
| 11 | `/consulting/[sessionId]/fashion` | direction, nine looks, shortlist/compare, selected look |

## State and consistency

- `consultation_sessions.snapshot` is the source of truth; component state is an unsaved form draft only.
- Every PATCH sends `expectedVersion` and `If-Match`; the database update also matches the previous version. A conflict returns HTTP 409 with the latest snapshot.
- Direct URLs authenticate ownership and apply server route guards. Refresh and mobile re-entry restore the server snapshot.
- Generated asset paths are retained separately from signed presentation URLs. Direct reads and the explicit refresh endpoint renew expired URLs.
- A strategy revision invalidates downstream preview, comparison, brief, care, and fashion state while preserving immutable selection history for audit.
- A new style selection appends a revision and never mutates the prior snapshot. Actual service confirmation locks further strategy/style changes.
- Public salon shares use a 256-bit opaque token, a SHA-256 database lookup hash, frozen sanitized payload, expiry, and revocation. Raw face photos and the full consultation snapshot are excluded.

## Compatibility and rollback

- `NEXT_PUBLIC_CONSULTATION_FRONTEND_V2=false`: `/workspace` and all existing paths behave as before; consulting routes redirect to the legacy workspace.
- Flag enabled: `/workspace` enters `/consulting/new`.
- `/workspace?legacy=1&returnTo=...` is the explicit generation compatibility bridge and returns the generation ID to Scene 02.
- Result/Aftercare and Styler routes remain unchanged and are linked from Scenes 10 and 11.
- Rollback is a feature-flag change only. It does not delete consultation snapshots or revoke existing privacy controls.

## Shared platform contract

`@hairfit/shared/consulting/contract` owns the DTOs used by web and Expo. `@hairfit/api-client` exposes create, latest/read, optimistic update, and asset-refresh methods so both platforms consume the same server source of truth.

## Final validation gate

Formal validation is intentionally deferred until implementation is complete. The single final gate must record all of the following before this document can claim completion:

- [x] lint and monorepo typecheck
- [x] consultation contract and directly affected regression contracts
- [x] component registry and Supabase migration mirror check (76 mirrored migrations)
- [x] production web build with the flag both OFF and ON
- [x] 11-stage browser harness at desktop, tablet, and small mobile widths
- [x] keyboard, dialog focus, reduced-motion, privacy-share expiry/revocation checks
- [x] direct URL, refresh, conflict, partial generation, signed URL refresh, and selection-lock evidence

The consultation browser suite passes 4/4, including the 11 addressable Scenes, header/footer exclusion, horizontal overflow, focus trapping/return, Escape, and serious/critical axe checks at 390px and 768px. The wider existing web suite passes 63/76; its 13 failures are baseline harness mismatches outside the consultation implementation, including tests that still wait for a removed global subscription-payment notice. The existing Styler decomposition source test also expects a literal fetch shape that is absent from the unchanged controller. These are recorded rather than rewritten as part of this frontend scope.

The fresh-database chain could not run because the local Docker daemon/PostgreSQL service is unavailable. The root and `my-app` migration directories are byte-for-byte mirrored and the mirror gate passes. No remote database was mutated for validation.

Implementation status: frontend scope complete and final scoped validation passed, with the two pre-existing/environment limitations above recorded for follow-up.
