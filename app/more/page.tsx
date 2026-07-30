"use client";

import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { minSessionFor } from "@/lib/onboarding-gate";
import { isBadgeExcluded } from "@/lib/constants";

const MORE_ITEMS = [
  { href: "/notifications", label: "Notifications", icon: "🔔", description: "Every push notification we've sent you." },
  { href: "/goals", label: "Goals", icon: "🎯", description: "Your daily/weekly/monthly targets and your 5/10-year and lifetime dreams." },
  { href: "/contacts", label: "Contacts", icon: "📇", description: "Your A/B/Customer contact list." },
  { href: "/volume", label: "Volume", icon: "📦", description: "Personal PV and Ditto tracking." },
  // Visible to everyone: admins see the whole company, everyone else
  // sees their own upline chain and downline (RLS scopes it either way).
  { href: "/team", label: "Team", icon: "👥", description: "Your downline, your upline, and team pipeline totals." },
  { href: "/library", label: "Resources", icon: "📚", description: "Process, Products, Scripts & FAQ, Leaders, Audio & Book Library." },
  { href: "/assistant", label: "Assistant", icon: "🤖", description: "Role-play A/B/C-list conversations." },
  { href: "/onboarding", label: "Onboarding", icon: "🎓", description: "New team member sessions." },
  { href: "/games", label: "Games", icon: "🎮", description: "Diamond Run, Diamond Chase, Trivia." },
  { href: "/badges", label: "Badges", icon: "🏅", description: "Achievements earned from your Core Run, PV, pipeline, and reading numbers." },
  { href: "/events", label: "Team Events", icon: "📸", description: "Photos and videos from our team events." },
];

export default function MorePage() {
  const { user, unlockedThrough } = useAuth();
  const badgesExcluded = isBadgeExcluded(user.email);
  const visibleItems = MORE_ITEMS.filter(
    (item) =>
      unlockedThrough >= minSessionFor(item.href) && (item.href !== "/badges" || !badgesExcluded)
  );

  return (
    <>
      <PageHeader title="More" subtitle="Resources, practice, and a break" />
      <main className="page-main">
        {visibleItems.map((item) => (
          <Link key={item.href} href={item.href} className="card flex items-center gap-3">
            <span className="text-2xl leading-none">{item.icon}</span>
            <div>
              <p className="font-semibold text-white">{item.label}</p>
              <p className="text-xs text-slate-400">{item.description}</p>
            </div>
          </Link>
        ))}
      </main>
    </>
  );
}
