// A real CSV parser (quoted fields, embedded commas, escaped "" quotes) -
// unlike parseContactNamesFromCsv in app/contacts/page.tsx, which only
// ever needs the first column of a simple export, the stores sheet has
// several columns (name/address/spaces) that can themselves contain
// commas (e.g. "123 Main St, Suite 4"), so a plain split(",") would
// misalign every column after the first quoted one.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

// Finds the first header (case-insensitive, trimmed) that exactly
// matches or contains one of the candidate names - lets the sheet's
// actual column names vary a bit ("Store", "Store Name", "Location
// Name") without needing an exact schema.
export function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const exact = normalized.indexOf(candidate);
    if (exact !== -1) return exact;
  }
  for (const candidate of candidates) {
    const partial = normalized.findIndex((h) => h.includes(candidate));
    if (partial !== -1) return partial;
  }
  return -1;
}
