import { redirect } from "next/navigation";
import { CANONICAL_GENERATION_ENTRY_PATH } from "../../lib/canonical-generation-entry";

export default function LegacyUploadPage() {
  redirect(CANONICAL_GENERATION_ENTRY_PATH);
}
