"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { isPrimaryUser } from "@/lib/constants";
import type { CompanyEvent, EventPhoto } from "@/lib/types";

function formatEventLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function EventsPage() {
  const { user } = useAuth();
  const isAdmin = isPrimaryUser(user.email);

  const [events, setEvents] = useState<CompanyEvent[]>([]);
  const [photosByEvent, setPhotosByEvent] = useState<Record<string, EventPhoto[]>>({});
  const [loading, setLoading] = useState(true);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: eventRows }, { data: photoRows }] = await Promise.all([
        supabase.from("company_events").select("*").order("event_at", { ascending: false }),
        supabase.from("event_photos").select("*").order("created_at", { ascending: false }),
      ]);
      setEvents((eventRows as CompanyEvent[]) ?? []);
      const grouped: Record<string, EventPhoto[]> = {};
      for (const photo of (photoRows as EventPhoto[]) ?? []) {
        (grouped[photo.company_event_id] ??= []).push(photo);
      }
      setPhotosByEvent(grouped);
      setLoading(false);
    }
    load();
  }, []);

  async function uploadPhotos(eventId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingFor(eventId);
    setUploadError(null);

    const uploaded: EventPhoto[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${eventId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("event-photos").upload(path, file);
      if (uploadErr) {
        setUploadError(uploadErr.message);
        continue;
      }
      const { data: pub } = supabase.storage.from("event-photos").getPublicUrl(path);
      const { data: row } = await supabase
        .from("event_photos")
        .insert({
          company_event_id: eventId,
          storage_path: path,
          photo_url: pub.publicUrl,
          uploaded_by: user.id,
        })
        .select("*")
        .single();
      if (row) uploaded.push(row as EventPhoto);
    }

    if (uploaded.length > 0) {
      setPhotosByEvent((prev) => ({
        ...prev,
        [eventId]: [...uploaded, ...(prev[eventId] ?? [])],
      }));
    }
    setUploadingFor(null);
  }

  async function deletePhoto(photo: EventPhoto) {
    setPhotosByEvent((prev) => ({
      ...prev,
      [photo.company_event_id]: (prev[photo.company_event_id] ?? []).filter((p) => p.id !== photo.id),
    }));
    await supabase.storage.from("event-photos").remove([photo.storage_path]);
    await supabase.from("event_photos").delete().eq("id", photo.id);
  }

  return (
    <>
      <PageHeader title="Team Events" subtitle="Photos from our team events" />
      <main className="page-main">
        {isAdmin && (
          <p className="px-1 text-xs text-slate-500">
            Manage event titles/dates from the Calendar tab&apos;s Team Events section — add photos
            to any of them right here.
          </p>
        )}

        {loading ? (
          <div className="empty-state">Loading events…</div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            No team events yet
            {isAdmin ? " — add one from the Calendar tab's Team Events section." : "."}
          </div>
        ) : (
          events.map((event) => {
            const photos = photosByEvent[event.id] ?? [];
            return (
              <div key={event.id} className="card space-y-2">
                <div>
                  <p className="section-title">{event.title}</p>
                  <p className="text-xs text-amber-light">{formatEventLabel(event.event_at)}</p>
                  {event.notes && <p className="text-xs text-slate-400">{event.notes}</p>}
                </div>

                {photos.length === 0 ? (
                  <p className="text-sm text-slate-400">No photos yet.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {photos.map((photo) => (
                      <div key={photo.id} className="group relative aspect-square">
                        <button
                          onClick={() => setLightboxUrl(photo.photo_url)}
                          className="h-full w-full overflow-hidden rounded-lg bg-navy"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.photo_url}
                            alt={event.title}
                            className="h-full w-full object-cover"
                          />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => deletePhoto(photo)}
                            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-navy/80 text-xs text-white"
                            aria-label="Delete photo"
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
                    <label className="btn-secondary block w-full cursor-pointer text-center">
                      {uploadingFor === event.id ? "Uploading…" : "📷 Add Photos"}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        disabled={uploadingFor === event.id}
                        onChange={(e) => {
                          uploadPhotos(event.id, e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white"
            onClick={() => setLightboxUrl(null)}
            aria-label="Close"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Event photo"
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </>
  );
}
