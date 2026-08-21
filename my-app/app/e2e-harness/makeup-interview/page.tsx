import { notFound } from "next/navigation";
import { MakeupInterviewFixture } from "../../../components/consulting/makeup/MakeupInterviewFixture";

export const metadata = { title: "Makeup Interview E2E Harness", robots: { index: false, follow: false } };

export default async function MakeupInterviewHarnessPage({ searchParams }: { searchParams: Promise<{ saveDelay?: string }> }) {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") notFound();
  const query = await searchParams;
  return <main className="mx-auto max-w-6xl p-6"><MakeupInterviewFixture saveDelayMs={query.saveDelay === "1" ? 400 : 0} /></main>;
}
