export interface CursorPosition {
  id: string;
  sortValue: string;
}

export interface CursorScanEntry<T> {
  cursor: CursorPosition;
  value: T | null;
}

interface CollectCursorFilteredPageOptions<T> {
  cursor: CursorPosition | null;
  limit: number;
  batchSize?: number;
  loadBatch: (
    cursor: CursorPosition | null,
    batchSize: number,
  ) => Promise<CursorScanEntry<T>[]>;
}

export async function collectCursorFilteredPage<T>({
  cursor,
  limit,
  batchSize = 100,
  loadBatch,
}: CollectCursorFilteredPageOptions<T>) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Cursor page limit must be a positive integer");
  }
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("Cursor scan batch size must be a positive integer");
  }

  const matches: CursorScanEntry<T>[] = [];
  let scanCursor = cursor;
  let scanned = 0;

  while (matches.length <= limit) {
    const batch = await loadBatch(scanCursor, batchSize);
    if (batch.length > batchSize) {
      throw new Error("Cursor batch exceeded its requested size");
    }
    if (batch.length === 0) {
      break;
    }

    for (const entry of batch) {
      scanned += 1;
      if (entry.value !== null) {
        matches.push(entry);
      }
      if (matches.length > limit) {
        break;
      }
    }

    if (matches.length > limit || batch.length < batchSize) {
      break;
    }

    const last = batch.at(-1);
    if (!last) {
      break;
    }
    if (scanCursor?.id === last.cursor.id && scanCursor.sortValue === last.cursor.sortValue) {
      throw new Error("Cursor scan did not advance");
    }
    scanCursor = last.cursor;
  }

  const page = matches.slice(0, limit);
  return {
    items: page.map((entry) => entry.value as T),
    nextCursor: matches.length > limit ? page.at(-1)?.cursor || null : null,
    scanned,
  };
}
