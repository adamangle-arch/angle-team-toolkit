"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";

type InviteInfo = {
  candidate_name: string;
  inviter_first_name: string | null;
  inviter_last_name: string | null;
  already_linked: boolean;
};

export default function LoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Candidate accounts: a shareable invite link (Candidate Roadmap ->
  // "Invite to App") carries ?candidate=<id>, read once on mount since
  // this form only ever mounts client-side (behind AuthGate's signed-out
  // check) - no SSR/hydration concern with reading window directly here.
  const [candidateId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("candidate");
  });
  const [invite, setInvite] = useState<InviteInfo | null>(null);

  useEffect(() => {
    if (!candidateId) return;
    let cancelled = false;
    async function loadInvite() {
      const { data } = await supabase
        .rpc("get_candidate_invite_info", { p_candidate_id: candidateId })
        .maybeSingle();
      if (!cancelled) setInvite((data as InviteInfo) ?? null);
    }
    loadInvite();
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  const inviterName = invite
    ? [invite.inviter_first_name, invite.inviter_last_name].filter(Boolean).join(" ") || "Someone"
    : null;
  const inviteAlreadyUsed = Boolean(invite?.already_linked);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options:
          candidateId && !inviteAlreadyUsed ? { data: { candidate_id: candidateId } } : undefined,
      });
      if (error) {
        setError(error.message);
      } else if (!data.session) {
        setInfo("Check your email to confirm your account, then sign in.");
      }
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs space-y-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-white">Angle Team Toolkit</p>
          <p className="text-sm text-slate-400">
            {mode === "signin" ? "Sign in to your account" : "Create your account"}
          </p>
        </div>

        {candidateId && invite && !inviteAlreadyUsed && (
          <div className="card space-y-1 text-center !border-amber bg-amber/10">
            <p className="text-sm font-medium text-white">
              👋 {inviterName} invited you to check out some resources
            </p>
            <p className="text-xs text-slate-400">
              Create an account below — you&apos;ll get access to team resources right away, and
              the rest unlocks once you&apos;re launched.
            </p>
          </div>
        )}
        {candidateId && invite && inviteAlreadyUsed && (
          <div className="card space-y-1 text-center">
            <p className="text-xs text-slate-400">
              This invite link has already been used — sign in below, or ask for a new link.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="card space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            className="input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={6}
            className="input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          {info && <p className="text-xs text-amber-light">{info}</p>}
          <button className="btn-primary w-full" disabled={loading}>
            {mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <button
          className="w-full text-center text-xs text-slate-400"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
