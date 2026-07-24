"use client";

import Link from "next/link";
import { useAuth } from "./AuthGate";

export default function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { user, signOut } = useAuth();

  return (
    <header className="app-header flex items-center justify-between gap-2">
      <div>
        <h1 className="app-title">{title}</h1>
        {subtitle ? <p className="app-subtitle">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          href="/profile"
          className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-300 active:scale-95"
        >
          My Profile
        </Link>
        <button
          className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-300 active:scale-95"
          onClick={() => signOut()}
          title={user.email ?? undefined}
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
