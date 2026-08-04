"use client";

import { useState } from "react";
import Link from "next/link";
import type { Profile } from "@/lib/types";
import type { SponsorshipNode } from "@/lib/sponsorship-tree";

function personName(profile: Profile): string {
  return profile.first_name && profile.last_name
    ? `${profile.first_name} ${profile.last_name}`
    : profile.email;
}

function TreeNode({ node }: { node: SponsorshipNode }) {
  const [collapsed, setCollapsed] = useState(false);
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
          <span className="ml-auto shrink-0 text-xs text-slate-600">{node.children.length}</span>
        )}
      </div>
      {!collapsed && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.profile.id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SponsorshipTree({
  nodes,
  emptyLabel,
}: {
  nodes: SponsorshipNode[];
  emptyLabel: string;
}) {
  if (nodes.length === 0) {
    return <p className="text-sm text-slate-400">{emptyLabel}</p>;
  }
  return (
    <div>
      {nodes.map((node) => (
        <TreeNode key={node.profile.id} node={node} />
      ))}
    </div>
  );
}
