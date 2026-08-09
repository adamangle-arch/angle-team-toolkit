"use client";

import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { minSessionFor } from "@/lib/onboarding-gate";

// Cycled per tile below, not tied to the account-wide colorway
// (profiles.theme_color) - this is just visual variety for the grid, same
// idea as the App Store's Browse tiles each getting their own color.
const TILE_COLORS: { from: string; to: string }[] = [
  { from: "#7dd3fc", to: "#0369a1" }, // sky
  { from: "#6ee7b7", to: "#047857" }, // emerald
  { from: "#c4b5fd", to: "#6d28d9" }, // violet
  { from: "#5eead4", to: "#0f766e" }, // teal
  { from: "#fda4af", to: "#be123c" }, // rose
  { from: "#fde68a", to: "#b45309" }, // amber
];

const MORE_ITEMS = [
  { href: "/stories", label: "Stories", icon: "📸", description: "Today's prompt - gone in 24h." },
  { href: "/notifications", label: "Notifications", icon: "🔔", description: "Every push we've sent you." },
  { href: "/goals", label: "Goals", icon: "🎯", description: "Targets and your dreams." },
  { href: "/contacts", label: "Contacts", icon: "📇", description: "Your A/B/Customer list." },
  { href: "/volume", label: "Volume", icon: "📦", description: "Personal PV and Ditto." },
  // Visible to everyone: admins see the whole company, everyone else
  // sees their own upline chain and downline (RLS scopes it either way).
  { href: "/team", label: "Team", icon: "👥", description: "Downline, upline, totals." },
  { href: "/library", label: "Resources", icon: "📚", description: "Process, scripts, leaders." },
  { href: "/assistant", label: "Assistant", icon: "🤖", description: "Role-play conversations." },
  { href: "/onboarding", label: "Onboarding", icon: "🎓", description: "New member sessions." },
  { href: "/games", label: "Games", icon: "🎮", description: "Diamond Run, Chase, Trivia." },
  { href: "/badges", label: "Badges", icon: "🏅", description: "Achievements you've earned." },
  { href: "/events", label: "Team Events", icon: "🎉", description: "Photos and videos." },
];

export default function MorePage() {
  const { unlockedThrough } = useAuth();
  const visibleItems = MORE_ITEMS.filter((item) => unlockedThrough >= minSessionFor(item.href));

  return (
    <>
      <PageHeader title="More" subtitle="Resources, practice, and a break" />
      <main className="page-main">
        <div className="grid grid-cols-2 gap-3">
          {visibleItems.map((item, i) => {
            const color = TILE_COLORS[i % TILE_COLORS.length];
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex min-h-[132px] flex-col justify-end overflow-hidden rounded-2xl p-3.5 transition active:scale-95"
                style={{
                  background: `linear-gradient(135deg, ${color.from}, ${color.to})`,
                  boxShadow: "0 10px 24px -12px rgba(0,0,0,0.55)",
                }}
              >
                <span
                  className="pointer-events-none absolute -right-3 -top-3 text-7xl leading-none opacity-25"
                  aria-hidden
                >
                  {item.icon}
                </span>
                <div className="relative z-10">
                  <p className="text-base font-extrabold leading-tight text-white drop-shadow-sm">
                    {item.label}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-white/85">{item.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
