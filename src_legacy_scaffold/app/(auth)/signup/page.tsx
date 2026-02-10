import Link from "next/link";
import { Card } from "../../../components/ui/Card";

export default function SignupPage() {
  return (
    <div className="mx-auto flex w-full max-w-md px-6 py-10">
      <Card className="w-full" title="회원가입" description="Clerk signup 위젯을 이 위치에 연결합니다.">
        <p className="text-sm text-gray-700">가입 후 무료 체험 크레딧을 지급합니다.</p>
        <p className="mt-4 text-sm text-gray-600">
          이미 계정이 있나요?{" "}
          <Link href="/login" className="font-semibold text-black underline">
            로그인
          </Link>
        </p>
      </Card>
    </div>
  );
}
