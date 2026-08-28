"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Download, Trash2, Phone, Globe, MapPin, Plus, EyeOff } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { SkeletonList } from "@/components/Skeleton";
import { supabase } from "@/lib/supabaseClient";
import { LEAD_CATEGORIES, LEAD_STATUSES, isLeadsToolOwner } from "@/lib/constants";
import { getLeadsHiddenForDemo, setLeadsHiddenForDemo } from "@/lib/demoMode";
import type { Lead, DiscoveredBusiness } from "@/lib/types";

const RADIUS_OPTIONS = [5, 10, 15, 25];

function downloadCsv(leads: Lead[]) {
  const header = ["Business Name", "Category", "Address", "Phone", "Website", "Status", "Notes"];
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = leads.map((l) =>
    [l.business_name, l.category, l.address, l.phone, l.website, l.status, l.notes].map(escape).join(",")
  );
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function LeadsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isOwner = isLeadsToolOwner(user.email);

  useEffect(() => {
    if (!isOwner) router.replace("/home");
  }, [isOwner, router]);

  // See lib/demoMode.ts - a local-only switch to pull the Home tile for
  // this before showing the app to a prospect, flipped from the button
  // below rather than anywhere it'd need a round trip to Supabase.
  const [hiddenForDemo, setHiddenForDemo] = useState(false);
  useEffect(() => {
    function syncFromStorage() {
      setHiddenForDemo(getLeadsHiddenForDemo());
    }
    syncFromStorage();
  }, []);

  function hideForDemo() {
    setLeadsHiddenForDemo(true);
    router.push("/home");
  }

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [updateError, setUpdateError] = useState<string | null>(null);

  async function loadLeads() {
    setLoading(true);
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setLeads((data as Lead[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (!isOwner) return;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setLeads((data as Lead[]) ?? []);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  // --- Discover (Google Places search) ---
  const [searchAddress, setSearchAddress] = useState("");
  const [searchRadius, setSearchRadius] = useState(10);
  const [searchCategory, setSearchCategory] = useState<string>(LEAD_CATEGORIES[0].key);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [discoverResults, setDiscoverResults] = useState<DiscoveredBusiness[] | null>(null);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<Set<string>>(new Set());
  const [addingSelected, setAddingSelected] = useState(false);

  const existingPlaceIds = useMemo(
    () => new Set(leads.map((l) => l.google_place_id).filter((id): id is string => Boolean(id))),
    [leads]
  );

  async function runDiscover() {
    if (!searchAddress.trim()) {
      setDiscoverError("Enter an address or zip code to search near.");
      return;
    }
    setDiscovering(true);
    setDiscoverError(null);
    setDiscoverResults(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    try {
      const res = await fetch("/api/leads/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address: searchAddress.trim(), radiusMiles: searchRadius, category: searchCategory }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDiscoverError(data.error || "Search failed.");
        setDiscovering(false);
        return;
      }
      const results = (data.results as DiscoveredBusiness[]) ?? [];
      setDiscoverResults(results);
      setSelectedPlaceIds(new Set(results.filter((r) => !existingPlaceIds.has(r.google_place_id)).map((r) => r.google_place_id)));
    } catch {
      setDiscoverError("Search failed - check your connection and try again.");
    }
    setDiscovering(false);
  }

  function toggleSelected(placeId: string) {
    setSelectedPlaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  }

  async function addSelectedToLeads() {
    if (!discoverResults || selectedPlaceIds.size === 0) return;
    setAddingSelected(true);
    const rows = discoverResults
      .filter((r) => selectedPlaceIds.has(r.google_place_id))
      .map((r) => ({
        user_id: user.id,
        business_name: r.business_name,
        category: r.category,
        address: r.address,
        phone: r.phone,
        website: r.website,
        lat: r.lat,
        lng: r.lng,
        google_place_id: r.google_place_id,
      }));
    const { error } = await supabase.from("leads").upsert(rows, { onConflict: "user_id,google_place_id", ignoreDuplicates: true });
    setAddingSelected(false);
    if (error) {
      setDiscoverError(error.message);
      return;
    }
    setDiscoverResults(null);
    setSelectedPlaceIds(new Set());
    setSearchAddress("");
    loadLeads();
  }

  // --- Manual add ---
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualCategory, setManualCategory] = useState<string>(LEAD_CATEGORIES[0].label);
  const [manualAddress, setManualAddress] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualWebsite, setManualWebsite] = useState("");
  const [manualAdding, setManualAdding] = useState(false);

  async function addManualLead() {
    const name = manualName.trim();
    if (!name) return;
    setManualAdding(true);
    const { data, error } = await supabase
      .from("leads")
      .insert({
        user_id: user.id,
        business_name: name,
        category: manualCategory,
        address: manualAddress.trim(),
        phone: manualPhone.trim(),
        website: manualWebsite.trim(),
      })
      .select("*")
      .single();
    setManualAdding(false);
    if (error) {
      setUpdateError(error.message);
      return;
    }
    if (data) setLeads((prev) => [data as Lead, ...prev]);
    setManualName("");
    setManualAddress("");
    setManualPhone("");
    setManualWebsite("");
    setManualOpen(false);
  }

  async function updateLead(id: string, patch: Partial<Lead>) {
    const previous = leads.find((l) => l.id === id);
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const { error } = await supabase
      .from("leads")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      if (previous) setLeads((prev) => prev.map((l) => (l.id === id ? previous : l)));
      setUpdateError(error.message);
    } else {
      setUpdateError(null);
    }
  }

  async function deleteLead(id: string) {
    const lead = leads.find((l) => l.id === id);
    if (lead && !window.confirm(`Delete ${lead.business_name}? This can't be undone.`)) return;
    const previous = leads;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) {
      setLeads(previous);
      setUpdateError(error.message);
    } else {
      setUpdateError(null);
    }
  }

  // --- Filters ---
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [textFilter, setTextFilter] = useState("");

  const filteredLeads = useMemo(() => {
    const text = textFilter.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (text && !l.business_name.toLowerCase().includes(text) && !l.address.toLowerCase().includes(text)) return false;
      return true;
    });
  }, [leads, statusFilter, textFilter]);

  if (!isOwner) return null;

  return (
    <>
      <PageHeader title="Ad Sales Leads" subtitle="Find and track local businesses for checkout-TV ads" />
      <main className="page-main">
        {hiddenForDemo ? (
          <div className="card flex items-center justify-between gap-3">
            <p className="text-xs text-slate-300">Hidden from the Home menu on this device.</p>
            <button
              className="chip-btn shrink-0"
              onClick={() => {
                setLeadsHiddenForDemo(false);
                setHiddenForDemo(false);
              }}
            >
              Unhide
            </button>
          </div>
        ) : (
          <button className="chip-btn flex w-fit items-center gap-1.5" onClick={hideForDemo}>
            <EyeOff className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            Hide before showing a prospect
          </button>
        )}

        <div className="card space-y-3">
          <p className="section-title">Find Businesses</p>
          <input
            className="input"
            placeholder="Address or zip code to search near"
            value={searchAddress}
            onChange={(e) => setSearchAddress(e.target.value)}
          />
          <div className="flex gap-2">
            <select className="select flex-1" value={searchRadius} onChange={(e) => setSearchRadius(Number(e.target.value))}>
              {RADIUS_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r} mi radius
                </option>
              ))}
            </select>
            <select className="select flex-1" value={searchCategory} onChange={(e) => setSearchCategory(e.target.value)}>
              {LEAD_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary w-full" onClick={runDiscover} disabled={discovering}>
            <Search className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            {discovering ? "Searching…" : "Search"}
          </button>
          {discoverError && <p className="text-xs text-red-300">{discoverError}</p>}

          {discoverResults && (
            <div className="space-y-2 border-t pt-3" style={{ borderColor: "rgb(var(--surface-rgb) / 0.1)" }}>
              {discoverResults.length === 0 ? (
                <p className="text-sm text-slate-400">No businesses found - try a different category or a wider radius.</p>
              ) : (
                <>
                  <p className="text-xs text-slate-400">
                    {discoverResults.length} found - {selectedPlaceIds.size} selected
                    {existingPlaceIds.size > 0 ? " (already-saved leads start unchecked)" : ""}
                  </p>
                  <div className="max-h-80 space-y-1.5 overflow-y-auto">
                    {discoverResults.map((r) => {
                      const alreadySaved = existingPlaceIds.has(r.google_place_id);
                      return (
                        <label
                          key={r.google_place_id}
                          className={`flex items-start gap-2 rounded-lg px-2.5 py-2 text-sm ${alreadySaved ? "opacity-50" : ""}`}
                          style={{ background: "rgb(var(--surface-rgb) / 0.04)" }}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={selectedPlaceIds.has(r.google_place_id)}
                            onChange={() => toggleSelected(r.google_place_id)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-white">
                              {r.business_name} {alreadySaved && <span className="text-xs font-normal text-slate-500">(already saved)</span>}
                            </p>
                            <p className="truncate text-xs text-slate-400">{r.address}</p>
                            <p className="text-xs text-slate-400">
                              {r.phone || "No phone listed"} {r.website ? "· has website" : "· no website"}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <button className="btn-primary w-full" onClick={addSelectedToLeads} disabled={addingSelected || selectedPlaceIds.size === 0}>
                    {addingSelected ? "Adding…" : `Add ${selectedPlaceIds.size} to Leads`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="card space-y-2">
          <button className="flex w-full items-center justify-between text-left" onClick={() => setManualOpen((o) => !o)}>
            <p className="section-title">Add a Lead Manually</p>
            <Plus className={`h-4 w-4 text-amber-light transition ${manualOpen ? "rotate-45" : ""}`} strokeWidth={2.5} aria-hidden />
          </button>
          {manualOpen && (
            <div className="space-y-2 pt-1">
              <input className="input" placeholder="Business name" value={manualName} onChange={(e) => setManualName(e.target.value)} />
              <select className="select" value={manualCategory} onChange={(e) => setManualCategory(e.target.value)}>
                {LEAD_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.label}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input className="input" placeholder="Address" value={manualAddress} onChange={(e) => setManualAddress(e.target.value)} />
              <input className="input" placeholder="Phone" value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} />
              <input className="input" placeholder="Website" value={manualWebsite} onChange={(e) => setManualWebsite(e.target.value)} />
              <button className="btn-primary w-full" onClick={addManualLead} disabled={manualAdding || !manualName.trim()}>
                {manualAdding ? "Adding…" : "Add Lead"}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="section-title">Leads ({filteredLeads.length})</p>
          <button className="chip-btn flex items-center gap-1" onClick={() => downloadCsv(filteredLeads)} disabled={filteredLeads.length === 0}>
            <Download className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            Export CSV
          </button>
        </div>

        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Search name or address"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
          />
          <select className="select flex-1" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {updateError && <p className="text-xs text-red-300">{updateError}</p>}

        {loading ? (
          <SkeletonList cards={3} lines={2} />
        ) : filteredLeads.length === 0 ? (
          <div className="empty-state">
            {leads.length === 0 ? "No leads yet - search above or add one manually." : "No leads match these filters."}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLeads.map((lead) => (
              <div key={lead.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-white">{lead.business_name}</p>
                    <p className="text-xs text-slate-400">{lead.category}</p>
                  </div>
                  <button className="btn-icon shrink-0" onClick={() => deleteLead(lead.id)} aria-label={`Delete ${lead.business_name}`}>
                    <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                </div>
                {lead.address && (
                  <p className="flex items-center gap-1.5 text-xs text-slate-300">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
                    {lead.address}
                  </p>
                )}
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-xs text-amber-light">
                    <Phone className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                    {lead.phone}
                  </a>
                )}
                {lead.website && (
                  <a href={lead.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 truncate text-xs text-amber-light">
                    <Globe className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                    {lead.website}
                  </a>
                )}
                <div className="flex gap-2 pt-1">
                  <select
                    className="select flex-1"
                    value={lead.status}
                    onChange={(e) => updateLead(lead.id, { status: e.target.value })}
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  className="textarea min-h-16"
                  placeholder="Notes - decision maker name, best time to call, etc."
                  defaultValue={lead.notes}
                  onBlur={(e) => {
                    if (e.target.value !== lead.notes) updateLead(lead.id, { notes: e.target.value });
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
