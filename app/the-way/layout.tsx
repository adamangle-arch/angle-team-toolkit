import type { Metadata } from "next";
import WayAuthGate from "@/components/way/WayAuthGate";
import WayShell from "@/components/way/WayShell";

export const metadata: Metadata = {
  title: "The Way",
  description: "A discipleship course platform.",
};

export default function WayLayout({ children }: { children: React.ReactNode }) {
  return (
    <WayAuthGate>
      <WayShell>{children}</WayShell>
    </WayAuthGate>
  );
}
