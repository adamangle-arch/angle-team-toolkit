import WayGrassTuft from "./WayGrassTuft";

// The trail-signpost visual from the church's own artwork - orange board,
// thick navy border, bold uppercase lettering, on a short post with a
// tuft of grass at the base. Deliberately uniform in color across every
// course (the source artwork doesn't color-code its signs by topic) so
// `courses.color_theme` no longer drives this - it's kept as a DB column
// for now in case a future admin screen wants per-course color back, but
// this component ignores it on purpose.
export default function CourseSign({
  icon,
  title,
  size = "md",
}: {
  icon: React.ReactNode;
  title: string;
  size?: "md" | "lg";
}) {
  const isLg = size === "lg";

  return (
    <div className="flex flex-col items-center">
      <div
        className="flex flex-col items-center gap-1.5 rounded-[10px] text-center"
        style={{
          background: "var(--way-accent)",
          color: "var(--way-accent-ink)",
          border: "3px solid var(--way-text)",
          padding: isLg ? "18px 22px" : "12px 16px",
          boxShadow: "0 8px 16px -10px var(--way-shadow)",
        }}
      >
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
