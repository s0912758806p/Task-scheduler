// Ordering helpers for cards inside a column. A card's position is the midpoint of its
// neighbours; when the gap is exhausted the caller must renumber the whole column.

export const POSITION_STEP = 1024;
const MIN_GAP = 1e-6;

/** Position for an item between `before` and `after`; `null` means renumber the column. */
export function positionBetween(before: number | null, after: number | null): number | null {
  if (before === null && after === null) return 0;
  if (before === null) return after! - POSITION_STEP;
  if (after === null) return before + POSITION_STEP;
  if (after - before < MIN_GAP) return null;
  return (before + after) / 2;
}

export function renumber(ids: string[]): Array<{ id: string; position: number }> {
  return ids.map((id, i) => ({ id, position: (i + 1) * POSITION_STEP }));
}
