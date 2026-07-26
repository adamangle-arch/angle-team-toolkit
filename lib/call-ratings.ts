import { CALL_RATING_TYPES, type CallRatingType } from "./constants";
import type { CallRating } from "./types";

export type CallRatingGroup = {
  type: CallRatingType;
  items: CallRating[];
  avgScore: number | null;
};

// Groups ratings by meeting type, in process order (QI1 -> QI2 -> FU1 ->
// FU2 -> Questionnaire) rather than alphabetically or by recency, so a
// pattern at one specific stage (e.g. FU2 calls scoring low) is easy to
// spot instead of getting lost in one mixed feed. Types with no ratings
// yet are omitted rather than shown empty.
export function groupCallRatingsByType(ratings: CallRating[]): CallRatingGroup[] {
  return CALL_RATING_TYPES.map((type) => {
    const items = ratings.filter((r) => r.call_type === type);
    const scored = items
      .map((r) => r.overall_score)
      .filter((s): s is number => s !== null && s !== undefined);
    const avgScore =
      scored.length > 0 ? scored.reduce((sum, s) => sum + s, 0) / scored.length : null;
    return { type, items, avgScore };
  }).filter((group) => group.items.length > 0);
}
