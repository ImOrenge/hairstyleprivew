# HairFit V2 Phase 06 — Makeup Zone Prescriptions

Date: 2026-08-15
Scope: local implementation and verification only

> Rendering revision: 고밀도 얼굴 랜드마크, 레퍼런스 동기화, 좌우 컬러 칩과 브러시 스트로크의 후속 구현 기준은 `p37-makeup-dense-landmark-reference-sync-implementation-spec-2026-08-15.md`가 이 문서의 Canvas 표현 규칙보다 우선한다. 서버 방향 정책과 immutable snapshot 계약은 이 문서를 계속 따른다.

## Outcome

Phase 06 turns the Phase 05 face map into seven deterministic, editable prescriptions. Base, brow, eyeshadow, eyeliner, blush, lip, and lashes now carry colour, placement, application direction, intensity, finish, technique, product attributes, warnings, and Personal Color provenance. The original photo remains unchanged; Canvas overlays and the accessible Direction Matrix are two projections of the same server snapshot.

This is a technical direction system, not a makeup image synthesis feature. It does not change face pixels, smooth skin, reshape features, or claim a virtual try-on result.

## Zone contract

- Base uses tone family, depth band, coverage, and finish. It never asserts a commercial shade number.
- Brow stores a bounded vector and respects the confirmed hair colour, fringe, and parting hints.
- Eyeshadow stores base, mid, and deep placement, while eyeliner uses an explicit polyline.
- Blush stores anchor, vector, and spread; lip stores contour and fill; lashes store fan direction.
- Face-observation hair, eye, and brow regions become explicit exclusion polygons. Facial-hair preference changes base/lip coverage policy without removing any module.
- Presentation intensity, occasion, time, skill, owned products, and user exclusions alter the policy without gender gating.
- An explicitly disabled module remains in the immutable seven-module snapshot with `disabled_by_user` provenance and is excluded from downstream routines.

## Safe adjustment contract

- Intensity, colour family, finish, anchor, and vector adjustments are revisioned server patches.
- A single point adjustment is capped at `0.05` normalized units, vector adjustment at `0.08`, and final vector magnitude at `0.35`.
- The server independently validates bounds; the client cannot bypass them.
- Pointer controls commit on release or blur, while buttons and keyboard paths provide equivalent non-drag operation.
- Every successful patch emits only allow-listed operational telemetry and returns the next server revision.

## Rendering and accessibility

- The Canvas uses a true 4:5 normalized `0 0 1000 1250` SVG coordinate system over the source photo.
- Included zones, paired zones, polylines, anchors, vectors, and excluded polygons remain visually distinct.
- The Matrix exposes the complete colour/location/direction/intensity/texture/technique/product prescription without requiring the graphic.
- Module toolbar, detail panel, adjustment alternatives, and off control remain usable at 390px and desktop widths.
- Reduced-motion test configuration does not hide data or controls.

## Verification

- Phase 06 contract tests: 7/7 pass.
- Phase 05 regression tests: 7/7 pass.
- Shared tests after the complete Phase 07 integration: 113/113 pass.
- Web and monorepo workspace typechecks: pass.
- Focused ESLint: pass.
- Playwright desktop/mobile Makeup checks: 2/2 pass.
- Component registry: 58 components and 58 passports valid.
- Migration mirror: 94/94 pass; Phase 06 itself adds no migration.
- `git diff --check`: pass, with line-ending conversion warnings only.
- Visual evidence: `docs/hairfit-v2/evidence/p06-makeup-zone-direction-desktop.png`.

## External boundary

No remote migration, live authenticated user adjustment, device screen-reader session, production flag enablement, deployment, or release was executed. Those boundaries remain part of the Phase 08 release packet and must not be reported as live proof.
