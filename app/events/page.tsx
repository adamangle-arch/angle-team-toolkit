"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { isPrimaryUser } from "@/lib/constants";
import { formatDateLabel } from "@/lib/dates";
import type { TeamEventAlbum, EventMedia } from "@/lib/types";

// crypto.randomUUID() needs a secure context and isn't available in
// every mobile browser/in-app webview - falling back avoids a thrown
// exception mid-upload leaving the "Uploading..." button stuck forever
// with no error shown.
function uniqueId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function EventsPage() {
  const { user } = useAuth();
  const isAdmin = isPrimaryUser(user.email);

  const [albums, setAlbums] = useState<TeamEventAlbum[]>([]);
  const [mediaByAlbum, setMediaByAlbum] = useState<Record<string, EventMedia[]>>({});
  const [loading, setLoading] = useState(true);

  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [creatingAlbum, setCreatingAlbum] = useState(false);

  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<EventMedia | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: albumRows }, { data: mediaRows }] = await Promise.all([
        supabase.from("team_event_albums").select("*").order("event_date", { ascending: false }),
        supabase.from("event_media").select("*").order("created_at", { ascending: false }),
      ]);
      setAlbums((albumRows as TeamEventAlbum[]) ?? []);
      const grouped: Record<string, EventMedia[]> = {};
      for (const media of (mediaRows as EventMedia[]) ?? []) {
        (grouped[media.album_id] ??= []).push(media);
      }
      setMediaByAlbum(grouped);
      setLoading(false);
    }
    load();
  }, []);

  async function createAlbum() {
    const title = newTitle.trim();
    if (!title) return;
    setCreatingAlbum(true);
    const { data } = await supabase
      .from("team_event_albums")
      .insert({ title, event_date: newDate, created_by: user.id })
      .select("*")
      .single();
    if (data) setAlbums((prev) => [data as TeamEventAlbum, ...prev]);
    setNewTitle("");
    setCreatingAlbum(false);
  }

  async function deleteAlbum(albumId: string) {
    setAlbums((prev) => prev.filter((a) => a.id !== albumId));
    const toRemove = mediaByAlbum[albumId] ?? [];
    if (toRemove.length > 0) {
      await supabase.storage.from("event-media").remove(toRemove.map((m) => m.storage_path));
    }
    await supabase.from("team_event_albums").delete().eq("id", albumId);
  }

  async function uploadMedia(albumId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingFor(albumId);
    setUploadError(null);

    const uploaded: EventMedia[] = [];
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const isVideo = file.type.startsWith("video/");
        const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
        const path = `${albumId}/${uniqueId()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("event-media").upload(path, file);
        if (uploadErr) {
          errors.push(`${file.name}: ${uploadErr.message}`);
          continue;
        }
        const { data: pub } = supabase.storage.from("event-media").getPublicUrl(path);
        const { data: row, error: insertErr } = await supabase
          .from("event_media")
          .insert({
            album_id: albumId,
            storage_path: path,
            media_url: pub.publicUrl,
            media_type: isVideo ? "video" : "photo",
            uploaded_by: user.id,
          })
          .select("*")
          .single();
        if (insertErr) {
          errors.push(`${file.name}: ${insertErr.message}`);
        } else if (row) {
          uploaded.push(row as EventMedia);
        }
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : "Upload failed."}`);
      }
    }

    if (uploaded.length > 0) {
      setMediaByAlbum((prev) => ({
        ...prev,
        [albumId]: [...uploaded, ...(prev[albumId] ?? [])],
      }));
    }
    if (errors.length > 0) setUploadError(errors.join(" "));
    setUploadingFor(null);
  }

  async function deleteMedia(media: EventMedia) {
    setMediaByAlbum((prev) => ({
      ...prev,
      [media.album_id]: (prev[media.album_id] ?? []).filter((m) => m.id !== media.id),
    }));
    await supabase.storage.from("event-media").remove([media.storage_path]);
    await supabase.from("event_media").delete().eq("id", media.id);
  }

  return (
    <>
      <PageHeader title="Team Events" subtitle="Photos and videos from our team events" />
      <main className="page-main">
        {isAdmin && (
          <div className="card space-y-2">
            <p className="section-title">Add Event</p>
            <input
              className="input"
              placeholder="Title (e.g. SUMMIT Conference 2026)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <input
              type="date"
              className="input"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
            <button
              className="btn-primary w-full"
              onClick={createAlbum}
              disabled={creatingAlbum || !newTitle.trim()}
            >
              {creatingAlbum ? "Adding…" : "Add Event"}
            </button>
          </div>
        )}

        {loading ? (
          <div className="empty-state">Loading events…</div>
        ) : albums.length === 0 ? (
          <div className="empty-state">
            No team events yet{isAdmin ? " — add one above." : "."}
          </div>
        ) : (
          albums.map((album) => {
            const media = mediaByAlbum[album.id] ?? [];
            return (
              <div key={album.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="section-title">{album.title}</p>
                    <p className="text-xs text-amber-light">{formatDateLabel(album.event_date)}</p>
                  </div>
                  {isAdmin && (
                    <button
                      className="btn-icon !h-7 !w-7 text-sm shrink-0"
                      onClick={() => deleteAlbum(album.id)}
                      aria-label={`Delete event ${album.title}`}
                    >
                      ×
                    </button>
                  )}
                </div>

                {media.length === 0 ? (
                  <p className="text-sm text-slate-400">No photos or videos yet.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {media.map((item) => (
                      <div key={item.id} className="group relative aspect-square">
                        <button
                          onClick={() => setLightbox(item)}
                          className="h-full w-full overflow-hidden rounded-lg bg-navy"
                        >
                          {item.media_type === "video" ? (
                            <video src={item.media_url} className="h-full w-full object-cover" muted />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.media_url}
                              alt={album.title}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </button>
                        {item.media_type === "video" && (
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl">
                            ▶️
                          </span>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => deleteMedia(item)}
                            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-navy/80 text-xs text-white"
                            aria-label="Delete media"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {isAdmin && (
                  <div className="space-y-1.5 pt-1">
                    {/* Separate photo/video pickers - mixing both in one
                        picker (accept="image/*,video/*") makes the iOS
                        Photos picker choke on large multi-selections. */}
                    <div className="flex gap-2">
                      <label className="btn-secondary flex-1 cursor-pointer text-center">
                        {uploadingFor === album.id ? "Uploading…" : "📷 Add Photos"}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={uploadingFor === album.id}
                          onChange={(e) => {
                            uploadMedia(album.id, e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <label className="btn-secondary flex-1 cursor-pointer text-center">
                        {uploadingFor === album.id ? "Uploading…" : "🎥 Add Videos"}
                        <input
                          type="file"
                          accept="video/*"
                          multiple
                          className="hidden"
                          disabled={uploadingFor === album.id}
                          onChange={(e) => {
                            uploadMedia(album.id, e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white"
            onClick={() => setLightbox(null)}
            aria-label="Close"
          >
            ✕
          </button>
          {lightbox.media_type === "video" ? (
            <video
              src={lightbox.media_url}
              className="max-h-full max-w-full rounded-lg"
              controls
              autoPlay
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lightbox.media_url}
              alt="Event media"
              className="max-h-full max-w-full rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </>
  );
}
