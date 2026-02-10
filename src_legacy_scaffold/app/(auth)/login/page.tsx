import Link from "next/link";
import { Card } from "../../../components/ui/Card";

export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-md px-6 py-10">
      <Card
        className="w-full"
        title="로그인"
        description="MVP 단계에서는 Clerk 소셜 로그인 버튼을 여기에 연결합니다."
      >
        <div className="space-y-2 text-sm text-gray-700">
          <p>- Google</p>
          <p>- Apple</p>
          <p>- Kakao</p>
        </div>
        <p className="mt-4 text-sm text-gray-600">
          계정이 없나요?{" "}
          <Link href="/signup" className="font-semibold text-black underline">
            회원가입
          </Link>
        </p>
      </Card>
    </div>
  );
}
