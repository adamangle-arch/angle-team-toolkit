"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Profile } from "@/lib/types";

// One file, admin-replaceable via the Supabase dashboard's Storage UI -
// no management table needed for an asset that changes rarely if ever
// (see supabase/schema.sql's WELCOME VIDEO section). Renamed here (and
// re-uploaded to the same path) any time the video itself changes.
const WELCOME_VIDEO_PATH = "parents-welcome.mp4";

// The very first thing a new team member sees after finishing signup,
// before Onboarding Session 1 - not gated behind it. Shows exactly once
// per account (profiles.welcome_video_watched_at), then never again.
// Skippable rather than a hard block - a video with sound can't
// autoplay in a mobile browser without a tap anyway, so trapping
// someone behind "must finish watching" would just be a dead end on the
// devices where autoplay silently fails.
export default function WelcomeVideoOverlay({
  profile,
  userId,
  onWatched,
}: {
  profile: Profile;
  userId: string;
  onWatched: () => void;
}) {
  const [ended, setEnded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (profile.welcome_video_watched_at) return null;

  async function markWatched() {
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("profiles")
      .update({ welcome_video_watched_at: new Date().toISOString() })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      setError(`Couldn't save that: ${error.message}`);
      return;
    }
    onWatched();
  }

  const { data } = supabase.storage.from("welcome-video").getPublicUrl(WELCOME_VIDEO_PATH);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-navy px-4 py-8">
      <div className="w-full max-w-md space-y-1 text-center">
        <p className="text-2xl">👋</p>
        <p className="text-lg font-bold text-white">Welcome to the Angle Team</p>
        <p className="text-sm text-slate-400">A quick message before you get started.</p>
      </div>
      <video
        className="w-full max-w-md rounded-xl bg-black"
        src={data.publicUrl}
        controls
        playsInline
        onEnded={() => setEnded(true)}
      />
      {error && <p className="max-w-md text-center text-xs text-red-400">{error}</p>}
      <button className="btn-primary w-full max-w-md" onClick={markWatched} disabled={saving}>
        {saving ? "…" : ended ? "Continue" : "Skip for now"}
      </button>
    </div>
  );
}
