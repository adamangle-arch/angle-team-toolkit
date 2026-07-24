"use client";

import { use, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabaseClient";
import type { PublicProfile } from "@/lib/types";

export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await supabase.rpc("get_public_profile", { p_user_id: id });
      if (!cancelled) {
        setProfile(((data as PublicProfile[]) ?? [])[0] ?? null);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const name = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Unnamed"
    : "";

  const audios = profile
    ? [profile.favorite_audio_1, profile.favorite_audio_2, profile.favorite_audio_3].filter(
        Boolean
      )
    : [];
  const books = profile
    ? [profile.favorite_book_1, profile.favorite_book_2, profile.favorite_book_3].filter(Boolean)
    : [];

  return (
    <>
      <PageHeader title="Profile" />
      <main className="page-main">
        {loading ? (
          <div className="empty-state">Loading profile…</div>
        ) : !profile ? (
          <div className="empty-state">Profile not found.</div>
        ) : (
          <>
            <div className="card flex items-center gap-3">
              {profile.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.photo_url}
                  alt={name}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-navy text-2xl">
                  🙂
                </div>
              )}
              <div>
                <p className="text-lg font-semibold text-white">{name}</p>
                {profile.team && <p className="pill-amber mt-1">{profile.team}</p>}
              </div>
            </div>

            {profile.hometown && (
              <div className="card space-y-1">
                <p className="section-title">Hometown</p>
                <p className="text-sm text-slate-200">{profile.hometown}</p>
              </div>
            )}

            {profile.background && (
              <div className="card space-y-1">
                <p className="section-title">Background</p>
                <p className="text-sm text-slate-200">{profile.background}</p>
              </div>
            )}

            {audios.length > 0 && (
              <div className="card space-y-1">
                <p className="section-title">Top Favorite Audios</p>
                {audios.map((a, i) => (
                  <p key={i} className="text-sm text-slate-200">
                    {i + 1}. {a}
                  </p>
                ))}
              </div>
            )}

            {books.length > 0 && (
              <div className="card space-y-1">
                <p className="section-title">Top Favorite Books</p>
                {books.map((b, i) => (
                  <p key={i} className="text-sm text-slate-200">
                    {i + 1}. {b}
                  </p>
                ))}
              </div>
            )}

            {profile.team_impact && (
              <div className="card space-y-1">
                <p className="section-title">How This Team Has Helped</p>
                <p className="text-sm text-slate-200">{profile.team_impact}</p>
              </div>
            )}

            {!profile.hometown &&
              !profile.background &&
              audios.length === 0 &&
              books.length === 0 &&
              !profile.team_impact && (
                <div className="empty-state">
                  {name} hasn&apos;t filled in their profile yet.
                </div>
              )}
          </>
        )}
      </main>
    </>
  );
}
