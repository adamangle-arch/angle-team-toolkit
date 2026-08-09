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
          href="/search"
          aria-label="Search"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl leading-none transition duration-150 active:scale-95"
          style={{
            background: "linear-gradient(135deg, var(--color-amber-light), var(--color-amber))",
            boxShadow: "0 6px 18px -6px rgb(var(--amber-rgb) / 0.65)",
          }}
        >
          🔍
        </Link>
        <Link href="/profile" className="chip-btn">
          My Profile
        </Link>
        <button className="chip-btn" onClick={() => signOut()} title={user.email ?? undefined}>
          Sign Out
        </button>
      </div>
    </header>
  );
}
