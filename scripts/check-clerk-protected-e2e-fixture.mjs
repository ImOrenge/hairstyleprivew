import { createClerkClient } from "@clerk/backend";
import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @param {Record<string, string | undefined>} environment */
export function protectedE2eFixtureConfig(environment = process.env) {
  const secretKey = environment.CLERK_SECRET_KEY?.trim() ?? "";
  const emailAddress = environment.E2E_CLERK_USER_EMAIL?.trim().toLowerCase() ?? "";
  const adminEmailAddress = environment.E2E_CLERK_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const salonEmailAddress = environment.E2E_CLERK_SALON_EMAIL?.trim().toLowerCase() ?? "";
  const supabaseUrl = environment.E2E_SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = environment.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const ownedGenerationId = environment.E2E_OWNED_GENERATION_ID?.trim() ?? "";
  const foreignGenerationId = environment.E2E_FOREIGN_GENERATION_ID?.trim() ?? "";

  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Clerk development secret (sk_test_) is required; live keys are rejected.");
  }
  if (!emailAddress.includes("+clerk_test")) {
    throw new Error("E2E_CLERK_USER_EMAIL must identify an existing +clerk_test customer.");
  }
  if (!adminEmailAddress.includes("+clerk_test")) {
    throw new Error("E2E_CLERK_ADMIN_EMAIL must identify an existing +clerk_test admin.");
  }
  if (!salonEmailAddress.includes("+clerk_test")) {
    throw new Error("E2E_CLERK_SALON_EMAIL must identify an existing +clerk_test salon owner.");
  }
  if (new Set([emailAddress, adminEmailAddress, salonEmailAddress]).size !== 3) {
    throw new Error("Customer, admin, and salon Clerk fixtures must use different accounts.");
  }
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      throw new Error();
    }
  } catch {
    throw new Error("E2E_SUPABASE_URL must be a non-loopback HTTPS URL.");
  }
  if (!serviceRoleKey || /^YOUR[_A-Z0-9-]*$/i.test(serviceRoleKey)) {
    throw new Error("E2E_SUPABASE_SERVICE_ROLE_KEY is required.");
  }
  if (!UUID_PATTERN.test(foreignGenerationId)) {
    throw new Error("E2E_FOREIGN_GENERATION_ID must be a valid UUID.");
  }
  if (!UUID_PATTERN.test(ownedGenerationId)) {
    throw new Error("E2E_OWNED_GENERATION_ID must be a valid UUID.");
  }
  if (ownedGenerationId === foreignGenerationId) {
    throw new Error("Owned and foreign generation fixtures must be different.");
  }

  return {
    secretKey,
    emailAddress,
    adminEmailAddress,
    salonEmailAddress,
    supabaseUrl,
    serviceRoleKey,
    ownedGenerationId,
    foreignGenerationId,
  };
}

async function exactClerkFixture(clerk, emailAddress, expectedAccountType) {
  const result = await clerk.users.getUserList({ emailAddress: [emailAddress], limit: 10 });
  const exactUsers = result.data.filter((user) =>
    user.emailAddresses.some(({ emailAddress: candidate }) => candidate.toLowerCase() === emailAddress),
  );
  const candidates = exactUsers.filter((user) => {
    const accountType = user.publicMetadata?.accountType;
    return expectedAccountType === "member"
      ? accountType === undefined || accountType === null || accountType === "member"
      : accountType === expectedAccountType;
  });
  if (candidates.length !== 1) {
    throw new Error(`The exact +clerk_test ${expectedAccountType} fixture was not found uniquely.`);
  }
  return candidates[0];
}

async function assertSupabaseRoleFixture(supabase, user, emailAddress, expectedAccountType) {
  const { data, error } = await supabase
    .from("users")
    .select("id,email,account_type")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`${expectedAccountType} Supabase fixture lookup failed: ${error.message}`);
  if (
    !data ||
    typeof data.email !== "string" ||
    data.email.toLowerCase() !== emailAddress ||
    (expectedAccountType === "member"
      ? ![null, "member"].includes(data.account_type)
      : data.account_type !== expectedAccountType)
  ) {
    throw new Error(`The Clerk ${expectedAccountType} fixture must have a matching Supabase role profile.`);
  }
}

async function main() {
  const envPath = path.join(process.cwd(), "my-app", ".env.local");
  if (existsSync(envPath)) loadEnvFile(envPath);

  const config = protectedE2eFixtureConfig();
  const {
    secretKey,
    emailAddress,
    adminEmailAddress,
    salonEmailAddress,
    supabaseUrl,
    serviceRoleKey,
    ownedGenerationId,
    foreignGenerationId,
  } = config;
  const clerk = createClerkClient({ secretKey });
  const signedInUser = await exactClerkFixture(clerk, emailAddress, "member");
  const adminUser = await exactClerkFixture(clerk, adminEmailAddress, "admin");
  const salonUser = await exactClerkFixture(clerk, salonEmailAddress, "salon_owner");
  if (new Set([signedInUser.id, adminUser.id, salonUser.id]).size !== 3) {
    throw new Error("Customer, admin, and salon fixtures must resolve to different Clerk users.");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await assertSupabaseRoleFixture(supabase, signedInUser, emailAddress, "member");
  await assertSupabaseRoleFixture(supabase, adminUser, adminEmailAddress, "admin");
  await assertSupabaseRoleFixture(supabase, salonUser, salonEmailAddress, "salon_owner");

  const { data: ownedGeneration, error: ownedGenerationError } = await supabase
    .from("generations")
    .select("id,user_id,status,options,generated_assets_expires_at")
    .eq("id", ownedGenerationId)
    .maybeSingle();
  if (ownedGenerationError) throw new Error(`Owned generation fixture lookup failed: ${ownedGenerationError.message}`);
  const recommendationSet = ownedGeneration?.options?.recommendationSet;
  const variants = recommendationSet && typeof recommendationSet === "object"
    ? recommendationSet.variants
    : null;
  const assetsExpireAt = new Date(ownedGeneration?.generated_assets_expires_at || "");
  if (
    !ownedGeneration ||
    ownedGeneration.user_id !== signedInUser.id ||
    ownedGeneration.status !== "completed" ||
    !Array.isArray(variants) ||
    !variants.some((variant) => variant?.status === "completed" && variant?.generatedImagePath) ||
    Number.isNaN(assetsExpireAt.getTime()) ||
    assetsExpireAt.getTime() <= Date.now()
  ) {
    throw new Error("E2E_OWNED_GENERATION_ID must be a non-expired completed generation owned by the signed-in fixture.");
  }

  const { data: generation, error: generationError } = await supabase
    .from("generations")
    .select("id,user_id,status")
    .eq("id", foreignGenerationId)
    .maybeSingle();
  if (generationError) throw new Error(`Foreign generation fixture lookup failed: ${generationError.message}`);
  if (!generation) throw new Error("E2E_FOREIGN_GENERATION_ID does not identify an existing generation.");
  if (generation.user_id === signedInUser.id) {
    throw new Error("E2E_FOREIGN_GENERATION_ID is owned by the signed-in fixture and cannot prove the 403 boundary.");
  }

  const { data: owner, error: ownerError } = await supabase
    .from("users")
    .select("email")
    .eq("id", generation.user_id)
    .maybeSingle();
  if (ownerError) throw new Error(`Foreign generation owner lookup failed: ${ownerError.message}`);
  const ownerEmail = typeof owner?.email === "string" ? owner.email.toLowerCase() : "";
  if (!ownerEmail.includes("+clerk_test")) {
    throw new Error("The foreign generation must belong to another dedicated +clerk_test fixture.");
  }

  console.log(JSON.stringify({
    exactCustomerFixture: 1,
    exactAdminFixture: 1,
    exactSalonFixture: 1,
    ownedGenerationFixture: 1,
    foreignGenerationFixture: 1,
    ownerMismatch: true,
    readOnly: true,
  }));
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[protected-e2e] ${error instanceof Error ? error.message : "Fixture preflight failed."}`);
    process.exitCode = 1;
  });
}
