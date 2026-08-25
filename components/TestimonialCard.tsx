"use client";

import { extractYoutubeId } from "@/lib/youtube";

// Shared by /team-story (admin review + "live now" list) and the public
// /our-team page, so all three places render a testimonial identically -
// a big Instagram-post-sized photo (not a small profile-picture avatar),
// the quote, and an inline-playing YouTube embed rather than a plain
// "watch it elsewhere" link.
export default function TestimonialCard({
  authorName,
  photoUrl,
  quote,
  videoUrl,
  background,
  location,
}: {
  authorName: string;
  photoUrl: string | null;
  quote: string;
  videoUrl: string | null;
  background?: string | null;
  location?: string | null;
}) {
  const youtubeId = videoUrl ? extractYoutubeId(videoUrl) : null;

  return (
    <div className="space-y-3 rounded-xl border border-white/10 p-3">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={authorName}
          className="aspect-square w-full rounded-xl object-cover"
        />
      )}
      <div>
        <p className="text-sm font-semibold text-white">{authorName}</p>
        {location && <p className="text-xs text-slate-400">{location}</p>}
      </div>
      {background && <p className="whitespace-pre-line text-xs text-slate-400">{background}</p>}
      <p className="whitespace-pre-line text-sm text-slate-300">{quote}</p>
      {youtubeId && (
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${youtubeId}`}
            title={`${authorName}'s video`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}
