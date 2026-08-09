"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthGate";
import { minSessionFor } from "@/lib/onboarding-gate";

// Only the handful of tabs used every single day live on the main bar -
// everything else (see app/more/page.tsx) is one tap away under More.
// Swiping a scrollable nav row to find a tab wasn't intuitive, so this is
// deliberately short enough to never need horizontal scrolling.
const NAV_ITEMS = [
  { href: "/dashboard", label: "Today", icon: "🏠" },
  { href: "/pipeline", label: "Pipeline", icon: "📊" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/streak", label: "Core Run", icon: "🔥" },
  { href: "/leaderboard", label: "Leaderboard", icon: "🏆" },
];

// Everything not on the main bar lives behind More instead.
const MORE_ROUTES = [
  "/goals",
  "/contacts",
  "/volume",
  "/team",
  "/assistant",
  "/onboarding",
  "/library",
  "/games",
  "/badges",
  "/events",
];

export default function BottomNav() {
  const pathname = usePathname();
  const { unlockedThrough } = useAuth();
  const moreActive = MORE_ROUTES.some((r) => pathname?.startsWith(r)) || pathname?.startsWith("/more");
  const visibleItems = NAV_ITEMS.filter((item) => unlockedThrough >= minSessionFor(item.href));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md"
      style={{
        background: "rgba(10,15,30,0.55)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        className="no-scrollbar flex items-center gap-1 overflow-x-auto px-1.5 py-1.5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.375rem)" }}
      >
        {visibleItems.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[60px] flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] font-medium transition-all duration-150 ${
                active ? "text-amber-light" : "text-slate-400"
              }`}
              style={
                active
                  ? { background: "rgba(245,158,11,0.14)", boxShadow: "0 0 16px -2px rgba(245,158,11,0.4)" }
                  : undefined
              }
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}

        <Link
          href="/more"
          className={`flex min-w-[60px] flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] font-medium transition-all duration-150 ${
            moreActive ? "text-amber-light" : "text-slate-400"
          }`}
          style={
            moreActive
              ? { background: "rgba(245,158,11,0.14)", boxShadow: "0 0 16px -2px rgba(245,158,11,0.4)" }
              : undefined
          }
        >
          <span className="text-lg leading-none">⋯</span>
          <span>More</span>
        </Link>
      </div>
    </nav>
  );
}
