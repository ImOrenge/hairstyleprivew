"use client";

import type { ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { MakeupDirectionStage } from "../makeup/MakeupDirectionStage";

export function MakeupWorkbench({ snapshot, refresh }: { snapshot: ConsultationSnapshot; refresh?: (options?: { silent?: boolean }) => Promise<unknown> }) {
  return <MakeupDirectionStage consultation={snapshot} onConfirmed={() => refresh?.({ silent: true })} />;
}
