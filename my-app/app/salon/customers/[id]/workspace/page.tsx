import { SalonWorkspaceWizard } from "../../../../../components/salon/SalonWorkspaceWizard";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SalonCustomerWorkspacePage({ params }: Props) {
  const { id } = await params;
  return <SalonWorkspaceWizard customerId={id} />;
}
