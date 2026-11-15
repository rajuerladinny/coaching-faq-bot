// Helpers for the owner's lead list.

/** Country code assumed for 10-digit numbers typed without one. */
export const DEFAULT_COUNTRY_CODE = "91";

/** A wa.me link for the lead's number, or null when the number is unusable. */
export function whatsappLink(phone, countryCode = DEFAULT_COUNTRY_CODE) {
  const digits = String(phone).replace(/\D/g, "");
  if (String(phone).trim().startsWith("+") && digits.length >= 8) return `https://wa.me/${digits}`;
  if (digits.length === 10) return `https://wa.me/${countryCode}${digits}`;
  if (digits.length > 10) return `https://wa.me/${digits}`;
  return null;
}

/** Quotes a CSV cell and neutralises spreadsheet formula prefixes. */
export function csvCell(value) {
  const text = String(value ?? "");
  // A leading + is normal for phone numbers, but spreadsheets read it as a formula.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function leadsToCsv(leads) {
  const rows = leads.map((l) =>
    [l.name, l.phone, l.status, l.created_at, l.note, (l.questions || []).join(" | ")]
      .map(csvCell)
      .join(",")
  );
  return ["name,phone,status,received_at,note,questions", ...rows, ""].join("\r\n");
}

export function answerRate(stats) {
  if (!stats || !stats.messages_this_month) return null;
  return Math.round((stats.answered_this_month / stats.messages_this_month) * 100);
}
