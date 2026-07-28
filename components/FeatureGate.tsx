"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthGate";

// Wraps a page that's part of the progressive onboarding unlock (see
// lib/onboarding-gate.ts). If someone lands here directly (a bookmark, a
// stale link) before they've unlocked it, bounce them back to Onboarding
// instead of showing a half-relevant page - except a session-0 candidate
// account (invited, not yet Launched), who doesn't have access to
// Onboarding either and goes to Resources instead, the one thing they
// do have access to. Redirecting a session-0 account to "/onboarding"
// itself would loop forever, since that page needs session 1 too.
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
  const fallbackPath = unlockedThrough <= 0 ? "/library" : "/onboarding";

  useEffect(() => {
    if (!unlocked) router.replace(fallbackPath);
  }, [unlocked, router, fallbackPath]);

  if (!unlocked) return null;
  return <>{children}</>;
}
