import type { Profile } from "./types";

export type SponsorshipNode = {
  profile: Profile;
  children: SponsorshipNode[];
};

function displaySortName(p: Profile): string {
  return (p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.email).toLowerCase();
}

// Builds the tree of everyone reachable downward from rootId via
// upline_id, sorted alphabetically at each level. rootId's own profile is
// NOT included - only descendants. Pass rootId = null to get the
// top-level forest (everyone with no upline at all, e.g. the founders).
export function buildSponsorshipChildren(
  profiles: Profile[],
  rootId: string | null
): SponsorshipNode[] {
  const byUpline = new Map<string | null, Profile[]>();
  for (const p of profiles) {
    const key = p.upline_id ?? null;
    const bucket = byUpline.get(key);
    if (bucket) bucket.push(p);
    else byUpline.set(key, [p]);
  }

  function build(parentId: string | null): SponsorshipNode[] {
    const kids = (byUpline.get(parentId) ?? [])
      .slice()
      .sort((a, b) => displaySortName(a).localeCompare(displaySortName(b)));
    return kids.map((p) => ({ profile: p, children: build(p.id) }));
  }

  return build(rootId);
}
