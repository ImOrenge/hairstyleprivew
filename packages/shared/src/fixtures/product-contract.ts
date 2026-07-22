import type { GenerationDisplayStatus } from "../generation/contract";

export interface GenerationContractFixture {
  name: string;
  rawStatus: unknown;
  expectedStatus: GenerationDisplayStatus;
  expectedTerminal: boolean;
  expectedDestination: "generate" | "result";
}

export const generationContractFixtures: GenerationContractFixture[] = [
  {
    name: "queued generation stays on progress",
    rawStatus: "queued",
    expectedStatus: "queued",
    expectedTerminal: false,
    expectedDestination: "generate",
  },
  {
    name: "legacy running maps to processing",
    rawStatus: "running",
    expectedStatus: "processing",
    expectedTerminal: false,
    expectedDestination: "generate",
  },
  {
    name: "partial completion keeps the recovery board",
    rawStatus: "partial",
    expectedStatus: "partial",
    expectedTerminal: true,
    expectedDestination: "generate",
  },
  {
    name: "completed generation opens the result",
    rawStatus: "completed",
    expectedStatus: "completed",
    expectedTerminal: true,
    expectedDestination: "result",
  },
  {
    name: "failed generation stays on recovery",
    rawStatus: "failed",
    expectedStatus: "failed",
    expectedTerminal: true,
    expectedDestination: "generate",
  },
  {
    name: "unknown status fails safe to progress",
    rawStatus: "future_status",
    expectedStatus: "unknown",
    expectedTerminal: false,
    expectedDestination: "generate",
  },
];

export const hairstyleCreditEstimateFixtures = [
  { credits: -1, creditsPerGeneration: 10, expected: 0 },
  { credits: 0, creditsPerGeneration: 10, expected: 0 },
  { credits: 9, creditsPerGeneration: 10, expected: 0 },
  { credits: 10, creditsPerGeneration: 10, expected: 1 },
  { credits: 20, creditsPerGeneration: 10, expected: 2 },
  { credits: 29, creditsPerGeneration: 10, expected: 2 },
  { credits: 29, creditsPerGeneration: 15, expected: 1 },
] as const;
