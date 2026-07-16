import { describe, expect, it } from 'vitest';
import { applyManualEdits, type ManualEdits } from '../src/editor/manual-edits.js';
import { mediaFrameRect } from '../src/remotion/layouts.js';
import type { Scene, SlideshowManifest } from '../src/schemas/manifest.js';

const scene = (id: string, assetIds: string[]): Scene =>
  ({
    id,
    type: 'collage',
    startFrame: 0,
    endFrame: 90,
    durationInFrames: 90,
    layout: 'collage',
    photos: assetIds.map((assetId) => ({
      assetId,
      focus: { x: 0.5, y: 0.5 },
      rotation: 0,
      scale: 1,
      movement: {
        type: 'still',
        startScale: 1,
        endScale: 1,
        startX: 0,
        endX: 0,
        startY: 0,
        endY: 0,
      },
    })),
    seed: id,
    weight: 1,
    fixedDuration: false,
    layers: [],
    warnings: [],
  }) satisfies Scene;

const manifestWithScenes = (scenes: Scene[]): SlideshowManifest =>
  ({ scenes }) as unknown as SlideshowManifest;

describe('manual framing edits', () => {
  it('applies focus, zoom, fit and frame overrides', () => {
    const manifest = manifestWithScenes([scene('scene-0001', ['asset-a'])]);
    const edits: ManualEdits = {
      version: 1,
      projectId: 'demo',
      scenes: {
        'scene-0001': {
          sceneType: 'collage',
          assetIds: ['asset-a'],
          photos: {
            'asset-a': {
              focus: { x: 0.31, y: 0.42 },
              contentScale: 1.7,
              fit: 'cover',
              frame: { x: 0.1, y: 0.2, width: 0.4, height: 0.5 },
            },
          },
        },
      },
    };

    const photo = applyManualEdits(manifest, edits).scenes[0]?.photos[0];
    expect(photo?.focus).toEqual({ x: 0.31, y: 0.42 });
    expect(photo?.contentScale).toBe(1.7);
    expect(photo?.fit).toBe('cover');
    expect(photo?.frame).toEqual({ x: 0.1, y: 0.2, width: 0.4, height: 0.5 });
  });

  it('keeps edits attached when a scene id changes but its assets remain the same', () => {
    const manifest = manifestWithScenes([scene('scene-0099', ['asset-b', 'asset-a'])]);
    const edits: ManualEdits = {
      version: 1,
      projectId: 'demo',
      scenes: {
        'scene-0002': {
          sceneType: 'collage',
          assetIds: ['asset-a', 'asset-b'],
          photos: { 'asset-b': { contentScale: 2 } },
        },
      },
    };

    expect(applyManualEdits(manifest, edits).scenes[0]?.photos[0]?.contentScale).toBe(2);
  });

  it('uses a manual frame instead of the automatic layout rectangle', () => {
    const manual = { x: 0.2, y: 0.25, width: 0.35, height: 0.4 };
    expect(mediaFrameRect('album-page', 3, 0, manual)).toEqual(manual);
    expect(mediaFrameRect('album-page', 3, 0)).toEqual({
      x: 0.08,
      y: 0.12,
      width: 0.42,
      height: 0.64,
    });
  });
});
