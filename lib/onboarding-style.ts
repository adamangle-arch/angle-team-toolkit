import { ClipboardList, Flame, MessageCircle, PiggyBank, ShoppingBag, type LucideIcon } from "lucide-react";

// One icon + gradient per session, index-matched to ONBOARDING_SESSIONS
// - same "colorful module card" language the Home hub's tiles use, just
// five fixed entries instead of a cycled palette since there are always
// exactly five sessions. Shared between the Classroom overview
// (app/onboarding/page.tsx) and each session's own homework page
// (app/onboarding/[session]/page.tsx) so both use the same banner look.
export const SESSION_STYLE: { icon: LucideIcon; from: string; to: string }[] = [
  { icon: PiggyBank, from: "#6ee7b7", to: "#047857" }, // Budget Session
  { icon: ClipboardList, from: "#7dd3fc", to: "#0369a1" }, // List Building
  { icon: ShoppingBag, from: "#c4b5fd", to: "#6d28d9" }, // Customers
  { icon: MessageCircle, from: "#fda4af", to: "#be123c" }, // Sharing Your Story
  { icon: Flame, from: "#fde68a", to: "#b45309" }, // 30-Day Core Run
];
