// A small hand-drawn-style tuft of grass, matching the base of every
// signpost in the church's own artwork - purely decorative, sits under
// CourseSign's post.
export default function WayGrassTuft({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="34"
      height="18"
      viewBox="0 0 34 18"
      fill="none"
      aria-hidden
    >
      <path
        d="M17 18L6 4M17 18L12 2M17 18L17 1M17 18L22 2M17 18L28 4"
        stroke="var(--way-text)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
