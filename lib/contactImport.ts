// Shared between the Contact Builder's two upload paths - the client-side
// quick parse for plain CSV/TXT files (app/contacts/page.tsx) and the
// server-side Excel parse (app/api/contacts/parse-import/route.ts, since a
// real .xlsx file is a zipped binary format that can't be read as plain
// text in the browser). One set of rules for "which column is the name"
// so a plain list, a single Name column, and a First Name/Last Name
// spreadsheet (the shape most phone-contacts export apps produce) all
// import the same way regardless of which path handled the file.
const FULL_NAME_HEADERS = ["name", "full name", "fullname", "display name", "contact name"];
const FIRST_NAME_HEADERS = ["first name", "firstname", "given name"];
const LAST_NAME_HEADERS = ["last name", "lastname", "family name", "surname"];

export function extractNamesFromRows(rows: string[][]): string[] {
  const nonEmptyRows = rows.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (nonEmptyRows.length === 0) return [];

  const header = nonEmptyRows[0].map((cell) => cell.trim().toLowerCase());
  const fullNameIdx = header.findIndex((h) => FULL_NAME_HEADERS.includes(h));
  const firstIdx = header.findIndex((h) => FIRST_NAME_HEADERS.includes(h));
  const lastIdx = header.findIndex((h) => LAST_NAME_HEADERS.includes(h));
  // Only treat row 0 as a header (and skip it) if it actually matched one
  // of the name-column patterns above - otherwise it's real data (e.g. a
  // plain list of names with no header at all).
  const hasHeaderRow = fullNameIdx >= 0 || firstIdx >= 0 || lastIdx >= 0;
  const dataRows = hasHeaderRow ? nonEmptyRows.slice(1) : nonEmptyRows;

  const names: string[] = [];
  for (const row of dataRows) {
    let name = "";
    if (fullNameIdx >= 0) {
      name = (row[fullNameIdx] ?? "").trim();
    } else if (firstIdx >= 0 || lastIdx >= 0) {
      const first = firstIdx >= 0 ? (row[firstIdx] ?? "").trim() : "";
      const last = lastIdx >= 0 ? (row[lastIdx] ?? "").trim() : "";
      name = [first, last].filter(Boolean).join(" ");
    } else {
      // No recognizable header - fall back to the first column, same as
      // the original plain-list behavior (one name per line, or the
      // first field of an unlabeled export).
      name = (row[0] ?? "").trim();
    }
    if (name && name.toLowerCase() !== "name") names.push(name);
  }
  return names;
}
