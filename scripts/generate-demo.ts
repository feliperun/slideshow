import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const root = path.resolve('examples/family');
const photos = path.join(root, 'photos');
const audio = path.join(root, 'audio');
await mkdir(photos, { recursive: true });
await mkdir(audio, { recursive: true });

const palette = [
  ['#f7b267', '#f4845f'],
  ['#84dcc6', '#4b4e6d'],
  ['#ff8fab', '#9b5de5'],
  ['#ffd166', '#06d6a0'],
  ['#7bdff2', '#b2f7ef'],
] as const;
for (let index = 0; index < 12; index++) {
  const portrait = index % 3 === 0;
  const square = index % 5 === 0;
  const width = square ? 1400 : portrait ? 1200 : 1800;
  const height = square ? 1400 : portrait ? 1800 : 1200;
  const colors = palette[index % palette.length]!;
  const month = String((index % 12) + 1).padStart(2, '0');
  const file = path.join(photos, `2024-${month}-20-${String(index + 1).padStart(2, '0')}.jpg`);
  const svg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <circle cx="${width * 0.25}" cy="${height * 0.3}" r="${Math.min(width, height) * 0.16}" fill="#fff" opacity=".28"/>
      <path d="M0 ${height * 0.78} Q ${width * 0.5} ${height * 0.5} ${width} ${height * 0.76} V ${height} H0Z" fill="#fff" opacity=".2"/>
      <text x="50%" y="50%" text-anchor="middle" font-size="${Math.min(width, height) * 0.1}" font-family="sans-serif" fill="white" font-weight="700">MEMÓRIA ${index + 1}</text>
    </svg>`);
  await sharp(svg).jpeg({ quality: 90 }).toFile(file);
}

await execFileAsync('ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'error',
  '-y',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=220:sample_rate=48000:duration=12',
  '-filter:a',
  'volume=0.12',
  path.join(audio, 'soundtrack.wav'),
]);
process.stdout.write(`Demo gerado em ${root}\n`);
