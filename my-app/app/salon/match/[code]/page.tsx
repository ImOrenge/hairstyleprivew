import { MatchInviteClient } from "../../../../components/salon/MatchInviteClient";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function SalonMatchInvitePage({ params }: PageProps) {
  const { code } = await params;

  return <MatchInviteClient code={code || ""} />;
}
