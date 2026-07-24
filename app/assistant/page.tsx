"use client";

import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import type { AssistantMessage } from "@/lib/types";

export default function AssistantPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("assistant_messages")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      setMessages((data as AssistantMessage[]) ?? []);
      setLoading(false);
    }
    load();
  }, [user.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setInput("");
    setSending(true);

    const { data: userRow } = await supabase
      .from("assistant_messages")
      .insert({ user_id: user.id, role: "user", content: text })
      .select("*")
      .single();

    const updated = userRow ? [...messages, userRow as AssistantMessage] : messages;
    if (userRow) setMessages(updated);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messages: updated.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Something went wrong.");
      }

      const { data: assistantRow } = await supabase
        .from("assistant_messages")
        .insert({ user_id: user.id, role: "assistant", content: json.reply })
        .select("*")
        .single();

      if (assistantRow) {
        setMessages((prev) => [...prev, assistantRow as AssistantMessage]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageHeader title="Role-Play Coach" subtitle="Practice A-list, B-list, and C-list conversations" />
      <main className="page-main">
        {loading ? (
          <div className="empty-state">Loading conversation…</div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            Tell it which list you want to practice (A, B, or C/marketplace) and who the prospect
            is. It will play the prospect one message at a time, then score your conversation when
            you say &quot;end role-play.&quot; For process, scripts, products, or comp plan
            questions, check the Resources tab instead.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-amber text-navy"
                      : "card !rounded-2xl text-slate-200"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        )}

        {sending && (
          <div className="flex justify-start">
            <div className="card !rounded-2xl px-3.5 py-2.5 text-sm text-slate-400">
              Thinking…
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div ref={bottomRef} />

        <div className="card flex items-end gap-2">
          <textarea
            className="textarea min-h-0 flex-1"
            placeholder="Start a role-play or reply in character…"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            className="btn-primary shrink-0"
            onClick={handleSend}
            disabled={sending || !input.trim()}
          >
            Send
          </button>
        </div>
      </main>
    </>
  );
}
