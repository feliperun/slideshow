import type { Scene } from '../schemas/manifest';

export type FrameRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const automaticFrameRect = (layout: Scene['layout'], count: number, index: number): FrameRect => {
  if (layout === 'single-portrait') return { x: 0.29, y: 0.08, width: 0.42, height: 0.84 };
  if (layout === 'single-landscape' || layout === 'hero')
    return { x: 0.07, y: 0.08, width: 0.86, height: 0.79 };
  if (layout === 'square-editorial') return { x: 0.26, y: 0.07, width: 0.48, height: 0.78 };
  if (layout === 'video-editorial') return { x: 0.08, y: 0.09, width: 0.84, height: 0.76 };
  if (layout === 'polaroid') return { x: 0.25, y: 0.06, width: 0.5, height: 0.79 };
  if (layout === 'timeline-strip') return { x: 0.14, y: 0.09, width: 0.72, height: 0.72 };
  if (layout === 'split-screen') {
    return { x: index === 0 ? 0.05 : 0.51, y: 0.11, width: 0.44, height: 0.72 };
  }
  if (layout === 'photo-stack') {
    const stack: FrameRect[] = [
      { x: 0.12, y: 0.15, width: 0.43, height: 0.68 },
      { x: 0.46, y: 0.09, width: 0.43, height: 0.7 },
      { x: 0.31, y: 0.2, width: 0.4, height: 0.66 },
    ];
    return stack[index] ?? stack[stack.length - 1]!;
  }
  if (layout === 'album-page') {
    const album: FrameRect[] = [
      { x: 0.08, y: 0.12, width: 0.42, height: 0.64 },
      { x: 0.53, y: 0.09, width: 0.38, height: 0.45 },
      { x: 0.56, y: 0.57, width: 0.34, height: 0.3 },
    ];
    return album[index] ?? album[album.length - 1]!;
  }
  if (count === 2) {
    return { x: index === 0 ? 0.07 : 0.52, y: 0.12, width: 0.41, height: 0.69 };
  }
  const collage: FrameRect[] = [
    { x: 0.05, y: 0.09, width: 0.48, height: 0.46 },
    { x: 0.56, y: 0.07, width: 0.38, height: 0.54 },
    { x: 0.12, y: 0.59, width: 0.38, height: 0.31 },
    { x: 0.55, y: 0.64, width: 0.36, height: 0.25 },
  ];
  return collage[index] ?? collage[collage.length - 1]!;
};

export const mediaFrameRect = (
  layout: Scene['layout'],
  count: number,
  index: number,
  manualFrame?: FrameRect,
): FrameRect => manualFrame ?? automaticFrameRect(layout, count, index);

export const frameRectStyle = (rect: FrameRect): React.CSSProperties => ({
  left: `${rect.x * 100}%`,
  top: `${rect.y * 100}%`,
  width: `${rect.width * 100}%`,
  height: `${rect.height * 100}%`,
});
