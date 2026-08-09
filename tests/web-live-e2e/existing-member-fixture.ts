import { createClerkClient } from "@clerk/backend";
import { createClient } from "@supabase/supabase-js";

type ExistingMemberFixture = {
  emailAddress: string;
  userId: string;
};

function requireLiveTestEnvironment() {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY?.trim() ?? "";
  const secretKey = process.env.CLERK_SECRET_KEY?.trim() ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!publishableKey.startsWith("pk_test_") || !secretKey.startsWith("sk_test_")) {
    throw new Error("Live consultation E2E only accepts a Clerk development instance.");
  }
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new Error();
  } catch {
    throw new Error("Live consultation E2E requires the configured non-loopback Supabase HTTPS project.");
  }
  if (!serviceRoleKey) throw new Error("Live consultation E2E requires the configured Supabase service role key.");

  return { publishableKey, secretKey, supabaseUrl, serviceRoleKey };
}

export function liveTestEnvironment() {
  return requireLiveTestEnvironment();
}

export async function resolveExistingMemberFixture(): Promise<ExistingMemberFixture> {
  const environment = requireLiveTestEnvironment();
  const clerk = createClerkClient({ secretKey: environment.secretKey });
  const users = await clerk.users.getUserList({ limit: 100 });
  const testUsers = users.data.flatMap((user) => {
    const email = user.emailAddresses.find(({ emailAddress }) => emailAddress.toLowerCase().includes("+clerk_test"));
    return email ? [{ userId: user.id, emailAddress: email.emailAddress }] : [];
  });
  if (!testUsers.length) throw new Error("No existing Clerk development customer fixture is available.");

  const supabase = createClient(environment.supabaseUrl, environment.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from("users")
    .select("id,account_type,onboarding_completed_at")
    .in("id", testUsers.map(({ userId }) => userId));
  if (error) throw new Error("The existing customer fixture could not be matched to HairFit.");

  const profiles = new Map((data ?? []).map((row) => [row.id, row]));
  const fixture = testUsers
    .map((user) => ({ ...user, profile: profiles.get(user.userId) }))
    .filter(({ profile }) => profile && [null, "member"].includes(profile.account_type))
    .sort((left, right) => {
      const leftScore = Number(left.profile?.account_type === "member") + Number(Boolean(left.profile?.onboarding_completed_at));
      const rightScore = Number(right.profile?.account_type === "member") + Number(Boolean(right.profile?.onboarding_completed_at));
      return rightScore - leftScore;
    })[0];
  if (!fixture) throw new Error("No existing Clerk fixture has a matching HairFit customer profile.");

  return { emailAddress: fixture.emailAddress, userId: fixture.userId };
}
