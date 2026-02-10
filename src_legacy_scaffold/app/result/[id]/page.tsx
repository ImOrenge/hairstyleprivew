import { ActionToolbar } from "../../../components/result/ActionToolbar";
import { ComparisonView } from "../../../components/result/ComparisonView";
import { FeedbackModal } from "../../../components/result/FeedbackModal";

interface ResultPageProps {
  params: {
    id: string;
  };
}

export default function ResultPage({ params }: ResultPageProps) {
  const beforeImage = "https://placehold.co/900x1200?text=Original";
  const afterImage = "https://placehold.co/900x1200?text=Generated";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-6 py-8">
      <h1 className="text-2xl font-bold">결과 확인</h1>
      <p className="text-sm text-gray-600">Generation ID: {params.id}</p>
      <ComparisonView beforeImage={beforeImage} afterImage={afterImage} />
      <ActionToolbar id={params.id} />
      <FeedbackModal />
    </div>
  );
}
