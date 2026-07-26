"use client";

import Link from "next/link";
import PageHeader from "@/components/PageHeader";

const MORE_ITEMS = [
  { href: "/library", label: "Resources", icon: "📚", description: "Process, Products, Scripts & FAQ, Leaders, Audio & Book Library." },
  { href: "/assistant", label: "Assistant", icon: "🤖", description: "Role-play A/B/C-list conversations." },
  { href: "/onboarding", label: "Onboarding", icon: "🎓", description: "New team member sessions." },
  { href: "/games", label: "Games", icon: "🎮", description: "Diamond Run, Diamond Chase, Trivia." },
];

export default function MorePage() {
  return (
    <>
      <PageHeader title="More" subtitle="Resources, practice, and a break" />
      <main className="page-main">
        {MORE_ITEMS.map((item) => (
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
