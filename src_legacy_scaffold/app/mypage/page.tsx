import Link from "next/link";
import { Card } from "../../components/ui/Card";

const historyItems = [
  { id: "gen_001", createdAt: "2026-02-08", style: "ash layered medium" },
  { id: "gen_002", createdAt: "2026-02-07", style: "brown perm long" },
  { id: "gen_003", createdAt: "2026-02-07", style: "black straight short" },
];

export default function MyPage() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 px-6 py-8">
      <h1 className="text-2xl font-bold">마이페이지</h1>

      <Card title="크레딧 현황" description="현재 남은 크레딧과 충전 상태">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-700">
            남은 크레딧: <strong className="text-lg text-black">18</strong>
          </p>
          <button className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            충전하기
          </button>
        </div>
      </Card>

      <Card title="생성 히스토리" description="최근 생성한 결과를 확인할 수 있습니다.">
        <div className="grid gap-2 text-sm text-gray-700">
          {historyItems.map((item) => (
            <Link
              key={item.id}
              href={`/result/${item.id}`}
              className="rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50"
            >
              <div className="font-medium">{item.style}</div>
              <div className="text-xs text-gray-500">
                {item.id} · {item.createdAt}
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
