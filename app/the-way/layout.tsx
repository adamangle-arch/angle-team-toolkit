import type { Metadata } from "next";
import { Archivo, Karla } from "next/font/google";
import WayAuthGate from "@/components/way/WayAuthGate";
import WayShell from "@/components/way/WayShell";
import WayBackdrop from "@/components/way/WayBackdrop";
import "./way.css";

// Variable name kept as --font-way-serif (not renamed to -display) to avoid
// touching the way-serif/way-wordmark class name in every component that
// references it - it's an internal identifier, not user-facing text.
const waySerif = Archivo({
  variable: "--font-way-serif",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
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
      <WayBackdrop />
      <WayAuthGate>
        <WayShell>{children}</WayShell>
      </WayAuthGate>
    </div>
  );
}
