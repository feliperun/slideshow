import { describe, expect, it } from 'vitest';
import { projectConfigSchema } from '../src/schemas/project.js';

const valid = {
  id: 'family',
  title: 'Nossa história',
  targetDurationSeconds: 120,
  seed: 'family-2026',
  output: { file: 'output/final.mp4' },
};

describe('project config', () => {
  it('fills defaults and validates', () => {
    const parsed = projectConfigSchema.parse(valid);
    expect(parsed.fps).toBe(30);
    expect(parsed.width).toBe(1920);
    expect(parsed.safeArea.bottom).toBe(0.07);
  });

  it('rejects invalid scene limits', () => {
    expect(() =>
      projectConfigSchema.parse({ ...valid, minimumSceneSeconds: 5, idealSceneSeconds: 3 }),
    ).toThrow();
  });

  it('rejects focus points outside normalized coordinates', () => {
    expect(() =>
      projectConfigSchema.parse({ ...valid, photos: { 'a.jpg': { focus: { x: 2, y: 0.5 } } } }),
    ).toThrow();
  });
});
