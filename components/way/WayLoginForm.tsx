"use client";

import { useState, type FormEvent } from "react";
import { waySupabase } from "@/lib/way/supabaseClient";

export default function WayLoginForm() {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    if (mode === "signin") {
      const { error } = await waySupabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else if (mode === "signup") {
      const { data, error } = await waySupabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else if (!data.session) {
        setInfo("Check your email to confirm your account, then sign in.");
      }
    } else {
      const { error } = await waySupabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/the-way`,
      });
      if (error) {
        setError(error.message);
      } else {
        setInfo("If that email has an account, a reset link is on its way.");
      }
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs space-y-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-white">The Way</p>
          <p className="text-sm text-slate-400">
            {mode === "signin" && "Sign in to continue your courses"}
            {mode === "signup" && "Create your account"}
            {mode === "forgot" && "Reset your password"}
          </p>
        </div>

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
          {mode !== "forgot" && (
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
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {info && <p className="text-xs text-amber-light">{info}</p>}
          <button className="btn-primary w-full" disabled={loading}>
            {mode === "signin" && "Sign In"}
            {mode === "signup" && "Create Account"}
            {mode === "forgot" && (loading ? "Sending…" : "Send Reset Link")}
          </button>
        </form>

        {mode === "signin" && (
          <button
            className="w-full text-center text-xs text-slate-400"
            onClick={() => {
              setMode("forgot");
              setError(null);
              setInfo(null);
            }}
          >
            Forgot password?
          </button>
        )}

        <button
          className="w-full text-center text-xs text-slate-400"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
        >
          {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Sign up"}
        </button>
      </div>
    </div>
  );
}
