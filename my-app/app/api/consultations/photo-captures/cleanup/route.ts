import { NextResponse } from "next/server";
import { isAuthorizedGenerationWorkflowCallback } from "../../../../../lib/generation-workflow-callback-auth";
import { drainExpiredPersonalColorCaptures } from "../../../../../lib/personal-color-capture";

export async function POST(request: Request) {
  if (!(await isAuthorizedGenerationWorkflowCallback(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await drainExpiredPersonalColorCaptures(100));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "사진 정리를 완료하지 못했습니다." }, { status: 500 });
  }
}
