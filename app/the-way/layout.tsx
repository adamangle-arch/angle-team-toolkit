import type { Metadata } from "next";
import { Petrona, Karla } from "next/font/google";
import WayAuthGate from "@/components/way/WayAuthGate";
import WayShell from "@/components/way/WayShell";
import "./way.css";

const waySerif = Petrona({
  variable: "--font-way-serif",
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["normal", "italic"],
});

const waySans = Karla({
  variable: "--font-way-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "The Way",
  description: "A discipleship course platform.",
};

export default function WayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`way-scope ${waySerif.variable} ${waySans.variable}`}>
      <WayAuthGate>
        <WayShell>{children}</WayShell>
      </WayAuthGate>
    </div>
  );
}
