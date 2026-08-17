"use client";

import { useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { TEAMS } from "@/lib/constants";
import type { Profile } from "@/lib/types";

// A lighter sibling to ProfileGate, for someone who already fully signed
// up before the Aug 2026 team-list trim (name, upline, everything else
// already on file) and just needs to re-pick their team from the
// trimmed list. ProfileGate's full "Finish your profile" form - upline
// account number, new-vs-existing-business question, spouse email - was
// confusing people into thinking they had to redo their whole signup
// for a one-field change (real feedback: "this is too confusing").
// Shown instead of ProfileGate whenever everything else is already on
// file and only team_confirmed_at is missing - see the hasInitialProfile
// / nameTeamComplete split in components/AuthGate.tsx.
export default function TeamReconfirmGate({
  user,
  profile,
  onComplete,
}: {
  user: User;
  profile: Profile;
  onComplete: () => void;
}) {
  const [team, setTeam] = useState(
    profile.team && (TEAMS as readonly string[]).includes(profile.team) ? profile.team : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!team) return;
    setError(null);
    setSaving(true);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ team, team_confirmed_at: new Date().toISOString() })
      .eq("id", user.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onComplete();
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs space-y-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-white">Confirm your team</p>
          <p className="text-sm text-slate-400">
            The team list changed - just double-check you&apos;re still on the right one.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-3">
          <select required className="select" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="" disabled>
              Select your team…
            </option>
            {TEAMS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button className="btn-primary w-full" disabled={saving || !team}>
            {saving ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
