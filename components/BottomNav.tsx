"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Today", icon: "🏠" },
  { href: "/pipeline", label: "Pipeline", icon: "📊" },
  { href: "/history", label: "History", icon: "🗂️" },
  { href: "/contacts", label: "Contacts", icon: "📇" },
  { href: "/streak", label: "Run Streak", icon: "🔥" },
  { href: "/goals", label: "Goals", icon: "🎯" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/volume", label: "Volume", icon: "📦" },
  { href: "/leaderboard", label: "Leaderboard", icon: "🏆" },
  { href: "/assistant", label: "Assistant", icon: "🤖" },
  { href: "/onboarding", label: "Onboarding", icon: "🎓" },
  // Resources opens straight to the Process tab (what to actually do),
  // so it sits right after Onboarding in the new-person's path instead
  // of all the way at the back.
  { href: "/library", label: "Resources", icon: "📚" },
  { href: "/games", label: "Games", icon: "🎮" },
  // Visible to everyone: admins see the whole company, everyone else
  // sees their own downline (RLS scopes it either way).
  { href: "/team", label: "Team", icon: "👥" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md backdrop-blur-xl"
      style={{
        background: "linear-gradient(180deg, rgba(10,15,30,0.75), rgba(10,15,30,0.97))",
        borderTop: "1px solid rgba(245,158,11,0.15)",
      }}
    >
      <div
        className="no-scrollbar flex overflow-x-auto"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[64px] flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition-all duration-150 ${
                active ? "text-amber-light" : "text-slate-400"
              }`}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none transition-all duration-150"
                style={
                  active
                    ? { background: "rgba(245,158,11,0.16)", boxShadow: "0 0 12px rgba(245,158,11,0.35)" }
                    : undefined
                }
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
