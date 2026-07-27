"use client";

import { useState } from "react";
import Link from "next/link";
import type { SponsorshipNode } from "@/lib/sponsorship-tree";

function displayName(node: SponsorshipNode): string {
  const { profile } = node;
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
        <Link
          href={`/profile/${node.profile.id}`}
          className="truncate text-sm text-slate-200 underline decoration-dotted underline-offset-2"
        >
          {displayName(node)}
        </Link>
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
