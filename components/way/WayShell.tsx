"use client";

import { useWayAuth } from "./WayAuthGate";
import WelcomeVideoGate from "./WelcomeVideoGate";

// Gates every /the-way page behind the one-time welcome video, once
// (profile.welcome_video_watched_at) — sits inside WayAuthGate's provider
// so it can read the freshly-loaded profile and re-check it via
// refreshProfile() the moment the video's marked watched.
export default function WayShell({ children }: { children: React.ReactNode }) {
  const { profile, refreshProfile } = useWayAuth();

  if (!profile.welcome_video_watched_at) {
    return <WelcomeVideoGate onWatched={refreshProfile} />;
  }

  return <>{children}</>;
}
