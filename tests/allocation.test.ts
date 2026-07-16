import { describe, expect, it } from 'vitest';
import { allocateFrames } from '../src/timeline/allocation.js';

describe('allocateFrames', () => {
  it('distributes integer frames exactly', () => {
    const allocation = allocateFrames(
      [
        { id: 'a', weight: 1, minFrames: 30, maxFrames: 120 },
        { id: 'b', weight: 2, minFrames: 30, maxFrames: 120 },
        { id: 'c', weight: 1, minFrames: 30, maxFrames: 120 },
      ],
      240,
    );
    expect([...allocation.values()].reduce((sum, value) => sum + value, 0)).toBe(240);
    expect(allocation.get('b')).toBeGreaterThan(allocation.get('a') as number);
  });

  it('pins items at maximum and redistributes the remainder', () => {
    const allocation = allocateFrames(
      [
        { id: 'hero', weight: 10, minFrames: 40, maxFrames: 60 },
        { id: 'normal', weight: 1, minFrames: 40, maxFrames: 160 },
      ],
      180,
    );
    expect(allocation.get('hero')).toBe(60);
    expect(allocation.get('normal')).toBe(120);
  });

  it('honors all minimums', () => {
    const allocation = allocateFrames(
      [
        { id: 'a', weight: 1, minFrames: 66, maxFrames: 180 },
        { id: 'b', weight: 1, minFrames: 66, maxFrames: 180 },
      ],
      133,
    );
    expect(allocation.get('a')).toBeGreaterThanOrEqual(66);
    expect(allocation.get('b')).toBeGreaterThanOrEqual(66);
    expect((allocation.get('a') as number) + (allocation.get('b') as number)).toBe(133);
  });

  it('rejects an insufficient duration', () => {
    expect(() =>
      allocateFrames(
        [
          { id: 'a', weight: 1, minFrames: 60, maxFrames: 100 },
          { id: 'b', weight: 1, minFrames: 60, maxFrames: 100 },
        ],
        119,
      ),
    ).toThrow(/Duração impossível/);
  });

  it('rejects unfillable extra time', () => {
    expect(() =>
      allocateFrames([{ id: 'a', weight: 1, minFrames: 60, maxFrames: 100 }], 101),
    ).toThrow(/Duração impossível/);
  });
});
