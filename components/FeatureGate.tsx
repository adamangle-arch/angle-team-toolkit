"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthGate";

// Wraps a page that's part of the progressive onboarding unlock (see
// lib/onboarding-gate.ts). If someone lands here directly (a bookmark, a
// stale link) before they've unlocked it, bounce them back to Onboarding
// instead of showing a half-relevant page.
export default function FeatureGate({
  minSession,
  children,
}: {
  minSession: number;
  children: React.ReactNode;
}) {
  const { unlockedThrough } = useAuth();
  const router = useRouter();
  const unlocked = unlockedThrough >= minSession;

  useEffect(() => {
    if (!unlocked) router.replace("/onboarding");
  }, [unlocked, router]);

  if (!unlocked) return null;
  return <>{children}</>;
}
