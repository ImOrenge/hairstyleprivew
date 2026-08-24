import "server-only";

import { createHash } from "node:crypto";
import {
  assertMakeupRecipeV1,
  presentationFamilyFromGender,
  validateMakeupRecipeCatalogV1,
  type MakeupGender,
  type MakeupMode,
  type MakeupRecipeCatalogCycleV1,
  type MakeupRecipeModulePolicyV1,
  type MakeupRecipeV1,
} from "@hairfit/shared/makeup";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "../v2/errors";

type CycleRow = {
  id: string; version: number; status: MakeupRecipeCatalogCycleV1["status"]; fingerprint: string | null;
  validation: MakeupRecipeCatalogCycleV1["validation"]; activated_at: string | null; created_at: string;
};
type EntryRow = {
  id: string; cycle_id: string; presentation_family: MakeupRecipeV1["presentationFamily"];
  makeup_mode: MakeupMode; module_policies: MakeupRecipeModulePolicyV1[]; fingerprint: string;
};

export type MakeupRecipeDraftV1 = Pick<MakeupRecipeV1, "presentationFamily" | "mode" | "modules">;

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function mapCycle(row: CycleRow): MakeupRecipeCatalogCycleV1 {
  return {
    schemaVersion: "makeup-recipe-catalog-cycle-v1",
    id: row.id,
    version: row.version,
    status: row.status,
    fingerprint: row.fingerprint ?? "",
    validation: row.validation,
    activatedAt: row.activated_at,
    createdAt: row.created_at,
  };
}

function mapEntry(row: EntryRow, cycleVersion: number): MakeupRecipeV1 {
  const recipe: MakeupRecipeV1 = {
    schemaVersion: "makeup-recipe-v1",
    id: row.id,
    cycleId: row.cycle_id,
    cycleVersion,
    presentationFamily: row.presentation_family,
    mode: row.makeup_mode,
    modules: row.module_policies,
    fingerprint: row.fingerprint,
  };
  assertMakeupRecipeV1(recipe);
  return recipe;
}

export async function readActiveMakeupRecipeCatalogV1() {
  const db = getSupabaseAdminClient();
  const pointer = await db.from("makeup_recipe_catalog_active_cycle").select("active_cycle_id").eq("singleton", true).maybeSingle();
  if (pointer.error) throw new Error(pointer.error.message);
  const cycleId = (pointer.data as { active_cycle_id?: string } | null)?.active_cycle_id;
  if (!cycleId) return null;
  const [cycleResult, entryResult] = await Promise.all([
    db.from("makeup_recipe_catalog_cycles").select("id,version,status,fingerprint,validation,activated_at,created_at").eq("id", cycleId).maybeSingle(),
    db.from("makeup_recipe_catalog_entries").select("id,cycle_id,presentation_family,makeup_mode,module_policies,fingerprint").eq("cycle_id", cycleId),
  ]);
  if (cycleResult.error) throw new Error(cycleResult.error.message);
  if (entryResult.error) throw new Error(entryResult.error.message);
  if (!cycleResult.data) return null;
  const cycle = mapCycle(cycleResult.data as unknown as CycleRow);
  const recipes = (entryResult.data as unknown as EntryRow[]).map((row) => mapEntry(row, cycle.version));
  const validation = validateMakeupRecipeCatalogV1(recipes);
  if (cycle.status !== "active" || !cycle.validation.valid || !validation.valid || !cycle.fingerprint) {
    throw new HairfitV2Error("MAKEUP_RECIPE_CATALOG_INVALID", 503, "메이크업 방향 기준을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.");
  }
  return { cycle, recipes };
}

export async function readActiveMakeupRecipeV1(gender: MakeupGender, mode: MakeupMode) {
  const catalog = await readActiveMakeupRecipeCatalogV1();
  if (!catalog) throw new HairfitV2Error("MAKEUP_RECIPE_CATALOG_UNAVAILABLE", 503, "메이크업 방향 기준이 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
  const family = presentationFamilyFromGender(gender);
  const recipe = catalog.recipes.find((item) => item.presentationFamily === family && item.mode === mode);
  if (!recipe) throw new HairfitV2Error("MAKEUP_RECIPE_NOT_FOUND", 503, "선택한 메이크업 방향 기준을 찾지 못했습니다.");
  return recipe;
}

export async function readMakeupRecipeCatalogAdminState() {
  const db = getSupabaseAdminClient();
  const [latest, active] = await Promise.all([
    db.from("makeup_recipe_catalog_cycles").select("id,version,status,fingerprint,validation,activated_at,created_at").order("version", { ascending: false }).limit(1).maybeSingle(),
    readActiveMakeupRecipeCatalogV1(),
  ]);
  if (latest.error) throw new Error(latest.error.message);
  return { latest: latest.data ? mapCycle(latest.data as unknown as CycleRow) : null, active };
}

export async function createMakeupRecipeCatalogCycleV1(actor: string, version: number, drafts: MakeupRecipeDraftV1[]) {
  if (!Number.isInteger(version) || version < 1) throw new HairfitV2Error("MAKEUP_RECIPE_VERSION_INVALID", 400, "카탈로그 버전을 확인해 주세요.");
  const cycleId = "catalog-cycle-draft";
  const recipes: MakeupRecipeV1[] = drafts.map((draft) => ({
    schemaVersion: "makeup-recipe-v1",
    id: `${draft.presentationFamily}:${draft.mode}`,
    cycleId,
    cycleVersion: version,
    presentationFamily: draft.presentationFamily,
    mode: draft.mode,
    modules: draft.modules,
    fingerprint: hash({ presentationFamily: draft.presentationFamily, mode: draft.mode, modules: draft.modules }),
  }));
  const validation = validateMakeupRecipeCatalogV1(recipes);
  if (!validation.valid) throw new HairfitV2Error("MAKEUP_RECIPE_CATALOG_INVALID", 400, validation.errors.join(", "));
  const created = await getSupabaseAdminClient().rpc("create_makeup_recipe_catalog_cycle_v1", {
    p_version: version,
    p_actor: actor,
    p_entries: recipes.map((recipe) => ({ presentationFamily: recipe.presentationFamily, mode: recipe.mode, modules: recipe.modules })),
  });
  if (created.error) throw new HairfitV2Error("MAKEUP_RECIPE_CATALOG_CREATE_FAILED", 409, created.error.message);
  return created.data;
}

export async function validateMakeupRecipeCatalogCycleAdmin(cycleId: string) {
  const result = await getSupabaseAdminClient().rpc("validate_makeup_recipe_catalog_cycle_v1", { p_cycle_id: cycleId });
  if (result.error) throw new HairfitV2Error("MAKEUP_RECIPE_CATALOG_VALIDATE_FAILED", 409, result.error.message);
  return result.data;
}

export async function activateMakeupRecipeCatalogCycleAdmin(cycleId: string, actor: string) {
  const result = await getSupabaseAdminClient().rpc("activate_makeup_recipe_catalog_cycle_v1", { p_cycle_id: cycleId, p_actor: actor });
  if (result.error) throw new HairfitV2Error("MAKEUP_RECIPE_CATALOG_ACTIVATE_FAILED", 409, result.error.message);
  return result.data;
}
