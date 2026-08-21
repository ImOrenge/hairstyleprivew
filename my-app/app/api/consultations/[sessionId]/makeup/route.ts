import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { readMakeupDirection } from "../../../../../lib/makeup/makeup-direction-server";
import { isHairfitV2Enabled } from "../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../lib/v2/http";
import { readMakeupArtifacts } from "../../../../../lib/makeup/makeup-artifacts-server";
import { isConsultationMakeupInterviewEnabled, isMakeupStyleSimulationEnabled } from "../../../../../lib/consulting/feature-flag";
import { readCurrentMakeupRationale, readMakeupInterview } from "../../../../../lib/makeup/makeup-interview-server";
import { readMakeupSimulation } from "../../../../../lib/makeup/makeup-simulation-server";

interface Params { params: Promise<{ sessionId: string }> }
export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("MAKEUP_DIRECTION_V1")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { sessionId } = await params;
  try {
    const direction = await readMakeupDirection(userId, sessionId);
    const artifacts = direction.snapshot && ["confirmed", "routine_ready", "brief_ready"].includes(direction.snapshot.status) ? await readMakeupArtifacts(userId, sessionId) : { routine: null, brief: null, share: null };
    const interviewEnabled = isConsultationMakeupInterviewEnabled();
    const interview = interviewEnabled ? await readMakeupInterview(userId, sessionId) : null;
    const rationaleAi = interviewEnabled && direction.snapshot?.rationale ? await readCurrentMakeupRationale(userId, sessionId) : null;
    const simulationEnabled = isMakeupStyleSimulationEnabled();
    const simulation = simulationEnabled ? await readMakeupSimulation(userId, sessionId) : null;
    return NextResponse.json({ ...direction, artifacts, interviewEnabled, interview, rationaleAi, simulationEnabled, simulation });
  }
  catch (error) { return v2Failure(error); }
}
