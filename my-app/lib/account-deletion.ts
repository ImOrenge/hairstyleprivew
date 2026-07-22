import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const STORAGE_DELETE_BATCH_SIZE = 100;

interface AccountDeletionStorageRow {
  outbox_id: string;
  bucket: string;
  object_path: string;
}

export class AccountDeletionCleanupError extends Error {
  readonly code: "DATABASE_DELETE_FAILED" | "STORAGE_DELETE_PENDING";

  constructor(
    code: AccountDeletionCleanupError["code"],
    message: string,
  ) {
    super(message);
    this.name = "AccountDeletionCleanupError";
    this.code = code;
  }
}

function isStorageRow(value: unknown): value is AccountDeletionStorageRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.outbox_id === "string" &&
    typeof row.bucket === "string" &&
    typeof row.object_path === "string"
  );
}

function storageRows(value: unknown) {
  return (Array.isArray(value) ? value : []).filter(isStorageRow);
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function recordCleanupFailure(
  supabase: SupabaseClient,
  userId: string,
  code: string,
) {
  await supabase.rpc("fail_account_deletion_storage", {
    p_user_id: userId,
    p_error_code: code,
  });
}

export async function deleteAccountApplicationData(
  supabase: SupabaseClient,
  userId: string,
) {
  const requested = await supabase.rpc("request_account_deletion", {
    p_user_id: userId,
  });
  if (requested.error) {
    throw new AccountDeletionCleanupError(
      "DATABASE_DELETE_FAILED",
      "계정 데이터를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  const listed = await supabase.rpc("list_account_deletion_storage", {
    p_user_id: userId,
  });
  if (listed.error) {
    throw new AccountDeletionCleanupError(
      "DATABASE_DELETE_FAILED",
      "삭제할 사진 목록을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  const rows = storageRows(listed.data);
  const rowsByBucket = new Map<string, AccountDeletionStorageRow[]>();
  for (const row of rows) {
    const bucketRows = rowsByBucket.get(row.bucket) ?? [];
    bucketRows.push(row);
    rowsByBucket.set(row.bucket, bucketRows);
  }

  for (const [bucket, bucketRows] of rowsByBucket) {
    for (const batch of chunks(bucketRows, STORAGE_DELETE_BATCH_SIZE)) {
      const removed = await supabase.storage
        .from(bucket)
        .remove(batch.map((row) => row.object_path));
      if (removed.error) {
        await recordCleanupFailure(supabase, userId, "storage_api_delete_failed");
        throw new AccountDeletionCleanupError(
          "STORAGE_DELETE_PENDING",
          "사진 삭제를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }

      const finished = await supabase.rpc("finish_account_deletion_storage", {
        p_user_id: userId,
        p_outbox_ids: batch.map((row) => row.outbox_id),
      });
      if (finished.error) {
        await recordCleanupFailure(supabase, userId, "storage_receipt_failed");
        throw new AccountDeletionCleanupError(
          "STORAGE_DELETE_PENDING",
          "사진 삭제 확인을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
    }
  }

  return { storageObjectCount: rows.length };
}

export async function markAccountIdentityDeletionFailed(
  supabase: SupabaseClient,
  userId: string,
) {
  await supabase.rpc("fail_account_identity_deletion", {
    p_user_id: userId,
    p_error_code: "identity_delete_failed",
  });
}

export async function markAccountIdentityDeletionComplete(
  supabase: SupabaseClient,
  userId: string,
) {
  return supabase.rpc("complete_account_identity_deletion", {
    p_user_id: userId,
  });
}

export function isIdentityAlreadyDeleted(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return record.status === 404 || record.statusCode === 404;
}
