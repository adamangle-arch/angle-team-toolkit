"use client";

import { useWayAuth } from "./WayAuthGate";
import WelcomeVideoGate from "./WelcomeVideoGate";
import VerseOverlay from "./VerseOverlay";

// Gates every /the-way page behind the one-time welcome video, once
// (profile.welcome_video_watched_at) — sits inside WayAuthGate's provider
// so it can read the freshly-loaded profile and re-check it via
// refreshProfile() the moment the video's marked watched. Once past that,
// every fresh mount (i.e. every time the app is opened) also layers a
// verse overlay on top of the page underneath it.
export default function WayShell({ children }: { children: React.ReactNode }) {
  const { profile, refreshProfile } = useWayAuth();

  if (!profile.welcome_video_watched_at) {
    return <WelcomeVideoGate onWatched={refreshProfile} />;
  }

  return (
    <>
      <VerseOverlay />
      {children}
    </>
  );
}
