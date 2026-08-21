# HairFit Personal Color and Makeup Model / Policy Card v1

Date: 2026-08-15
Scope: `observation-bundle-v2`, `axis-policy-v1`, `posterior-v1`, `palette-2026-08`, `makeup-zone-policy-v1`, `makeup-routine-v1`, `makeup-artist-brief-v1`

## Component

HairFit separates image observation, colour-science conversion, five-axis scoring, 12-type posterior mapping, interactive drape updates, deterministic Makeup geometry, zone prescriptions, routine compilation, and artist-brief projection. An LLM may explain stored evidence but does not create observations, probabilities, coordinates, product shade numbers, or consent.

## Inputs and outputs

- Inputs: private versioned capture assets, quality signals, normalized face observations, calibration metadata, user context, confirmed hairstyle, and optional drape responses.
- Outputs: axis values or explicit unavailable reasons, normalized 12-type posterior, harmony palette, immutable Makeup Direction, compact/full routine, and structured artist brief.
- Raster output: none for Makeup. The source face image is not morphed, smoothed, whitened, or recoloured by this system.

## Training or rule source

Current Personal Color axes, posterior mapping, palette, Makeup geometry, zone, routine, and brief components are versioned deterministic policies. This card makes no claim that a new proprietary model was trained. Any upstream face landmark model remains an observation dependency and must be recorded in the observation manifest.

## Evaluation cohorts and metrics

Local evaluation covers 14 synthetic failure-mode fixtures, gender invariance, facial-hair policy, unavailable axes, posterior normalization, safe geometry bounds, routine budget, brief consistency, privacy defaults, and Web/Expo type compatibility. Human cohort metrics (ΔE00, MAE, rank correlation, top-1/top-2, Brier, ECE, subgroup gap, expert agreement) are `not_measured` until a separately consented controlled pilot exists.

## Calibration

The profile records calibration method/version/confidence and keeps capture reliability separate from profile confidence. It never substitutes a missing axis with zero. Numeric release thresholds for colour accuracy or subgroup calibration are intentionally unset until pilot evidence exists.

## Known failure modes

Colour cast, split lighting, highlights, cosmetics, reflections, facial hair, low eyelid visibility, multiple faces, unsupported colour spaces, and orientation metadata can reduce or block evidence. The product must display the corresponding warning, partial state, or recapture request.

## Fairness and inclusion

All seven Makeup modules are available regardless of gender field. Presentation changes direction and intensity, not feature availability. Facial hair is a user-controlled coverage/exclusion input. Policies prohibit defect language, skin whitening objectives, automatic feminine/masculine restrictions, and invented certainty for darker or otherwise underrepresented cohorts.

## Privacy and security

Source and mask assets are private; public shares expose no storage path and omit the source photo by default. Event payloads use an allow-list and exclude image bytes, storage paths, samples, raw provider output, and free text. Product processing does not depend on training consent. Consent events are append-only and revocable.

## Rollback

Immediately set `PERSONAL_COLOR_V2_WRITE`, `PERSONAL_COLOR_V2_READ`, `PERSONAL_COLOR_DRAPE_V1`, and `MAKEUP_DIRECTION_V1` to false. Keep additive rows, return to legacy projection/read, stop canary writes, and run reconciliation. Legacy code cannot be removed until two compatible releases and 30 consecutive observation days with zero structural mismatch are proven.
