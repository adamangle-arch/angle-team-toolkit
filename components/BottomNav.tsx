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
  { href: "/contacts", label: "Contacts", icon: "📇" },
  { href: "/streak", label: "Run Streak", icon: "🔥" },
  // Visible to everyone: admins see the whole company, everyone else
  // sees their own downline (RLS scopes it either way).
  { href: "/team", label: "Team", icon: "👥" },
];

// Everything not on the main bar lives behind More instead.
const MORE_ROUTES = [
  "/goals",
  "/calendar",
  "/volume",
  "/leaderboard",
  "/assistant",
  "/onboarding",
  "/library",
  "/games",
  "/events",
];

export default function BottomNav() {
  const pathname = usePathname();
  const { unlockedThrough } = useAuth();
  const moreActive = MORE_ROUTES.some((r) => pathname?.startsWith(r)) || pathname?.startsWith("/more");
  const visibleItems = NAV_ITEMS.filter((item) => unlockedThrough >= minSessionFor(item.href));

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
        {visibleItems.map((item) => {
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

        <Link
          href="/more"
          className={`flex min-w-[64px] flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition-all duration-150 ${
            moreActive ? "text-amber-light" : "text-slate-400"
          }`}
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none transition-all duration-150"
            style={
              moreActive
                ? { background: "rgba(245,158,11,0.16)", boxShadow: "0 0 12px rgba(245,158,11,0.35)" }
                : undefined
            }
          >
            ⋯
          </span>
          <span>More</span>
        </Link>
      </div>
    </nav>
  );
}
