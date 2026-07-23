/**
 * Render the next document number the way the DB's next_document_number() would,
 * for read-only PREVIEW purposes (e.g. the disabled "Invoice number" field and
 * the settings numbering editor). The real number is assigned server-side on
 * save, so a preview can be momentarily stale if another document is created in
 * between — it is indicative, not a reservation.
 */
export function previewDocumentNumber(
  prefix: string,
  format: string,
  padding: number,
  next: number,
  now: Date = new Date(),
): string {
  const pad = Math.max(1, Number(padding) || 1);
  const seq = Math.max(1, Number(next) || 1);
  return (format || "")
    .split("{PREFIX}").join(prefix || "")
    .split("{YYYY}").join(String(now.getFullYear()))
    .split("{MM}").join(String(now.getMonth() + 1).padStart(2, "0"))
    .split("{SEQ}").join(String(seq).padStart(pad, "0"));
}
