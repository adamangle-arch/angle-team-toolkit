import { darken, hexToRgb, isValidHex, lighten } from "./color";

// Every custom property a colorway can touch - shared by the apply and
// clear paths below so the two can't drift out of sync with each other.
const CUSTOM_PROPERTIES = ["--color-amber", "--color-amber-dark", "--color-amber-light", "--amber-rgb"] as const;

// Single source of truth for turning a saved theme_color (+
// custom_theme_hex, only meaningful when theme_color is "custom") into
// the actual repaint - shared by AuthGate's own-profile effect and My
// Profile's optimistic apply-on-tap handlers, so the two can never
// drift out of sync with each other the way two copies of this logic
// eventually would.
//
// A preset repaints entirely through its :root[data-theme="..."] block
// in app/globals.css, so all this needs to do for one is set the
// attribute (and clear any leftover custom-hex override sitting on top
// of it as an inline style - inline wins over any stylesheet rule
// regardless of which attribute value is underneath, so a stale
// override would otherwise survive a switch back to a preset). A custom
// hex has no such block - there's no bounding the infinite hex space
// with static CSS - so instead this derives light/dark tints and an RGB
// triplet from the one hex the person picked with lib/color.ts and sets
// all four custom properties directly as inline styles.
export function applyTheme(themeColor: string, customHex: string | null) {
  const root = document.documentElement;
  if (themeColor === "custom" && customHex && isValidHex(customHex)) {
    root.dataset.theme = "custom";
    const [r, g, b] = hexToRgb(customHex);
    root.style.setProperty("--color-amber", customHex);
    root.style.setProperty("--color-amber-dark", darken(customHex, 0.35));
    root.style.setProperty("--color-amber-light", lighten(customHex, 0.3));
    root.style.setProperty("--amber-rgb", `${r} ${g} ${b}`);
    return;
  }
  root.dataset.theme = themeColor || "amber";
  for (const prop of CUSTOM_PROPERTIES) root.style.removeProperty(prop);
}
