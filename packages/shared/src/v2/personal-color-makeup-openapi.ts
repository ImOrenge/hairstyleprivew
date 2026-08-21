import { MAKEUP_CONTEXT_PROFILE_JSON_SCHEMA, MAKEUP_DIRECTION_SNAPSHOT_JSON_SCHEMA } from "../makeup/schema.ts";
import { PERSONAL_COLOR_PROFILE_V2_JSON_SCHEMA } from "../personal-color-v2/schema.ts";

export const PERSONAL_COLOR_MAKEUP_OPENAPI_V2 = {
  openapi: "3.1.0",
  info: { title: "HairFit Personal Color and Makeup API", version: "2.0.0" },
  components: { schemas: {
    PersonalColorProfileV2: PERSONAL_COLOR_PROFILE_V2_JSON_SCHEMA,
    MakeupContextProfile: MAKEUP_CONTEXT_PROFILE_JSON_SCHEMA,
    MakeupDirectionSnapshot: MAKEUP_DIRECTION_SNAPSHOT_JSON_SCHEMA,
  } },
  paths: {
    "/api/v2/consultations/{consultationId}/personal-color/profile": { get: { operationId: "getPersonalColorProfileV2" } },
    "/api/consultations/{consultationId}/personal-color/drapes": { get: { operationId: "getPersonalColorDrapeV2" }, post: { operationId: "startPersonalColorDrapeV2" } },
    "/api/consultations/{consultationId}/personal-color/drapes/{drapeId}/responses": { post: { operationId: "answerPersonalColorDrapeV2" } },
    "/api/consultations/{consultationId}/personal-color/drapes/{drapeId}/complete": { post: { operationId: "completePersonalColorDrapeV2" } },
    "/api/consultations/{consultationId}/personal-color/training-consent": { get: { operationId: "getPersonalColorTrainingConsent" }, put: { operationId: "grantPersonalColorTrainingConsent" }, delete: { operationId: "revokePersonalColorTrainingConsent" } },
    "/api/consultations/{consultationId}/makeup": { get: { operationId: "getMakeupDirection" } },
    "/api/consultations/{consultationId}/makeup/context": { put: { operationId: "saveMakeupContext" } },
    "/api/consultations/{consultationId}/makeup/build": { post: { operationId: "buildMakeupDirection" } },
    "/api/consultations/{consultationId}/makeup/modules/{module}": { put: { operationId: "patchMakeupModule" } },
    "/api/consultations/{consultationId}/makeup/confirm": { post: { operationId: "confirmMakeupDirection" } },
    "/api/consultations/{consultationId}/makeup/routine": { post: { operationId: "compileMakeupRoutine" } },
    "/api/consultations/{consultationId}/makeup/brief": { post: { operationId: "compileMakeupArtistBrief" } },
    "/api/consultations/{consultationId}/makeup/share": { post: { operationId: "shareMakeupArtistBrief" } },
  },
} as const;
