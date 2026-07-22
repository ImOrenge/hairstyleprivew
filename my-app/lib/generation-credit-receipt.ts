import {
  normalizeGenerationCreditReceipt,
  type GenerationCreditReceipt,
} from "@hairfit/shared";
import { callSupabaseRpc } from "./supabase-rpc";

export interface GenerationCreditReceiptRpcClient {
  rpc: unknown;
}

function isReceiptRpcUnavailable(error: { message: string; code?: string }) {
  const message = error.message.toLowerCase();
  return (
    error.code === "PGRST202" ||
    (message.includes("read_generation_credit_receipt") &&
      (message.includes("schema cache") || message.includes("does not exist")))
  );
}

export async function readGenerationCreditReceipt(
  client: GenerationCreditReceiptRpcClient,
  generationId: string,
  userId: string,
  options: { allowRpcUnavailable?: boolean } = {},
): Promise<GenerationCreditReceipt | null> {
  const { data, error } = await callSupabaseRpc(client, "read_generation_credit_receipt", {
    p_generation_id: generationId,
    p_user_id: userId,
  });

  if (error) {
    // Rolling deploy compatibility: generations accepted before the migration
    // stay on the legacy first-variant charge path.
    if (isReceiptRpcUnavailable(error) && options.allowRpcUnavailable) return null;
    throw new Error(error.message);
  }
  if (data === null || data === undefined) return null;

  const receipt = normalizeGenerationCreditReceipt(data);
  if (!receipt) {
    throw new Error("Generation credit receipt is invalid");
  }
  if (receipt.generationId !== generationId.trim().toLowerCase()) {
    throw new Error("Generation credit receipt does not match the generation");
  }

  return receipt;
}
