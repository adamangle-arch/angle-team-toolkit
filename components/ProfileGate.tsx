"use client";

import { useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { fireNotifyEvent } from "@/lib/notifyClient";
import { TEAMS, ONBOARDING_SESSIONS, isPrimaryUser } from "@/lib/constants";

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
  // Whether First 30 Days Onboarding should actually gate this account -
  // it's meant for someone brand new, not a rollout of an already-active
  // team onto the app, so this is asked up front instead of an admin
  // having to manually unlock every existing person one at a time.
  const [startStatus, setStartStatus] = useState<"new" | "existing" | "">("");
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
    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !team ||
      (!isAdmin && !uplineNumber.trim()) ||
      (!isAdmin && !startStatus)
    ) {
      return;
    }
    setError(null);
    setSaving(true);

    // Admins are always fully unlocked regardless of this column (see
    // AuthGate's isAdmin check), so this only actually matters for
    // everyone else - someone already active on the team transitioning to
    // the app skips First 30 Days Onboarding entirely instead of an
    // admin/upline having to unlock all 5 sessions for them by hand.
    const skipOnboarding = !isAdmin && startStatus === "existing";

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        team,
        ...(skipOnboarding
          ? {
              onboarding_unlocked_through: ONBOARDING_SESSIONS.length,
              onboarding_completed_at: new Date().toISOString(),
            }
          : {}),
      })
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
      // Only fired from this one-time signup gate, never from My Profile's
      // own "re-link my upline" field - that one's a self-service edit
      // someone might use any time (fixing a typo, changing sponsors), not
      // a new-person-joined-the-team event.
      fireNotifyEvent({ kind: "downline_signup_linked", firstName: firstName.trim(), lastName: lastName.trim() });
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

          {!isAdmin && (
            <div className="space-y-1.5 rounded-xl border border-white/10 bg-navy/60 p-3">
              <p className="text-sm font-medium text-slate-200">
                Did you just get your Amway business launched within the last 30 days, or are you
                already active and just transitioning to the app?
              </p>
              <p className="text-xs text-slate-500">
                We ask so the app knows whether to walk you through First 30 Days Onboarding — it&apos;s
                built for someone brand new, so if you&apos;re already active it&apos;ll just get in
                your way. Answering &quot;already active&quot; skips it and unlocks the whole app right
                away.
              </p>
              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  className={startStatus === "new" ? "toggle-pill-active" : "toggle-pill-inactive"}
                  onClick={() => setStartStatus("new")}
                >
                  Launched in the last 30 days
                </button>
                <button
                  type="button"
                  className={startStatus === "existing" ? "toggle-pill-active" : "toggle-pill-inactive"}
                  onClick={() => setStartStatus("existing")}
                >
                  Already active, transitioning
                </button>
              </div>
            </div>
          )}

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
            disabled={
              saving ||
              !firstName.trim() ||
              !lastName.trim() ||
              !team ||
              (!isAdmin && !uplineNumber.trim()) ||
              (!isAdmin && !startStatus)
            }
          >
            {saving ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
