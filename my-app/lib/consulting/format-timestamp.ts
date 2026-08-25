const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function formatConsultationTimestampKst(value: string | Date) {
  const source = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(source.getTime())) return "확인 중";
  const kst = new Date(source.getTime() + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const hour = String(kst.getUTCHours()).padStart(2, "0");
  const minute = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${year}. ${month}. ${day}. ${hour}:${minute}`;
}
