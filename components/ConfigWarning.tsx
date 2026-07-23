"use client";

import { supabaseConfigured } from "@/lib/supabaseClient";

export default function ConfigWarning() {
  if (supabaseConfigured) return null;

  return (
    <div className="mx-4 mt-3 rounded-xl border border-amber/40 bg-amber/10 p-3 text-xs text-amber-light">
      Supabase isn&apos;t configured yet. Set{" "}
      <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
      <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your
      environment, then reload. Data won&apos;t save until this is set.
    </div>
  );
}
