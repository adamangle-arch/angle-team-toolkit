"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useWayAuth } from "./WayAuthGate";

export default function WayHeader({
  title,
  subtitle,
  backHref,
}: {
  title: React.ReactNode;
  subtitle?: string;
  backHref?: string;
}) {
  const { signOut } = useWayAuth();

  return (
    <header className="app-header flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {backHref && (
          <Link href={backHref} aria-label="Back" className="btn-icon">
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="app-title truncate">{title}</h1>
          {subtitle ? <p className="app-subtitle truncate">{subtitle}</p> : null}
        </div>
      </div>
      <button className="chip-btn shrink-0" onClick={() => signOut()}>
        Sign Out
      </button>
    </header>
  );
}
