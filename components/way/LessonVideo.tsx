"use client";

import { useState } from "react";
import { Play } from "lucide-react";

// A lesson's YouTube video, played right in the lesson card instead of
// sending people off to the YouTube app. Shows the video's thumbnail
// until tapped, so a course page with several videos doesn't load a
// player for each one up front. The tap that swaps in the player counts
// as the user gesture autoplay needs, so it starts without a second tap
// on most phones.
export default function LessonVideo({ videoId, title }: { videoId: string; title: string }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-[10px] bg-black">
      {playing ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className="group absolute inset-0 flex items-center justify-center"
          aria-label={`Play video: ${title}`}
          onClick={() => setPlaying(true)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail; next/image would need i.ytimg.com configured as a remote host for no real gain here. */}
          <img
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            // Without a thumbnail (offline, blocked) leave the plain black
            // backdrop rather than a broken-image icon.
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
          />
          <span
            className="relative flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform group-active:scale-90"
            style={{ background: "var(--way-accent)", color: "var(--way-accent-ink)" }}
          >
            <Play className="ml-0.5 h-6 w-6" fill="currentColor" aria-hidden />
          </span>
        </button>
      )}
    </div>
  );
}
