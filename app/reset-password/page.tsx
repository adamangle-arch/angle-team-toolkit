"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Standalone, like /prospect - AuthGate renders this page outside the
// normal sign-in wall (see the pathname check there) since arriving here
// means following an emailed reset link, not being already signed in.
// Supabase parses the recovery token out of the URL itself (supabase-js's
// default detectSessionInUrl behavior) and fires a PASSWORD_RECOVERY auth
// event once it's done, which is what actually unlocks the form below -
// checking getSession() alone on mount can race that parsing, so both are
// covered.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasRecoverySession(true);
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(true);
        setReady(true);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.replace("/"), 1500);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs space-y-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-white">Angle Team Toolkit</p>
          <p className="text-sm text-slate-400">Set a new password</p>
        </div>

        {!ready ? (
          <p className="text-center text-sm text-slate-400">Loading…</p>
        ) : done ? (
          <p className="card text-center text-sm text-amber-light">
            Password updated — taking you back in…
          </p>
        ) : !hasRecoverySession ? (
          <div className="card space-y-3 text-center">
            <p className="text-sm text-slate-400">
              This reset link is invalid or has expired. Request a new one from the sign-in
              screen.
            </p>
            <Link href="/" className="btn-secondary block w-full">
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-3">
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={6}
              className="input"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={6}
              className="input"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button className="btn-primary w-full" disabled={saving}>
              {saving ? "Updating…" : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
