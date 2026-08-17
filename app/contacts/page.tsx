"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { Lightbulb, Trophy, Upload, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import FeatureGate from "@/components/FeatureGate";
import { SkeletonList } from "@/components/Skeleton";
import { supabase } from "@/lib/supabaseClient";
import { CONTACT_STATUSES, CUSTOMER_STATUSES, CONNECTION_TAGS, RECONNECT_METHODS } from "@/lib/constants";
import { NETWORKING_MEMORY_PROMPTS, CUSTOMER_MEMORY_PROMPTS } from "@/lib/contact-questions-data";
import type { Contact } from "@/lib/types";

const LIST_TARGET = 100;
const LIST_MILESTONES: { threshold: number; dotColor?: string; trophy?: boolean }[] = [
  { threshold: 20, dotColor: "bg-emerald-400" },
  { threshold: 40, dotColor: "bg-amber-400" },
  { threshold: 60, dotColor: "bg-red-500" },
  { threshold: 80, dotColor: "bg-sky-400" },
  { threshold: 100, trophy: true },
];

type ViewMode = "networking" | "customer";

type PendingImport = { name: string; destination: "networking" | "customer" };

// Deliberately not a full RFC 4180 CSV parser (quoted fields with
// embedded commas, etc.) - this only needs to handle a plain list of
// names, one per line, or the first column of a simple export (e.g. a
// phone contacts CSV with Name/Email/Phone columns), which covers what
// anyone's actually going to paste in here. Takes the text before the
// first comma on each line, skips blank lines and a lone "name" header.
function parseContactNamesFromCsv(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(",")[0]?.trim() ?? "")
    .filter((name) => name.length > 0 && name.toLowerCase() !== "name");
}

export default function ContactsPage() {
  const { ownerId } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("networking");

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<"A" | "B">("A");
  const [newTags, setNewTags] = useState<string[]>([]);
  const [newReconnectMethod, setNewReconnectMethod] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // A bulk-uploaded list needs a review step before anything's saved -
  // unlike a manually-added contact (one at a time, destination already
  // chosen by whichever tab you're on), an upload dumps in a batch of
  // names with no way to know which belong on the Networking List vs the
  // Customer List, so each one gets its own toggle here before Import.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImports, setPendingImports] = useState<PendingImport[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be re-picked later if needed
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const names = parseContactNamesFromCsv(String(reader.result ?? ""));
      if (names.length === 0) {
        setImportError("Couldn't find any names in that file.");
        return;
      }
      setImportError(null);
      setPendingImports(names.map((name) => ({ name, destination: "networking" })));
    };
    reader.readAsText(file);
  }

  function updatePendingImport(index: number, patch: Partial<PendingImport>) {
    setPendingImports((prev) => prev && prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function removePendingImport(index: number) {
    setPendingImports((prev) => prev && prev.filter((_, i) => i !== index));
  }

  async function importPendingContacts() {
    if (!pendingImports || pendingImports.length === 0) return;
    setImporting(true);
    setImportError(null);
    const rows = pendingImports
      .filter((p) => p.name.trim())
      .map((p) => ({
        name: p.name.trim(),
        category: p.destination === "customer" ? "Customer" : "B",
        user_id: ownerId,
      }));
    const { data, error } = await supabase.from("contacts").insert(rows).select("*");
    setImporting(false);
    if (error) {
      setImportError(error.message);
      return;
    }
    setContacts((prev) => [...((data as Contact[]) ?? []), ...prev]);
    setPendingImports(null);
  }

  const [promptIndex, setPromptIndex] = useState(0);
  const activePrompts = viewMode === "customer" ? CUSTOMER_MEMORY_PROMPTS : NETWORKING_MEMORY_PROMPTS;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("contacts")
        .select("*")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false });
      setContacts((data as Contact[]) ?? []);
      setLoading(false);
    }
    load();
  }, [ownerId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPromptIndex((i) => (i + 1) % activePrompts.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [activePrompts]);

  function toggleTag(tag: string) {
    setNewTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function selectReconnectMethod(method: string) {
    setNewReconnectMethod((prev) => (prev === method ? "" : method));
  }

  async function addContact() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setAddError(null);
    const category = viewMode === "customer" ? "Customer" : newCategory;
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        name,
        category,
        user_id: ownerId,
        connection_tags: newTags,
        reconnect_method: newReconnectMethod,
      })
      .select("*")
      .single();
    if (error) {
      setAddError(error.message);
      setAdding(false);
      return;
    }
    if (data) setContacts((prev) => [data as Contact, ...prev]);
    setNewName("");
    setNewTags([]);
    setNewReconnectMethod("");
    setAdding(false);
  }

  async function updateContact(id: string, patch: Partial<Contact>) {
    const previous = contacts.find((c) => c.id === id);
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await supabase
      .from("contacts")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      // Revert - otherwise a failed status/tag change still shows as saved.
      if (previous) {
        setContacts((prev) => prev.map((c) => (c.id === id ? previous : c)));
      }
      setUpdateError(error.message);
    } else {
      setUpdateError(null);
    }
  }

  async function deleteContact(id: string) {
    const contact = contacts.find((c) => c.id === id);
    if (contact && !window.confirm(`Delete ${contact.name}? This can't be undone.`)) return;
    const previous = contacts;
    setContacts((prev) => prev.filter((c) => c.id !== id));
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) {
      // Revert - otherwise a failed delete still looks like it worked.
      setContacts(previous);
      setUpdateError(error.message);
    } else {
      setUpdateError(null);
    }
  }

  const networkingContacts = useMemo(
    () => contacts.filter((c) => c.category === "A" || c.category === "B"),
    [contacts]
  );
  const customerContacts = useMemo(
    () => contacts.filter((c) => c.category === "Customer"),
    [contacts]
  );
  const activeList = viewMode === "networking" ? networkingContacts : customerContacts;

  const contactedCount = activeList.filter((c) => c.status !== "Not yet asked").length;
  const remainingCount = activeList.length - contactedCount;

  const groupA = networkingContacts.filter((c) => c.category === "A");
  const groupB = networkingContacts.filter((c) => c.category === "B");

  const listPct = Math.min(100, (networkingContacts.length / LIST_TARGET) * 100);

  return (
    <FeatureGate minSession={2}>
      <PageHeader title="Contact Builder" subtitle="Build your list, one name at a time" />
      <main className="page-main">
        <div className="card flex p-1">
          <button
            className={viewMode === "networking" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setViewMode("networking")}
          >
            Networking List
          </button>
          <button
            className={viewMode === "customer" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setViewMode("customer")}
          >
            Customer List
          </button>
        </div>

        <p className="px-1 text-xs text-slate-500">
          <Lightbulb className="inline h-3 w-3 align-[-2px]" aria-hidden />{" "}
          {viewMode === "networking"
            ? "Networking prospects are typically in their 20s–30s."
            : "Customers are typically 35+, already spending money on a household."}{" "}
          Not a rigid rule — there are always exceptions, just the typical demographic.
        </p>

        {viewMode === "networking" && (
          <div className="card space-y-2">
            <p className="section-title">List Builder</p>
            <p className="text-xs text-slate-400">The goal: 100 names on your networking list.</p>
            <div className="pt-1">
              <div className="relative h-5 w-full rounded-full bg-white/10">
                <div
                  className="h-5 rounded-full transition-all duration-300"
                  style={{
                    width: `${listPct}%`,
                    background: "linear-gradient(135deg, var(--color-amber-light), var(--color-amber))",
                  }}
                />
                {[20, 40, 60, 80].map((mark) => (
                  <div
                    key={mark}
                    className="absolute inset-y-0 w-0.5 bg-white/40"
                    style={{ left: `${mark}%` }}
                  />
                ))}
              </div>
              <div className="relative mt-1 h-8 text-[10px] text-slate-400">
                {LIST_MILESTONES.map((m) => (
                  <div
                    key={m.threshold}
                    className="absolute flex -translate-x-1/2 flex-col items-center gap-0.5"
                    style={{ left: `${m.threshold}%` }}
                  >
                    {m.trophy ? (
                      <Trophy className="h-3 w-3" aria-hidden />
                    ) : (
                      <span className={`inline-block h-2 w-2 rounded-full ${m.dotColor}`} aria-hidden />
                    )}
                    <span>{m.threshold}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="flex items-center gap-1 pt-4 text-sm text-amber-light">
              {networkingContacts.length} / {LIST_TARGET} contacts
              {networkingContacts.length >= LIST_TARGET && (
                <Trophy className="h-3.5 w-3.5" aria-hidden />
              )}
            </p>
          </div>
        )}

        <div className="card grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-navy p-2">
            <p className="text-lg font-bold text-amber-light">{contactedCount}</p>
            <p className="text-[10px] text-slate-400">Contacted</p>
          </div>
          <div className="rounded-lg bg-navy p-2">
            <p className="text-lg font-bold text-amber-light">{remainingCount}</p>
            <p className="text-[10px] text-slate-400">Left to Contact</p>
          </div>
        </div>

        <div className="card space-y-2">
          <p className="section-title">Add Contact</p>
          <input
            className="input"
            placeholder={viewMode === "customer" ? "Customer name" : "Contact name"}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addContact()}
          />
          {viewMode === "networking" && (
            <div className="flex gap-2">
              <button
                className={`gap-1.5 ${
                  newCategory === "A" ? "toggle-pill-active flex-1" : "toggle-pill-inactive flex-1 bg-white/5"
                }`}
                onClick={() => setNewCategory("A")}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                A (Family/Friends)
              </button>
              <button
                className={`gap-1.5 ${
                  newCategory === "B" ? "toggle-pill-active flex-1" : "toggle-pill-inactive flex-1 bg-white/5"
                }`}
                onClick={() => setNewCategory("B")}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-sky-400" aria-hidden />
                B (Acquaintances)
              </button>
            </div>
          )}
          <p className="text-xs text-slate-500">How do you know them?</p>
          <div className="flex flex-wrap gap-2">
            {CONNECTION_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={
                  newTags.includes(tag)
                    ? "toggle-pill-active flex-none px-3"
                    : "toggle-pill-inactive flex-none bg-white/5 px-3"
                }
              >
                {tag}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">Best way to reconnect?</p>
          <div className="flex flex-wrap gap-2">
            {RECONNECT_METHODS.map((method) => (
              <button
                key={method}
                onClick={() => selectReconnectMethod(method)}
                className={
                  newReconnectMethod === method
                    ? "toggle-pill-active flex-none px-3"
                    : "toggle-pill-inactive flex-none bg-white/5 px-3"
                }
              >
                {method}
              </button>
            ))}
          </div>
          {addError && <p className="text-xs text-red-400">{addError}</p>}
          <button
            className="btn-primary w-full"
            onClick={addContact}
            disabled={adding || !newName.trim()}
          >
            Add Contact
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={handleFileSelected}
          />
          <button
            type="button"
            className="btn-secondary flex w-full items-center justify-center gap-1.5"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" aria-hidden />
            Or Upload a List (CSV)
          </button>
          {importError && <p className="text-xs text-red-400">{importError}</p>}
          <p
            key={promptIndex}
            className="animate-fade-in flex items-center justify-center gap-1.5 text-center text-xs italic text-slate-500"
          >
            <Lightbulb className="h-3 w-3 shrink-0" aria-hidden />
            {activePrompts[promptIndex % activePrompts.length]}
          </p>
        </div>

        {pendingImports && (
          <div className="card space-y-2">
            <div className="flex items-center justify-between">
              <p className="section-title">Review Import ({pendingImports.length})</p>
              <button className="chip-btn text-xs" onClick={() => setPendingImports(null)}>
                Cancel
              </button>
            </div>
            <p className="text-xs text-slate-400">
              For each name, pick whether it goes on your Networking List or Customer List, then import.
            </p>
            <div className="max-h-80 space-y-1.5 overflow-y-auto">
              {pendingImports.map((row, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    className="input !py-1.5 flex-1 text-sm"
                    value={row.name}
                    onChange={(e) => updatePendingImport(i, { name: e.target.value })}
                  />
                  <button
                    className={
                      row.destination === "networking" ? "toggle-pill-active px-2 text-xs" : "toggle-pill-inactive px-2 text-xs"
                    }
                    onClick={() => updatePendingImport(i, { destination: "networking" })}
                  >
                    Networking
                  </button>
                  <button
                    className={
                      row.destination === "customer" ? "toggle-pill-active px-2 text-xs" : "toggle-pill-inactive px-2 text-xs"
                    }
                    onClick={() => updatePendingImport(i, { destination: "customer" })}
                  >
                    Customer
                  </button>
                  <button
                    className="btn-icon !h-7 !w-7 shrink-0 text-sm"
                    onClick={() => removePendingImport(i)}
                    aria-label={`Remove ${row.name || "this row"}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="btn-primary w-full"
              onClick={importPendingContacts}
              disabled={importing || pendingImports.length === 0}
            >
              {importing ? "Importing…" : `Import ${pendingImports.length} Contact${pendingImports.length === 1 ? "" : "s"}`}
            </button>
          </div>
        )}

        {updateError && (
          <div className="card">
            <p className="text-xs text-red-400">{updateError}</p>
          </div>
        )}

        {loading ? (
          <SkeletonList cards={3} lines={1} />
        ) : activeList.length === 0 ? (
          <div className="empty-state">
            {viewMode === "networking"
              ? "No contacts yet. Add your first one above."
              : "No customers yet. Add your first one above."}
          </div>
        ) : viewMode === "networking" ? (
          <>
            <ContactGroup
              title={
                <>
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                  A-List Connections ({groupA.length})
                </>
              }
              contacts={groupA}
              onUpdate={updateContact}
              onDelete={deleteContact}
              statusOptions={CONTACT_STATUSES}
            />
            <ContactGroup
              title={
                <>
                  <span className="inline-block h-2 w-2 rounded-full bg-sky-400" aria-hidden />
                  B-List Connections ({groupB.length})
                </>
              }
              contacts={groupB}
              onUpdate={updateContact}
              onDelete={deleteContact}
              statusOptions={CONTACT_STATUSES}
            />
          </>
        ) : (
          <ContactGroup
            title={`Customer List (${customerContacts.length})`}
            contacts={customerContacts}
            onUpdate={updateContact}
            onDelete={deleteContact}
            statusOptions={CUSTOMER_STATUSES}
          />
        )}
      </main>
    </FeatureGate>
  );
}

function ContactGroup({
  title,
  contacts,
  onUpdate,
  onDelete,
  statusOptions,
}: {
  title: ReactNode;
  contacts: Contact[];
  onUpdate: (id: string, patch: Partial<Contact>) => void;
  onDelete: (id: string) => void;
  statusOptions: readonly string[];
}) {
  if (contacts.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="section-title flex items-center gap-1.5 px-1">{title}</p>
      {contacts.map((contact) => (
        <ContactCard
          key={contact.id}
          contact={contact}
          onUpdate={onUpdate}
          onDelete={onDelete}
          statusOptions={statusOptions}
        />
      ))}
    </div>
  );
}

function ContactCard({
  contact,
  onUpdate,
  onDelete,
  statusOptions,
}: {
  contact: Contact;
  onUpdate: (id: string, patch: Partial<Contact>) => void;
  onDelete: (id: string) => void;
  statusOptions: readonly string[];
}) {
  const [notes, setNotes] = useState(contact.notes);

  return (
    <div className="card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-white">{contact.name}</p>
        <button
          className="btn-icon !h-7 !w-7 text-sm"
          onClick={() => onDelete(contact.id)}
          aria-label={`Delete ${contact.name}`}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {contact.connection_tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {contact.connection_tags.map((tag) => (
            <span key={tag} className="pill">
              {tag}
            </span>
          ))}
        </div>
      )}
      <select
        className="select"
        value={contact.status}
        onChange={(e) => onUpdate(contact.id, { status: e.target.value })}
      >
        {statusOptions.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <select
        className="select"
        value={contact.reconnect_method}
        onChange={(e) => onUpdate(contact.id, { reconnect_method: e.target.value })}
      >
        <option value="">Best way to reconnect…</option>
        {RECONNECT_METHODS.map((method) => (
          <option key={method} value={method}>
            {method}
          </option>
        ))}
      </select>
      <textarea
        className="textarea"
        placeholder="Notes…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          if (notes !== contact.notes) onUpdate(contact.id, { notes });
        }}
      />
    </div>
  );
}
