const AXIS_ESTIMATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["value", "confidence", "evidenceIds", "unavailableReason"],
  properties: {
    value: { type: ["number", "null"], minimum: -1, maximum: 1 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidenceIds: { type: "array", items: { type: "string" } },
    unavailableReason: { type: ["string", "null"] },
  },
} as const;

const STRING_ARRAY_SCHEMA = { type: "array", items: { type: "string" } } as const;

export const PERSONAL_COLOR_PROFILE_V2_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://hairfit.beauty/schemas/personal-color-profile-v2.json",
  title: "PersonalColorProfileV2",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "id", "consultationId", "version", "status", "captureMode", "observationBundleId",
    "calibration", "regions", "axes", "seasonalPosterior", "displayClassification", "harmonyPalette",
    "preferenceProfile", "confidence", "modelManifest", "legacyProjectionHash", "drapeValidatedAt",
    "confirmedAt", "createdAt",
  ],
  properties: {
    schemaVersion: { const: "personal-color-profile-v2" },
    id: { type: "string", minLength: 1 },
    consultationId: { type: "string", minLength: 1 },
    version: { type: "integer", minimum: 1 },
    status: { type: "string", enum: ["draft", "capture_validating", "observation_running", "color_processing", "profile_ready", "drape_in_progress", "confirmed", "partial_ready", "failed_retryable", "failed_terminal", "superseded"] },
    captureMode: { type: "string", enum: ["quick", "precision", "legacy_unknown"] },
    observationBundleId: { type: ["string", "null"] },
    calibration: {
      type: "object",
      additionalProperties: false,
      required: ["method", "referenceWhite", "confidence", "version", "meanDeltaE00"],
      properties: {
        method: { type: "string", enum: ["none", "estimated_white_balance", "gray_reference", "color_checker"] },
        referenceWhite: { const: "D65" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        version: { type: "string" },
        meanDeltaE00: { type: ["number", "null"], minimum: 0 },
      },
    },
    regions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "region", "validPixelRatio", "confidence", "exclusions", "lab", "unavailableReason"],
        properties: {
          id: { type: "string" },
          region: { type: "string", enum: ["forehead_center", "left_cheek_upper", "right_cheek_upper", "left_cheek_lower", "right_cheek_lower", "jaw_center", "neck_center"] },
          validPixelRatio: { type: "number", minimum: 0, maximum: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          exclusions: STRING_ARRAY_SCHEMA,
          lab: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["l", "a", "b", "chroma", "hueAngle"],
            properties: { l: { type: "number" }, a: { type: "number" }, b: { type: "number" }, chroma: { type: "number", minimum: 0 }, hueAngle: { type: "number" } },
          },
          unavailableReason: { type: ["string", "null"] },
        },
      },
    },
    axes: { type: "object", additionalProperties: false, required: ["temperature", "value", "chroma", "contrast", "hueCharacter"], properties: { temperature: AXIS_ESTIMATE_SCHEMA, value: AXIS_ESTIMATE_SCHEMA, chroma: AXIS_ESTIMATE_SCHEMA, contrast: AXIS_ESTIMATE_SCHEMA, hueCharacter: AXIS_ESTIMATE_SCHEMA } },
    seasonalPosterior: { type: "array", items: { type: "object", additionalProperties: false, required: ["type", "probability"], properties: { type: { enum: ["spring_light", "spring_warm", "spring_bright", "summer_light", "summer_cool", "summer_muted", "autumn_muted", "autumn_warm", "autumn_deep", "winter_bright", "winter_cool", "winter_deep"] }, probability: { type: "number", minimum: 0, maximum: 1 } } } },
    displayClassification: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["label", "mode"], properties: { label: { type: "string" }, mode: { enum: ["confident", "dominant", "boundary"] } } }] },
    harmonyPalette: { type: "object", additionalProperties: false, required: ["best", "base", "accent", "challenge", "metals"], properties: { best: STRING_ARRAY_SCHEMA, base: STRING_ARRAY_SCHEMA, accent: STRING_ARRAY_SCHEMA, challenge: STRING_ARRAY_SCHEMA, metals: STRING_ARRAY_SCHEMA } },
    preferenceProfile: { type: "object", additionalProperties: false, required: ["likedColorIds", "dislikedColorIds", "preferredContrast"], properties: { likedColorIds: STRING_ARRAY_SCHEMA, dislikedColorIds: STRING_ARRAY_SCHEMA, preferredContrast: { type: ["string", "null"] } } },
    confidence: { type: "object", additionalProperties: false, required: ["overall", "typeConfidence", "paletteConfidence", "stability"], properties: { overall: { type: "number", minimum: 0, maximum: 1 }, typeConfidence: { type: "number", minimum: 0, maximum: 1 }, paletteConfidence: { type: "number", minimum: 0, maximum: 1 }, stability: { type: "number", minimum: 0, maximum: 1 } } },
    modelManifest: { type: "object", additionalProperties: false, required: ["profileModel", "axisPolicyVersion", "posteriorVersion", "paletteVersion", "createdAt"], properties: { profileModel: { type: "string" }, axisPolicyVersion: { type: "string" }, posteriorVersion: { type: "string" }, paletteVersion: { type: "string" }, createdAt: { type: "string", format: "date-time" } } },
    legacyProjectionHash: { type: ["string", "null"] },
    drapeValidatedAt: { type: ["string", "null"], format: "date-time" },
    confirmedAt: { type: ["string", "null"], format: "date-time" },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;
