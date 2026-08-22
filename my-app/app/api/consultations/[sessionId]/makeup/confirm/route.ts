import { auth } from "@clerk/nextjs/server";
import { after, NextResponse } from "next/server";
import { isMakeupStyleSimulationEnabled } from "../../../../../../lib/consulting/feature-flag";
import { processMakeupSimulation, queueMakeupSimulation } from "../../../../../../lib/makeup/makeup-simulation-server";
import { confirmMakeupDirection } from "../../../../../../lib/makeup/makeup-direction-server";
import { isHairfitV2Enabled } from "../../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../../lib/v2/http";
import { projectMakeupProfessionalReportInputV1, runMakeupProfessionalReportCapability } from "../../../../../../lib/capabilities/makeup-professional-report-service";

interface Params { params: Promise<{ sessionId: string }> }
export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("MAKEUP_DIRECTION_V1")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { snapshotId?: string; expectedRevision?: number } | null;
  if (!body?.snapshotId || !Number.isInteger(body.expectedRevision)) return NextResponse.json({ error: "snapshotId와 expectedRevision이 필요합니다." }, { status: 400 });
  const { sessionId } = await params;
  try {
    const confirmed = await confirmMakeupDirection(userId, sessionId, body.snapshotId, body.expectedRevision!);
    const reportInput = projectMakeupProfessionalReportInputV1({ snapshot: confirmed.snapshot, routine: confirmed.artifacts.routine, brief: confirmed.artifacts.brief });
    const run = isMakeupStyleSimulationEnabled() ? await queueMakeupSimulation(userId, sessionId) : null;
    after(async () => {
      await Promise.allSettled([
        runMakeupProfessionalReportCapability({ userId, consultationId: sessionId, reportInput }),
        run?.state === "queued" ? processMakeupSimulation(userId, sessionId, run.id) : Promise.resolve(),
      ]);
    });
    return NextResponse.json(run ? { ...confirmed, simulationRun: run } : confirmed, { status: run ? 202 : 200 });
  }
  catch (error) { return v2Failure(error); }
}
