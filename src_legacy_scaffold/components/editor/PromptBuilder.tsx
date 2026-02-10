import { HairOptions } from "../../store/useGenerationStore";

export function buildPrompt(options: HairOptions) {
  return `${options.color} ${options.style} hair, ${options.length} length, ${options.gender}, photorealistic`;
}

export function PromptBuilder({ options }: { options: HairOptions }) {
  const prompt = buildPrompt(options);
  return <p className="sr-only">prompt: {prompt}</p>;
}
