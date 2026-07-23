"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabaseClient";
import { CONTACT_STATUSES } from "@/lib/constants";
import type { Contact } from "@/lib/types";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<"A" | "B">("A");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("contacts")
        .select("*")
        .order("created_at", { ascending: false });
      setContacts((data as Contact[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function addContact() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    const { data } = await supabase
      .from("contacts")
      .insert({ name, category: newCategory })
      .select("*")
      .single();
    if (data) setContacts((prev) => [data as Contact, ...prev]);
    setNewName("");
    setAdding(false);
  }

  async function updateContact(id: string, patch: Partial<Contact>) {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await supabase
      .from("contacts")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  async function deleteContact(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    await supabase.from("contacts").delete().eq("id", id);
  }

  const groupA = contacts.filter((c) => c.category === "A");
  const groupB = contacts.filter((c) => c.category === "B");

  return (
    <>
      <PageHeader title="A/B Contact List" subtitle="Family & friends vs. acquaintances" />
      <main className="page-main">
        <div className="card space-y-2">
          <p className="section-title">Add Contact</p>
          <input
            className="input"
            placeholder="Contact name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addContact()}
          />
          <div className="flex gap-2">
            <button
              className={newCategory === "A" ? "toggle-pill-active flex-1" : "toggle-pill-inactive flex-1 bg-white/5"}
              onClick={() => setNewCategory("A")}
            >
              A (Family/Friends)
            </button>
            <button
              className={newCategory === "B" ? "toggle-pill-active flex-1" : "toggle-pill-inactive flex-1 bg-white/5"}
              onClick={() => setNewCategory("B")}
            >
              B (Acquaintances)
            </button>
          </div>
          <button
            className="btn-primary w-full"
            onClick={addContact}
            disabled={adding || !newName.trim()}
          >
            Add Contact
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Loading contacts…</div>
        ) : contacts.length === 0 ? (
          <div className="empty-state">No contacts yet. Add your first one above.</div>
        ) : (
          <>
            <ContactGroup
              title={`A List (${groupA.length})`}
              contacts={groupA}
              onUpdate={updateContact}
              onDelete={deleteContact}
            />
            <ContactGroup
              title={`B List (${groupB.length})`}
              contacts={groupB}
              onUpdate={updateContact}
              onDelete={deleteContact}
            />
          </>
        )}
      </main>
    </>
  );
}

function ContactGroup({
  title,
  contacts,
  onUpdate,
  onDelete,
}: {
  title: string;
  contacts: Contact[];
  onUpdate: (id: string, patch: Partial<Contact>) => void;
  onDelete: (id: string) => void;
}) {
  if (contacts.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="section-title px-1">{title}</p>
      {contacts.map((contact) => (
        <ContactCard
          key={contact.id}
          contact={contact}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function ContactCard({
  contact,
  onUpdate,
  onDelete,
}: {
  contact: Contact;
  onUpdate: (id: string, patch: Partial<Contact>) => void;
  onDelete: (id: string) => void;
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
          ×
        </button>
      </div>
      <select
        className="select"
        value={contact.status}
        onChange={(e) => onUpdate(contact.id, { status: e.target.value })}
      >
        {CONTACT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
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
