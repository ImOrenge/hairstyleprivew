import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "prediction id is required" }, { status: 400 });
  }

  return NextResponse.json(
    {
      id,
      status: "failed",
      error: "Polling route is not used in Gemini sync image generation flow.",
    },
    { status: 410 },
  );
}
