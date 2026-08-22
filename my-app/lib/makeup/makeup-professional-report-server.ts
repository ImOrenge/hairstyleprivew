import "server-only";

import type { MakeupDirectionProfessionalReportEnvelopeV1 } from "@hairfit/shared/makeup";
import { readMakeupArtifacts } from "./makeup-artifacts-server";
import { readMakeupDirection } from "./makeup-direction-server";
import {
  attachMakeupProfessionalReport,
  projectMakeupProfessionalReportInputV1,
  readMakeupProfessionalReportCapability,
  retryMakeupProfessionalReportCapability,
  runMakeupProfessionalReportCapability,
} from "../capabilities/makeup-professional-report-service";
import { HairfitV2Error } from "../v2/errors";

async function currentInput(userId: string, consultationId: string) {
  const [direction, artifacts] = await Promise.all([readMakeupDirection(userId, consultationId), readMakeupArtifacts(userId, consultationId)]);
  if (!direction.snapshot?.confirmedAt || !artifacts.routine || !artifacts.brief) throw new HairfitV2Error("MAKEUP_DIRECTION_NOT_CONFIRMED", 409, "메이크업 방향을 먼저 확정해 주세요.");
  return projectMakeupProfessionalReportInputV1({ snapshot: direction.snapshot, routine: artifacts.routine, brief: artifacts.brief });
}

export async function readCurrentMakeupProfessionalReport(userId: string, consultationId: string): Promise<MakeupDirectionProfessionalReportEnvelopeV1> {
  const reportInput = await currentInput(userId, consultationId);
  return attachMakeupProfessionalReport(reportInput, await readMakeupProfessionalReportCapability({ userId, reportInput }));
}

export async function runCurrentMakeupProfessionalReport(userId: string, consultationId: string) {
  const reportInput = await currentInput(userId, consultationId);
  const result = await runMakeupProfessionalReportCapability({ userId, consultationId, reportInput });
  return attachMakeupProfessionalReport(reportInput, result);
}

export async function retryCurrentMakeupProfessionalReport(userId: string, consultationId: string) {
  const reportInput = await currentInput(userId, consultationId);
  const result = await retryMakeupProfessionalReportCapability({ userId, consultationId, reportInput });
  return attachMakeupProfessionalReport(reportInput, result);
}
