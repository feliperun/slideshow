import { describe, expect, it } from 'vitest';
import { pickSeeded, seededRandom, stableHash } from '../src/utils/seeded-random.js';

describe('deterministic choices', () => {
  it('returns the same random value for the same seed', () => {
    expect(seededRandom('family:scene-1')).toBe(seededRandom('family:scene-1'));
  });

  it('returns stable picks', () => {
    expect(pickSeeded(['a', 'b', 'c'], 'same')).toBe(pickSeeded(['a', 'b', 'c'], 'same'));
  });

  it('hashes equal structures identically', () => {
    expect(stableHash({ a: 1, b: [2, 3] })).toBe(stableHash({ a: 1, b: [2, 3] }));
  });
});
