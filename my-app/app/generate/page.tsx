import { redirect } from "next/navigation";
import { CANONICAL_GENERATION_STEP_PATH } from "../../lib/canonical-generation-entry";

export default function LegacyGeneratePage() {
  redirect(CANONICAL_GENERATION_STEP_PATH);
}
