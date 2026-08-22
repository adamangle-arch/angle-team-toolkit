"use client";

import { useEffect, useRef, useState } from "react";
import { Link2, ArrowUpRight, Paperclip } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthGate";
import FeatureGate from "@/components/FeatureGate";
import CallRatingPanel from "@/components/CallRatingPanel";
import { SkeletonRows } from "@/components/Skeleton";
import { supabase } from "@/lib/supabaseClient";
import type { AssistantMessage } from "@/lib/types";

type Tab = "roleplay" | "rate";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function AssistantPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("roleplay");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function attachImageFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That image is too large — try a screenshot under 5MB.");
      return;
    }
    setError(null);
    const dataUrl = await readFileAsDataUrl(file);
    setPendingImage(dataUrl);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    attachImageFile(file);
  }

  async function handleSend() {
    const text = input.trim();
    if ((!text && !pendingImage) || sending) return;
    setError(null);
    setInput("");
    const imageToSend = pendingImage;
    setPendingImage(null);
    setSending(true);

    const { data: userRow, error: userInsertError } = await supabase
      .from("assistant_messages")
      .insert({ user_id: user.id, role: "user", content: text, image_data: imageToSend })
      .select("*")
      .single();

    if (userInsertError || !userRow) {
      // Restore what they typed - without this, the input clears above
      // but nothing was actually saved or sent, and no error explains why.
      setInput(text);
      setPendingImage(imageToSend);
      setError(userInsertError?.message || "Couldn't send that message. Try again.");
      setSending(false);
      return;
    }

    const updated = [...messages, userRow as AssistantMessage];
    setMessages(updated);

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
          messages: updated.map((m) => ({
            role: m.role,
            content: m.content,
            image_data: m.image_data,
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Something went wrong.");
      }

      const { data: assistantRow, error: assistantInsertError } = await supabase
        .from("assistant_messages")
        .insert({ user_id: user.id, role: "assistant", content: json.reply })
        .select("*")
        .single();

      if (assistantRow) {
        setMessages((prev) => [...prev, assistantRow as AssistantMessage]);
      } else {
        // The reply was already generated (and already cost an API call) -
        // still show it even though saving it to history failed, rather
        // than the user waiting and getting nothing back.
        setMessages((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            user_id: user.id,
            role: "assistant",
            content: json.reply,
            image_data: null,
            created_at: new Date().toISOString(),
          },
        ]);
        if (assistantInsertError) {
          setError("Got a reply, but couldn't save it to your conversation history.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  return (
    <FeatureGate minSession={5}>
      <PageHeader title="Assistant" subtitle="Role-play conversations, and rate your meetings" />
      <div className="px-4 pt-3">
        <div className="card space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            Full Team AI Assistant
          </p>
          <p className="text-xs text-slate-400">
            Want deeper Q&amp;A on scripts, comp plan, or objections? Ask your upline to invite
            you to the team&apos;s Gemini Assistant, then open it below.
          </p>
          <p className="text-xs text-amber-light">
            Before you tap the button, sign in to a Google account in your browser. If you skip
            this step, the link opens plain Gemini instead of the team&apos;s assistant.
          </p>
          <a
            href="https://gemini.google.com/gem/1NkM3ZlEKZxU2sUFvSIaEEQ9i7DTw2So9?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            Open Gemini Assistant
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
      <div className="tab-bar px-4 pb-3 pt-3">
        <div className="card flex p-1">
          <button
            className={tab === "roleplay" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setTab("roleplay")}
          >
            Role-Play
          </button>
          <button
            className={tab === "rate" ? "toggle-pill-active" : "toggle-pill-inactive"}
            onClick={() => setTab("rate")}
          >
            Rate a Call
          </button>
        </div>
      </div>
      <main className="page-main !pt-0">
        {tab === "rate" && <CallRatingPanel />}

        {tab === "roleplay" && (
          <>
        {loading ? (
          <SkeletonRows rows={4} />
        ) : messages.length === 0 ? (
          <div className="empty-state">
            Tell it which list you want to practice (A, B, or C/marketplace) and who the prospect
            is. It will play the prospect one message at a time, then score your conversation when
            you say &quot;end role-play.&quot; You can also paste or attach a screenshot of a real
            text thread and ask for feedback on it. For process, scripts, products, or comp plan
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
                      ? "bg-amber text-ink"
                      : "card !rounded-2xl text-slate-200"
                  }`}
                >
                  {m.image_data && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.image_data}
                      alt="Attached screenshot"
                      className="mb-2 max-h-64 rounded-lg"
                    />
                  )}
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

        {pendingImage && (
          <div className="card flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pendingImage} alt="Attached screenshot preview" className="h-16 rounded-lg" />
            <span className="flex-1 text-xs text-slate-400">Screenshot attached</span>
            <button className="pill" onClick={() => setPendingImage(null)}>
              Remove
            </button>
          </div>
        )}

        <div className="card flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) attachImageFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn-secondary shrink-0"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach a screenshot"
          >
            <Paperclip className="h-4 w-4" aria-hidden />
          </button>
          <textarea
            className="textarea min-h-0 flex-1"
            placeholder="Start a role-play, reply in character, or paste a screenshot…"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
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
            disabled={sending || (!input.trim() && !pendingImage)}
          >
            Send
          </button>
        </div>
          </>
        )}
      </main>
    </FeatureGate>
  );
}
