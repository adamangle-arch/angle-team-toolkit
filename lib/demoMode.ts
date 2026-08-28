// Ad Sales Leads is a real business tool Adam sometimes has open while
// showing a prospect the app during an MLM recruiting conversation - the
// isLeadsToolOwner() gate already keeps everyone ELSE from ever seeing
// it, but it doesn't stop a prospect sitting next to him from seeing it
// on HIS screen. This is a lightweight, local-only "hide it from the
// Home menu for now" switch he can flip right before a demo - not a
// security boundary (nothing here touches RLS or auth), just a UI
// convenience. localStorage rather than a profiles column since it's
// purely "how this one browser/device renders the menu right now," not
// data worth syncing anywhere.
const STORAGE_KEY = "atk_leads_hidden_for_demo";

export function getLeadsHiddenForDemo(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setLeadsHiddenForDemo(hidden: boolean) {
  if (typeof window === "undefined") return;
  if (hidden) {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
