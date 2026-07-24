"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Profile } from "@/lib/types";

type FormFields = {
  photo_url: string | null;
  hometown: string;
  background: string;
  favorite_audio_1: string;
  favorite_audio_2: string;
  favorite_audio_3: string;
  favorite_book_1: string;
  favorite_book_2: string;
  favorite_book_3: string;
  team_impact: string;
};

function toFields(profile: Profile): FormFields {
  return {
    photo_url: profile.photo_url,
    hometown: profile.hometown ?? "",
    background: profile.background ?? "",
    favorite_audio_1: profile.favorite_audio_1 ?? "",
    favorite_audio_2: profile.favorite_audio_2 ?? "",
    favorite_audio_3: profile.favorite_audio_3 ?? "",
    favorite_book_1: profile.favorite_book_1 ?? "",
    favorite_book_2: profile.favorite_book_2 ?? "",
    favorite_book_3: profile.favorite_book_3 ?? "",
    team_impact: profile.team_impact ?? "",
  };
}

export default function ProfileForm({
  userId,
  profile,
  onDone,
  showSkip,
}: {
  userId: string;
  profile: Profile;
  onDone: () => void;
  showSkip?: boolean;
}) {
  const [fields, setFields] = useState<FormFields>(toFields(profile));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userId}/photo.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    set("photo_url", `${data.publicUrl}?t=${Date.now()}`);
    setUploading(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase
      .from("profiles")
      .update({ ...fields, profile_prompted: true })
      .eq("id", userId);
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    onDone();
  }

  async function handleSkip() {
    setSaving(true);
    await supabase.from("profiles").update({ profile_prompted: true }).eq("id", userId);
    setSaving(false);
    onDone();
  }

  return (
    <div className="space-y-3">
      <div className="card flex items-center gap-3">
        {fields.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fields.photo_url}
            alt="Profile photo"
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-navy text-2xl">
            🙂
          </div>
        )}
        <label className="btn-secondary cursor-pointer">
          {uploading ? "Uploading…" : "Upload Photo"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
            disabled={uploading}
          />
        </label>
      </div>

      <div className="card space-y-2">
        <p className="section-title">Hometown</p>
        <input
          className="input"
          placeholder="Where are you from?"
          value={fields.hometown}
          onChange={(e) => set("hometown", e.target.value)}
        />
      </div>

      <div className="card space-y-2">
        <p className="section-title">Background</p>
        <textarea
          className="textarea"
          placeholder="A little about you…"
          value={fields.background}
          onChange={(e) => set("background", e.target.value)}
        />
      </div>

      <div className="card space-y-2">
        <p className="section-title">Top 3 Favorite Audios</p>
        <input
          className="input"
          placeholder="1."
          value={fields.favorite_audio_1}
          onChange={(e) => set("favorite_audio_1", e.target.value)}
        />
        <input
          className="input"
          placeholder="2."
          value={fields.favorite_audio_2}
          onChange={(e) => set("favorite_audio_2", e.target.value)}
        />
        <input
          className="input"
          placeholder="3."
          value={fields.favorite_audio_3}
          onChange={(e) => set("favorite_audio_3", e.target.value)}
        />
      </div>

      <div className="card space-y-2">
        <p className="section-title">Top 3 Favorite Books</p>
        <input
          className="input"
          placeholder="1."
          value={fields.favorite_book_1}
          onChange={(e) => set("favorite_book_1", e.target.value)}
        />
        <input
          className="input"
          placeholder="2."
          value={fields.favorite_book_2}
          onChange={(e) => set("favorite_book_2", e.target.value)}
        />
        <input
          className="input"
          placeholder="3."
          value={fields.favorite_book_3}
          onChange={(e) => set("favorite_book_3", e.target.value)}
        />
      </div>

      <div className="card space-y-2">
        <p className="section-title">How has this team impacted you?</p>
        <textarea
          className="textarea"
          placeholder="One thing being around this team has done for you positively…"
          value={fields.team_impact}
          onChange={(e) => set("team_impact", e.target.value)}
        />
      </div>

      {error && <p className="px-1 text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        {showSkip && (
          <button className="btn-secondary flex-1" onClick={handleSkip} disabled={saving}>
            Skip for now
          </button>
        )}
        <button className="btn-primary flex-1" onClick={handleSave} disabled={saving || uploading}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
