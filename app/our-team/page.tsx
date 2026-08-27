"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import TestimonialCard from "@/components/TestimonialCard";
import { supabase } from "@/lib/supabaseClient";
import type { PublicTeamTestimonial } from "@/lib/types";

// Public, unauthenticated page - no access code, no sign-in, meant to be
// sent as a plain link (see the "Copy Link" buttons on /team-story). Same
// AuthGate exemption pattern as /prospect, so it renders standalone
// instead of hitting the sign-in wall.
//
// An optional ?ids=a,b,c query param (from "Copy Link - Handpicked" on
// /team-story) filters down to just those testimonials, in whatever
// order they already sort in - no server change needed for this, since
// every approved testimonial was already being fetched here anyway.
function OurTeamContent() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get("ids");
  const [testimonials, setTestimonials] = useState<PublicTeamTestimonial[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("get_public_team_testimonials").then(({ data, error }) => {
      if (error) {
        setError(error.message);
        return;
      }
      const all = (data as PublicTeamTestimonial[]) ?? [];
      if (idsParam) {
        const ids = new Set(idsParam.split(","));
        setTestimonials(all.filter((t) => ids.has(t.id)));
      } else {
        setTestimonials(all);
      }
    });
  }, [idsParam]);

  return (
    <>
      <header className="app-header">
        <h1 className="app-title">Team Impact</h1>
      </header>
      <main className="page-main">
        {error ? (
          <p className="text-sm text-red-400">Couldn&apos;t load this page — {error}</p>
        ) : testimonials === null ? (
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

export default function OurTeamPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Loading…</div>
      }
    >
      <OurTeamContent />
    </Suspense>
  );
}
