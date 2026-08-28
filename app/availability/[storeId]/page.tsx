"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { MapPin, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { PublicStoreAvailability } from "@/lib/types";

// The link included in outreach emails: no account, works for anyone
// it's sent to - same "public, unauthenticated view" pattern as
// /prospect, bypassed past the sign-in wall in components/AuthGate.tsx.
export default function AvailabilityPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = use(params);
  const [stores, setStores] = useState<PublicStoreAvailability[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase.rpc("get_public_store_availability", { p_store_id: storeId });
      if (cancelled) return;
      if (error) {
        setLoadError("Couldn't load store availability.");
        return;
      }
      setStores((data as PublicStoreAvailability[]) ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!businessName.trim()) {
      setSubmitError("Business name is required.");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setSubmitError("Enter an email or phone number so we can reach you.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const { error } = await supabase.rpc("submit_ad_interest", {
      p_store_id: storeId,
      p_business_name: businessName.trim(),
      p_contact_name: contactName.trim(),
      p_email: email.trim(),
      p_phone: phone.trim(),
      p_message: message.trim(),
    });
    setSubmitting(false);
    if (error) {
      setSubmitError(error.message);
      return;
    }
    setSubmitted(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8">
      <div className="mb-6 text-center">
        <p className="text-2xl font-extrabold text-white">Checkout-TV Ad Space Near You</p>
        <p className="mt-1 text-sm text-slate-400">
          Reach every shopper checking out - see what&apos;s open at grocery stores in your area.
        </p>
      </div>

      {loadError && <p className="text-center text-sm text-red-300">{loadError}</p>}

      {stores === null && !loadError ? (
        <p className="text-center text-sm text-slate-400">Loading…</p>
      ) : stores && stores.length === 0 ? (
        <p className="text-center text-sm text-slate-400">No store availability to show right now.</p>
      ) : (
        <div className="space-y-2">
          {stores?.map((store) => (
            <div key={store.id} className="card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate font-semibold text-white">
                  <MapPin className="h-4 w-4 shrink-0 text-amber-light" strokeWidth={2} aria-hidden />
                  {store.name}
                </p>
                <p className="truncate text-xs text-slate-400">{store.address}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-extrabold text-amber-light">{store.spaces_available}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">spaces open</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card mt-6 space-y-3">
        {submitted ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-amber-light" strokeWidth={2} aria-hidden />
            <p className="font-semibold text-white">Thanks - we&apos;ll be in touch.</p>
            <p className="text-sm text-slate-400">We got your info and will reach out about available spaces.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-2">
            <p className="section-title">Interested? Let us know.</p>
            <input
              className="input"
              placeholder="Business name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
            <input
              className="input"
              placeholder="Your name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
            <input
              className="input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input className="input" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <textarea
              className="textarea min-h-16"
              placeholder="Anything else we should know? (optional)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            {submitError && <p className="text-xs text-red-300">{submitError}</p>}
            <button className="btn-primary w-full" disabled={submitting}>
              {submitting ? "Sending…" : "I'm Interested"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
