"use client";

import { useEffect, useState } from "react";
import TestimonialCard from "@/components/TestimonialCard";
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
        <h1 className="app-title">What our team means to the people in it</h1>
      </header>
      <main className="page-main">
        {testimonials === null ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Loading…</div>
        ) : testimonials.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing to show yet — check back soon.</p>
        ) : (
          testimonials.map((t) => (
            <div key={t.id} className="card">
              <TestimonialCard
                authorName={t.author_name}
                photoUrl={t.photo_url}
                quote={t.quote}
                videoUrl={t.video_url}
                background={t.background}
                location={t.location}
              />
            </div>
          ))
        )}
      </main>
    </>
  );
}
