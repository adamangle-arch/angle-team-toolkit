// A fixed, subtle landscape silhouette behind the whole app - three
// layered hills plus a few pine trees in the brand's own navy tint,
// echoing the church's "Come and Follow Me" artwork. Every card in the
// app is opaque, so this only ever shows through in the gaps/margins
// around content, never competing with anything readable. Fixed rather
// than scrolling with the page, so it holds still while cards scroll
// past it - a small, cheap sense of depth.
export default function WayBackdrop() {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMax slice"
      className="pointer-events-none fixed inset-0 h-full w-full"
      style={{ zIndex: -1 }}
      aria-hidden
    >
      <path d="M0,300 L0,200 Q100,150 200,185 T400,175 L400,300 Z" fill="var(--way-text)" opacity={0.035} />

      <path d="M0,300 L0,230 Q90,190 180,215 T400,205 L400,300 Z" fill="var(--way-text)" opacity={0.06} />
      <path d="M64,196 L54,218 L74,218 Z" fill="var(--way-text)" opacity={0.06} />
      <path d="M146,208 L134,232 L158,232 Z" fill="var(--way-text)" opacity={0.06} />
      <path d="M268,198 L256,222 L280,222 Z" fill="var(--way-text)" opacity={0.06} />
      <path d="M338,206 L328,228 L348,228 Z" fill="var(--way-text)" opacity={0.06} />

      <path d="M0,300 L0,260 Q100,230 220,250 T400,245 L400,300 Z" fill="var(--way-text)" opacity={0.09} />
      <path d="M100,238 L88,262 L112,262 Z" fill="var(--way-text)" opacity={0.09} />
      <path d="M310,242 L296,266 L324,266 Z" fill="var(--way-text)" opacity={0.09} />
    </svg>
  );
}
