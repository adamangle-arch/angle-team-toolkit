"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/pipeline", label: "Pipeline", icon: "📊" },
  { href: "/candidates", label: "Roadmap", icon: "🧭" },
  { href: "/contacts", label: "Contacts", icon: "📇" },
  { href: "/streak", label: "Run Streak", icon: "🔥" },
  { href: "/recognition", label: "Wins", icon: "🏆" },
  { href: "/goals", label: "Goals", icon: "🎯" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md border-t border-white/10 bg-navy/95 backdrop-blur">
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
              className={`flex min-w-[64px] flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium transition ${
                active ? "text-amber" : "text-slate-400"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
