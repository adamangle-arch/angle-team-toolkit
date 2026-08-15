"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthGate";
import { minSessionFor } from "@/lib/onboarding-gate";

// Home is the landing screen (AuthGate sends first-open-of-the-session
// traffic straight here) and doubles as the hub for everything not on
// this bar (see app/home/page.tsx) - it owns the house icon and the
// unread-notifications badge, both moved off Today, which now gets its
// own icon since it's a normal tab again rather than the entry point.
// Swiping a scrollable nav row to find a tab wasn't intuitive, so this is
// deliberately short enough to never need horizontal scrolling.
const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: "🏠" },
  { href: "/dashboard", label: "Today", icon: "☀️" },
  { href: "/pipeline", label: "Pipeline", icon: "📊" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/streak", label: "Core Run", icon: "🔥" },
  { href: "/leaderboard", label: "Leaderboard", icon: "🏆" },
];

// Everything reached through the Home hub, rather than its own bar tab -
// visiting any of these should still highlight Home as the active tab.
const HOME_HUB_ROUTES = [
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
  "/insights",
  "/stories",
  "/notifications",
  "/ideas",
];

// Core Run tab's little status dot - done (green)/at-risk (red, pulses)/
// off-day (blue) are worth a glance from anywhere in the app; the
// ordinary "haven't logged today yet, still plenty of time" state isn't,
// so 'pending' (and null, before the first fetch resolves) renders
// nothing rather than a dot that's lit almost every morning.
const CORE_RUN_DOT_STYLE: Record<string, string> = {
  done: "bg-emerald-400",
  off_day: "bg-sky-400",
  at_risk: "bg-red-500 animate-pulse",
};

export default function BottomNav() {
  const pathname = usePathname();
  const { unlockedThrough, unreadNotificationCount, coreRunStatus } = useAuth();
  const homeHubActive = HOME_HUB_ROUTES.some((r) => pathname?.startsWith(r));
  const visibleItems = NAV_ITEMS.filter((item) => unlockedThrough >= minSessionFor(item.href));
  const coreRunDotClass = coreRunStatus ? CORE_RUN_DOT_STYLE[coreRunStatus] : undefined;

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
          const active =
            Boolean(pathname?.startsWith(item.href)) || (item.href === "/home" && homeHubActive);
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
              <span className="relative text-lg leading-none">
                {item.icon}
                {item.href === "/streak" && coreRunDotClass && (
                  <span
                    className={`absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full border border-navy ${coreRunDotClass}`}
                    aria-label={`Core Run status: ${coreRunStatus?.replace("_", " ")}`}
                  />
                )}
                {item.href === "/home" && unreadNotificationCount > 0 && (
                  <span
                    className="absolute -right-2.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white"
                    aria-label={`${unreadNotificationCount} unread notification${unreadNotificationCount === 1 ? "" : "s"}`}
                  >
                    {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
