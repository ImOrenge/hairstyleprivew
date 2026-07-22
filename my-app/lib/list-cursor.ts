interface ListCursorPayload {
  id: string;
  sortValue: string;
  version: 1;
}

const LIST_CURSOR_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const LIST_CURSOR_SORT_PATTERN = /^[0-9TZ:+.\- ]{10,64}$/;

export function encodeListCursor(sortValue: string, id: string) {
  return Buffer.from(JSON.stringify({ id, sortValue, version: 1 } satisfies ListCursorPayload), "utf8").toString(
    "base64url",
  );
}

export function decodeListCursor(value: string | null) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ListCursorPayload>;
    if (parsed.version !== 1 || typeof parsed.id !== "string" || typeof parsed.sortValue !== "string") {
      return null;
    }
    if (!LIST_CURSOR_ID_PATTERN.test(parsed.id) || !LIST_CURSOR_SORT_PATTERN.test(parsed.sortValue)) return null;
    if (!Number.isFinite(Date.parse(parsed.sortValue))) return null;
    return { id: parsed.id, sortValue: parsed.sortValue };
  } catch {
    return null;
  }
}
