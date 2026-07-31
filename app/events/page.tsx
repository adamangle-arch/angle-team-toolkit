"use client";

import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { isPrimaryUser } from "@/lib/constants";
import { formatDateLabel } from "@/lib/dates";
import type { TeamEventAlbum, EventMedia } from "@/lib/types";

// crypto.randomUUID() needs a secure context and isn't available in
// every mobile browser/in-app webview - falling back avoids a thrown
// exception mid-upload leaving the "Uploading..." button stuck forever
// with no error shown.
// Selecting a big batch at once (especially with videos) is what makes
// the iOS Photos picker hang - capping it here keeps each upload quick
// and gives a clear message instead of a slow, uncertain wait. Videos
// are much bigger than photos, so they get a tighter cap.
const MAX_PHOTOS_PER_UPLOAD = 5;
const MAX_VIDEOS_PER_UPLOAD = 1;

function uniqueId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Phone camera photos routinely run 3-8MB each - over LTE that's what
// actually made a 5-photo batch feel like it uploaded "forever". Resizing
// to a sane max dimension and re-encoding as JPEG before it ever leaves
// the device cuts that by 80-90% in the common case. Falls back to the
// original file untouched if decoding fails (e.g. an unsupported format)
// or the "compressed" result would somehow be bigger.
const MAX_UPLOAD_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;

async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function EventsPage() {
  const { user, ownerId } = useAuth();
  const isAdmin = isPrimaryUser(user.email);

  const [albums, setAlbums] = useState<TeamEventAlbum[]>([]);
  const [mediaByAlbum, setMediaByAlbum] = useState<Record<string, EventMedia[]>>({});
  const [attendedAlbumIds, setAttendedAlbumIds] = useState<Set<string>>(new Set());
  const [markingAttendedFor, setMarkingAttendedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [newTitle, setNewTitle] = useState("");
  const [createAlbumError, setCreateAlbumError] = useState<string | null>(null);
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [creatingAlbum, setCreatingAlbum] = useState(false);

  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<"photo" | "video" | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ albumId: string; index: number } | null>(null);
  const touchStartX = useRef<number | null>(null);

  const lightboxItems = lightbox ? (mediaByAlbum[lightbox.albumId] ?? []) : [];
  const lightboxMedia = lightbox ? lightboxItems[lightbox.index] : null;

  // Wraps around both ends so a swipe/tap past the last photo loops back
  // to the first instead of doing nothing.
  function showRelative(delta: number) {
    setLightbox((prev) => {
      if (!prev) return prev;
      const items = mediaByAlbum[prev.albumId] ?? [];
      if (items.length === 0) return prev;
      const nextIndex = (prev.index + delta + items.length) % items.length;
      return { albumId: prev.albumId, index: nextIndex };
    });
  }

  const SWIPE_THRESHOLD_PX = 50;

  function handleLightboxTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleLightboxTouchEnd(e: React.TouchEvent) {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null) return;
    const deltaX = e.changedTouches[0].clientX - startX;
    if (deltaX > SWIPE_THRESHOLD_PX) showRelative(-1);
    else if (deltaX < -SWIPE_THRESHOLD_PX) showRelative(1);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: albumRows }, { data: mediaRows }, { data: attendanceRows }] = await Promise.all([
        supabase.from("team_event_albums").select("*").order("event_date", { ascending: false }),
        supabase.from("event_media").select("*").order("created_at", { ascending: false }),
        supabase.from("event_attendances").select("album_id").eq("user_id", ownerId),
      ]);
      setAlbums((albumRows as TeamEventAlbum[]) ?? []);
      const grouped: Record<string, EventMedia[]> = {};
      for (const media of (mediaRows as EventMedia[]) ?? []) {
        (grouped[media.album_id] ??= []).push(media);
      }
      setMediaByAlbum(grouped);
      setAttendedAlbumIds(
        new Set(((attendanceRows as { album_id: string }[]) ?? []).map((r) => r.album_id))
      );
      setLoading(false);
    }
    load();
  }, [ownerId]);

  async function markAttended(albumId: string) {
    setMarkingAttendedFor(albumId);
    await supabase.from("event_attendances").insert({ user_id: ownerId, album_id: albumId });
    setAttendedAlbumIds((prev) => new Set(prev).add(albumId));
    setMarkingAttendedFor(null);
  }

  async function createAlbum() {
    const title = newTitle.trim();
    if (!title) return;
    setCreatingAlbum(true);
    setCreateAlbumError(null);
    const { data, error } = await supabase
      .from("team_event_albums")
      .insert({ title, event_date: newDate, created_by: user.id })
      .select("*")
      .single();
    if (error) {
      setCreateAlbumError(error.message);
    } else if (data) {
      setAlbums((prev) => [data as TeamEventAlbum, ...prev]);
      setNewTitle("");
    }
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

  async function uploadOne(
    albumId: string,
    file: File
  ): Promise<{ ok: true; row: EventMedia } | { ok: false; error: string }> {
    try {
      const isVideo = file.type.startsWith("video/");
      const toUpload = isVideo ? file : await compressImage(file);
      const ext = isVideo ? file.name.split(".").pop() || "mp4" : "jpg";
      const path = `${albumId}/${uniqueId()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("event-media").upload(path, toUpload);
      if (uploadErr) return { ok: false, error: `${file.name}: ${uploadErr.message}` };
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
      if (insertErr) return { ok: false, error: `${file.name}: ${insertErr.message}` };
      return { ok: true, row: row as EventMedia };
    } catch (err) {
      return { ok: false, error: `${file.name}: ${err instanceof Error ? err.message : "Upload failed."}` };
    }
  }

  async function uploadMedia(albumId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const isVideoBatch = files[0].type.startsWith("video/");
    const max = isVideoBatch ? MAX_VIDEOS_PER_UPLOAD : MAX_PHOTOS_PER_UPLOAD;
    if (files.length > max) {
      setUploadError(
        isVideoBatch
          ? `Select ${max} video at a time (you picked ${files.length}) — videos are large and can make the picker hang.`
          : `Select ${max} or fewer at a time (you picked ${files.length}) — large batches can make the picker hang.`
      );
      return;
    }
    setUploadingFor(albumId);
    setUploadType(isVideoBatch ? "video" : "photo");
    setUploadError(null);

    const fileArray = Array.from(files);
    setUploadProgress({ done: 0, total: fileArray.length });

    // Photos are compressed down to a small size first, so uploading the
    // whole batch in parallel finishes faster than one-at-a-time - a
    // single video just runs on its own either way.
    const results = await Promise.all(
      fileArray.map(async (file) => {
        const result = await uploadOne(albumId, file);
        setUploadProgress((prev) => (prev ? { done: prev.done + 1, total: prev.total } : prev));
        return result;
      })
    );

    const uploaded = results.filter((r) => r.ok).map((r) => r.row);
    const errors = results.filter((r) => !r.ok).map((r) => r.error);

    if (uploaded.length > 0) {
      setMediaByAlbum((prev) => ({
        ...prev,
        [albumId]: [...uploaded, ...(prev[albumId] ?? [])],
      }));
    }
    if (errors.length > 0) setUploadError(errors.join(" "));
    setUploadingFor(null);
    setUploadType(null);
    setUploadProgress(null);
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
            {createAlbumError && <p className="text-xs text-red-400">{createAlbumError}</p>}
          </div>
        )}

        {loading ? (
          <SkeletonList cards={3} lines={1} />
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
                  {attendedAlbumIds.has(album.id) ? (
                    <span className="pill-amber shrink-0 text-xs">✅ You were there</span>
                  ) : (
                    <button
                      className="btn-secondary shrink-0 text-xs"
                      onClick={() => markAttended(album.id)}
                      disabled={markingAttendedFor === album.id}
                    >
                      {markingAttendedFor === album.id ? "Marking…" : "📸 I Was There"}
                    </button>
                  )}
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
                  <p className="text-sm text-slate-400">
                    {isAdmin
                      ? "No photos or videos yet — add some below."
                      : "No photos or videos yet — check back after the event."}
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {media.map((item, index) => (
                      <div key={item.id} className="group relative aspect-square">
                        <button
                          onClick={() => setLightbox({ albumId: album.id, index })}
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
                    <p className="text-xs text-slate-500">
                      Up to {MAX_PHOTOS_PER_UPLOAD} photos or {MAX_VIDEOS_PER_UPLOAD} video at a
                      time.
                    </p>
                    <div className="flex gap-2">
                      <label className="btn-secondary flex-1 cursor-pointer text-center">
                        {uploadingFor === album.id && uploadType === "photo"
                          ? uploadProgress
                            ? `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
                            : "Uploading…"
                          : "📷 Add Photos"}
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
                        {uploadingFor === album.id && uploadType === "video" ? "Uploading…" : "🎥 Add Video"}
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          disabled={uploadingFor === album.id}
                          onChange={(e) => {
                            uploadMedia(album.id, e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    {uploadingFor === album.id && uploadType === "photo" && (
                      <p className="text-xs text-slate-500">
                        Compressing and uploading — large photos are resized first to keep this quick.
                      </p>
                    )}
                    {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>

      {lightboxMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
          onTouchStart={handleLightboxTouchStart}
          onTouchEnd={handleLightboxTouchEnd}
        >
          <button
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white"
            onClick={() => setLightbox(null)}
            aria-label="Close"
          >
            ✕
          </button>

          {lightboxItems.length > 1 && (
            <>
              <span className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
                {lightbox!.index + 1} / {lightboxItems.length}
              </span>
              <button
                className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-xl text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  showRelative(-1);
                }}
                aria-label="Previous"
              >
                ‹
              </button>
              <button
                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-xl text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  showRelative(1);
                }}
                aria-label="Next"
              >
                ›
              </button>
            </>
          )}

          {lightboxMedia.media_type === "video" ? (
            <video
              key={lightboxMedia.id}
              src={lightboxMedia.media_url}
              className="max-h-full max-w-full rounded-lg"
              controls
              autoPlay
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={lightboxMedia.id}
              src={lightboxMedia.media_url}
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
