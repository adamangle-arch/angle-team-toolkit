"use client";

import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { minSessionFor } from "@/lib/onboarding-gate";

const MORE_ITEMS = [
  { href: "/notifications", label: "Notifications", icon: "🔔", description: "Every push notification we've sent you." },
  { href: "/goals", label: "Goals", icon: "🎯", description: "Your daily/weekly/monthly targets." },
  { href: "/calendar", label: "Calendar", icon: "📅", description: "Meetings, reminders, and team events." },
  { href: "/history", label: "Candidate History", icon: "🗂️", description: "Every candidate you've ever added, active or not." },
  { href: "/volume", label: "Volume", icon: "📦", description: "Personal PV and Ditto tracking." },
  { href: "/leaderboard", label: "Leaderboard", icon: "🏆", description: "Team and individual rankings, streaks, milestones." },
  { href: "/library", label: "Resources", icon: "📚", description: "Process, Products, Scripts & FAQ, Leaders, Audio & Book Library." },
  { href: "/assistant", label: "Assistant", icon: "🤖", description: "Role-play A/B/C-list conversations." },
  { href: "/onboarding", label: "Onboarding", icon: "🎓", description: "New team member sessions." },
  { href: "/games", label: "Games", icon: "🎮", description: "Diamond Run, Diamond Chase, Trivia." },
  { href: "/events", label: "Team Events", icon: "📸", description: "Photos and videos from our team events." },
];

export default function MorePage() {
  const { unlockedThrough } = useAuth();
  const visibleItems = MORE_ITEMS.filter((item) => unlockedThrough >= minSessionFor(item.href));

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
