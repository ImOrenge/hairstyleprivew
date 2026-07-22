import type {
  GenerationResultSelectionInput,
  GenerationResultSelectionResolution,
} from "../generation/contract.ts";

export interface GenerationSelectionFixture {
  name: string;
  input: GenerationResultSelectionInput;
  expected: GenerationResultSelectionResolution;
}

const recommendationSet = {
  selectedVariantId: "variant-1",
  variants: [
    { id: "variant-1", outputUrl: "https://example.com/one.jpg" },
    { id: "variant-2", outputUrl: "https://example.com/two.jpg" },
  ],
};

export const generationSelectionFixtures: GenerationSelectionFixture[] = [
  {
    name: "an existing requested variant can become the active comparison before confirmation",
    input: { recommendationSet, requestedVariantId: "variant-2" },
    expected: {
      selectedVariantId: "variant-2",
      serverSelectedVariantId: "variant-1",
      selectionLocked: false,
      requestedVariantIgnored: false,
    },
  },
  {
    name: "an unknown requested variant falls back to the server selection",
    input: { recommendationSet, requestedVariantId: "missing" },
    expected: {
      selectedVariantId: "variant-1",
      serverSelectedVariantId: "variant-1",
      selectionLocked: false,
      requestedVariantIgnored: true,
    },
  },
  {
    name: "confirmation ignores a stale requested variant",
    input: {
      recommendationSet,
      selectedVariant: { id: "variant-2" },
      confirmedHairRecord: { id: "record-1" },
      requestedVariantId: "variant-1",
    },
    expected: {
      selectedVariantId: "variant-2",
      serverSelectedVariantId: "variant-2",
      selectionLocked: true,
      requestedVariantIgnored: true,
    },
  },
];
