"use client";

import { useState } from "react";
import Link from "next/link";
import LevelAvatar from "@/components/LevelAvatar";
import StoryViewer from "@/components/StoryViewer";
import type { StoryPost } from "@/lib/types";

// Wraps LevelAvatar with the "tap to view their story" behavior shared
// by Who's Around, Leaderboard rows, and Profile pages: a gold ring
// (.story-ring) when this person currently has an active story, and
// tapping opens StoryViewer instead of navigating - falls back to a
// plain Link to their profile when they don't have one (or does nothing
// when linkWhenNoStory is off, for a profile page that's already theirs).
export default function AvatarWithStory({
  userId,
  photoUrl,
  level,
  name,
  size,
  showLevelChip,
  stories,
  linkWhenNoStory = true,
  className,
  overlay,
  children,
}: {
  userId: string;
  photoUrl: string | null;
  level: number;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg";
  showLevelChip?: boolean;
  stories?: StoryPost[];
  linkWhenNoStory?: boolean;
  className?: string;
  // A small absolutely-positioned badge (e.g. WhosActive's "online now"
  // dot) anchored to the avatar itself - kept separate from `children`,
  // which renders alongside the avatar inside the same clickable area
  // instead (e.g. Leaderboard's PersonLink name label).
  overlay?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const activeStories = stories ?? [];
  const hasStory = activeStories.length > 0;

  const avatar = (
    <span className="relative inline-block">
      <span className={hasStory ? "story-ring" : undefined}>
        <LevelAvatar photoUrl={photoUrl} level={level} name={name} size={size} showLevelChip={showLevelChip} />
      </span>
      {overlay}
    </span>
  );

  if (hasStory) {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className={className}>
          {avatar}
          {children}
        </button>
        {open && (
          <StoryViewer
            stories={activeStories}
            posterPhotoUrl={photoUrl}
            onClose={() => setOpen(false)}
            onStoryRemoved={() => {
              if (activeStories.length <= 1) setOpen(false);
            }}
          />
        )}
      </>
    );
  }

  if (!linkWhenNoStory) {
    return (
      <span className={className}>
        {avatar}
        {children}
      </span>
    );
  }

  return (
    <Link href={`/profile/${userId}`} className={className}>
      {avatar}
      {children}
    </Link>
  );
}
