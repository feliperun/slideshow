import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { manifestSchema } from '../src/schemas/manifest.js';

const root = path.resolve('.');
const manifest = manifestSchema.parse(
  JSON.parse(await readFile(path.join(root, 'output', 'project-manifest.json'), 'utf8')),
);
const outputDirectory = path.join(root, 'output', 'transition-tests');
await mkdir(outputDirectory, { recursive: true });
const serveUrl = await bundle({
  entryPoint: path.join(root, 'src', 'remotion', 'index.ts'),
  publicDir: root,
  symlinkPublicDir: true,
});
const composition = await selectComposition({
  serveUrl,
  id: 'Slideshow',
  inputProps: manifest,
  timeoutInMilliseconds: 300_000,
});
const samples = new Map<string, { start: number; end: number }>();
for (let index = 0; index < manifest.scenes.length - 1; index++) {
  const current = manifest.scenes[index];
  const next = manifest.scenes[index + 1];
  const type = current?.transitionOut?.type;
  if (!current || !next || !type || samples.has(type)) continue;
  samples.set(type, {
    start: Math.max(0, next.startFrame - 6),
    end: Math.min(manifest.totalFrames - 1, next.startFrame + 30),
  });
}
for (const [type, range] of samples) {
  console.log(`[transition-test] ${type}: ${range.start}-${range.end}`);
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    pixelFormat: 'yuv420p',
    imageFormat: 'jpeg',
    jpegQuality: 90,
    crf: 20,
    x264Preset: 'ultrafast',
    concurrency: 1,
    offthreadVideoThreads: 1,
    frameRange: [range.start, range.end],
    outputLocation: path.join(outputDirectory, `${type}.mp4`),
    inputProps: manifest,
    muted: true,
    overwrite: true,
    timeoutInMilliseconds: 300_000,
  });
}
console.log(`[transition-test] ${samples.size} variantes salvas em ${outputDirectory}`);
