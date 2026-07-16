import { spawn } from 'node:child_process';

const ANALYSIS_SAMPLE_RATE = 22_050;
const WINDOW_SAMPLES = 1_024;
const HOP_SAMPLES = 512;

export type BeatAnalysis = {
  bpm: number;
  confidence: number;
  beatFrames: number[];
};

const decodeMonoPcm = (file: string, durationSeconds: number): Promise<Int16Array> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        file,
        '-t',
        durationSeconds.toFixed(3),
        '-ac',
        '1',
        '-ar',
        ANALYSIS_SAMPLE_RATE.toString(),
        '-f',
        's16le',
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(errors).toString('utf8') || `ffmpeg terminou com ${code}`));
        return;
      }
      const pcm = Buffer.concat(chunks);
      resolve(new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2)));
    });
  });

const average = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

export const detectBeatGridFromPcm = (
  pcm: Int16Array,
  sampleRate: number,
  fps: number,
  durationSeconds: number,
): BeatAnalysis | undefined => {
  if (pcm.length < sampleRate * 4) return undefined;
  const hopSeconds = HOP_SAMPLES / sampleRate;
  const envelope: number[] = [];
  for (let start = 0; start + WINDOW_SAMPLES <= pcm.length; start += HOP_SAMPLES) {
    let absoluteSum = 0;
    for (let index = start; index < start + WINDOW_SAMPLES; index++) {
      absoluteSum += Math.abs(pcm[index] ?? 0);
    }
    envelope.push(Math.log1p(absoluteSum / WINDOW_SAMPLES));
  }
  const onset = envelope.map((value, index) => {
    const historyStart = Math.max(0, index - 12);
    const history = envelope.slice(historyStart, index);
    const baseline = average(history);
    return Math.max(0, value - baseline);
  });
  const smoothed = onset.map((value, index) => {
    const previous = onset[index - 1] ?? value;
    const next = onset[index + 1] ?? value;
    return previous * 0.2 + value * 0.6 + next * 0.2;
  });
  const lagMin = Math.max(1, Math.round(60 / 175 / hopSeconds));
  const lagMax = Math.round(60 / 78 / hopSeconds);
  const lagScores: Array<{ lag: number; score: number }> = [];
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let score = 0;
    for (let index = lag; index < smoothed.length; index++) {
      score += (smoothed[index] ?? 0) * (smoothed[index - lag] ?? 0);
    }
    const bpm = 60 / (lag * hopSeconds);
    const tempoPreference = bpm >= 96 && bpm <= 160 ? 1.08 : 1;
    lagScores.push({ lag, score: score * tempoPreference });
  }
  const ranked = [...lagScores].sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score <= 0) return undefined;
  let bestPhase = 0;
  let bestPhaseScore = Number.NEGATIVE_INFINITY;
  for (let phase = 0; phase < best.lag; phase++) {
    let score = 0;
    for (let index = phase; index < smoothed.length; index += best.lag) {
      score += Math.max(smoothed[index - 1] ?? 0, smoothed[index] ?? 0, smoothed[index + 1] ?? 0);
    }
    if (score > bestPhaseScore) {
      bestPhase = phase;
      bestPhaseScore = score;
    }
  }
  const beatFrames: number[] = [];
  const maximumFrame = Math.round(durationSeconds * fps);
  for (let index = bestPhase; index < smoothed.length; index += best.lag) {
    const frame = Math.round(index * hopSeconds * fps);
    if (frame >= 0 && frame < maximumFrame) beatFrames.push(frame);
  }
  const scoreMean = average(lagScores.map(({ score }) => score));
  return {
    bpm: Number((60 / (best.lag * hopSeconds)).toFixed(2)),
    confidence: Number(Math.min(1, best.score / Math.max(best.score, scoreMean * 2.4)).toFixed(3)),
    beatFrames: [...new Set(beatFrames)],
  };
};

export const analyzeAudioBeats = async (
  file: string,
  fps: number,
  durationSeconds: number,
): Promise<BeatAnalysis | undefined> => {
  try {
    const pcm = await decodeMonoPcm(file, durationSeconds);
    return detectBeatGridFromPcm(pcm, ANALYSIS_SAMPLE_RATE, fps, durationSeconds);
  } catch {
    return undefined;
  }
};
