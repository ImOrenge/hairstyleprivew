# Personal Color and Makeup Canary / Rollback Runbook v1

Date: 2026-08-15

## Canary entry

1. Record source revision, migration count/mirror digest, and all rollout flag names without values.
2. Apply the complete additive migration chain before enabling any read/write flag.
3. Enable `PERSONAL_COLOR_V2_WRITE`, then shadow reconciliation, then `PERSONAL_COLOR_V2_READ`, `PERSONAL_COLOR_DRAPE_V1`, and `MAKEUP_DIRECTION_V1` for the authorized canary environment.
4. Run `personal-color-makeup` reconciliation daily through the existing admin owner boundary.
5. An empty window is `insufficient_data`, never pass. Any structural profile/source/artifact mismatch fails the canary; allowed structural mismatch count is zero.

Model accuracy and subgroup calibration do not use this zero threshold. Their thresholds remain unset until a controlled human pilot provides evidence.

## Daily reconciliation

The `output_snapshot` reconciliation compares confirmed Makeup snapshot source IDs and seven-module count, routine/brief presence and provenance, default-off photo policy, and Hair Color/Fashion Personal Color profile IDs. Mismatch samples contain a short one-way entity fingerprint and bounded reason only.

## Rollback drill

1. Generate the server OFF payload locally and verify every server flag is false.
2. Set the four Personal Color/Makeup flags off at the deployment boundary.
3. Verify legacy Personal Color route/projection and the previous Fashion/Styler path remain available.
4. Confirm no additive row was deleted, no pending generation/aftercare/payment contract changed, and private asset cleanup continues.
5. Re-run migration mirror, contract regression, and reconciliation in read-only mode.

The local drill validates payload construction and flag-off journey behavior. It does not mutate a remote Worker or production environment.

## Legacy retirement decision

Current status: **not eligible**. The implementation preserves legacy projection and read fallback. Retirement requires at least two compatible releases, 30 consecutive observation days, and zero structural mismatch. A deprecation notice is documentation-only until that evidence exists.
