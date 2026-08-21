# HairFit Personal Color and Makeup Validation Dataset Card v1

Date: 2026-08-15
Release: `synthetic-controlled-fixtures-v1`
Status: local structural validation set; not a human accuracy dataset

## Purpose

This release checks contracts, failure handling, geometry bounds, colour conversion invariants, inclusive policy coverage, and Web/Expo presentation parity. It must not be used to claim Personal Color diagnostic accuracy, subgroup calibration, commercial shade matching, or photorealistic makeup quality.

## Consent and deletion

The release contains no user photo, biometric template, provider response, Clerk identity, or production row. Its generated records are repository fixtures and can be removed with the code release. Future human captures require product-processing consent plus a separate optional `personal-color-training-v1` event before enrolment. Revocation stops future training use; an opt-in event alone never copies a source asset.

## Capture protocol

No real capture pilot was run. Fourteen synthetic scenario definitions model neutral daylight, warm cast, split lighting, glasses reflection, heavy makeup, stubble, full beard, low eyelid visibility, dark lipstick, Display-P3 conversion, rotated EXIF, multiple faces, high highlights, and missing Personal Color. Each fixture declares the expected blocker/warning/partial/fallback path and required evidence.

## Device and lighting distribution

There are no measured device samples. Device manufacturer, camera position, illuminant, colour-card ΔE00, cross-device drift, and cross-illumination drift are therefore `not_measured`. Display-P3 and EXIF cases exercise conversion/orientation contracts only.

## Skin tone and hue distribution

No human skin-tone cohort is present. Red/yellow/olive hue character, skin-lightness groups, and subgroup calibration remain unmeasured. The contract preserves unavailable axes instead of filling missing evidence with zero.

## Facial hair and makeup distribution

Policy fixtures cover stubble, full beard, heavy makeup, dark lipstick, glasses reflection, and low eyelid visibility. These are rule/contract cases, not population-frequency estimates. Gender invariance tests use identical context across `male`, `female`, `nonbinary`, and `not_provided` and require all seven modules in every result.

## Labels and annotators

The shared expert-label contract requires at least three unique pseudonymous annotators, a complete normalized 12-type posterior per annotator, retained boundary votes, and one case ID. Tests use three synthetic annotator records solely to validate workflow rules. No person is represented as a qualified colour expert in this release.

## Structural results

- Fixture definitions present and unique: 14/14.
- Every fixture has an explicit evidence expectation: 14/14.
- Gender-invariant Makeup module availability: pass for all contract values.
- Facial-hair exclusion and coverage policy: pass in shared contract fixtures.
- Posterior shape and sum-to-one invariant: pass.
- Unavailable-axis preservation: pass.
- Web/Expo shared type compilation: pass.
- Expert multi-label acceptance/rejection rules: pass with synthetic labels.

These are deterministic software results, not accuracy, fairness, or clinical performance measurements.

## Known limitations

- No controlled A/B capture with colour card, spectrophotometer, or qualified experts.
- No Fitzpatrick-like or locally appropriate skin-lightness cohort measurement.
- No device, age-band, lighting, makeup-influence, or facial-hair subgroup rates.
- No ΔE00, MAE, rank correlation, Brier score, ECE, top-1/top-2, or inter-annotator agreement result.
- No actual screen-reader or physical Expo-device session in this local release.

## Intended use

Regression testing, schema validation, failure-mode review, canary structural mismatch detection, and preparation for a separately consented controlled pilot.

## Prohibited use

Marketing accuracy claims, clinical or medical use, automated salon product shade selection, skin whitening objectives, gender-based feature restrictions, or training from production photos without explicit separate consent.

## Version and lineage

The fixture vocabulary comes from the implementation package quality matrix. Its machine-readable source is `packages/shared/src/quality/personal-color-makeup-validation.ts`. Any future human dataset must receive a new card/version and cannot silently inherit this release's status.
