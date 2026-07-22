import type {
  ConfirmedHairRecordIdentity,
  GenerationSelectionCommand,
  GenerationSelectionStage,
} from "../generation/contract.ts";

export interface GenerationSelectionLockFixture {
  name: string;
  input: {
    selectedVariantId?: string | null;
    confirmedHairRecord?: ConfirmedHairRecordIdentity | null;
  };
  expectedLocked: boolean;
  expectedStage: GenerationSelectionStage;
  expectedCommands: GenerationSelectionCommand[];
}

export const generationSelectionLockFixtures: GenerationSelectionLockFixture[] = [
  {
    name: "generated candidates remain unlocked before selection",
    input: { selectedVariantId: null, confirmedHairRecord: null },
    expectedLocked: false,
    expectedStage: "generated",
    expectedCommands: ["select_variant", "regenerate"],
  },
  {
    name: "a selected candidate remains changeable before confirmation",
    input: { selectedVariantId: "variant-1", confirmedHairRecord: null },
    expectedLocked: false,
    expectedStage: "selected",
    expectedCommands: ["select_variant", "confirm_selection", "regenerate"],
  },
  {
    name: "only a confirmed hair record locks selection and routes alternatives to regeneration",
    input: {
      selectedVariantId: "variant-1",
      confirmedHairRecord: { id: "hair-record-1" },
    },
    expectedLocked: true,
    expectedStage: "confirmed",
    expectedCommands: ["regenerate"],
  },
];
