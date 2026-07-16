import { describe, expect, it } from 'vitest';
import { detectBeatGridFromPcm } from '../src/analysis/analyze-audio.js';

describe('beat analysis', () => {
  it('detects a regular 120 BPM pulse grid', () => {
    const sampleRate = 22_050;
    const seconds = 12;
    const pcm = new Int16Array(sampleRate * seconds);
    for (let time = 0.5; time < seconds; time += 0.5) {
      const start = Math.round(time * sampleRate);
      for (let index = start; index < Math.min(pcm.length, start + 700); index++) {
        pcm[index] = Math.round(24_000 * Math.exp(-(index - start) / 160));
      }
    }
    const analysis = detectBeatGridFromPcm(pcm, sampleRate, 30, seconds);
    expect(analysis).toBeDefined();
    expect(analysis?.bpm).toBeGreaterThan(110);
    expect(analysis?.bpm).toBeLessThan(130);
    expect(analysis?.beatFrames.length).toBeGreaterThan(18);
  });
});
