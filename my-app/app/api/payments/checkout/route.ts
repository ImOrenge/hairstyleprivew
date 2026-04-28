// 이 엔드포인트는 더 이상 사용되지 않습니다.
// 구독 결제는 POST /api/payments/subscribe 를 사용하세요.
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "이 엔드포인트는 사용 중단되었습니다. 구독 결제는 /api/payments/subscribe 를 이용하세요.",
    },
    { status: 410 },
  );
}
