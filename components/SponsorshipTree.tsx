"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import type { Profile } from "@/lib/types";
import type { SponsorshipNode } from "@/lib/sponsorship-tree";
import SearchablePicker, { type SearchablePickerOption } from "./SearchablePicker";

function personName(profile: Profile): string {
  return profile.first_name && profile.last_name
    ? `${profile.first_name} ${profile.last_name}`
    : profile.email;
}

// Only passed from the admin-only "Whole Team" view (app/team/page.tsx)
// - a regular member's own "My Tree" never gets this prop, so the Move
// control simply doesn't render there. Reassigning someone's upline is
// sensitive enough (ripples into Team tab grouping, notifications,
// upline visibility) that it's admin-only, not something every member
// gets on their own downline.
export type AdminMove = {
  options: SearchablePickerOption[];
  onMove: (userId: string, newUplineId: string | null) => void | Promise<void>;
};

function TreeNode({ node, adminMove }: { node: SponsorshipNode; adminMove?: AdminMove }) {
  const [collapsed, setCollapsed] = useState(false);
  const [moving, setMoving] = useState(false);
  const [saving, setSaving] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div className="border-l border-white/10 pl-3">
      <div className="flex items-center gap-1.5 py-1">
        {hasChildren ? (
          <button
            className="flex h-5 w-5 shrink-0 items-center justify-center text-xs text-slate-400"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span className="w-5 shrink-0 text-center text-xs text-slate-600">•</span>
        )}
        <span className="truncate text-sm text-slate-200">
          <Link
            href={`/profile/${node.profile.id}`}
            className="underline decoration-dotted underline-offset-2"
          >
            {personName(node.profile)}
          </Link>
          {node.partner && (
            <>
              {" & "}
              <Link
                href={`/profile/${node.partner.id}`}
                className="underline decoration-dotted underline-offset-2"
              >
                {personName(node.partner)}
              </Link>
            </>
          )}
        </span>
        {node.profile.team && (
          <span className="shrink-0 truncate text-xs text-slate-500">· {node.profile.team}</span>
        )}
        {hasChildren && (
          <span className={adminMove ? "shrink-0 text-xs text-slate-600" : "ml-auto shrink-0 text-xs text-slate-600"}>
            {node.children.length}
          </span>
        )}
        {adminMove && (
          <button
            className="btn-icon ml-auto !h-6 !w-6 shrink-0 text-xs"
            onClick={() => setMoving((m) => !m)}
            aria-label={`Move ${personName(node.profile)}`}
          >
            <Pencil className="h-3 w-3" aria-hidden />
          </button>
        )}
      </div>
      {moving && adminMove && (
        <div className="mb-1.5 ml-6 space-y-1">
          <p className="text-xs text-slate-500">Move {personName(node.profile)} under…</p>
          <SearchablePicker
            options={[{ value: "", label: "No upline (top level)" }, ...adminMove.options].filter(
              (o) => o.value !== node.profile.id
            )}
            value=""
            placeholder="Search for a new upline…"
            onChange={async (newUplineId) => {
              setSaving(true);
              await adminMove.onMove(node.profile.id, newUplineId || null);
              setSaving(false);
              setMoving(false);
            }}
          />
          {saving && <p className="text-xs text-slate-500">Moving…</p>}
        </div>
      )}
      {!collapsed && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.profile.id} node={child} adminMove={adminMove} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SponsorshipTree({
  nodes,
  emptyLabel,
  adminMove,
}: {
  nodes: SponsorshipNode[];
  emptyLabel: string;
  adminMove?: AdminMove;
}) {
  if (nodes.length === 0) {
    return <p className="text-sm text-slate-400">{emptyLabel}</p>;
  }
  return (
    <div>
      {nodes.map((node) => (
        <TreeNode key={node.profile.id} node={node} adminMove={adminMove} />
      ))}
    </div>
  );
}
