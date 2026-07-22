import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SalonConnectionsClient } from "../../../components/salon/SalonConnectionsClient";
import { AppPage } from "../../../components/ui/Surface";
import { buildSignInRedirectUrl } from "../../../lib/clerk";

export default async function SalonConnectionsPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect(buildSignInRedirectUrl("/salon/connections"));
  }

  return (
    <AppPage className="max-w-4xl pb-16 pt-8">
      <SalonConnectionsClient />
    </AppPage>
  );
}
