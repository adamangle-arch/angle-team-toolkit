import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { extractNamesFromRows } from "@/lib/contactImport";

export const dynamic = "force-dynamic";

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
);

// Contact Builder's "Or Upload a List" - the plain CSV/TXT path parses
// client-side (see app/contacts/page.tsx), but a real .xlsx/.xls file is
// a zipped binary format, not plain text, so it has to be parsed
// server-side instead. Any signed-in team member can use this - it's a
// stateless parse (nothing is read from or written to the database on
// their behalf), same auth bar as every other authenticated route, not
// admin-gated.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: userData, error: userError } = await supabaseAuthClient.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  // A contact list has no business being this large - caps how much work
  // a single upload can make this function do.
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "That file is too large (10MB max)." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    // exceljs's bundled type declarations and @types/node's generic
    // Buffer<TArrayBuffer> disagree on which ArrayBuffer flavor backs a
    // Buffer here - both sides really are the same Buffer at runtime,
    // this is purely a compile-time mismatch between the two.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return NextResponse.json({ error: "That spreadsheet has no sheets." }, { status: 400 });
    }

    const rows: string[][] = [];
    worksheet.eachRow((row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const value = cell.value;
        // A formula cell's value is {formula, result} rather than a plain
        // scalar - the result is what a person actually sees in the
        // sheet, so that's what should feed the name-column detection.
        const resolved =
          value && typeof value === "object" && "result" in value
            ? (value as { result: unknown }).result
            : value;
        cells.push(resolved === null || resolved === undefined ? "" : String(resolved));
      });
      rows.push(cells);
    });

    const names = extractNamesFromRows(rows);
    return NextResponse.json({ names });
  } catch {
    return NextResponse.json(
      { error: "Couldn't read that file - make sure it's a valid Excel file." },
      { status: 400 }
    );
  }
}
