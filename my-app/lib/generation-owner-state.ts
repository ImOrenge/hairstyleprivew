export const GENERATION_PIPELINE_IDLE_MESSAGE =
  "Review your upload and generate a 3x3 recommendation grid.";

export function normalizeGenerationOwnerId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return /^[a-zA-Z0-9_-]{3,128}$/.test(normalized) ? normalized : null;
}

export function createGenerationOwnerReset(
  ownerId: string | null,
  ownerRevision: number,
) {
  return {
    generationOwnerId: ownerId,
    generationOwnerRevision: ownerRevision,
    generationOwnerBound: true,
    originalImage: null,
    previewUrl: null,
    imageHydrated: ownerId === null,
    draftReceipt: null,
    draftUploading: false,
    draftUploadError: null,
    generationQuote: null,
    generationQuoteLoading: false,
    generationQuoteError: null,
    clientRequestId: null,
    isGenerating: false,
    progress: 0,
    pipelineStage: "idle" as const,
    pipelineMessage: GENERATION_PIPELINE_IDLE_MESSAGE,
    pipelineError: null,
    latestPredictionId: null,
    latestOutputUrl: null,
    generationId: null,
    analysisSummary: null,
    recommendationGrid: [],
    selectedVariantId: null,
    gridGenerationProgress: 0,
  };
}

export function isGenerationOwnerCurrent(
  currentOwnerId: string | null,
  currentRevision: number,
  expectedOwnerId: string,
  expectedRevision: number,
) {
  return currentOwnerId === expectedOwnerId && currentRevision === expectedRevision;
}

export interface GenerationOwnerSnapshot {
  ownerId: string;
  ownerRevision: number;
}

export function getGenerationOwnerSnapshot(state: {
  generationOwnerBound: boolean;
  generationOwnerId: string | null;
  generationOwnerRevision: number;
}): GenerationOwnerSnapshot | null {
  return state.generationOwnerBound && state.generationOwnerId
    ? {
        ownerId: state.generationOwnerId,
        ownerRevision: state.generationOwnerRevision,
      }
    : null;
}

export function doesGenerationOwnerSnapshotMatch(
  state: {
    generationOwnerId: string | null;
    generationOwnerRevision: number;
  },
  snapshot: GenerationOwnerSnapshot,
) {
  return isGenerationOwnerCurrent(
    state.generationOwnerId,
    state.generationOwnerRevision,
    snapshot.ownerId,
    snapshot.ownerRevision,
  );
}
