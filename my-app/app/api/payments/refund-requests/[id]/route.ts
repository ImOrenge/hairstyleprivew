import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRefundRequestForUser } from "../../../../../lib/refund-automation";
import { isSupabaseConfigured } from "../../../../../lib/supabase";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "올바른 환불 요청 ID가 아닙니다." }, { status: 400 });
  }
  try {
    const refundRequest = await getRefundRequestForUser(userId, id);
    if (!refundRequest) {
      return NextResponse.json({ error: "환불 요청을 찾지 못했습니다." }, { status: 404 });
    }
    return NextResponse.json({ refundRequest }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "환불 상태를 확인하지 못했습니다." },
      { status: 500 },
    );
  }
}
