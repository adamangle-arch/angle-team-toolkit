"use client";

import { useState, type FormEvent } from "react";
import { waySupabase } from "@/lib/way/supabaseClient";

// Shown by WayAuthGate when someone arrives from a "Forgot password?"
// email. By then supabase-js has already turned the link's token into a
// short-lived recovery session (hasSession). No session means the link
// was invalid, expired, or already used.
export default function WayResetPasswordForm({
  hasSession,
  onDone,
}: {
  hasSession: boolean;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    const { error } = await waySupabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    setTimeout(onDone, 1400);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs space-y-5">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed local asset, not user content; next/image's remote-loader config isn't needed here. */}
          <img
            src="/the-way/legacy-church-logo-light.png"
            alt="Legacy Church Abingdon"
            className="mx-auto mb-3 h-auto w-44"
          />
          <p className="way-wordmark text-3xl" style={{ color: "var(--way-text)" }}>
            The Way
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--way-text-dim)" }}>
            Choose a new password
          </p>
        </div>

        {saved ? (
          <p className="way-card text-center text-sm" style={{ color: "var(--way-accent)" }}>
            Password updated. Taking you in…
          </p>
        ) : !hasSession ? (
          <div className="way-card space-y-3 text-center">
            <p className="text-sm" style={{ color: "var(--way-text-dim)" }}>
              This reset link is invalid or has expired. Request a new one from the sign-in
              screen.
            </p>
            <button className="way-btn way-btn-primary w-full" onClick={onDone}>
              Back to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="way-card space-y-3">
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={6}
              className="way-input"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={6}
              className="way-input"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {error && (
              <p className="text-xs" style={{ color: "var(--way-danger)" }}>
                {error}
              </p>
            )}
            <button className="way-btn way-btn-primary w-full" disabled={saving}>
              {saving ? "Saving…" : "Save New Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
