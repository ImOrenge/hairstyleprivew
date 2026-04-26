import { CustomerDetailClient } from "../../../../components/salon/CustomerDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SalonCustomerDetailPage({ params }: Props) {
  const { id } = await params;
  return <CustomerDetailClient customerId={id} />;
}
