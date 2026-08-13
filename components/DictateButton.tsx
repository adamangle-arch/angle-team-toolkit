"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// Minimal typing for the Web Speech API - not in TypeScript's default DOM
// lib, and only the handful of members this component actually touches.
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  0: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function transcriptFrom(results: SpeechRecognitionResultList): string {
  const parts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    parts.push(results[i][0].transcript);
  }
  return parts.join(" ");
}

// Support never changes at runtime, so subscribe is a no-op - this is
// the documented React pattern for reading an environment value that
// legitimately differs between server and client (getServerSnapshot
// always false) without a setState-in-effect render pass or a
// hydration-mismatch warning, unlike a useState+useEffect check would
// produce here.
function subscribe() {
  return () => {};
}
function getSnapshot() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}
function getServerSnapshot() {
  return false;
}

// Free, browser-native voice-to-text - no backend, no API key. Safari/
// iOS support the webkit-prefixed version; recognition.lang is fixed to
// en-US - swap this if the team ever needs another language.
export default function DictateButton({
  onTranscript,
}: {
  onTranscript: (text: string) => void;
}) {
  const supported = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event) => onTranscript(transcriptFrom(event.results));
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn-icon shrink-0 ${listening ? "text-amber-light" : ""}`}
      aria-label={listening ? "Stop dictating" : "Dictate a note"}
    >
      {listening ? "🔴" : "🎤"}
    </button>
  );
}
