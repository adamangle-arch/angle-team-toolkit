// Shared between the Contact Builder's upload paths - the client-side
// quick parse for plain CSV/TXT files (app/contacts/page.tsx), the
// server-side Excel parse (app/api/contacts/parse-import/route.ts, since a
// real .xlsx file is a zipped binary format that can't be read as plain
// text in the browser), and the client-side vCard parse below. One set of
// rules for "which column is the name" so a plain list, a single Name
// column, and a First Name/Last Name spreadsheet (the shape most
// phone-contacts export apps produce) all import the same way regardless
// of which path handled the file.
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

// iOS has no Contact Picker API (Safari doesn't implement it at all), so
// pulling someone in straight from the Contacts app isn't possible there -
// this is the workaround: iOS's own Contacts app can share one or many
// contacts out as a .vcf (Share Sheet > Save to Files, AirDrop, Mail,
// etc.), and that file is plain text, so it can be read the same way a
// CSV/TXT list already is (see handleFileSelected in app/contacts/page.tsx)
// with no server round-trip needed. Carries the note along too, unlike the
// name-only CSV/XLSX paths, since a vCard's NOTE field is exactly the kind
// of "why I'm adding them" text someone would otherwise retype by hand.
export function parseVCard(text: string): { name: string; notes: string }[] {
  // A vCard line can be "folded" across multiple physical lines - RFC
  // 6350 says a continuation line starts with a space or tab, so joining
  // those back onto the previous line undoes the fold before any
  // property is read.
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1);

  const contacts: { name: string; notes: string }[] = [];
  for (const card of cards) {
    let fn = "";
    let n = "";
    let note = "";
    for (const rawLine of card.split("\n")) {
      const line = rawLine.trim();
      if (!line || /^END:VCARD/i.test(line)) continue;
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      // Strip any ;TYPE=... / ;ENCODING=... parameters - only the bare
      // property name (before the first ';') decides which field this is.
      const key = line.slice(0, colonIdx).split(";")[0].toUpperCase();
      const value = unescapeVCardValue(line.slice(colonIdx + 1));
      if (key === "FN") fn = value;
      else if (key === "N" && !n) n = value;
      else if (key === "NOTE") note = note ? `${note}\n${value}` : value;
    }
    // FN ("formatted name") is what the Contacts app actually shows, so
    // it wins when present; N (Family;Given;Additional;Prefix;Suffix) is
    // only a fallback for vCards that only ever set the structured field.
    let name = fn;
    if (!name && n) {
      const [family, given] = n.split(";");
      name = [given, family].filter((part) => part && part.trim()).join(" ");
    }
    if (name.trim()) contacts.push({ name: name.trim(), notes: note });
  }
  return contacts;
}

function unescapeVCardValue(value: string): string {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}
