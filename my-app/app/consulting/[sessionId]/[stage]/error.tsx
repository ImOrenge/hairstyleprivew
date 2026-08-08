"use client";

import { useEffect } from "react";
import { RecoveryNotice } from "../../../../components/consulting/recovery/RecoveryNotice";

export default function ConsultationStageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Consultation Scene recovery", error); }, [error]);
  return <RecoveryNotice onRetry={reset} />;
}
