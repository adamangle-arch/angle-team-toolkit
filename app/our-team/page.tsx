"use client";

import { useEffect, useState } from "react";
import { Video } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { PublicTeamTestimonial } from "@/lib/types";

// Public, unauthenticated page - no access code, no sign-in, meant to be
// sent as a plain link (see the "Copy Link" button on /team-story). Same
// AuthGate exemption pattern as /prospect, so it renders standalone
// instead of hitting the sign-in wall.
export default function OurTeamPage() {
  const [testimonials, setTestimonials] = useState<PublicTeamTestimonial[] | null>(null);

  useEffect(() => {
    supabase.rpc("get_public_team_testimonials").then(({ data }) => {
      setTestimonials((data as PublicTeamTestimonial[]) ?? []);
    });
  }, []);

  return (
    <>
      <header className="app-header">
        <h1 className="app-title">More Than a Company</h1>
        <p className="app-subtitle">What our team means to the people in it</p>
      </header>
      <main className="page-main">
        {testimonials === null ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Loading…</div>
        ) : testimonials.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing to show yet — check back soon.</p>
        ) : (
          testimonials.map((t) => (
            <div key={t.id} className="card space-y-2">
              <div className="flex items-center gap-3">
                {t.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.photo_url}
                    alt={t.author_name}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                )}
                <p className="text-sm font-semibold text-white">{t.author_name}</p>
              </div>
              <p className="text-sm text-slate-300">{t.quote}</p>
              {t.video_url && (
                <a
                  href={t.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-amber-light underline"
                >
                  <Video className="h-3 w-3" aria-hidden /> Watch video
                </a>
              )}
            </div>
          ))
        )}
      </main>
    </>
  );
}
