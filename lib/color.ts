// Small hex color helpers backing the "custom" App Color option (see
// lib/applyTheme.ts) - a hand-picked preset gets its own light/dark
// tints written by hand in app/globals.css, but a custom hex is
// whatever a person picks in the color input, so the light/dark/RGB
// forms every colorway needs have to be derived from that one hex at
// runtime instead.

export function isValidHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function componentToHex(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, "0");
}

// Blends toward white (positive amount) or black (negative amount) -
// the same "mix" every :root[data-theme] block's hand-picked light/dark
// pair is doing by eye, just computed instead of chosen.
function mix(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  return `#${componentToHex(r + (target - r) * t)}${componentToHex(g + (target - g) * t)}${componentToHex(b + (target - b) * t)}`;
}

export function lighten(hex: string, amount: number): string {
  return mix(hex, amount);
}

export function darken(hex: string, amount: number): string {
  return mix(hex, -amount);
}
