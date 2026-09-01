"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookHeart, CirclePlay } from "lucide-react";
import { useWayAuth } from "./WayAuthGate";
import WelcomeVideoGate from "./WelcomeVideoGate";

export default function WayHeader({
  title,
  subtitle,
  backHref,
}: {
  title: React.ReactNode;
  subtitle?: string;
  backHref?: string;
}) {
  const { signOut } = useWayAuth();
  const [showWelcomeVideo, setShowWelcomeVideo] = useState(false);

  return (
    <>
      <header className="way-header flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {backHref && (
            <Link href={backHref} aria-label="Back" className="way-btn-icon">
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Link>
          )}
          <div className="min-w-0">
            <h1 className="way-title truncate">{title}</h1>
            {subtitle ? <p className="way-subtitle truncate">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/the-way/journal" aria-label="Journal" className="way-btn-icon">
            <BookHeart className="h-4 w-4" aria-hidden />
          </Link>
          <button
            type="button"
            aria-label="Watch welcome video"
            className="way-btn-icon"
            onClick={() => setShowWelcomeVideo(true)}
          >
            <CirclePlay className="h-4 w-4" aria-hidden />
          </button>
          <button className="way-chip" onClick={() => signOut()}>
            Sign Out
          </button>
        </div>
      </header>
      {showWelcomeVideo && <WelcomeVideoGate replay onClose={() => setShowWelcomeVideo(false)} />}
    </>
  );
}
