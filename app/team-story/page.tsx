"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import FeatureGate from "@/components/FeatureGate";
import { SkeletonList } from "@/components/Skeleton";
import TestimonialCard from "@/components/TestimonialCard";
import { supabase } from "@/lib/supabaseClient";
import { isPrimaryUser } from "@/lib/constants";
import { extractYoutubeId } from "@/lib/youtube";
import type { PendingTeamTestimonial, PublicTeamTestimonial, TeamTestimonial } from "@/lib/types";

// The public, no-login page these testimonials show up on once
// approved - see app/our-team/page.tsx and the AuthGate exemption that
// lets it render outside the sign-in wall the same way /prospect does.
const PUBLIC_PATH = "/our-team";

export default function TeamStoryPage() {
  const { user } = useAuth();
  const isAdmin = isPrimaryUser(user.email);

  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState<PublicTeamTestimonial[]>([]);
  const [mine, setMine] = useState<TeamTestimonial | null>(null);
  const [needsReview, setNeedsReview] = useState<PendingTeamTestimonial[]>([]);
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
        const { data: pendingRows } = await supabase.rpc("get_pending_team_testimonials");
        setNeedsReview(
          ((pendingRows as PendingTeamTestimonial[]) ?? []).filter((r) => r.author_id !== user.id)
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
    const trimmedVideo = videoUrl.trim();
    if (trimmedVideo && !extractYoutubeId(trimmedVideo)) {
      setError("That doesn't look like a YouTube link - paste the full youtube.com or youtu.be URL.");
      return;
    }
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
      video_url: trimmedVideo || null,
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
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[11px] font-semibold text-amber-light">
                      Waiting on approval
                    </span>
                    {isAdmin && mine && (
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-emerald-400 underline"
                        onClick={() => approve(mine.id)}
                      >
                        Approve your own (admin)
                      </button>
                    )}
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
                placeholder="YouTube link, instead or in addition (optional)"
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
                  <div key={row.id} className="space-y-3">
                    <TestimonialCard
                      authorName={row.author_name}
                      photoUrl={row.photo_url}
                      quote={row.quote}
                      videoUrl={row.video_url}
                    />
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
                  <TestimonialCard
                    key={t.id}
                    authorName={t.author_name}
                    photoUrl={t.photo_url}
                    quote={t.quote}
                    videoUrl={t.video_url}
                  />
                ))
              )}
            </div>
          </>
        )}
      </main>
    </FeatureGate>
  );
}
