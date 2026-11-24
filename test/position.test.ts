import { describe, expect, it } from 'vitest';
import { POSITION_STEP, positionBetween, renumber } from '@/lib/position';

describe('position', () => {
  it('has a step of 1024', () => {
    expect(POSITION_STEP).toBe(1024);
  });

  it('positionBetween handles open ends and midpoints', () => {
    expect(positionBetween(null, null)).toBe(0);
    expect(positionBetween(1024, null)).toBe(2048);
    expect(positionBetween(null, 1024)).toBe(0);
    expect(positionBetween(0, 1024)).toBe(512);
  });

  it('returns null when the gap is exhausted (needs renumber)', () => {
    let before = 0;
    const after = 1;
    let sawNull = false;
    for (let i = 0; i < 60; i++) {
      const p = positionBetween(before, after);
      if (p === null) {
        sawNull = true;
        break;
      }
      before = p;
    }
    expect(sawNull).toBe(true);
  });

  it('renumber assigns evenly spaced positions in order', () => {
    expect(renumber(['a', 'b'])).toEqual([
      { id: 'a', position: 1024 },
      { id: 'b', position: 2048 },
    ]);
    expect(renumber([])).toEqual([]);
  });
});
