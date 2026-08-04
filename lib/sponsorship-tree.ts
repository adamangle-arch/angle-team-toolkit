import type { Profile } from "./types";

export type SponsorshipNode = {
  profile: Profile;
  // A linked spouse (profile.household_id set) never gets its own node -
  // it's folded into whichever partner it defers to, same as everywhere
  // else in this app a linked couple is shown as one unit rather than
  // two separate people who happen to share a household (My Tree's own
  // mine+theirs merge above, CoupleLink on the Leaderboard, etc.).
  partner: Profile | null;
  children: SponsorshipNode[];
};

function displaySortName(p: Profile): string {
  return (p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.email).toLowerCase();
}

// Builds the tree of everyone reachable downward from rootId via
// upline_id, sorted alphabetically at each level. rootId's own profile is
// NOT included - only descendants. Pass rootId = null to get the
// top-level forest (everyone with no upline at all, e.g. the founders).
//
// A linked pair merges into one node regardless of which of the two
// upline_id points where a downline branch actually sits (usually the
// same sponsor for both, but not guaranteed - only one partner may have
// bothered entering it): the node is placed using the non-deferring
// partner's upline_id, and children are the union of both partners' own
// downline (whoever entered either partner's account number as their
// sponsor), deduped and re-sorted together.
export function buildSponsorshipChildren(
  profiles: Profile[],
  rootId: string | null
): SponsorshipNode[] {
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const skipIds = new Set<string>();
  const partnerOf = new Map<string, Profile>();
  for (const p of profiles) {
    if (p.household_id && p.household_id !== p.id && byId.has(p.household_id)) {
      skipIds.add(p.id);
      partnerOf.set(p.household_id, p);
    }
  }

  const byUpline = new Map<string | null, Profile[]>();
  for (const p of profiles) {
    if (skipIds.has(p.id)) continue;
    const key = p.upline_id ?? null;
    const bucket = byUpline.get(key);
    if (bucket) bucket.push(p);
    else byUpline.set(key, [p]);
  }

  function build(parentId: string | null): SponsorshipNode[] {
    const kids = (byUpline.get(parentId) ?? [])
      .slice()
      .sort((a, b) => displaySortName(a).localeCompare(displaySortName(b)));
    return kids.map((p) => {
      const partner = partnerOf.get(p.id) ?? null;
      const ownChildren = build(p.id);
      const children = partner
        ? (() => {
            const seen = new Set(ownChildren.map((n) => n.profile.id));
            return [...ownChildren, ...build(partner.id).filter((n) => !seen.has(n.profile.id))].sort(
              (a, b) => displaySortName(a.profile).localeCompare(displaySortName(b.profile))
            );
          })()
        : ownChildren;
      return { profile: p, partner, children };
    });
  }

  return build(rootId);
}
