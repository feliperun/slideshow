export const secondsToFrames = (seconds: number, fps: number): number =>
  Math.max(0, Math.round(seconds * fps));

export const framesToSeconds = (frames: number, fps: number): number => frames / fps;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
