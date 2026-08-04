"use client";

import Link from "next/link";
import type { AverageLeaderEntry } from "@/lib/types";

function leaderName(entry: AverageLeaderEntry): string {
  const name = [entry.first_name, entry.last_name].filter(Boolean).join(" ") || "Unnamed";
  if (!entry.partner_user_id) return name;
  const partnerName = [entry.partner_first_name, entry.partner_last_name].filter(Boolean).join(" ");
  return partnerName ? `${name} & ${partnerName}` : name;
}

// Top 3 (ties included, so this can render more than 3 rows) for one
// metric out of a batch already fetched from one of the
// get_*_average_leaders() RPCs (supabase/schema.sql). Renders nothing if
// nobody on the team has a nonzero average yet for this metric, rather
// than showing a "Top 3" label over an empty list.
export default function AverageLeaders({
  leaders,
  metric,
}: {
  leaders: AverageLeaderEntry[];
  metric: string;
}) {
  const rows = leaders.filter((l) => l.metric === metric);
  if (rows.length === 0) return null;
  return (
    <div className="space-y-0.5">
      {rows.map((entry, i) => (
        <p key={entry.user_id} className="truncate text-[11px] text-slate-500">
          <span className="text-amber-light">#{i + 1}</span>{" "}
          <Link
            href={`/profile/${entry.user_id}`}
            className="text-slate-400 underline decoration-dotted underline-offset-2"
          >
            {leaderName(entry)}
          </Link>{" "}
          — {entry.value.toFixed(1)}
        </p>
      ))}
    </div>
  );
}
