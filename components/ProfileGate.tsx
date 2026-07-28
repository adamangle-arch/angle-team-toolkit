"use client";

import { useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { TEAMS, isPrimaryUser } from "@/lib/constants";

export default function ProfileGate({
  user,
  onComplete,
}: {
  user: User;
  onComplete: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [team, setTeam] = useState("");
  const [uplineNumber, setUplineNumber] = useState("");
  const [spouseEmail, setSpouseEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Admins aren't sponsored by anyone on the team, so they shouldn't be
  // blocked from finishing signup without an upline account number - they
  // can still link one if they want (e.g. an admin who's also building
  // their own downline), it's just not required for them the way it is
  // for everyone else.
  const isAdmin = isPrimaryUser(user.email);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !team || (!isAdmin && !uplineNumber.trim())) return;
    setError(null);
    setSaving(true);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ first_name: firstName.trim(), last_name: lastName.trim(), team })
      .eq("id", user.id);

    if (profileError) {
      setSaving(false);
      setError(profileError.message);
      return;
    }

    // Required for everyone except admins - every other new signup has to
    // be sponsored by someone already in the business, so this is how the
    // sponsorship tree (upline visibility, Team tab) gets built from day
    // one instead of being an easy-to-skip self-service step people
    // forgot to do.
    const trimmedUpline = uplineNumber.trim();
    if (trimmedUpline) {
      const { error: uplineError } = await supabase.rpc("link_upline", {
        p_account_number: trimmedUpline,
      });
      if (uplineError) {
        setSaving(false);
        setError(`Upline account number: ${uplineError.message}`);
        return;
      }
    }

    // Optional - not everyone has a spouse also on the team, but if they
    // typed an email in here they mean it, so a bad one should still be
    // caught now rather than silently doing nothing.
    const email = spouseEmail.trim();
    if (email) {
      const { error: spouseError } = await supabase.rpc("link_spouse", { p_partner_email: email });
      if (spouseError) {
        setSaving(false);
        setError(`Spouse email: ${spouseError.message}`);
        return;
      }
    }

    setSaving(false);
    onComplete();
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs space-y-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-white">Finish your profile</p>
          <p className="text-sm text-slate-400">
            One-time setup so your activity counts toward the right team.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-3">
          <input
            type="text"
            required
            autoComplete="given-name"
            className="input"
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <input
            type="text"
            required
            autoComplete="family-name"
            className="input"
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
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
          <input
            type="text"
            required={!isAdmin}
            inputMode="numeric"
            className="input"
            placeholder={isAdmin ? "Your upline's account number (optional)" : "Your upline's account number"}
            value={uplineNumber}
            onChange={(e) => setUplineNumber(e.target.value)}
          />
          <p className="-mt-1.5 text-xs text-slate-500">
            {isAdmin
              ? "Optional for admins — leave blank if you weren't sponsored by someone on the team."
              : "Ask whoever brought you in for their account number — find it on their My Profile page."}
          </p>
          <input
            type="email"
            autoComplete="off"
            className="input"
            placeholder="Spouse's email (only if they're also on the team)"
            value={spouseEmail}
            onChange={(e) => setSpouseEmail(e.target.value)}
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            className="btn-primary w-full"
            disabled={saving || !firstName.trim() || !lastName.trim() || !team || (!isAdmin && !uplineNumber.trim())}
          >
            {saving ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
