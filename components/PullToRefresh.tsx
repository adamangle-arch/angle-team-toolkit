"use client";

import { useRef, useState, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";
import { RefreshCw } from "lucide-react";

// Instagram-style pull-to-refresh - drag down from the very top of the
// current page's scrollable area (".page-main", every page's own
// scrolling container - see globals.css) to force it to reload its
// data. There's no server-rendered data to re-fetch here (every page
// is a client component that loads via its own useEffect on mount), so
// "refresh" means remounting the page subtree rather than a Next.js
// router refresh - bumping `refreshKey` changes this wrapper's key,
// which unmounts/remounts {children} and re-runs every mount effect
// underneath it, the same as a real reload would, without the
// full-page white-flash a location.reload() causes. BottomNav and the
// overlays live outside this wrapper (see AuthGate) so they're
// untouched by the remount.
const PULL_THRESHOLD = 70; // rubber-banded px of drag needed to trigger a refresh
const MAX_PULL = 90; // visual cap so the indicator can't be dragged arbitrarily far
const RESISTANCE = 0.5; // finger travel doesn't map 1:1 to visual pull distance
const MIN_SPINNER_MS = 600; // keeps the spinner from reading as a flicker on a fast remount

export default function PullToRefresh({ children }: { children: ReactNode }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const scrollEl = useRef<Element | null>(null);
  const pulling = useRef(false);

  function handleTouchStart(e: ReactTouchEvent) {
    if (refreshing) return;
    const main = (e.target as Element).closest(".page-main");
    if (!main || main.scrollTop > 0) {
      scrollEl.current = null;
      return;
    }
    scrollEl.current = main;
    touchStartY.current = e.touches[0].clientY;
    pulling.current = true;
    setIsPulling(true);
  }

  function handleTouchMove(e: ReactTouchEvent) {
    if (!pulling.current || touchStartY.current === null || !scrollEl.current) return;
    if (scrollEl.current.scrollTop > 0) {
      pulling.current = false;
      setIsPulling(false);
      setPullDistance(0);
      return;
    }
    const delta = e.touches[0].clientY - touchStartY.current;
    setPullDistance(delta > 0 ? Math.min(delta * RESISTANCE, MAX_PULL) : 0);
  }

  function handleTouchEnd() {
    if (!pulling.current) return;
    pulling.current = false;
    touchStartY.current = null;
    setIsPulling(false);
    if (pullDistance >= PULL_THRESHOLD) {
      setRefreshing(true);
      setRefreshKey((k) => k + 1);
      setTimeout(() => {
        setRefreshing(false);
        setPullDistance(0);
      }, MIN_SPINNER_MS);
    } else {
      setPullDistance(0);
    }
  }

  const indicatorHeight = refreshing ? 44 : pullDistance;

  // Both wrapper divs have to pass flex sizing straight through - the
  // app shell (app-shell in globals.css) is a flex column that expects
  // PageHeader + page-main as direct flex children (page-main's flex-1
  // is what makes it the one scrolling element instead of the whole
  // document). Without flex/min-h-0 here on both levels, inserting this
  // component between them would silently break that and bring back the
  // exact "page doesn't scroll in the installed app" bug documented on
  // .app-shell.
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden"
        style={{
          height: indicatorHeight,
          transition: isPulling ? "none" : "height 200ms ease-out",
        }}
        aria-hidden
      >
        <RefreshCw
          className={`h-5 w-5 text-amber-light ${refreshing ? "animate-spin" : ""}`}
          style={
            refreshing
              ? undefined
              : { transform: `rotate(${Math.min((pullDistance / PULL_THRESHOLD) * 360, 360)}deg)` }
          }
        />
      </div>
      <div key={refreshKey} className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
