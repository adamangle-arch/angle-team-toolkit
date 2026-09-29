import { CircleCheckBig } from "lucide-react";
import WayGrassTuft from "./WayGrassTuft";

// The trail-signpost visual from the church's own artwork - orange board,
// thick navy border, bold uppercase lettering, on a short post with a
// tuft of grass at the base. Deliberately uniform in color across every
// course (the source artwork doesn't color-code its signs by topic) so
// `courses.color_theme` no longer drives this - it's kept as a DB column
// for now in case a future admin screen wants per-course color back, but
// this component ignores it on purpose.
//
// `state` is purely a visual accent layered on top of that same board:
// "current" gets the pulsing ring used elsewhere for "you are here" on
// the journey road, "done" gets a small checkmark badge. Neither changes
// navigability - every course stays open regardless (see the product
// brief's "no sequential unlock gating").
export default function CourseSign({
  icon,
  title,
  size = "md",
  state = "default",
}: {
  icon: React.ReactNode;
  title: string;
  size?: "md" | "lg";
  state?: "default" | "current" | "done";
}) {
  const isLg = size === "lg";

  return (
    <div className="flex flex-col items-center">
      <div
        className={`relative flex flex-col items-center gap-1.5 rounded-[10px] text-center ${state === "current" ? "way-sign-board--current" : ""}`}
        style={{
          background: "var(--way-accent)",
          color: "var(--way-accent-ink)",
          border: "3px solid var(--way-text)",
          padding: isLg ? "18px 22px" : "12px 16px",
          boxShadow: "0 8px 16px -10px var(--way-shadow)",
        }}
      >
        {state === "done" && (
          <span className="way-sign-badge-done" aria-hidden>
            <CircleCheckBig className="h-3.5 w-3.5" />
          </span>
        )}
        {icon}
        <p
          className="way-serif"
          style={{
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            lineHeight: 1.15,
            fontSize: isLg ? "17px" : "14px",
          }}
        >
          {title}
        </p>
      </div>
      <div style={{ width: 6, height: isLg ? 26 : 18, background: "var(--way-accent)" }} />
      <WayGrassTuft />
    </div>
  );
}
