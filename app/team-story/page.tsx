"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Video } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import FeatureGate from "@/components/FeatureGate";
import { SkeletonList } from "@/components/Skeleton";
import { supabase } from "@/lib/supabaseClient";
import { isPrimaryUser } from "@/lib/constants";
import type { PublicTeamTestimonial, TeamTestimonial } from "@/lib/types";

// The public, no-login page these testimonials show up on once
// approved - see app/our-team/page.tsx and the AuthGate exemption that
// lets it render outside the sign-in wall the same way /prospect does.
const PUBLIC_PATH = "/our-team";

type PendingRow = TeamTestimonial & { author_name: string };

export default function TeamStoryPage() {
  const { user } = useAuth();
  const isAdmin = isPrimaryUser(user.email);

  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState<PublicTeamTestimonial[]>([]);
  const [mine, setMine] = useState<TeamTestimonial | null>(null);
  const [needsReview, setNeedsReview] = useState<PendingRow[]>([]);
  const [copied, setCopied] = useState(false);

  const [quote, setQuote] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped after any save/approve/reject to re-run the load effect below,
  // rather than calling a setState-laden loader function directly from
  // inside the effect (which the lint rule for effects flags as a
  // cascading-render risk) - see other pages in this app for the same
  // "define the loader inline in the effect" shape this now matches.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function load() {
      const [{ data: pub }, { data: own }] = await Promise.all([
        supabase.rpc("get_public_team_testimonials"),
        supabase.from("team_testimonials").select("*").eq("author_id", user.id).maybeSingle(),
      ]);
      setLive((pub as PublicTeamTestimonial[]) ?? []);
      const ownRow = (own as TeamTestimonial) ?? null;
      setMine(ownRow);
      setQuote(ownRow?.quote ?? "");
      setPhotoUrl(ownRow?.photo_url ?? null);
      setVideoUrl(ownRow?.video_url ?? "");

      if (isAdmin) {
        const { data: pendingRows } = await supabase
          .from("team_testimonials")
          .select("*, profiles!team_testimonials_author_id_fkey(first_name,last_name)")
          .eq("approved", false);
        setNeedsReview(
          ((pendingRows as (TeamTestimonial & {
            profiles: { first_name: string | null; last_name: string | null } | null;
          })[]) ?? [])
            .filter((r) => r.author_id !== user.id)
            .map((r) => ({
              ...r,
              author_name:
                [r.profiles?.first_name, r.profiles?.last_name].filter(Boolean).join(" ") || "Someone",
            }))
        );
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingPhoto(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/testimonial.${ext}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
      upsert: true,
    });
    if (uploadError) {
      setError(uploadError.message);
    } else {
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setPhotoUrl(`${data.publicUrl}?t=${Date.now()}`);
    }
    setUploadingPhoto(false);
  }

  async function save() {
    const trimmed = quote.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    // Always false here, never true - only an admin can publish this
    // (see team_testimonials_update_own's with check in schema.sql),
    // so any edit an author makes goes back to "waiting on approval"
    // even if it was already live.
    const payload = {
      author_id: user.id,
      quote: trimmed,
      photo_url: photoUrl,
      video_url: videoUrl.trim() || null,
      approved: false,
    };
    const { data, error } = await supabase
      .from("team_testimonials")
      .upsert(payload, { onConflict: "author_id" })
      .select()
      .single();
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMine(data as TeamTestimonial);
    setRefreshKey((k) => k + 1);
  }

  async function removeMine() {
    if (!mine) return;
    setSaving(true);
    const { error } = await supabase.from("team_testimonials").delete().eq("id", mine.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMine(null);
    setQuote("");
    setPhotoUrl(null);
    setVideoUrl("");
    setRefreshKey((k) => k + 1);
  }

  async function approve(id: string) {
    setNeedsReview((prev) => prev.filter((r) => r.id !== id));
    const { error } = await supabase.from("team_testimonials").update({ approved: true }).eq("id", id);
    if (error) setError(error.message);
    setRefreshKey((k) => k + 1);
  }

  async function reject(id: string) {
    setNeedsReview((prev) => prev.filter((r) => r.id !== id));
    const { error } = await supabase.from("team_testimonials").delete().eq("id", id);
    if (error) setError(error.message);
  }

  function copyLink() {
    const url = `${window.location.origin}${PUBLIC_PATH}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const status = !mine ? null : mine.approved ? "live" : "pending";

  return (
    <FeatureGate minSession={1}>
      <PageHeader
        title="Team Story"
        subtitle="What our team means to us — not just Amway. Totally optional to send."
      />
      <main className="page-main">
        {loading ? (
          <SkeletonList cards={2} />
        ) : (
          <>
            <div className="card space-y-2">
              <p className="section-title">Shareable Link</p>
              <p className="text-xs text-slate-400">
                This is its own public page — no access code, no sign-in. Send it to anyone,
                anytime, whether or not they&apos;re already in your pipeline. It&apos;s never
                required.
              </p>
              <button type="button" className="btn-secondary w-full" onClick={copyLink}>
                {copied ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Check className="h-4 w-4" aria-hidden /> Copied
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <Copy className="h-4 w-4" aria-hidden /> Copy Link
                  </span>
                )}
              </button>
            </div>

            <div className="card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="section-title">Your Story</p>
                {status === "live" && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                    Live
                  </span>
                )}
                {status === "pending" && (
                  <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[11px] font-semibold text-amber-light">
                    Waiting on approval
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                What has this team specifically done for you? Saving (or editing) sends it to an
                admin for approval before it goes on the public page.
              </p>
              <textarea
                className="textarea min-h-32"
                placeholder="Tell your story..."
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
              />
              <div className="flex items-center gap-3">
                {photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl}
                    alt="Your photo"
                    className="h-14 w-14 rounded-full object-cover"
                  />
                )}
                <label className="chip-btn cursor-pointer">
                  {uploadingPhoto ? "Uploading..." : photoUrl ? "Change Photo" : "Add Photo (optional)"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                    disabled={uploadingPhoto}
                  />
                </label>
              </div>
              <input
                className="input"
                placeholder="Video link instead/in addition (optional)"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary flex-1"
                  onClick={save}
                  disabled={saving || !quote.trim()}
                >
                  {saving ? "Saving..." : mine ? "Save Changes" : "Submit"}
                </button>
                {mine && (
                  <button type="button" className="btn-secondary" onClick={removeMine} disabled={saving}>
                    Remove
                  </button>
                )}
              </div>
            </div>

            {isAdmin && needsReview.length > 0 && (
              <div className="card space-y-3">
                <p className="section-title">Needs Your Approval</p>
                {needsReview.map((row) => (
                  <div key={row.id} className="space-y-2 rounded-xl border border-white/10 p-3">
                    <div className="flex items-center gap-2">
                      {row.photo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.photo_url}
                          alt={row.author_name}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      )}
                      <p className="text-sm font-semibold text-white">{row.author_name}</p>
                    </div>
                    <p className="text-sm text-slate-300">{row.quote}</p>
                    {row.video_url && (
                      <a
                        href={row.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-amber-light underline"
                      >
                        <Video className="h-3 w-3" aria-hidden /> Watch video
                      </a>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-primary flex-1"
                        onClick={() => approve(row.id)}
                      >
                        Approve
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => reject(row.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="card space-y-3">
              <p className="section-title">Live on the Page Now</p>
              {live.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Nothing&apos;s live yet — be the first to add your story above.
                </p>
              ) : (
                live.map((t) => (
                  <div key={t.id} className="space-y-2 rounded-xl border border-white/10 p-3">
                    <div className="flex items-center gap-2">
                      {t.photo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.photo_url}
                          alt={t.author_name}
                          className="h-10 w-10 rounded-full object-cover"
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
            </div>
          </>
        )}
      </main>
    </FeatureGate>
  );
}
